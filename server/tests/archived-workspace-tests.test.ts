import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import Fastify from 'fastify';
import {AgentRepository} from '../src/agent/repository.ts';
import {agentContext,queueRun} from '../src/agent/runtime.ts';
import {registerAgentWorkspaceRoutes} from '../src/http/agent-workspace.ts';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
const actor={id:'user-admin',name:'管理员',email:'fixture@example.invalid',role:'admin' as const};
test('reviewed test archives leave normal schedules, results and rules visible and intact, and stop test execution and memory reuse',async()=>{
 const repository=new AgentRepository(),store=createMemoryLedgerStore(),app=Fastify(),{runtime}=registerAgentWorkspaceRoutes(app,store,{repository,auth:{mode:'local-bypass'},startScheduler:false});
 const owned={ownerId:actor.id,scope:'personal' as const,version:1},archivedAt='2026-11-10T00:00:00Z';
 await repository.transaction(s=>{
  const schedule={...owned,id:'business-schedule',title:'每周核对资料',skillId:'skill-knowledge',prompt:'核对实际资料并列出缺项',nextAt:'2099-01-01T00:00:00Z',intervalMinutes:0,enabled:true,actor};
  s.schedules.push(schedule,{...schedule,id:'test-schedule',title:'QA只读验证',catalogueArchivedAt:archivedAt,nextAt:'2020-01-01T00:00:00Z'});
  const memory={...owned,id:'business-memory',title:'报告引用要求',text:'报告写明资料来源',enabled:true,status:'draft' as const};s.memories.push(memory,{...memory,id:'test-memory',title:'QA测试偏好',text:'QA不应被继续引用',catalogueArchivedAt:archivedAt});
  s.memoryHistory.push({...memory,id:'test-memory',version:0});
  const run={...owned,id:'business-run',skillId:'skill-knowledge',title:'资料核对',status:'complete' as const,result:'列出三项待补资料',createdAt:archivedAt};s.runs.push(run,{...run,id:'test-run',title:'QA执行测试',catalogueArchivedAt:archivedAt});
 });
 const before=await repository.transaction(s=>({schedules:s.schedules,runs:s.runs,memories:s.memories}));
 try{
  const response=await app.inject({url:'/api/agent-workspace'});assert.equal(response.statusCode,200,response.body);const view=response.json();
  assert.deepEqual(view.schedules.map((x:any)=>x.id),['business-schedule']);assert.deepEqual(view.runs.map((x:any)=>x.id),['business-run']);assert.deepEqual(view.memories.map((x:any)=>x.id),['business-memory']);assert.equal(view.memoryHistory.length,0);
  assert.deepEqual((await agentContext(repository,actor,undefined,store)).memories.map(x=>x.id),['business-memory']);
  await runtime.tick(new Date('2026-11-10T12:00:00Z'));assert.equal((await repository.transaction(s=>s.runs)).length,2);
  await assert.rejects(repository.transaction(s=>queueRun(s,actor,'skill-knowledge','read',s.schedules[1])),(e:any)=>e.code==='agent_record_not_found');
  for(const [action,data] of [['run_schedule',{id:'test-schedule'}],['toggle_schedule',{id:'test-schedule',enabled:true}],['save_schedule',{id:'test-schedule',version:1,title:'QA只读验证',skillId:'skill-knowledge',prompt:'仅查询',nextAt:'2099-01-01T00:00:00Z',intervalMinutes:0,enabled:true}],['save_memory',{id:'test-memory',version:1,title:'QA测试偏好',text:'QA不应被继续引用',scope:'personal',enabled:true}]]){
   const current=await repository.transaction(s=>s.revision),r=await app.inject({method:'POST',url:'/api/agent-workspace/actions',payload:{requestId:randomUUID(),expectedRevision:current,action,data}});assert.equal(r.statusCode,404,r.body);
  }
  assert.deepEqual(await repository.transaction(s=>({schedules:s.schedules,runs:s.runs,memories:s.memories})),before);
 }finally{await app.close();}
});
