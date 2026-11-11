import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createMemoryLedgerStore,createSeedLedgerState,type LedgerStore} from '../src/ledger/store.ts';
import {createTestServer,registeredCookie} from './auth-fixture.ts';
const synthetic='assistant-actions-synthetic-secret';
const reply=(actions:unknown[],clarification='')=>({ok:true,status:200,text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify({actions,clarification})}}]})});
function reportAction(projectId:string,name='隔离办理报告'){return {kind:'report_draft',body:{targetType:'project',targetId:projectId,name,type:'项目初筛报告',sections:[{title:'工程验收',text:'仅用于独立工程验证，不代表业务数据。'}]}};}
async function conversation(server:any,headers:Record<string,string>={}){const response=await server.inject({method:'POST',url:'/api/ai/conversations',headers,payload:{requestId:randomUUID(),includeDemo:true}});assert.equal(response.statusCode,200,response.body);return response.json();}
async function propose(server:any,c:any,instruction='按明确字段办理本次工程验收',headers:Record<string,string>={}){return server.inject({method:'POST',url:`/api/ai/conversations/${c.id}/actions`,headers,payload:{requestId:randomUUID(),expectedRevision:c.revision,instruction}});}
async function confirm(server:any,c:any,id:string,headers:Record<string,string>={}){return server.inject({method:'POST',url:`/api/ai/conversations/${c.id}/actions/${id}/confirm`,headers,payload:{confirmed:true}});}
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};}

test('proposal RID replays exact input and rejects changed instruction; empty clarification responses also replay',async()=>{
 const store=createMemoryLedgerStore(),project=(await store.listProjects())[0];let calls=0,empty=false;
 const server=createTestServer({ledgerStore:store,ai:{env:{QWEN_API_KEY:'synthetic'},fetchImpl:async()=>{calls++;return reply(empty?[]:[reportAction(project.id)],empty?'请补充负责人和期限':'');}}});
 try{const c=await conversation(server),body={requestId:randomUUID(),expectedRevision:c.revision,instruction:'起草指定报告'};
 const first=await server.inject({method:'POST',url:`/api/ai/conversations/${c.id}/actions`,payload:body});assert.equal(first.statusCode,200,first.body);assert.equal(first.json().actions.length,1);
 const replay=await server.inject({method:'POST',url:`/api/ai/conversations/${c.id}/actions`,payload:body});assert.deepEqual(replay.json(),first.json());assert.equal(calls,1);
 const conflict=await server.inject({method:'POST',url:`/api/ai/conversations/${c.id}/actions`,payload:{...body,instruction:'已改成不同指令'}});assert.equal(conflict.statusCode,409);assert.equal(conflict.json().error,'action_request_conflict');assert.equal(calls,1);
 empty=true;const next=await conversation(server),emptyBody={requestId:randomUUID(),expectedRevision:next.revision,instruction:'缺少关键字段'};
 const none=await server.inject({method:'POST',url:`/api/ai/conversations/${next.id}/actions`,payload:emptyBody});assert.equal(none.statusCode,200,none.body);assert.deepEqual(none.json(),{actions:[],clarification:'请补充负责人和期限'});
 const emptyReplay=await server.inject({method:'POST',url:`/api/ai/conversations/${next.id}/actions`,payload:emptyBody});assert.deepEqual(emptyReplay.json(),none.json());assert.equal(calls,2);
 }finally{await server.close();}
});

