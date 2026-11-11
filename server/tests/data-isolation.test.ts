import test from 'node:test';
import assert from 'node:assert/strict';
import {reserveTurn,finishTurn} from '../src/ai/conversations.ts';
import {randomUUID} from 'node:crypto';
import {createMemoryLedgerStore,createSeedLedgerState} from '../src/ledger/store.ts';
import {createTestServer,registeredCookie} from './auth-fixture.ts';
const auth={mode:'password' as const,sessionSecret:'isolation-regression-only',adminEmail:'admin@example.invalid',adminPassword:'synthetic-only'};
const employee=(id:string)=>({id,name:id,email:id+'@example.invalid',role:'investment_manager' as const});
const marker='PRIVATE_BUSINESS_884291';
async function fixture(t:import('node:test').TestContext){
 const seed=createSeedLedgerState();
 function mark(v:any){if(!v||typeof v!=='object')return;for(const k of Object.keys(v)){if(['name','title','summary','detail','targetName'].includes(k)&&typeof v[k]==='string')v[k]=marker+' '+v[k];else mark(v[k]);}}
 seed.reports[0].projectId=seed.projects[0].id;seed.reports[0].fundId=seed.projects[0].fundId;
 mark(seed);const store=createMemoryLedgerStore(seed),app=createTestServer({ledgerStore:store,auth});t.after(()=>app.close());const a=employee('isolation-A'),b=employee('isolation-B');const cookies=await Promise.all([a,b].map(u=>registeredCookie(app,u,auth.sessionSecret)));
 await store.accessTransaction(s=>{for(const f of seed.funds)s.data.funds[f.id]={visibility:'members',memberIds:[a.id],revision:2};for(const p of seed.projects)s.data.projects[p.id]={visibility:'members',memberIds:[a.id],revision:1};});
 return {seed,store,app,a,b,cookies};
}
test('all module collections and details isolate employees while explicit project sharing remains usable',async t=>{
 const {seed,store,app,b,cookies:[ca,cb]}=await fixture(t);const p=seed.projects[0],f=seed.funds[0];
 const collections=['/api/funds','/api/projects','/api/companies','/api/tasks','/api/materials','/api/ai/materials','/api/materials/source-index','/api/reports','/api/capital-records','/api/meetings','/api/ai-intake-items','/api/audit-events','/api/investment-ledger','/api/investment-cashflows','/api/exit-settlements','/api/asset-history','/api/fund-operations','/api/fundraising/tasks','/api/custom-field-export/company','/api/custom-field-export/project','/api/custom-field-export/fund'];
 const leaks:string[]=[];for(const url of collections){const r=await app.inject({url,headers:{cookie:cb}});assert.notEqual(r.statusCode,500,url+': '+r.body);if(r.body.includes(marker))leaks.push(url);}assert.deepEqual(leaks,[],'private module leaks');
 const details=[`/api/funds/${f.id}`,`/api/funds/${f.id}/investors`,`/api/funds/${f.id}/lifecycle`,`/api/funds/${f.id}/deals`,`/api/projects/${p.id}`,`/api/projects/${p.id}/approvals`,`/api/projects/${p.id}/diligence`,`/api/projects/${p.id}/deals`,`/api/projects/${p.id}/post-investment`,`/api/projects/${p.id}/returns`,`/api/projects/${p.id}/investment-cashflows`,`/api/projects/${p.id}/exit-settlements`,`/api/projects/${p.id}/asset-history`];
 for(const url of details){const r=await app.inject({url,headers:{cookie:cb}});assert.equal(r.statusCode,403,url+': '+r.body);}
 assert.ok((await app.inject({url:'/api/projects',headers:{cookie:ca}})).body.includes(marker));
 await store.accessTransaction(s=>{s.data.projects[p.id]={visibility:'members',memberIds:[b.id],revision:2};});
 const sharedReports=(await app.inject({url:'/api/reports',headers:{cookie:cb}})).json().reports;for(const r of seed.reports.filter(r=>r.projectId===p.id))assert.ok(sharedReports.some((x:any)=>x.id===r.id),'shared project report missing');
 for(const url of [`/api/projects/${p.id}`,`/api/projects/${p.id}/approvals`,`/api/projects/${p.id}/diligence`,`/api/projects/${p.id}/deals`,`/api/projects/${p.id}/post-investment`])assert.equal((await app.inject({url,headers:{cookie:cb}})).statusCode,200,url);
 assert.equal((await app.inject({url:`/api/funds/${f.id}`,headers:{cookie:cb}})).statusCode,403,'project membership must not expose entire fund');
});
test('same-role employees cannot read, mutate or execute each other conversations, summaries and cards',async t=>{
 const {store,app,cookies:[ca,cb]}=await fixture(t);const c=(await app.inject({url:'/api/ai/conversations',method:'POST',headers:{cookie:ca},payload:{requestId:randomUUID(),includeDemo:true}})).json();
 await store.assistantTransaction('isolation-A:investment_manager',s=>{const chat=s.conversations.find(x=>x.id===c.id)!;chat.contextMemory={summary:'PRIVATE_SUMMARY_122',sourceCount:99} as any;chat.messages.push({id:randomUUID(),role:'user',content:'PRIVATE_PROMPT_123',status:'complete'} as any);chat.proposals=[{id:'private-action',state:'pending',title:'PRIVATE_CARD_124',body:{},details:[],path:'/api/tasks',method:'POST'} as any];});
 const base='/api/ai/conversations/'+c.id;
 for(const [method,suffix,payload] of [['GET','',undefined],['PATCH','',{expectedRevision:1,title:'stolen'}],['DELETE','',{expectedRevision:1}],['POST','/stop',{}],['GET','/actions',undefined],['POST','/actions/private-action/confirm',{confirmed:true}],['POST','/actions/private-action/cancel',{}]] as const){const r=await app.inject({method,url:base+suffix,headers:{cookie:cb},payload});assert.equal(r.statusCode,404,method+suffix+': '+r.body);assert.ok(!/PRIVATE_/.test(r.body));}
 assert.equal((await app.inject({url:'/api/ai/conversations?includeDemo=true',headers:{cookie:cb}})).json().conversations.length,0);
 const own=await app.inject({url:base,headers:{cookie:ca}});assert.equal(own.statusCode,200);assert.ok(own.body.includes('PRIVATE_PROMPT_123'));assert.ok(!own.body.includes('PRIVATE_SUMMARY_122'));
});

