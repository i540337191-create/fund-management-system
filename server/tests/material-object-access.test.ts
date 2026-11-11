import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createMemoryLedgerStore,createSeedLedgerState} from '../src/ledger/store.ts';
import {objectPolicy,ObjectPolicy} from '../src/auth/object-access.ts';
import {createTestServer,registeredCookie} from './auth-fixture.ts';
import type {SessionUser} from '../src/auth/session.ts';
const auth={mode:'password' as const,sessionSecret:'material-ACL-synthetic',adminEmail:'admin@example.invalid',adminPassword:'synthetic-password'};
const user=(id:string,role:SessionUser['role']='viewer'):SessionUser=>({id,name:id,email:id+'@example.invalid',role});
async function fixture(t:import('node:test').TestContext){
 const root=await mkdtemp(join(tmpdir(),'material-acl-')),seed=createSeedLedgerState(),project=seed.projects[0];
 const secret={...seed.materials[0],id:'isolated-material',name:'Isolated synthetic original.txt',fundId:project.fundId,projectId:project.id,sourceMaterialId:'isolated-source-alias',currentVersionId:null,relationships:undefined,dataOrigin:'user_input' as const};
 const common={...secret,id:'common-material',name:'Common synthetic original.txt',sourceMaterialId:'common-source-alias'};
 seed.materials=[secret,common];const store=createMemoryLedgerStore(seed),app=createTestServer({ledgerStore:store,auth,materialPreviewProjectRoot:root,materialStorageRoot:join(root,'storage')});
 t.after(async()=>{await app.close();await rm(root,{recursive:true,force:true});});
 const actors=[user('isolation-A'),user('isolation-B'),user('user-admin','admin')],cookies=await Promise.all(actors.map(a=>registeredCookie(app,a,auth.sessionSecret)));
 const dir=join(root,'docs/source-materials/2026-06-10-fund-ops-templates');await mkdir(dir,{recursive:true});
 await writeFile(join(dir,'source-index.json'),JSON.stringify({materials:[{id:secret.sourceMaterialId,relative_path:'secret.txt',preview_path:'secret-preview.txt',pdf:{recognized_text_path:'secret-ocr.txt'}},{id:common.sourceMaterialId,relative_path:'common.txt'}]}));
 for(const file of ['secret.txt','secret-preview.txt','secret-ocr.txt'])await writeFile(join(dir,file),'PRIVATE_SYNTHETIC_BODY');await writeFile(join(dir,'common.txt'),'COMMON_SYNTHETIC_BODY');
 const get=(url:string,index=1)=>app.inject({url,headers:{cookie:cookies[index]}});
 const put=(visibility:string,expectedRevision:number,memberIds:string[]=[],index=2)=>app.inject({method:'PUT',url:`/api/object-access/materials/${secret.id}`,headers:{cookie:cookies[index]},payload:{visibility,expectedRevision,memberIds}});
 return {store,app,secret,common,project,actors,cookies,get,put};
}
test('same-fund material narrowing keeps common files shared and blocks source, preview, search, reports and history',async t=>{
 const {store,app,secret,common,project,actors,get,put}=await fixture(t);
 assert.equal((await get('/api/materials')).json().materials.length,2);
 assert.equal((await put('members',0,[actors[0].id])).statusCode,200);
 for(const index of [0,1]){assert.equal((await get('/api/funds',index)).json().funds.some((f:{id:string})=>f.id===project.fundId),true);const result=await get('/api/materials',index);assert.equal(result.json().materials.some((m:{id:string})=>m.id===secret.id),index===0);assert.equal(result.json().materials.some((m:{id:string})=>m.id===common.id),true);}
 const base='/docs/source-materials/2026-06-10-fund-ops-templates/';
 for(const file of ['secret.txt','secret-preview.txt','secret-ocr.txt']){assert.equal((await get(base+file,0)).statusCode,200);const denied=await get(base+file);assert.ok([403,404].includes(denied.statusCode));assert.ok(!denied.body.includes('PRIVATE_SYNTHETIC_BODY'));}
 assert.equal((await get(base+'common.txt')).body,'COMMON_SYNTHETIC_BODY');
 assert.ok(!(await get('/api/materials/source-index')).body.includes(secret.sourceMaterialId));
 store.searchMaterialTextChunks=()=>[secret,common].map((m,i)=>({id:'chunk-'+i,materialId:m.sourceMaterialId!,fileName:m.name,category:'Synthetic',projectOrFund:'Synthetic',archivePath:'',page:1,chunkIndex:0,text:'SYNTHETIC_SEARCH_'+m.id,recognizedTextPath:'',recognizedTextHref:'',originalPath:'',originalDocumentHref:base+(i?'common':'secret')+'.txt',dataOrigin:'user_input'}));
 assert.ok(!(await get('/api/materials/text-search?q=SYNTHETIC&includeDemo=true')).body.includes('SYNTHETIC_SEARCH_'+secret.id));
 await store.saveReportContent((await store.listReports())[0].id,[{title:'Synthetic',text:'PRIVATE_DERIVED_REPORT'}],(await store.listReports())[0].updatedAt,{id:actors[2].id,name:actors[2].name},{id:'synthetic-template',ownerId:actors[2].id,scope:'organization',title:'Private template',objectType:'report',stage:'',fields:[],materials:[],version:1,status:'published',sourceMapping:{materialId:secret.id,versionId:'legacy-synthetic',sha256:'',name:secret.name,sections:[],variables:[]}});
 assert.ok(!(await get('/api/reports?includeDemo=true')).body.includes('PRIVATE_DERIVED_REPORT'));
 const report=(await store.listReports())[0];assert.equal((await objectPolicy(store,actors[1])).allowsKnown(report.id),false);
 await store.approveReport(report.id,actors[2]);const exported=await store.exportReport(report.id,'PDF',actors[2]);assert.ok(exported);assert.equal((await get('/api/reports/exports/'+exported.exportRecord.id+'/file')).statusCode,403);
 const cookie=await registeredCookie(app,actors[0],auth.sessionSecret),conversation=(await app.inject({method:'POST',url:'/api/ai/conversations',headers:{cookie},payload:{requestId:randomUUID(),includeDemo:true}})).json();
 await store.assistantTransaction(actors[0].id+':'+actors[0].role,s=>{const c=s.conversations.find(c=>c.id===conversation.id)!;c.messages.push({id:randomUUID(),role:'assistant',content:'PRIVATE_PERSISTED_HISTORY',state:'complete',createdAt:new Date().toISOString(),scopeIds:[secret.id],citations:[]} as any);});
 assert.ok((await app.inject({url:'/api/ai/conversations/'+conversation.id,headers:{cookie}})).body.includes('PRIVATE_PERSISTED_HISTORY'));
 assert.equal((await put('members',1,[])).statusCode,200);
 assert.ok(!(await app.inject({url:'/api/ai/conversations/'+conversation.id,headers:{cookie}})).body.includes('PRIVATE_PERSISTED_HISTORY'));
});
test('material ACL uses live admin, CAS, auditable reset and intersection with inherited access',async t=>{
 const {store,secret,project,actors,get,put}=await fixture(t);
 assert.equal((await put('members',0,[actors[0].id],0)).statusCode,403);
 assert.equal((await put('public',0)).statusCode,400);
 const concurrent=await Promise.all([put('members',0,[actors[0].id]),put('members',0,[actors[1].id])]);assert.deepEqual(concurrent.map(r=>r.statusCode).sort(),[200,409]);
 const snapshot=(await get('/api/object-access',2)).json(),entry=snapshot.materials.find((m:{id:string})=>m.id===secret.id);assert.deepEqual(entry.inheritance.projectIds,[project.id]);assert.equal(entry.mode,'restricted');assert.equal(entry.revision,1);
 assert.equal((await put('inherit',1,[actors[0].id])).statusCode,400);
 assert.equal((await put('inherit',1)).json().rule.revision,2);
 assert.equal((await get('/api/materials')).json().materials.length,2);
 assert.equal((await put('members',0,[actors[0].id])).statusCode,409);
 assert.equal((await put('members',2,[actors[0].id])).statusCode,200);
 await store.accessTransaction(s=>{s.data.projects[project.id]={visibility:'members',memberIds:[],revision:1};s.data.funds[project.fundId]={visibility:'members',memberIds:[],revision:2};});
 assert.equal((await objectPolicy(store,actors[0])).allows(secret.id),false,'material membership cannot widen inherited access');
 const audit=(await store.listAuditEvents()).filter(e=>e.module==='对象权限'&&e.targetId===secret.id);assert.equal(audit.length,3);assert.ok(audit.some(e=>JSON.parse(e.detail).after.visibility==='inherit'));
});
test('material provenance and alias restrictions propagate through long derived chains without order dependence',async()=>{
 const seed=createSeedLedgerState(),project=seed.projects[0],actor=user('source-chain-viewer');
 const material={...seed.materials[0],id:'private-material',projectId:project.id,fundId:project.fundId,relationships:undefined,sourceMaterialId:'private-alias',currentVersionId:'private-version'};
 const rows=Array.from({length:8},(_,i)=>({id:'derived-'+i,sourceBasis:[{id:i?'derived-'+(i-1):material.id}],content:'PRIVATE_DERIVED'}));rows.push({id:'old-version',materialId:material.id,objectType:'material_version'} as any);
 const policy=new ObjectPolicy(actor,{funds:{[project.fundId]:{visibility:'public',memberIds:[],revision:1}},projects:{},materials:{[material.id]:{visibility:'members',memberIds:[],revision:1}}},seed.projects,seed.funds,[material],rows.reverse());
 for(const id of [material.id,'private-alias','private-version',...rows.map(r=>r.id)])assert.equal(policy.allowsKnown(id),false,id);
 assert.deepEqual(policy.filter(rows),[]);
 assert.equal(policy.filter({id:'derived-diligence-report',sections:{summary:'PRIVATE_SUMMARY'},source:{items:[{submissions:[{summary:'PRIVATE_SUBMISSION',evidence:[{material:{id:material.id}}]}]}],findings:[]}}),null);
 assert.equal(policy.filter({id:'derived-financial-record',revenue:123,evidence:[{id:material.id}]}),null);
 assert.deepEqual(policy.filter({id:'independent-financial-record',revenue:456,evidence:[]}),{id:'independent-financial-record',revenue:456,evidence:[]});
});
test('uploaded immutable versions are denied after narrowing while common originals remain downloadable',async t=>{
 const {app,project,actors,cookies,common,get}=await fixture(t);
 const upload=await app.inject({method:'POST',url:'/api/materials/upload?'+new URLSearchParams({requestId:randomUUID(),name:'Synthetic-private.txt',type:'Synthetic',projectId:project.id}),headers:{cookie:cookies[2],'content-type':'application/octet-stream'},payload:Buffer.from('PRIVATE_UPLOADED_SYNTHETIC_ORIGINAL')});
 assert.equal(upload.statusCode,201,upload.body);const first=upload.json();
 const second=await app.inject({method:'POST',url:'/api/materials/upload?'+new URLSearchParams({requestId:randomUUID(),name:'Synthetic-private.txt',type:'Synthetic',projectId:project.id,materialId:first.material.id,expectedVersion:'1'}),headers:{cookie:cookies[2],'content-type':'application/octet-stream'},payload:Buffer.from('PRIVATE_UPLOADED_SYNTHETIC_SECOND')});assert.equal(second.statusCode,201,second.body);
 assert.equal((await get(first.version.downloadHref)).statusCode,200);
 assert.equal((await app.inject({method:'PUT',url:'/api/object-access/materials/'+first.material.id,headers:{cookie:cookies[2]},payload:{visibility:'members',memberIds:[actors[0].id],expectedRevision:0}})).statusCode,200);
 for(const href of [first.version.downloadHref,second.json().version.downloadHref,'/api/materials/'+first.material.id+'/versions','/api/materials/'+first.material.id+'/extraction/text']){assert.equal((await get(href)).statusCode,403,href);}
 assert.equal((await get(first.version.downloadHref,0)).body,'PRIVATE_UPLOADED_SYNTHETIC_ORIGINAL');
 assert.equal((await get(second.json().version.downloadHref,0)).body,'PRIVATE_UPLOADED_SYNTHETIC_SECOND');
 assert.equal((await get('/api/materials')).json().materials.some((m:{id:string})=>m.id===common.id),true);
});
test('live admin demotion rejects an in-flight ACL update before commit',async t=>{
 const {store,app,secret,actors}=await fixture(t),admin=user('revocable-material-admin','admin'),cookie=await registeredCookie(app,admin,auth.sessionSecret);
 let enter!:()=>void,release!:()=>void;const ready=new Promise<void>(r=>enter=r),go=new Promise<void>(r=>release=r),list=store.listMaterials;
 store.listMaterials=async()=>{enter();await go;return list();};
 const running=app.inject({method:'PUT',url:'/api/object-access/materials/'+secret.id,headers:{cookie},payload:{visibility:'members',memberIds:[actors[0].id],expectedRevision:0}});running.then(()=>{});await ready;
 await store.accountTransaction(s=>{s.users.find(u=>u.id===admin.id)!.role='viewer';});release();
 const result=await running;assert.equal(result.statusCode,403,result.body);assert.equal((await store.readObjectAccessSnapshot()).data.materials?.[secret.id],undefined);
});
test('material restriction serializes after an authorized write and rejects later writes',async t=>{
 const {store,app,secret,project,cookies,actors,put}=await fixture(t),manager=user('material-write-manager','post_investment'),cookie=await registeredCookie(app,manager,auth.sessionSecret);
 let enter!:()=>void,release!:()=>void;const ready=new Promise<void>(r=>enter=r),go=new Promise<void>(r=>release=r),write=store.setMaterialProjects;
 store.setMaterialProjects=async(...args)=>{enter();await go;return write(...args);};
 const request=()=>app.inject({method:'PUT',url:`/api/materials/${secret.id}/projects`,headers:{cookie},payload:{projectIds:[project.id]}});
 const running=request();running.then(()=>{});await ready;let restricted=false;
 const narrow=put('members',0,[actors[0].id]).then(r=>{restricted=true;return r;});await new Promise<void>(r=>setImmediate(r));assert.equal(restricted,false);release();
 assert.equal((await running).statusCode,200);assert.equal((await narrow).statusCode,200);assert.equal((await request()).statusCode,403);
});

