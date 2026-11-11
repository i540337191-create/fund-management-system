import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {AgentRepository} from '../src/agent/repository.ts';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import {registerAgentWorkspaceRoutes} from '../src/http/agent-workspace.ts';

test('48-hour preparation is independent of custom reminder, durable and rescheduled without changing business status',async()=>{
 const server=Fastify(),repository=new AgentRepository();
 const workspace=registerAgentWorkspaceRoutes(server,createMemoryLedgerStore(),{repository,auth:{mode:'local-bypass'},startScheduler:false});
 const due='2026-11-10T00:00:00.000Z';
 try{
  await repository.transaction(s=>s.tasks.push({id:'prep-case',ownerId:'user-admin',scope:'personal',title:'验收任务',note:'',status:'waiting',dueAt:due,remindAheadMinutes:60}));
  const count=()=>repository.transaction(s=>s.notifications.filter(n=>n.dedupe.startsWith('preparation:')).length);
  await workspace.runtime.tick(new Date('2026-11-07T23:59:59.999Z'));assert.equal(await count(),0);
  await workspace.runtime.tick(new Date('2026-11-08T00:00:00.000Z'));assert.equal(await count(),1);
  await workspace.runtime.tick(new Date('2026-11-08T00:00:01.000Z'));assert.equal(await count(),1);
  assert.equal(await repository.transaction(s=>s.tasks.find(t=>t.id==='prep-case')!.status),'waiting');
  await workspace.runtime.tick(new Date('2026-11-09T23:00:00.000Z'));
  assert.equal(await repository.transaction(s=>s.notifications.filter(n=>n.taskId==='prep-case').length),2);
  await workspace.runtime.tick(new Date('2026-11-09T23:00:01.000Z'));
  assert.equal(await repository.transaction(s=>s.notifications.filter(n=>n.taskId==='prep-case').length),2);
  await repository.transaction(s=>{s.tasks.find(t=>t.id==='prep-case')!.dueAt='2026-11-12T00:00:00.000Z';});
  await workspace.runtime.tick(new Date('2026-11-10T00:00:00.000Z'));assert.equal(await count(),2);
  await repository.transaction(s=>{s.tasks.find(t=>t.id==='prep-case')!.status='complete';});
  await workspace.runtime.tick(new Date('2026-11-13T00:00:00.000Z'));assert.equal(await count(),2);
 }finally{await server.close();}
});

test('preparation boundaries do not fabricate a deadline or override inactive business states',async()=>{
 const {taskPreparation}=await import('../src/agent/time.ts');
 const now=Date.parse('2026-11-08T00:00:00Z');
 assert.equal(taskPreparation({status:'open',dueAt:'2026-11-10T00:00:00.001Z'},now),'upcoming');
 assert.equal(taskPreparation({status:'waiting',dueAt:'2026-11-10T00:00:00Z'},now),'preparing');
 assert.equal(taskPreparation({status:'open',dueAt:'2026-11-08T00:00:00Z'},now),'preparing');
 assert.equal(taskPreparation({status:'open',dueAt:'2026-11-07T23:59:59.999Z'},now),'overdue');
 for(const status of ['complete','cancelled'])assert.equal(taskPreparation({status,dueAt:'2026-11-10T00:00:00Z'},now),'inactive');
 for(const dueAt of [undefined,'invalid'])assert.equal(taskPreparation({status:'open',dueAt},now),'unscheduled');
});

test('new personal task and preference API default to 48 hours',async()=>{
 const server=Fastify(),repository=new AgentRepository();
 registerAgentWorkspaceRoutes(server,createMemoryLedgerStore(),{repository,auth:{mode:'local-bypass'},startScheduler:false});
 try{
  let state=(await server.inject({url:'/api/agent-workspace'})).json();
  assert.equal(state.preferences.remindAheadMinutes,2880);
  const response=await server.inject({method:'POST',url:'/api/agent-workspace/actions',payload:{requestId:'c7db6383-bbfa-47f5-b676-a59242e02d14',expectedRevision:state.revision,action:'save_task',data:{title:'默认48小时',note:'',status:'open'}}});
  assert.equal(response.statusCode,200,response.body);
  state=response.json();assert.equal(state.tasks.find((t:any)=>t.title==='默认48小时').remindAheadMinutes,2880);
  assert.equal(state.tasks.find((t:any)=>t.title==='默认48小时').preparation,'unscheduled');
 }finally{await server.close();}
});