test('hidden name-based targets cannot commit writes and orphan inbox items stay owner-private',async t=>{
 const {seed,store,app,cookies:[,cb]}=await fixture(t);const writer=employee('intake-author');writer.role='investment_manager';const uploadUser={...writer,role:'post_investment' as const},cookie=await registeredCookie(app,uploadUser,auth.sessionSecret);
 const materialsBefore=(await store.listMaterials()).length;
 const archive=await app.inject({method:'POST',url:'/api/materials/archive',headers:{cookie},payload:{name:'forged material',type:'会议纪要',uploader:uploadUser.name,time:'2026-11-03',source:'工程验证',status:'已归档',quotes:'0',project:seed.projects[0].name}});assert.equal(archive.statusCode,403,archive.body);assert.equal((await store.listMaterials()).length,materialsBefore);
 const risksBefore=JSON.stringify((await store.readObjectAccessSnapshot()).rows);
 for(const payload of [{title:'hidden-target-risk',target:seed.projects[0].name,result:'forged'},{title:seed.projects[0].name+' hidden-title-risk',result:'forged'}])assert.equal((await app.inject({method:'POST',url:'/api/risks/handle',headers:{cookie:cb},payload})).statusCode,403);
 assert.equal(JSON.stringify((await store.readObjectAccessSnapshot()).rows),risksBefore,'denied risk must not commit');
 const before=(await store.listReports()).length;
 const report=await app.inject({method:'POST',url:'/api/reports',headers:{cookie:cb},payload:{name:'forged report',type:'投后报告',target:seed.projects[0].name,period:'2026年',status:'草稿',owner:'验收员工',source:'人工',updatedAt:'2026-11-03'}});
 assert.equal(report.statusCode,403,report.body);assert.equal((await store.listReports()).length,before,'denied target must not commit');
 const body={id:randomUUID(),title:'ORPHAN_INBOX_PRIVATE',inputType:'会议纪要',source:'工程验证',submittedBy:'forged person',submittedAt:'2026-11-03 10:00',summary:'unclassified private',confidence:'待核对',suggestedFund:'',suggestedProject:'',suggestedPath:'待归档',extracted:[],generatedTasks:[]};
 const created=await app.inject({method:'POST',url:'/api/ai-intake-items',headers:{cookie},payload:body});assert.equal(created.statusCode,410,created.body);
 await store.createAiIntakeItem({...body,inputType:"会议纪要",ownerId:uploadUser.id,submittedBy:uploadUser.name});
 assert.ok((await app.inject({url:'/api/ai-intake-items',headers:{cookie}})).body.includes(body.title));assert.ok(!(await app.inject({url:'/api/ai-intake-items',headers:{cookie:cb}})).body.includes(body.title));
 await store.accountTransaction(s=>{s.auditEvents.push({id:randomUUID(),module:'账号管理',action:'修改账号',targetType:'账号',targetId:uploadUser.id,targetName:'PRIVATE_OTHER_ACCOUNT',actor:'管理员',time:new Date().toISOString(),detail:'PRIVATE_OTHER_ACCOUNT',source:'账号管理'});});
 assert.ok(!(await app.inject({url:'/api/audit-events',headers:{cookie:cb}})).body.includes('PRIVATE_OTHER_ACCOUNT'));
});