test('no material overrides preserve existing derived visibility; unrelated override does not narrow a different source',()=>{
 const seed=createSeedLedgerState(),actor=user('baseline-viewer'),project=seed.projects[0];
 const privateMaterial={...seed.materials[0],id:'baseline-private-source',fundId:project.fundId,projectId:project.id,relationships:undefined,sourceMaterialId:'baseline-private-alias',currentVersionId:'baseline-private-version'};
 const other={...privateMaterial,id:'independent-material',projectId:null,fundId:seed.funds[0].id,sourceMaterialId:null,currentVersionId:null};
 const baseline={funds:{[project.fundId]:{visibility:'public' as const,memberIds:[],revision:1}},projects:{[project.id]:{visibility:'members' as const,memberIds:[],revision:1}}};
 const report={id:'baseline-derived-row',fundId:project.fundId,sourceBasis:[{id:privateMaterial.id}],content:'EXISTING_DERIVED_CONTENT'},aliasRow={id:'baseline-alias-row',fundId:project.fundId,sourceBasis:[{id:privateMaterial.sourceMaterialId},{id:privateMaterial.currentVersionId}],content:'EXISTING_ALIAS_CONTENT'};
 for(const data of [baseline,{...baseline,materials:{[other.id]:{visibility:'members' as const,memberIds:[],revision:1}}}]){
  const policy=new ObjectPolicy(actor,data,seed.projects,seed.funds,[privateMaterial,other],[report,aliasRow,{id:'historical-version',materialId:privateMaterial.id,objectType:'material_version'}]);
  assert.equal(policy.allows(privateMaterial.id),false);assert.equal(policy.allowsKnown(report.id),true);assert.equal(policy.allowsKnown(aliasRow.id),true);assert.equal(policy.allows('historical-version'),true);assert.equal(policy.filter(report)?.content,report.content);assert.deepEqual(policy.filter(aliasRow),aliasRow);
 }
});
