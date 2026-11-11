import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setImmediate as nextTick} from 'node:timers/promises';
import {createMemoryLedgerStore,createSeedLedgerState} from '../src/ledger/store.ts';
import {createTestServer,registeredCookie} from './auth-fixture.ts';
import type {SessionUser} from '../src/auth/session.ts';
const auth={mode:'password' as const,sessionSecret:'object-access-regression-synthetic',adminEmail:'admin@example.invalid',adminPassword:'synthetic-password'};
const user=(id:string,role:SessionUser['role']='viewer'):SessionUser=>({id,name:id,email:id+'@example.invalid',role});
async function fixture(t:import('node:test').TestContext){const store=createMemoryLedgerStore(),app=createTestServer({ledgerStore:store,auth});t.after(()=>app.close());return {store,app};}

test('hidden investor signature cannot bypass fund access; visible role permissions still apply',async t=>{
 const {store,app}=await fixture(t);const manager=user('object-manager','investment_manager'),viewer=user('object-viewer');
 const managerCookie=await registeredCookie(app,manager,auth.sessionSecret),viewerCookie=await registeredCookie(app,viewer,auth.sessionSecret);
 const original=await store.lpTransaction(s=>s.investors[0]);const url=`/api/fund-investors/${original.id}/confirm-signature`;
 const allowed=await app.inject({method:'POST',url,headers:{cookie:managerCookie},payload:{requestId:randomUUID(),expectedRevision:original.revision??1}});assert.equal(allowed.statusCode,200,allowed.body);
 const afterAllowed=await store.lpTransaction(s=>s.investors.find(i=>i.id===original.id)!);assert.equal(afterAllowed.signStatus,'已签署');
 assert.equal((await app.inject({method:'POST',url,headers:{cookie:viewerCookie},payload:{requestId:randomUUID(),expectedRevision:afterAllowed.revision}})).statusCode,403);
 await store.accessTransaction(s=>{s.data.funds[original.fundId]={visibility:'members',memberIds:[],revision:2};});
 assert.equal((await app.inject({url:'/api/funds',headers:{cookie:managerCookie}})).json().funds.length,0);
 const denied=await app.inject({method:'POST',url,headers:{cookie:managerCookie},payload:{requestId:randomUUID(),expectedRevision:afterAllowed.revision}});assert.equal(denied.statusCode,403,denied.body);assert.ok(!denied.body.includes(original.name));
 const afterDenied=await store.lpTransaction(s=>s.investors.find(i=>i.id===original.id)!);assert.equal(afterDenied.revision,afterAllowed.revision);
});

test('project override can return to inheritance without resetting CAS revision or losing audit',async t=>{
 const {store,app}=await fixture(t);const viewer=user('inherit-viewer');const viewerCookie=await registeredCookie(app,viewer,auth.sessionSecret),adminCookie=await registeredCookie(app,user('user-admin','admin'),auth.sessionSecret);
 const project=(await store.listProjects())[0];const put=(kind:string,id:string,visibility:string,expectedRevision:number,memberIds:string[]=[])=>app.inject({method:'PUT',url:`/api/object-access/${kind}/${id}`,headers:{cookie:adminCookie},payload:{visibility,expectedRevision,memberIds}});
 const visible=async()=>(await app.inject({url:'/api/projects',headers:{cookie:viewerCookie}})).json().projects.some((p:{id:string})=>p.id===project.id);
 assert.equal((await put('funds',project.fundId,'members',1,[viewer.id])).statusCode,200);assert.equal(await visible(),true);
 assert.equal((await put('projects',project.id,'members',0)).statusCode,200);assert.equal(await visible(),false);
 const restored=await put('projects',project.id,'inherit',1);assert.equal(restored.statusCode,200,restored.body);assert.equal(restored.json().rule.revision,2);assert.equal(await visible(),true);
 const snapshot=(await app.inject({url:'/api/object-access',headers:{cookie:adminCookie}})).json();assert.equal(snapshot.data.projects[project.id],undefined);assert.equal(snapshot.data.projectRevisions[project.id],2);
 assert.equal((await put('projects',project.id,'public',0)).statusCode,409);assert.equal((await put('projects',project.id,'public',1)).statusCode,409);
 assert.equal((await put('projects',project.id,'inherit',2,[viewer.id])).statusCode,400);assert.equal((await put('funds',project.fundId,'inherit',2)).statusCode,400);
 const audit=(await store.listAuditEvents()).find(e=>e.module==='对象权限'&&e.targetId===project.id&&JSON.parse(e.detail).after.visibility==='inherit');assert.ok(audit);assert.equal(JSON.parse(audit.detail).before.visibility,'members');
 const next=await put('projects',project.id,'members',2,[viewer.id]);assert.equal(next.statusCode,200,next.body);assert.equal(next.json().rule.revision,3);
 assert.equal((await put('funds',project.fundId,'members',2)).statusCode,200);assert.equal(await visible(),true);
 const inheritedAgain=await put('projects',project.id,'inherit',3);assert.equal(inheritedAgain.statusCode,200);assert.equal(await visible(),false);
});

