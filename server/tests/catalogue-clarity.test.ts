import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {AgentRepository} from '../src/agent/repository.ts';
import {agentContext,queueRun} from '../src/agent/runtime.ts';
import {registerAgentWorkspaceRoutes} from '../src/http/agent-workspace.ts';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
const admin={id:'user-admin',name:'管理员',email:'fixture@example.invalid',role:'admin' as const};
test('archived test catalogue entries disappear from discovery but keep existing schedule and execution references',async()=>{
 const repository=new AgentRepository(),store=createMemoryLedgerStore(),server=Fastify();
 registerAgentWorkspaceRoutes(server,store,{repository,auth:{mode:'local-bypass'},startScheduler:false});
 try{
  await repository.transaction(s=>{
   const builtin=s.skills.find(x=>x.id==='skill-knowledge')!;
   s.skills.push({...builtin,id:'reviewed-test-only',ownerId:admin.id,scope:'personal',builtin:false,catalogueArchivedAt:'2026-11-10T00:00:00Z'});
   s.plugins.push({...s.plugins[0],id:'reviewed-test-plugin',catalogueArchivedAt:'2026-11-10T00:00:00Z'});
   s.skillHistory.push({...s.skills.at(-1)!});
   s.schedules.push({id:'old-schedule',ownerId:admin.id,scope:'personal',title:'既有安排',skillId:'reviewed-test-only',prompt:'仅查询',actor:admin,nextAt:'2099-01-01T00:00:00Z',intervalMinutes:0,enabled:true});
  });
  const before=await repository.transaction(s=>s.schedules),response=await server.inject({url:'/api/agent-workspace'});assert.equal(response.statusCode,200,response.body);
  assert(!response.json().skills.some((x:any)=>x.id==='reviewed-test-only'));assert(!response.json().plugins.some((x:any)=>x.id==='reviewed-test-plugin'));assert(!response.json().skillHistory.some((x:any)=>x.id==='reviewed-test-only'));
  assert(!(await agentContext(repository,admin,undefined,store)).skills.some(x=>x.id==='reviewed-test-only'));
  assert((await agentContext(repository,admin,'reviewed-test-only',store)).skills.some(x=>x.id==='reviewed-test-only'));
  await repository.transaction(s=>assert.equal(queueRun(s,admin,'reviewed-test-only','只读',s.schedules[0]).skillId,'reviewed-test-only'));
  assert.deepEqual(await repository.transaction(s=>s.schedules),before);
 }finally{await server.close();}
});
test('copy upgrades keep user edits, enable switches, connection addresses and version history',async()=>{
 const repo=new AgentRepository();await repo.transaction(s=>{s.skills[0].title='用户自己的名称';s.skills[0].description='自己的做法';s.skills[0].version=2;s.plugins[0].enabled=false;s.plugins[0].endpoint='kept-private-address';s.plugins[0].connected=false;});
 const view=await repo.transaction(s=>s);assert.equal(view.skills[0].title,'用户自己的名称');assert.equal(view.skills[0].description,'自己的做法');assert.equal(view.plugins[0].title,'系统业务资料');assert.equal(view.plugins[0].enabled,false);assert.equal(view.plugins[0].connected,false);assert.equal(view.plugins[0].endpoint,'kept-private-address');
});
