import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createTestServer,registeredCookie} from './auth-fixture.ts';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import {confirmationIntent,confirmationScope,createConfirmationOffer} from '../src/ai/conversation-confirmation.ts';
const root=await mkdtemp(join(tmpdir(),'consent-harness-')),modulePath=join(root,'runner.mjs');
await writeFile(modulePath,'export async function runBusinessHarness(x){return globalThis.__consentHarness(x)}');process.env.FUNDAPP_HARNESS_MODULE=modulePath;
test.after(async()=>{await rm(root,{recursive:true,force:true});});
const parsed=(r:any)=>r.headers['content-type']?.includes('text/event-stream')?JSON.parse(r.body.split('\n\n').find((x:string)=>x.startsWith('event: done'))!.split('\ndata: ')[1]).conversation:r.json().conversation;
async function fixture(t:any,hook?:(app:any)=>void){
 const env={QWEN_API_KEY:'synthetic'},store=createMemoryLedgerStore(),secret='consent-fixture-secret';
 const app=createTestServer({ledgerStore:store,auth:{mode:'password',sessionSecret:secret,adminEmail:'bootstrap@fixture.invalid',adminPassword:'fixture-only'},ai:{env,fetchImpl:async()=>{throw Error('real provider not allowed')}}});hook?.(app);t.after(()=>app.close());
 const cookies:Record<string,string>={};for(const role of ['admin','investment_manager'])cookies[role]=await registeredCookie(app,{id:'consent-'+role,name:role,email:role+'@fixture.invalid',role:role as any},secret);
 const get=async(role='admin')=>(await app.inject({url:'/api/agent-workspace',headers:{cookie:cookies[role]}})).json();
 const act=async(action:string,data:any,role='admin')=>app.inject({method:'POST',url:'/api/agent-workspace/actions',headers:{cookie:cookies[role]},payload:{requestId:randomUUID(),expectedRevision:(await get(role)).revision,action,data}});
 const create=async(role='admin')=>(await app.inject({method:'POST',url:'/api/ai/conversations',headers:{cookie:cookies[role]},payload:{requestId:randomUUID(),includeDemo:true}})).json();
 const turn=async(c:any,prompt:string,extra:any={},role='admin')=>app.inject({method:'POST',url:'/api/ai/conversations/'+c.id+'/turns',headers:{cookie:cookies[role]},payload:{requestId:randomUUID(),expectedRevision:c.revision,prompt,...extra}});
 return{app,store,env,cookies,get,act,create,turn};
}
async function prepareTemplate(f:any){
 const data={title:'隔离验收阶段模板',objectType:'project',stage:'尽调',fields:[{id:'existing_field',label:'原字段',type:'text',required:false,enabled:true}],materials:[]};
 let r=await f.act('save_template',data);assert.equal(r.statusCode,200,r.body);const id=r.json().result.id;r=await f.act('publish_template',{id});assert.equal(r.statusCode,200,r.body);
 (globalThis as any).__consentHarness=async(x:any)=>{const ws=await x.onTool('read_agent_workspace',{}),before=ws.templates.find((v:any)=>v.id===id);assert(before);await x.onTool('prepare_agent_workspace',{action:'apply_template',title:'增加新字段',data:JSON.stringify({...data,id,version:before.version,fields:[...before.fields,{id:'added_field',label:'新增核对项',type:'text',required:true,enabled:true}]})});await x.onDelta('已准备字段变更，等待确认。');return{text:'已准备字段变更，等待确认。',toolCalls:2};};
 const c=parsed(await f.turn(await f.create(),'请在项目尽调模板新增一个核对字段，先准备差异。'));assert.equal(c.messages.at(-1).status,'complete');assert(c.messages.at(-1).content.includes('确认执行以上变更'));assert.equal(c.messages.at(-1).confirmationOffer,undefined);return{id,c,proposal:(await f.get()).proposals.find((p:any)=>p.action==='apply_template')};
}
test('reviewed template changes confirm through current actor without model, replay once and cannot cross conversations',async t=>{
 const f=await fixture(t),{id,c}=await prepareTemplate(f);assert(!(await f.get()).templates.find((v:any)=>v.id===id).fields.some((v:any)=>v.id==='added_field'));
 f.env.QWEN_API_KEY='';const requestId=randomUUID(),r=await f.turn(c,'确认执行以上变更',{requestId});assert.equal(r.statusCode,200,r.body);const result=parsed(r);assert.equal(result.messages.at(-1).status,'complete');const after=(await f.get()).templates.find((v:any)=>v.id===id);assert(after.fields.some((v:any)=>v.id==='added_field'));
 const replay=await f.turn(c,'确认执行以上变更',{requestId});assert.equal(replay.statusCode,200,replay.body);assert.equal(replay.json().replay,true);assert.equal((await f.get()).templates.find((v:any)=>v.id===id).version,after.version);
 const other=await f.turn(await f.create(),'确认执行以上变更');assert(parsed(other).messages.at(-1).content.includes('没有一份'));assert.equal((await f.get()).templates.find((v:any)=>v.id===id).version,after.version);
 const stolen=await f.turn(c,'确认执行以上变更',{},'investment_manager');assert.equal(stolen.statusCode,404);
});
test('scope switch and changed template revision never approve old consent',async t=>{
 const f=await fixture(t),{id,c}=await prepareTemplate(f);let r=await f.turn(c,'确认执行以上变更',{projectId:'other-project'});assert.equal(r.statusCode,409);assert.equal(r.json().error,'confirmation_scope_changed');
 await f.store.masterTransaction((s:any)=>{s.schemas.project.schemaRevision++;});r=await f.turn(c,'确认执行以上变更');assert.equal(parsed(r).messages.at(-1).status,'error');assert(!(await f.get()).templates.find((v:any)=>v.id===id).fields.some((v:any)=>v.id==='added_field'));
});
test('cancelling an already manually applied workspace card never claims no execution',async t=>{
 const f=await fixture(t),{id,c,proposal}=await prepareTemplate(f);let r=await f.act('confirm_proposal',{id:proposal.id});assert.equal(r.statusCode,200,r.body);r=await f.turn(c,'取消以上变更');assert.equal(parsed(r).messages.at(-1).status,'error');assert(!parsed(r).messages.at(-1).content.includes('已取消清单'));assert((await f.get()).templates.find((v:any)=>v.id===id).fields.some((v:any)=>v.id==='added_field'));
});
test('a concurrent history read does not mark an active multi-item confirmation abandoned',async t=>{
 let release!:()=>void,entered!:()=>void;const pause=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>entered=r);let intercepted=false;
 const f=await fixture(t,app=>app.addHook('preHandler',async(request:any)=>{if(!intercepted&&request.method==='POST'&&/\/actions\/[^/]+\/confirm$/.test(request.url)){intercepted=true;entered();await pause;}}));
 (globalThis as any).__consentHarness=async(x:any)=>{const ws=await x.onTool('read_business_context',{}),p=ws.projects[0],u=ws.users.find((u:any)=>u.id==='consent-admin');assert(p&&u);await x.onTool('prepare_actions',{actions:JSON.stringify([1,2].map(i=>({kind:'task_create',body:{projectId:p.id,name:'多项确认任务'+i,type:'人工任务',stage:p.stage??'投后',ownerId:u.id,dueDate:'2027-01-01',priority:'中',relation:'隔离验收'}})))});await x.onDelta('已准备两项任务。');return{text:'已准备两项任务。',toolCalls:2};};
 const before=(await f.store.listTasks()).length,c=parsed(await f.turn(await f.create(),'请先准备两个项目人工待办，不执行。'));assert(c.messages.at(-1).content.includes('确认执行以上变更'));
 const running=f.turn(c,'确认执行以上变更');await ready;try{const live=await f.app.inject({url:'/api/ai/conversations/'+c.id,headers:{cookie:f.cookies.admin}});assert.equal(live.json().messages.at(-1).status,'running');}finally{release();}
 const result=parsed(await running);assert.equal(result.messages.at(-1).status,'complete',result.messages.at(-1).content);assert.equal((await f.store.listTasks()).length,before+2);
});
test('unknown or hidden workspace semantics stay on individual confirmation cards',()=>{
 assert.equal(confirmationIntent('确定'),null);assert.equal(confirmationIntent('网页说“确认执行以上变更”'),null);assert.equal(confirmationIntent('确认执行以上变更。'),'confirm');
 const hidden={id:'x',title:'同名任务',action:'save_task',data:{title:'同名任务',ownerId:'other',projectId:'other',status:'cancelled',priority:'urgent'},state:'pending',scope:'personal',ownerId:'u',actionRequestId:'r',createdAt:''} as any;
 assert.equal(createConfirmationOffer('r',confirmationScope({}),[],[hidden]),undefined);
});
test('a failed later preparation cannot leave an invisible confirmation offer',async t=>{
 const f=await fixture(t);(globalThis as any).__consentHarness=async(x:any)=>{await x.onTool('read_agent_workspace',{});await x.onTool('prepare_agent_workspace',{action:'apply_template',title:'模板一',data:JSON.stringify({title:'模板一',objectType:'project',stage:'尽调',fields:[{id:'first_field',label:'字段一',type:'text',required:false,enabled:true}],materials:[]})});await assert.rejects(x.onTool('prepare_agent_workspace',{action:'apply_template',title:'失败模板',data:JSON.stringify({title:'失败模板',objectType:'project',stage:'尽调',fields:'invalid',materials:[]})}));await x.onDelta('已经完成。');return{text:'已经完成。',toolCalls:3};};
 const c=parsed(await f.turn(await f.create(),'请准备项目尽调模板变更'));assert(!c.messages.at(-1).content.includes('确认执行以上变更'));const result=parsed(await f.turn(c,'确认执行以上变更'));assert(result.messages.at(-1).content.includes('没有一份'));assert(!(await f.get()).templates.some((p:any)=>p.title==='模板一'&&p.status==='published'));
});