test('ACL revocation waits for an in-flight write, then rejects every later write',async t=>{
 const {store,app}=await fixture(t),actor=user('object-finance','finance'),cookie=await registeredCookie(app,actor,auth.sessionSecret);const record=(await store.listCapitalRecords())[0];
 let entered!:()=>void,release!:()=>void;const ready=new Promise<void>(r=>{entered=r;}),go=new Promise<void>(r=>{release=r;});
 const original=store.confirmCapitalRecord;store.confirmCapitalRecord=async id=>{entered();await go;return original(id);};
 const request=app.inject({method:'POST',url:`/api/capital-records/${record.id}/confirm`,headers:{cookie}});request.then(()=>{});await ready;
 let revoked=false;const revocation=store.accessTransaction(s=>{s.data.funds[record.fundId]={visibility:'members',memberIds:[],revision:2};if(record.projectId)s.data.projects[record.projectId]={visibility:'members',memberIds:[],revision:1};}).then(()=>{revoked=true;});
 await nextTick();assert.equal(revoked,false,'revoke must not pass a write holding the authorization lock');release();
 const first=await request;assert.equal(first.statusCode,200,first.body);await revocation;
 assert.equal((await app.inject({method:'POST',url:`/api/capital-records/${record.id}/confirm`,headers:{cookie}})).statusCode,403);
 assert.equal((await store.listCapitalRecords()).find(r=>r.id===record.id)?.confirmationStatus,'AI 已确认');
});

test('two concurrent registered accounts retain distinct object policies across asynchronous reads',async t=>{
 const seed=createSeedLedgerState();seed.funds.push({...seed.funds[0],id:'second-private-fund',name:'Synthetic second fund'});const store=createMemoryLedgerStore(seed),app=createTestServer({ledgerStore:store,auth});t.after(()=>app.close());
 const actors=[user('parallel-object-A'),user('parallel-object-B')],cookies=await Promise.all(actors.map(a=>registeredCookie(app,a,auth.sessionSecret))),funds=await store.listFunds();
 await store.accessTransaction(s=>{for(const [index,f]of funds.entries())s.data.funds[f.id]={visibility:'members',memberIds:[actors[index].id],revision:2};});
 await Promise.all(Array.from({length:40},async(_,i)=>{const index=i%2;const response=await app.inject({url:'/api/funds',headers:{cookie:cookies[index]}});assert.equal(response.statusCode,200,response.body);assert.deepEqual(response.json().funds.map((f:{id:string})=>f.id),[funds[index].id]);}));
});