test('concurrent same-role chats compress only their own history, and a new conversation starts clean',async t=>{
 const store=createMemoryLedgerStore(),requests:any[]=[];
 const app=createTestServer({ledgerStore:store,auth,ai:{env:{QWEN_API_KEY:'synthetic-isolation-provider'},fetchImpl:async(_url,init)=>{
  const body=JSON.parse(init!.body!);requests.push(body);const text=JSON.stringify(body);assert.ok(!(text.includes('PRIVATE_A_HISTORY')&&text.includes('PRIVATE_B_HISTORY')),'mixed employee context');
  return {ok:true,status:200,headers:{get:()=> 'application/json'},text:async()=>JSON.stringify({choices:[{message:{content:body.stream===false?(text.includes('PRIVATE_A_HISTORY')?'PRIVATE_A_SUMMARY':'PRIVATE_B_SUMMARY'):'合成隔离验证回复'}}]})};
 }}});t.after(()=>app.close());
 const actors=[employee('compress-A'),employee('compress-B')],cookies=await Promise.all(actors.map(a=>registeredCookie(app,a,auth.sessionSecret)));const chats=[];
 for(let i=0;i<2;i++){
  const c=(await app.inject({method:'POST',url:'/api/ai/conversations',headers:{cookie:cookies[i]},payload:{requestId:randomUUID(),includeDemo:true}})).json();
  await store.assistantTransaction(actors[i].id+':'+actors[i].role,s=>{const chat=s.conversations.find(x=>x.id===c.id)!;for(let j=0;j<16;j++){const rid=randomUUID();reserveTurn(chat,{requestId:rid,expectedRevision:chat.revision,prompt:(i?'PRIVATE_B_HISTORY':'PRIVATE_A_HISTORY')+' 内容'.repeat(150)});finishTurn(chat,rid,'助手历史回复','complete',[],'synthetic',undefined,[]);}});
  chats.push(await store.assistantTransaction(actors[i].id+':'+actors[i].role,s=>s.conversations.find(x=>x.id===c.id)!));
 }
 const responses=await Promise.all(chats.map((c,i)=>app.inject({method:'POST',url:`/api/ai/conversations/${c.id}/turns`,headers:{cookie:cookies[i]},payload:{requestId:randomUUID(),expectedRevision:c.revision,prompt:'继续我的对话',projectId:'',materialIds:[]}})));
 for(const r of responses)assert.equal(r.statusCode,200,r.body);
 const memories=await Promise.all(actors.map((a,i)=>store.assistantTransaction(a.id+':'+a.role,s=>s.conversations.find(x=>x.id===chats[i].id)!.contextMemory)));
 assert.match(memories[0]!.summary,/PRIVATE_A_SUMMARY/);assert.match(memories[1]!.summary,/PRIVATE_B_SUMMARY/);
 for(let i=0;i<2;i++){const response=await app.inject({url:`/api/ai/conversations/${chats[1-i].id}`,headers:{cookie:cookies[i]}});assert.equal(response.statusCode,404);}
 const clean=(await app.inject({method:'POST',url:'/api/ai/conversations',headers:{cookie:cookies[0]},payload:{requestId:randomUUID(),includeDemo:true}})).json();const start=requests.length;
 assert.equal((await app.inject({method:'POST',url:`/api/ai/conversations/${clean.id}/turns`,headers:{cookie:cookies[0]},payload:{requestId:randomUUID(),expectedRevision:clean.revision,prompt:'新的独立对话'}})).statusCode,200);
 assert.ok(!/PRIVATE_[AB]_(HISTORY|SUMMARY)/.test(JSON.stringify(requests.slice(start))),'new conversation reused old memory');
});

test('stored unbound labels cannot acquire a later private project during inbox archive',async t=>{
 const {seed,store,app}=await fixture(t);const actor={...employee('late-label-author'),role:'post_investment' as const},cookie=await registeredCookie(app,actor,auth.sessionSecret),fund=seed.funds[0],project=seed.projects[0];
 await store.accessTransaction(s=>{s.data.funds[fund.id]={visibility:'members',memberIds:[actor.id],revision:3};});
 const item={id:randomUUID(),ownerId:actor.id,title:'Delayed classification',inputType:'会议纪要' as const,source:'工程验证',submittedBy:actor.name,submittedAt:'2026-11-03 10:00',summary:'待归属',confidence:'待核对',suggestedFund:fund.name,suggestedFundId:fund.id,suggestedProject:'LATER_PRIVATE_PROJECT_777',suggestedPath:'待归档',extracted:[],generatedTasks:['must not create']};
 await store.createAiIntakeItem(item);
 await store.masterTransaction(s=>{s.projects.find(p=>p.id===project.id)!.name=item.suggestedProject;});
 // PostgreSQL retains suggested_project_id=NULL from intake creation; model that persisted boundary.
 const snapshot=store.readObjectAccessSnapshot;store.readObjectAccessSnapshot=async()=>{const s=await snapshot();s.rows=s.rows.map((r:any)=>r.id===item.id?{...r,projectId:null}:r);return s;};
 assert.ok((await app.inject({url:'/api/ai-intake-items',headers:{cookie}})).body.includes(item.title));
 const before={materials:(await store.listMaterials()).length,tasks:(await store.listTasks()).length};
 const result=await app.inject({method:'POST',url:`/api/ai-intake-items/${item.id}/archive`,headers:{cookie},payload:{}});assert.equal(result.statusCode,403,result.body);
 assert.equal((await store.listMaterials()).length,before.materials);assert.equal((await store.listTasks()).length,before.tasks);
});