test('business report receipt retry accepts JSONB key reordering without a second report or audit',async()=>{
 const raw=createMemoryLedgerStore(),project=(await raw.listProjects())[0];let failApplied=false,changedText=false;
 const store=new Proxy(raw,{get(t,key){if(key==='listReports')return async()=> (await t.listReports()).map(r=>({...r,sections:r.sections?.map(({title,text})=>({text:changedText?text+"实际改稿":text,title}))}));if(key==='assistantTransaction')return (owner:string,fn:any)=>t.assistantTransaction(owner,s=>{const value=fn(s);if(failApplied&&s.conversations.some(c=>c.proposals?.some(p=>p.state==='applied'))){failApplied=false;throw new Error('synthetic_receipt_commit_failure');}return value;});return Reflect.get(t,key);}}) as LedgerStore;
 const server=createTestServer({ledgerStore:store,ai:{env:{QWEN_API_KEY:'synthetic'},fetchImpl:async()=>reply([reportAction(project.id)])}});
 try{const c=await conversation(server),generated=await propose(server,c);assert.equal(generated.statusCode,200,generated.body);const action=generated.json().actions[0];failApplied=true;
 const interrupted=await confirm(server,c,action.id);assert.equal(interrupted.statusCode,500);assert.equal((await raw.listReports()).filter(r=>r.name==='隔离办理报告').length,1);
 const persisted=(await store.listReports()).find(r=>r.name==='隔离办理报告')!;assert.notEqual(JSON.stringify(persisted.sections),JSON.stringify(reportAction(project.id).body.sections));
 const beforeAudits=(await raw.listAuditEvents()).filter(a=>a.action==='保存报告草稿').length;
 changedText=true;const edited=await confirm(server,c,action.id);assert.equal(edited.statusCode,409,edited.body);assert.equal(edited.json().error,'action_result_changed');changedText=false;
 const retried=await confirm(server,c,action.id);assert.equal(retried.statusCode,200,retried.body);assert.equal(retried.json().action.state,'applied');assert.equal((await raw.listReports()).filter(r=>r.name==='隔离办理报告').length,1);assert.equal((await raw.listAuditEvents()).filter(a=>a.action==='保存报告草稿').length,beforeAudits);
 }finally{await server.close();}
});

test('stop aborts proposal generation and a provider that ignores abort cannot save late cards',async()=>{
 const store=createMemoryLedgerStore(),project=(await store.listProjects())[0],entered=deferred(),release=deferred();let aborted=false;
 const server=createTestServer({ledgerStore:store,ai:{env:{QWEN_API_KEY:'synthetic'},fetchImpl:async(_url,init)=>{init!.signal!.addEventListener('abort',()=>{aborted=true;});entered.resolve();await release.promise;return reply([reportAction(project.id)]);}}});
 try{const c=await conversation(server),running=propose(server,c);await entered.promise;
 const stopped=await server.inject({method:'POST',url:`/api/ai/conversations/${c.id}/stop`,payload:{}});assert.equal(stopped.statusCode,200,stopped.body);assert.equal(aborted,true);
 release.resolve();const late=await running;assert.equal(late.statusCode,409,late.body);assert.equal(late.json().error,'action_generation_cancelled');const cards=await server.inject({url:`/api/ai/conversations/${c.id}/actions`});assert.deepEqual(cards.json().actions,[]);assert.equal((await store.listReports()).filter(r=>r.name==='隔离办理报告').length,0);
 }finally{release.resolve();await server.close();}
});

test('historical content with inaccessible citations is hidden before proposal provider invocation',async()=>{
 const store=createMemoryLedgerStore();let transmitted:any;
 const server=createTestServer({ledgerStore:store,ai:{env:{QWEN_API_KEY:'synthetic'},fetchImpl:async(_url,init)=>{transmitted=JSON.parse(String(init!.body));return reply([],'请补充当前可读取的资料');}}});
 try{const c=await conversation(server);
 await store.assistantTransaction('user-admin:admin',s=>{s.conversations.find(v=>v.id===c.id)!.messages.push({id:randomUUID(),role:'assistant',content:'REVOKED_FINANCIAL_SENTINEL',status:'complete',createdAt:new Date().toISOString(),citations:[{id:'1',materialId:'revoked-material',title:'撤权工程资料',page:1,excerpt:'test',href:'/api/materials/revoked-material/file'}]});});
 const before=await server.inject({url:'/api/ai/conversations/'+c.id});assert.ok(!before.body.includes('REVOKED_FINANCIAL_SENTINEL'));
 const generated=await propose(server,c,'参考前文起草报告');assert.equal(generated.statusCode,200,generated.body);assert.ok(!JSON.stringify(transmitted.messages).includes('REVOKED_FINANCIAL_SENTINEL'));assert.ok(transmitted.messages.some((m:any)=>m.content==='此前历史业务内容当前无法核验，不得据此办理。'));
 }finally{await server.close();}
});