for(const explicitProject of [true,false])test(`SSE stops after revocation for ${explicitProject?'explicit project':'automatically retrieved context'}`,async t=>{
 const seed=createSeedLedgerState(),project=seed.projects[0];const material={...seed.materials[0],id:'sse-synthetic-material',name:'Synthetic evidence.txt',projectId:project.id,fundId:project.fundId,dataOrigin:'user_input' as const,currentVersionId:null,sourceMaterialId:null,relationships:undefined};seed.materials.push(material);
 const store=createMemoryLedgerStore(seed);store.searchMaterialTextChunks=()=>[{id:'sse-evidence',materialId:material.id,fileName:material.name,category:'验收',projectOrFund:'Synthetic',archivePath:'',page:1,chunkIndex:1,text:'SSE synthetic private source 123456',recognizedTextPath:'',recognizedTextHref:'',originalPath:'',originalDocumentHref:'/docs/source-materials/synthetic.txt',dataOrigin:'user_input'}];
 let release!:()=>void,checked!:()=>void;const go=new Promise<void>(r=>{release=r;}),firstChecked=new Promise<void>(r=>{checked=r;});let providerStarted=false;
 const readSession=store.readAuthSession;store.readAuthSession=async hash=>{const result=await readSession(hash);if(providerStarted)checked();return result;};
 const encoder=new TextEncoder(),frame=(text:string)=>encoder.encode('data: '+JSON.stringify({choices:[{delta:{content:text}}]})+'\n\n');
 const app=createTestServer({ledgerStore:store,auth,ai:{env:{QWEN_API_KEY:'synthetic-sse-only'},fetchImpl:async()=>{providerStarted=true;return {ok:true,status:200,text:async()=>'',headers:{get:()=> 'text/event-stream'},body:new ReadableStream<Uint8Array>({start(controller){controller.enqueue(frame('SSE_BEFORE_REVOKE_111'));go.then(()=>{controller.enqueue(frame('SSE_AFTER_REVOKE_999'));controller.enqueue(encoder.encode('data: [DONE]\n\n'));controller.close();});}})};}}});t.after(()=>app.close());
 const actor=user('sse-revoked-viewer'),cookie=await registeredCookie(app,actor,auth.sessionSecret);await store.accessTransaction(s=>{s.data.funds[project.fundId]={visibility:'public',memberIds:[],revision:2};});
 const conversation=(await app.inject({method:'POST',url:'/api/ai/conversations',headers:{cookie},payload:{requestId:randomUUID(),includeDemo:true}})).json();
 const running=app.inject({method:'POST',url:`/api/ai/conversations/${conversation.id}/turns`,headers:{cookie},payload:{requestId:randomUUID(),expectedRevision:conversation.revision,prompt:'请分析基金项目资料',...(explicitProject?{projectId:project.id}:{})}});running.then(()=>{});await firstChecked;await nextTick();
 await store.accessTransaction(s=>{s.data.funds[project.fundId]={visibility:'members',memberIds:[],revision:3};s.data.projects[project.id]={visibility:'members',memberIds:[],revision:1};});release();
 const response=await running;assert.ok(!response.body.includes('SSE_AFTER_REVOKE_999'),response.body);
 const saved=await store.assistantTransaction(actor.id+':'+actor.role,s=>s.conversations.find(c=>c.id===conversation.id));assert.ok(!saved?.messages.some(m=>m.content.includes('SSE_AFTER_REVOKE_999')),'revoked block must not enter persisted history');
});

test('standalone companies are creator-owned; clients cannot choose or transfer ownership',async t=>{
 const {store,app}=await fixture(t),creator=user('company-creator','investment_manager'),other=user('company-other','investment_manager');const creatorCookie=await registeredCookie(app,creator,auth.sessionSecret),otherCookie=await registeredCookie(app,other,auth.sessionSecret);
 const input={requestId:randomUUID(),name:'Creator private company',shortName:'Creator private',industry:'Synthetic'};
 const forged=await app.inject({method:'POST',url:'/api/companies',headers:{cookie:creatorCookie},payload:{...input,ownerId:other.id}});assert.equal(forged.statusCode,400,forged.body);
 const created=await app.inject({method:'POST',url:'/api/companies',headers:{cookie:creatorCookie},payload:input});assert.equal(created.statusCode,201,created.body);const company=created.json().company;assert.equal(company.ownerId,creator.id);
 await store.accessTransaction(s=>{for(const id of Object.keys(s.data.funds))s.data.funds[id]={visibility:'members',memberIds:[],revision:2};});
 assert.equal((await app.inject({url:`/api/companies/${company.id}`,headers:{cookie:creatorCookie}})).statusCode,200);
 assert.equal((await app.inject({url:`/api/companies/${company.id}`,headers:{cookie:otherCookie}})).statusCode,403);
 assert.ok(!(await app.inject({url:'/api/companies',headers:{cookie:otherCookie}})).body.includes(company.name));
 const transfer=await app.inject({method:'PATCH',url:`/api/companies/${company.id}`,headers:{cookie:creatorCookie},payload:{...input,requestId:randomUUID(),expectedRevision:1,ownerId:other.id}});assert.equal(transfer.statusCode,400,transfer.body);
 const updated=await app.inject({method:'PATCH',url:`/api/companies/${company.id}`,headers:{cookie:creatorCookie},payload:{...input,requestId:randomUUID(),expectedRevision:1,name:'Creator renamed'}});assert.equal(updated.statusCode,200,updated.body);assert.equal(updated.json().company.ownerId,creator.id);
 await store.masterTransaction(s=>{s.companies.push({id:'legacy-orphan-company',name:'Historical orphan without creator',shortName:'Historical orphan',industry:'Synthetic',revision:1});});
 assert.ok(!(await app.inject({url:'/api/companies',headers:{cookie:creatorCookie}})).body.includes('Historical orphan without creator'));
 const adminCookie=await registeredCookie(app,user('user-admin','admin'),auth.sessionSecret);assert.equal((await app.inject({url:'/api/companies/legacy-orphan-company',headers:{cookie:adminCookie}})).statusCode,200);
 assert.equal((await store.listCompanies()).find(c=>c.id==='legacy-orphan-company')?.ownerId,undefined,'historical creator must not be guessed');
});

