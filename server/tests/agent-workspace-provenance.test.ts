import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createMemoryLedgerStore,createSeedLedgerState} from '../src/ledger/store.ts';
import {createTestServer,registeredCookie} from './auth-fixture.ts';

const root=await mkdtemp(join(tmpdir(),'workspace-provenance-')),modulePath=join(root,'runner.mjs');
await writeFile(modulePath,'export async function runBusinessHarness(x){return globalThis.__workspaceProvenanceHarness(x)}');
process.env.FUNDAPP_HARNESS_MODULE=modulePath;
test.after(()=>rm(root,{recursive:true,force:true}));
const done=(body:string)=>JSON.parse(body.split('\n\n').find(frame=>frame.startsWith('event: done'))!.split('\ndata: ')[1]).conversation;

async function fixture(t:import('node:test').TestContext){
 const seed=createSeedLedgerState(),a=seed.projects[0],b={...a,id:'workspace-only-project-b',name:'隔离验收项目乙',shortName:'项目乙',ownerId:'another-owner'};
 seed.projects.push(b);
 const store=createMemoryLedgerStore(seed),secret='workspace-provenance-fixture-secret';
 const app=createTestServer({ledgerStore:store,auth:{mode:'password',sessionSecret:secret},ai:{env:{QWEN_API_KEY:'synthetic'},fetchImpl:async()=>{throw Error('Live provider must not run');}}});
 t.after(()=>app.close());
 const actor={id:'workspace-provenance-reader',name:'隔离验收账号',email:'provenance@fixture.invalid',role:'investment_manager' as const};
 const grant=()=>store.accessTransaction(s=>{s.data.projects[b.id]={visibility:'members',memberIds:[actor.id],revision:3};});
 let grantNextWorkspace=false;
 app.addHook('onRequest',async request=>{if(grantNextWorkspace&&request.url==='/api/agent-workspace'){grantNextWorkspace=false;await grant();}});
 const cookie=await registeredCookie(app,actor,secret),headers={cookie};
 await store.accessTransaction(s=>{s.data.funds[a.fundId]={visibility:'public',memberIds:[],revision:2};s.data.projects[b.id]={visibility:'members',memberIds:[actor.id],revision:1};});
 const c=(await app.inject({method:'POST',url:'/api/ai/conversations',headers,payload:{requestId:randomUUID(),includeDemo:true}})).json(),path='/api/ai/conversations/'+c.id;
 const revoke=()=>store.accessTransaction(s=>{s.data.projects[b.id]={visibility:'members',memberIds:[],revision:2};});
 const turn=()=>app.inject({method:'POST',url:path+'/turns',headers,payload:{requestId:randomUUID(),expectedRevision:c.revision,projectId:a.id,prompt:'请查阅个人工作台的可见项目名称。'}});
 const saved=()=>store.assistantTransaction(actor.id+':'+actor.role,s=>s.conversations.find(row=>row.id===c.id)!);
 const readWorkspace=async(x:any)=>{
  const initial=JSON.parse(x.prompt).controlledContext;
  assert(!initial.projects.some((p:any)=>p.id===b.id),'B must enter via workspace, not the selected-project context');
  const workspace=await x.onTool('read_agent_workspace',{section:'projects',query:b.name});
  assert.equal(workspace.projects.length,1);
  assert.equal(workspace.projects[0].id,b.id);
  return workspace.projects[0];
 };
 return {app,a,b,headers,path,revoke,grantOnNextWorkspace:()=>{grantNextWorkspace=true;},turn,saved,readWorkspace};
}

test('workspace-only project provenance hides derived history after that project is revoked',async t=>{
 const f=await fixture(t);
 (globalThis as any).__workspaceProvenanceHarness=async(x:any)=>{const project=await f.readWorkspace(x);await x.onDelta('当前可见工作台项目：'+project.name);return {text:'当前可见工作台项目：'+project.name,toolCalls:1};};
 const response=await f.turn();assert.equal(response.statusCode,200,response.body);
 const initial=done(response.body);assert.equal(initial.messages.at(-1).status,'complete');assert(initial.messages.at(-1).content.includes(f.b.name));
 assert((await f.saved()).messages.at(-1)!.scopeIds?.includes(f.b.id),'disclosed B must be recorded in reply provenance');
 await f.revoke();
 const projects=(await f.app.inject({url:'/api/projects',headers:f.headers})).json().projects;
 assert(projects.some((p:any)=>p.id===f.a.id));assert(!projects.some((p:any)=>p.id===f.b.id));
 const history=await f.app.inject({url:f.path,headers:f.headers});assert.equal(history.statusCode,200,history.body);
 assert.equal(history.json().messages.at(-1).content,'当前权限范围无法核验这条历史回复，请重新提问。');
 assert(!history.body.includes(f.b.name));
 assert((await f.saved()).messages.at(-1)!.content.includes(f.b.name),'redaction must preserve the original stored reply');
});

test('workspace project revocation blocks later deltas and persistence in an active turn',async t=>{
 const f=await fixture(t),blocked='权限撤销后不得发布的项目乙内容';let reached=false;
 (globalThis as any).__workspaceProvenanceHarness=async(x:any)=>{
  await f.readWorkspace(x);await x.onDelta('已核对当前可见项目。');
  await f.revoke();reached=true;
  await assert.rejects(x.onDelta(blocked));
  throw Error('Synthetic stop after authorization rejection');
 };
 const response=await f.turn();assert.equal(response.statusCode,200,response.body);assert(reached);
 assert(!response.body.includes(blocked));
 const record=await f.saved();assert.equal(record.messages.at(-1)!.status,'stopped');assert(record.messages.at(-1)!.scopeIds?.includes(f.b.id));
 assert(!record.messages.some(m=>m.content.includes(blocked)));
 const history=await f.app.inject({url:f.path,headers:f.headers});assert.equal(history.statusCode,200,history.body);
 assert.equal(history.json().messages.at(-1).content,'当前权限范围无法核验这条历史回复，请重新提问。');
});

test('a project granted during workspace reading still enters reply provenance',async t=>{
 const f=await fixture(t);await f.revoke();
 (globalThis as any).__workspaceProvenanceHarness=async(x:any)=>{
  // Grant after the outer turn's policy snapshot, while the nested workspace read obtains its data.
  f.grantOnNextWorkspace();
  const project=await f.readWorkspace(x);await x.onDelta('新增授权的工作台项目：'+project.name);
  return {text:'新增授权的工作台项目：'+project.name,toolCalls:1};
 };
 const response=await f.turn();assert.equal(response.statusCode,200,response.body);
 assert(done(response.body).messages.at(-1).content.includes(f.b.name));
 assert((await f.saved()).messages.at(-1)!.scopeIds?.includes(f.b.id),'newly granted data needs provenance from the refreshed policy');
 await f.revoke();const history=await f.app.inject({url:f.path,headers:f.headers});
 assert.equal(history.json().messages.at(-1).content,'当前权限范围无法核验这条历史回复，请重新提问。');
});
