import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import Fastify from 'fastify';
import {AgentRepository} from '../src/agent/repository.ts';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import {registerAgentWorkspaceRoutes} from '../src/http/agent-workspace.ts';
function fixture(){const server=Fastify(),repository=new AgentRepository();const workspace=registerAgentWorkspaceRoutes(server,createMemoryLedgerStore(),{repository,auth:{mode:'local-bypass'},startScheduler:false});const act=async(action:string,data:unknown)=>{const state=(await server.inject({url:'/api/agent-workspace'})).json();return server.inject({method:'POST',url:'/api/agent-workspace/actions',payload:{requestId:randomUUID(),expectedRevision:state.revision,action,data}});};return{server,repository,workspace,act};}
test('custom reminder fires only at its exact time, never becomes a business task and does not repeat',async()=>{
 const f=fixture(),dueAt=new Date(Date.now()+3*86400000).toISOString();try{
  const r=await f.act('save_reminder',{title:'隔离自定义提醒',text:'提醒内容',dueAt});assert.equal(r.statusCode,200,r.body);const id=r.json().result.id;
  assert(!r.json().tasks.some((t:any)=>t.id===id));
  const count=()=>f.repository.transaction(s=>s.notifications.filter(n=>n.dedupe.startsWith('reminder:'+id+':')).length);
  await f.workspace.runtime.tick(new Date(Date.parse(dueAt)-48*3600000));assert.equal(await count(),0);
  await f.workspace.runtime.tick(new Date(Date.parse(dueAt)-1));assert.equal(await count(),0);
  await f.workspace.runtime.tick(new Date(dueAt));assert.equal(await count(),1);
  await f.workspace.runtime.tick(new Date(Date.parse(dueAt)+1));assert.equal(await count(),1);
  assert.equal(await f.repository.transaction(s=>s.reminders.find(x=>x.id===id)?.status),'delivered');
 }finally{await f.server.close();}
});
test('reminder rejects past/invalid dates and foreign owner; cancelled or rescheduled reminders respect revisions',async()=>{
 const f=fixture();try{
  for(const dueAt of [new Date(Date.now()-1).toISOString(),'2026-02-30T10:00:00+08:00'])assert.equal((await f.act('save_reminder',{title:'无效时间',dueAt})).statusCode,400);
  const dueAt=new Date(Date.now()+86400000).toISOString();assert.equal((await f.act('save_reminder',{title:'越权',dueAt,ownerId:'other-account'})).statusCode,403);
  const r=await f.act('save_reminder',{title:'待取消',dueAt});assert.equal(r.statusCode,200,r.body);const id=r.json().result.id;
  assert.equal((await f.act('save_reminder',{id,version:0,title:'旧版本',dueAt})).statusCode,409);
  assert.equal((await f.act('cancel_reminder',{id,version:1})).statusCode,200);
  await f.workspace.runtime.tick(new Date(Date.parse(dueAt)+1));assert.equal(await f.repository.transaction(s=>s.notifications.some(n=>n.dedupe.startsWith('reminder:'+id+':'))),false);
 }finally{await f.server.close();}
});
test('read-all replay cannot consume a notification arriving after the original request',async()=>{
 const f=fixture();try{
  await f.repository.transaction(s=>s.notifications.push({id:'old-notice',ownerId:'user-admin',scope:'personal',title:'旧提醒',text:'',tone:'yellow',read:false,createdAt:new Date().toISOString(),dedupe:'old'}));
  const current=(await f.server.inject({url:'/api/agent-workspace'})).json();const payload={requestId:randomUUID(),expectedRevision:current.revision,action:'read_notice',data:{all:true}};
  assert.equal((await f.server.inject({method:'POST',url:'/api/agent-workspace/actions',payload})).statusCode,200);
  await f.repository.transaction(s=>{s.notifications.push({id:'new-notice',ownerId:'user-admin',scope:'personal',title:'并发新提醒',text:'',tone:'yellow',read:false,createdAt:new Date().toISOString(),dedupe:'new'});s.revision++;});
  assert.equal((await f.server.inject({method:'POST',url:'/api/agent-workspace/actions',payload})).statusCode,200);
  const notices=await f.repository.transaction(s=>s.notifications);assert.equal(notices.find(n=>n.id==='old-notice')?.read,true);assert.equal(notices.find(n=>n.id==='new-notice')?.read,false);
 }finally{await f.server.close();}
});
test('notification projection is newest first with stable ties without reordering persisted history',async()=>{
 const f=fixture();try{
  const row=(id:string,createdAt:string,ownerId='user-admin')=>({id,createdAt,ownerId,scope:'personal' as const,title:id,text:'',tone:'yellow' as const,read:false,dedupe:id});
  await f.repository.transaction(s=>s.notifications.push(row('old','2026-11-01T00:00:00Z'),row('new-a','2026-11-06T00:00:00Z'),row('new-z','2026-11-06T00:00:00Z'),row('foreign','2026-11-07T00:00:00Z','other')));
  for(let i=0;i<2;i++){const state=(await f.server.inject({url:'/api/agent-workspace'})).json();assert.deepEqual(state.notifications.map((n:any)=>n.id),['new-a','new-z','old']);}
  assert.deepEqual(await f.repository.transaction(s=>s.notifications.map(n=>n.id)),['old','new-a','new-z','foreign']);
 }finally{await f.server.close();}
});