test('legacy and project-created companies inherit visible project access without becoming globally readable',async t=>{
 const {store,app}=await fixture(t),allowed=user('company-linked-viewer'),denied=user('company-denied-viewer');const allowedCookie=await registeredCookie(app,allowed,auth.sessionSecret),deniedCookie=await registeredCookie(app,denied,auth.sessionSecret);const project=(await store.listProjects())[0];
 await store.masterTransaction(s=>{s.companies.push({id:'linked-legacy-company',name:'Linked legacy company',shortName:'Linked legacy',industry:'Synthetic',revision:1});s.projects.find(p=>p.id===project.id)!.companyId='linked-legacy-company';});
 await store.accessTransaction(s=>{s.data.funds[project.fundId]={visibility:'members',memberIds:[],revision:2};s.data.projects[project.id]={visibility:'members',memberIds:[allowed.id],revision:1};});
 assert.equal((await app.inject({url:'/api/companies/linked-legacy-company',headers:{cookie:allowedCookie}})).statusCode,200);assert.equal((await app.inject({url:'/api/companies/linked-legacy-company',headers:{cookie:deniedCookie}})).statusCode,403);
 const manager=user('company-project-manager','investment_manager'),managerCookie=await registeredCookie(app,manager,auth.sessionSecret);await store.accessTransaction(s=>{s.data.funds[project.fundId]={visibility:'public',memberIds:[],revision:3};});
 const created=await app.inject({method:'POST',url:'/api/projects',headers:{cookie:managerCookie},payload:{requestId:randomUUID(),name:'Synthetic bound project',shortName:'Bound project',industry:'Synthetic',fundId:project.fundId,manager:'',collaborators:'',sourceChannel:'',description:'',newCompany:{name:'Project created company',shortName:'Project company',industry:'Synthetic'}}});assert.equal(created.statusCode,201,created.body);const bound=created.json().project.companyId;
 assert.equal((await app.inject({url:`/api/companies/${bound}`,headers:{cookie:allowedCookie}})).statusCode,200);
 await store.accessTransaction(s=>{s.data.funds[project.fundId]={visibility:'members',memberIds:[manager.id],revision:4};});assert.equal((await app.inject({url:`/api/companies/${bound}`,headers:{cookie:allowedCookie}})).statusCode,403);
});

test('intake project labels normalize into scoped IDs and export visibility is independent of row order',async t=>{
 const seed=createSeedLedgerState(),project=seed.projects[0];seed.aiIntakeItems[0].suggestedFundId=project.fundId;seed.aiIntakeItems[0].suggestedProject=project.name;seed.aiIntakeItems[0].summary='HIDDEN_PROJECT_INTAKE_MARKER';const store=createMemoryLedgerStore(seed),app=createTestServer({ledgerStore:store,auth});t.after(()=>app.close());const actor=user('normalized-snapshot-viewer'),cookie=await registeredCookie(app,actor,auth.sessionSecret);
 await store.accessTransaction(s=>{s.data.projects[project.id]={visibility:'members',memberIds:[],revision:1};});assert.ok(!(await app.inject({url:'/api/ai-intake-items',headers:{cookie}})).body.includes('HIDDEN_PROJECT_INTAKE_MARKER'));
 const {ObjectPolicy}=await import('../src/auth/object-access.ts'),snapshot=await store.readObjectAccessSnapshot(),report={id:'reordered-hidden-report',projectId:project.id},exported={id:'reordered-child-export',reportId:report.id};
 for(const rows of [[exported,report],[report,exported]]){const policy=new ObjectPolicy(actor,snapshot.data,snapshot.projects,snapshot.funds,snapshot.materials,rows);assert.equal(policy.allows(report.id),false);assert.equal(policy.allows(exported.id),false);}
 await store.accessTransaction(s=>{s.data.projects[project.id]={visibility:'public',memberIds:[],revision:2};});const visibleSnapshot=await store.readObjectAccessSnapshot();const policy=new ObjectPolicy(actor,visibleSnapshot.data,visibleSnapshot.projects,visibleSnapshot.funds,visibleSnapshot.materials,[exported,report]);assert.equal(policy.allows(exported.id),true);
});