test('task cards create through the existing task route only after confirmation and cancelled cards write nothing',async()=>{
 const store=createMemoryLedgerStore(),project=(await store.listProjects())[0],name='AI办理独立任务';
 const action={kind:'task_create',body:{projectId:project.id,name,type:'资料核对',stage:'投后管理',ownerId:'user-admin',dueDate:'2026-12-01',priority:'中',relation:'本项目工程验收',note:'明确字段由测试提供'}};
 const server=createTestServer({ledgerStore:store,ai:{env:{QWEN_API_KEY:'synthetic'},fetchImpl:async()=>reply([action])}});
 try{const c=await conversation(server),first=await propose(server,c);assert.equal(first.statusCode,200,first.body);const card=first.json().actions[0];assert.equal((await store.listTasks()).filter(t=>t.name===name).length,0);
 const noConfirmation=await server.inject({method:'POST',url:`/api/ai/conversations/${c.id}/actions/${card.id}/confirm`,payload:{confirmed:false}});assert.equal(noConfirmation.statusCode,400);
 const cancelled=await server.inject({method:'POST',url:`/api/ai/conversations/${c.id}/actions/${card.id}/cancel`,payload:{}});assert.equal(cancelled.statusCode,200,cancelled.body);assert.equal((await confirm(server,c,card.id)).statusCode,409);assert.equal((await store.listTasks()).filter(t=>t.name===name).length,0);
 const next=await conversation(server),fresh=await propose(server,next);assert.equal(fresh.statusCode,200,fresh.body);const saved=await confirm(server,next,fresh.json().actions[0].id);assert.equal(saved.statusCode,200,saved.body);const repeated=await confirm(server,next,fresh.json().actions[0].id);assert.equal(repeated.statusCode,200,repeated.body);const tasks=(await store.listTasks()).filter(t=>t.name===name);assert.equal(tasks.length,1);assert.equal(tasks[0].projectId,project.id);assert.equal(tasks[0].status,'未开始');
 }finally{await server.close();}
});

test('material cards require selected original, disclose scope changes, preserve file identity and obey scope CAS',async()=>{
 const seed=createSeedLedgerState(),project=seed.projects[0],fund=seed.funds[0];seed.materials=[{id:'assistant-scope-fixture',name:'原件工程样例.pdf',type:'经营资料',uploader:'工程验收',time:'2026-11-02',source:'工程验收',status:'待复核',quotes:'0',project:project.name,projectId:project.id,fundId:fund.id,path:'工程验收',currentVersionId:'fixed-original-version',scopeRevision:1,sha256:'f'.repeat(64),originalFilePath:'api/materials/assistant-scope-fixture/versions/fixed-original-version/file',dataOrigin:'user_input'}];
 const store=createMemoryLedgerStore(seed),action={kind:'material_scope',body:{materialId:seed.materials[0].id,projectIds:[],fundIds:[fund.id],investorIds:[]}};
 const server=createTestServer({ledgerStore:store,ai:{env:{QWEN_API_KEY:'synthetic'},fetchImpl:async()=>reply([action])}});
 try{const unselected=await conversation(server);assert.equal((await propose(server,unselected)).statusCode,403);
 const c=await conversation(server);await store.assistantTransaction('user-admin:admin',s=>{s.conversations.find(x=>x.id===c.id)!.materialIds=[seed.materials[0].id];});
 const generated=await propose(server,c);assert.equal(generated.statusCode,200,generated.body);const card=generated.json().actions[0];assert.ok(card.details.some((x:any)=>x.label==='原件可见范围'&&x.after.includes('确认后')));assert.equal((await store.listMaterials())[0].scopeRevision,1);
 const confirmed=await confirm(server,c,card.id);assert.equal(confirmed.statusCode,200,confirmed.body);const m=(await store.listMaterials())[0];assert.equal(m.scopeRevision,2);assert.equal(m.currentVersionId,'fixed-original-version');assert.equal(m.originalFilePath,seed.materials[0].originalFilePath);assert.equal(m.sha256,seed.materials[0].sha256);
 const next=await conversation(server);await store.assistantTransaction('user-admin:admin',s=>{s.conversations.find(x=>x.id===next.id)!.materialIds=[m.id];});const fresh=await propose(server,next);assert.equal(fresh.statusCode,200,fresh.body);
 await store.lpTransaction(s=>{s.materials.find(x=>x.id===m.id)!.scopeRevision=3;});const stale=await confirm(server,next,fresh.json().actions[0].id);assert.equal(stale.statusCode,409,stale.body);assert.equal(stale.json().error,'material_scope_revision_conflict');assert.equal((await store.listMaterials())[0].scopeRevision,3);
 }finally{await server.close();}
});