test('cancelled project source cannot reappear as open during reminder synchronization',async()=>{
 const server=Fastify(),repository=new AgentRepository(),store=createMemoryLedgerStore();
 const workspace=registerAgentWorkspaceRoutes(server,store,{repository,auth:{mode:'local-bypass'},startScheduler:false});
 try{
  const task=(await store.listTasks())[0];assert(task);
  await store.updateTask(task.id,{ownerId:'user-admin',status:'已取消',dueDate:'2026-11-10'});
  await workspace.runtime.syncBusiness();
  const row=await repository.transaction(s=>s.tasks.find(t=>t.id==='business:'+task.id));assert.equal(row?.status,'cancelled');
  await workspace.runtime.tick(new Date('2026-11-09T00:00:00Z'));
  assert.equal(await repository.transaction(s=>s.notifications.filter(n=>n.taskId===row?.id).length),0);
 }finally{await server.close();}
});

test('date-only deadlines use the disclosed Shanghai day-end convention and invalid dates never normalize silently',async()=>{
 const {businessDueAt,taskPreparation}=await import('../src/agent/time.ts');
 assert.equal(businessDueAt('2026-11-05'),'2026-11-05T15:59:59.999Z');
 assert.equal(businessDueAt('2024-02-29'),'2024-02-29T15:59:59.999Z');
 for(const value of [undefined,'2026-02-29','2026-02-30','2026-13-01','2026-11-05T10:00:00Z','2026-1-5'])assert.equal(businessDueAt(value),undefined);
 const dueAt=businessDueAt('2026-11-05');assert.equal(taskPreparation({dueAt,status:'open'},Date.parse('2026-11-03T15:59:59.998Z')),'upcoming');assert.equal(taskPreparation({dueAt,status:'open'},Date.parse('2026-11-03T15:59:59.999Z')),'preparing');
});

for(const lead of [1440,2880])test('day-end convention migration preserves reminder receipt without duplicate preparation, previous lead '+lead,async()=>{
 const server=Fastify(),repository=new AgentRepository(),store=createMemoryLedgerStore();const workspace=registerAgentWorkspaceRoutes(server,store,{repository,auth:{mode:'local-bypass'},startScheduler:false});
 try{
  const task=(await store.listTasks())[0];await store.updateTask(task.id,{ownerId:'user-admin',status:'未开始',dueDate:'2026-11-10'});
  const id='business:'+task.id,oldDue='2026-11-09T16:00:00.000Z';
  await repository.transaction(s=>{s.tasks.push({id,ownerId:'user-admin',scope:'personal',title:'旧日期口径测试',note:'',source:'项目业务',status:'open',dueAt:oldDue,remindAheadMinutes:lead,remindedFor:oldDue+'::ahead'});s.notifications.push({id:'old-preparation',ownerId:'user-admin',scope:'personal',title:'旧准备提醒',text:'',tone:'yellow',read:false,createdAt:'2026-11-07T16:00:00Z',dedupe:'preparation:'+id+':'+oldDue,taskId:id});});
  await workspace.runtime.tick(new Date('2026-11-09T12:00:00Z'));
  assert.equal(await repository.transaction(s=>s.notifications.filter(n=>n.taskId===id).length),1);
  assert.equal(await repository.transaction(s=>s.tasks.find(t=>t.id===id)?.dueAt),'2026-11-10T15:59:59.999Z');
  await workspace.runtime.tick(new Date('2026-11-10T16:00:00Z'));assert.equal(await repository.transaction(s=>s.notifications.filter(n=>n.taskId===id).length),2);
  await workspace.runtime.tick(new Date('2026-11-10T16:00:01Z'));assert.equal(await repository.transaction(s=>s.notifications.filter(n=>n.taskId===id).length),2);
 }finally{await server.close();}
});
