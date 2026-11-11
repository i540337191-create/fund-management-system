import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import Fastify from 'fastify';
import {createServer} from '../src/index.ts';
import {AgentRepository} from '../src/agent/repository.ts';
import {registerAgentWorkspaceRoutes} from '../src/http/agent-workspace.ts';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import {workspaceRuntime} from '../src/agent/runtime.ts';
import {privateAddress} from '../src/agent/connectors.ts';
const admin={id:'user-admin',name:'管理员',email:'test@example.invalid',role:'admin' as const};
async function action(server:any,name:string,data:any,rid=randomUUID()){const current=await server.inject({url:'/api/agent-workspace'});assert.equal(current.statusCode,200,current.body);const response=await server.inject({method:'POST',url:'/api/agent-workspace/actions',payload:{requestId:rid,expectedRevision:current.json().revision,action:name,data}});return response;}
test('workspace persists user changes, replays requests, rejects altered replay and preserves server-derived business tasks',async()=>{
 const server=createServer({auth:{mode:'local-bypass'}});try{
  const view=(await server.inject({url:'/api/agent-workspace'})).json();assert(view.users.some((x:any)=>x.id===admin.id));assert(view.skills.length>=13);
  const payload={requestId:randomUUID(),expectedRevision:view.revision,action:'save_task',data:{title:'Synthetic callback',note:'synthetic source',dueAt:'2026-12-01T00:00:00.000Z',remindAheadMinutes:60}};
  const response=await server.inject({method:'POST',url:'/api/agent-workspace/actions',payload});assert.equal(response.statusCode,200,response.body);const id=response.json().result.id;assert(response.json().tasks.some((x:any)=>x.id===id));assert(response.json().projects);assert(response.json().users);
  const replay=await server.inject({method:'POST',url:'/api/agent-workspace/actions',payload});assert.equal(replay.statusCode,200,replay.body);assert.equal(replay.json().tasks.filter((x:any)=>x.id===id).length,1);
  const conflict=await server.inject({method:'POST',url:'/api/agent-workspace/actions',payload:{...payload,data:{...payload.data,title:'changed'}}});assert.equal(conflict.statusCode,409);
 }finally{await server.close();}
});
test('template edit keeps last published template active, publication syncs real business field schema',async()=>{
 const server=createServer({auth:{mode:'local-bypass'}});try{
  const data={title:'Synthetic project form',objectType:'project',stage:'投后',fields:[{id:'synthetic_code',label:'原件编号',type:'text',required:false,enabled:true}],materials:[{id:'signed',title:'已签投资协议',required:true}]};
  let r=await action(server,'save_template',data);assert.equal(r.statusCode,200,r.body);const id=r.json().result.id;
  r=await action(server,'publish_template',{id});assert.equal(r.statusCode,200,r.body);
  let schema=(await server.inject({url:'/api/custom-field-schemas/project'})).json().schema;assert(schema.fields.some((x:any)=>x.id==='synthetic_code'));
  r=await action(server,'save_template',{...data,id,title:'Edited unpublished form'});assert.equal(r.statusCode,200,r.body);const draftId=r.json().result.id;assert.notEqual(draftId,id);const published=r.json().templates.find((x:any)=>x.id===id);assert.equal(published.status,'published');assert.equal(published.title,data.title);
  r=await action(server,'publish_template',{id:draftId});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().templates.find((x:any)=>x.id===id).title,'Edited unpublished form');assert.equal(r.json().templates.filter((x:any)=>x.id===id&&x.status==='published').length,1);
 }finally{await server.close();}
});
test('disabled skill prevents preparing a schedule and plugin connect cannot be forged',async()=>{
 const server=createServer({auth:{mode:'local-bypass'}});try{
  let r=await action(server,'toggle_skill',{id:'skill-profile',enabled:false});assert.equal(r.statusCode,200,r.body);
  r=await action(server,'save_schedule',{title:'Synthetic',skillId:'skill-profile',prompt:'test',nextAt:'2026-12-01T00:00:00.000Z',intervalMinutes:0,enabled:true});assert.equal(r.statusCode,409,r.body);
  r=await action(server,'save_plugin',{id:'plugin-public-feed',enabled:true,connected:true,endpoint:'http://127.0.0.1/secret'});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().plugins.find((x:any)=>x.id==='plugin-public-feed').connected,false);
  r=await action(server,'test_plugin',{id:'plugin-public-feed'});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().plugins.find((x:any)=>x.id==='plugin-public-feed').connected,false);
 }finally{await server.close();}
});
test('queued one-shot execution is durable and read notice never completes task; snoozing never changes dueAt',async()=>{
 const server=Fastify(),store=createMemoryLedgerStore(),repository=new AgentRepository();const workspace=registerAgentWorkspaceRoutes(server,store,{repository,auth:{mode:'local-bypass'},startScheduler:false});
 try{
  const task={id:'synthetic-task',ownerId:admin.id,scope:'personal' as const,title:'Synthetic task',note:'',status:'open' as const,dueAt:'2026-11-06T00:00:00.000Z',remindAheadMinutes:1440};await repository.transaction(s=>s.tasks.push(task));
  await workspace.runtime.tick(new Date('2026-11-05T12:00:00.000Z'));let state=await repository.transaction(s=>s);assert.equal(state.notifications.filter(n=>n.taskId===task.id).length,1);
  await workspace.runtime.tick(new Date('2026-11-05T12:00:01.000Z'));state=await repository.transaction(s=>s);assert.equal(state.notifications.filter(n=>n.taskId===task.id).length,1);
  let r=await action(server,'read_notice',{id:state.notifications.find(n=>n.taskId===task.id)!.id});assert.equal(r.statusCode,200,r.body);assert.equal((await repository.transaction(s=>s.tasks.find(t=>t.id===task.id)!)).status,'open');
  r=await action(server,'snooze_task',{id:task.id,until:'2026-11-06T10:00:00.000Z'});assert.equal(r.statusCode,200,r.body);assert.equal((await repository.transaction(s=>s.tasks.find(t=>t.id===task.id)!)).dueAt,task.dueAt);
 }finally{await server.close();}
});
test('AI workspace proposals require explicit confirmation and preserve exact request replay',async()=>{
 const server=createServer({auth:{mode:'local-bypass'}});try{
  let r=await server.inject({method:'POST',url:'/api/agent-workspace/proposals',payload:{title:'新增测试待办',action:'save_task',data:{title:'Synthetic proposed task',note:'',remindAheadMinutes:60}}});assert.equal(r.statusCode,200,r.body);const id=r.json().proposal.id;
  let view=(await server.inject({url:'/api/agent-workspace'})).json();assert(!view.tasks.some((x:any)=>x.title==='Synthetic proposed task'));
  r=await action(server,'confirm_proposal',{id});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().tasks.filter((x:any)=>x.title==='Synthetic proposed task').length,1);
  r=await action(server,'confirm_proposal',{id});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().tasks.filter((x:any)=>x.title==='Synthetic proposed task').length,1);
 }finally{await server.close();}
});
test('connector validation blocks private and mapped network addresses',()=>{for(const ip of ['127.0.0.1','169.254.169.254','10.0.0.1','172.16.0.1','192.168.1.1','::1','::ffff:127.0.0.1','fd00::1'])assert(privateAddress(ip),ip);assert.equal(privateAddress('8.8.8.8'),false);});

 test('explicit Shanghai business time cannot drift eight hours in AI proposals',async()=>{const {requestedShanghaiTime}=await import('../src/agent/time.ts');assert.equal(requestedShanghaiTime('请安排2026年11月6日18点补材料'),'2026-11-06T10:00:00.000Z');assert.equal(requestedShanghaiTime('2026年11月6日下午3点半'),'2026-11-06T07:30:00.000Z');assert.equal(requestedShanghaiTime('2026年2月30日18点'),undefined);assert.equal(requestedShanghaiTime('明天再说'),undefined);});