test('fund suggestions require authorized proof identifiers and preserve role permissions without inventing capital',async()=>{
 const store=createMemoryLedgerStore(),fund=(await store.listFunds())[0];
 const action={kind:'fund_action',body:{fundId:fund.id,action:'capital',balance:'100',committed:'10',reserve:'5',threshold:'1',date:'2026-11-02',note:'工程验收不能冒充凭证',proof:{materialId:'missing-proof',versionId:'missing-version'}}};
 const server=createTestServer({ledgerStore:store,auth:{mode:'password',sessionSecret:synthetic,adminEmail:'admin@example.invalid',adminPassword:'password'},ai:{env:{QWEN_API_KEY:'synthetic'},fetchImpl:async()=>reply([action])}});
 try{const admin=await registeredCookie(server,{id:'user-admin',name:'管理员',email:'admin@example.invalid',role:'admin'},synthetic),headers={cookie:admin},c=await conversation(server,headers),generated=await propose(server,c,'登记明确的额度快照',headers);assert.equal(generated.statusCode,409,generated.body);assert.equal(generated.json().error,'action_object_unavailable');
assert.equal(await store.lifecycleTransaction(fund.id,async s=>s.data.capital),undefined);
 const viewer=await registeredCookie(server,{id:'actions-viewer',name:'只读验收用户',email:'viewer@example.invalid',role:'viewer'},synthetic),vh={cookie:viewer},v=await conversation(server,vh),forbidden=await propose(server,v,'登记资金',vh);assert.equal(forbidden.statusCode,403,forbidden.body);assert.equal(await store.lifecycleTransaction(fund.id,async s=>s.data.capital),undefined);
 }finally{await server.close();}
});

test('a stopped late generation cannot remove the newer generation controller during cleanup',async()=>{
 const store=createMemoryLedgerStore(),project=(await store.listProjects())[0],entered=[deferred(),deferred()],release=[deferred(),deferred()];let calls=0;
 const server=createTestServer({ledgerStore:store,ai:{env:{QWEN_API_KEY:'synthetic'},fetchImpl:async()=>{const index=calls++;entered[index].resolve();await release[index].promise;return reply([reportAction(project.id,'停止后新请求')]);}}});
 try{let c=await conversation(server);const old=propose(server,c);await entered[0].promise;
 const stop=await server.inject({method:'POST',url:`/api/ai/conversations/${c.id}/stop`,payload:{}});assert.equal(stop.statusCode,200,stop.body);c=stop.json();
 const next=propose(server,c);await entered[1].promise;release[0].resolve();assert.equal((await old).statusCode,409);
 assert.equal((await server.inject({url:`/api/ai/conversations/${c.id}`})).statusCode,200);
 release[1].resolve();const success=await next;assert.equal(success.statusCode,200,success.body);assert.equal(success.json().actions.length,1);
 }finally{release.forEach(x=>x.resolve());await server.close();}
});

test('a simultaneous cancel cannot claim success while a confirmed business write is running',async()=>{
 const raw=createMemoryLedgerStore(),project=(await raw.listProjects())[0],entered=deferred(),release=deferred();
 const store=new Proxy(raw,{get(t,key){if(key==='createReport')return async(input:any)=>{entered.resolve();await release.promise;return t.createReport(input);};return Reflect.get(t,key);}}) as LedgerStore;
 const server=createTestServer({ledgerStore:store,ai:{env:{QWEN_API_KEY:'synthetic'},fetchImpl:async()=>reply([reportAction(project.id,'并发确认样例')])}});
 try{const c=await conversation(server),response=await propose(server,c);assert.equal(response.statusCode,200,response.body);const id=response.json().actions[0].id;
 const running=confirm(server,c,id);await entered.promise;const cancelled=await server.inject({method:'POST',url:`/api/ai/conversations/${c.id}/actions/${id}/cancel`,payload:{}});assert.equal(cancelled.statusCode,409,cancelled.body);assert.equal(cancelled.json().error,'action_busy');release.resolve();assert.equal((await running).statusCode,200);assert.equal((await raw.listReports()).filter(r=>r.name==='并发确认样例').length,1);
 }finally{release.resolve();await server.close();}
});
