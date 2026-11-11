import test from 'node:test';
import assert from 'node:assert/strict';
import {projectTaskView} from '../src/agent/business-task-view.ts';
import type {ProjectTask} from '../src/ledger/store.ts';
import type {WorkTask} from '../src/agent/model.ts';
test('all authorized project tasks survive unknown and different owners, deduplicated against personal projection',()=>{
 const base={id:'source',projectId:'project',name:'真实事项',owner:'未分配',ownerId:null,dueDate:'2026-11-06',status:'已逾期',priority:'高',note:'',type:'资料'} as ProjectTask;
 const prior={id:'business:source',ownerId:'old',scope:'personal',title:'旧标题',status:'complete',remindAheadMinutes:60} as WorkTask;
 const result=projectTaskView([base,{...base,id:'other',ownerId:'different-user'}],[prior]);
 assert.equal(result.length,2);assert.equal(result[0].ownerId,'');assert.equal(result[0].status,'open');assert.equal(result[0].title,base.name);assert.equal(result[0].remindAheadMinutes,60);assert.equal(result[0].dueAt,'2026-11-06T15:59:59.999Z');assert.ok(result[0].href?.includes('taskId=source'));
});
test('projection preserves source completion and cancellation; does not invent a deadline',()=>{
 const tasks=['已完成','已取消'].map((status,i)=>({id:String(i),projectId:'p',name:'t',status,dueDate:'',priority:'中'}) as ProjectTask);
 assert.deepEqual(projectTaskView(tasks,[]).map(t=>[t.status,t.dueAt]),[['complete',undefined],['cancelled',undefined]]);
});
test('report and fee tasks have stable source IDs and real deadlines, without inventing report due dates',async()=>{
 const {otherBusinessTaskView}=await import('../src/agent/business-task-view.ts');
 const rows=otherBusinessTaskView([{id:'r',name:'报告',status:'待审核',projectId:'p',target:'企业'}] as any,[{id:'c',company:'企业',fund:'基金',fundId:'f',projectId:null,status:'逾期',dueDate:'2026-11-05'}] as any);
 assert.deepEqual(rows.map(r=>r.id),['report:r','capital:c']);assert.equal(rows[0].dueAt,undefined);assert.ok(rows[0].href?.includes('reportId=r'));assert.equal(rows[1].dueAt,'2026-11-05T15:59:59.999Z');
});

test('API projection includes unassigned business tasks without publishing unrelated personal arrangements',async()=>{
 const {default:Fastify}=await import('fastify');const {createMemoryLedgerStore}=await import('../src/ledger/store.ts');const {AgentRepository}=await import('../src/agent/repository.ts');const {registerAgentWorkspaceRoutes}=await import('../src/http/agent-workspace.ts');
 const server=Fastify(),store=createMemoryLedgerStore(),repository=new AgentRepository();const workspace=registerAgentWorkspaceRoutes(server,store,{repository,auth:{mode:'local-bypass'},startScheduler:false});
 try{const project=(await store.listProjects())[0];await store.workflowTransaction(project.id,async s=>{s.tasks.push({id:'unassigned-qa',projectId:project.id,name:'未分配事项',ownerId:null,owner:'未分配',status:'未开始',dueDate:'2026-11-06',priority:'中',note:'',type:'资料'} as any);});
 await repository.transaction(s=>{s.tasks.push({id:'private-other',ownerId:'different',scope:'personal',title:'不可暴露的私人安排',note:'',status:'open',remindAheadMinutes:0});});
 const response=await server.inject({url:'/api/agent-workspace'});assert.equal(response.statusCode,200);const body=response.json();assert.equal(body.tasks.filter((t:any)=>t.id==='business:unassigned-qa').length,1);assert.equal(body.tasks.find((t:any)=>t.id==='business:unassigned-qa').canConfigureReminder,false);assert.equal(body.tasks.some((t:any)=>t.id==='private-other'),false);
 }finally{await server.close();}
});
test('disappearing source is not evidence that business work was completed',async()=>{
 const {default:Fastify}=await import('fastify');const {createMemoryLedgerStore}=await import('../src/ledger/store.ts');const {AgentRepository}=await import('../src/agent/repository.ts');const {registerAgentWorkspaceRoutes}=await import('../src/http/agent-workspace.ts');
 const server=Fastify(),store=createMemoryLedgerStore(),repository=new AgentRepository();const workspace=registerAgentWorkspaceRoutes(server,store,{repository,auth:{mode:'local-bypass'},startScheduler:false});
 try{const project=(await store.listProjects())[0];await store.workflowTransaction(project.id,async s=>{s.tasks.push({id:'missing-source-test',projectId:project.id,name:'待核验事项',ownerId:'user-admin',owner:'管理员',status:'未开始',dueDate:'2026-11-06',priority:'中',note:'',type:'资料'} as any);});await workspace.runtime.syncBusiness();
 await store.workflowTransaction(project.id,async s=>{s.tasks=s.tasks.filter(t=>t.id!=='missing-source-test');});await workspace.runtime.syncBusiness();const task=await repository.transaction(s=>s.tasks.find(t=>t.id==='business:missing-source-test'));assert.equal(task?.status,'open');assert.equal(task?.sourceUnavailable,true);await store.workflowTransaction(project.id,async s=>{s.tasks.push({id:'missing-source-test',projectId:project.id,name:'恢复事项',ownerId:'user-admin',owner:'管理员',status:'已完成',dueDate:'2026-11-06'} as any);});await workspace.runtime.syncBusiness();const restored=await repository.transaction(s=>s.tasks.find(t=>t.id==='business:missing-source-test'));assert.equal(restored?.sourceUnavailable,false);assert.equal(restored?.sourceStatus,undefined);assert.equal(restored?.status,'complete');
 }finally{await server.close();}
});

test('business destinations preserve specific project processing and source metadata',async()=>{
 const {projectTaskDestination,otherBusinessTaskView}=await import('../src/agent/business-task-view.ts');
 const base={id:'t /1',projectId:'p /1',kind:'review',approvalRoundId:'round-1',name:'审批',note:'',type:'审批',dataPurpose:'engineering_fixture'} as ProjectTask;
 assert.equal(new URL(projectTaskDestination(base),'http://local').searchParams.get('roundId'),'round-1');
 for(const [kind,type,tab] of [['diligence','尽调','尽调分析'],['post_clause','投后报告审核','报告记录'],['post_clause','退出方案审核','投资信息'],['manual','人工','任务待办']]){
  const url=new URL(projectTaskDestination({...base,kind,type} as ProjectTask),'http://local');assert.equal(url.searchParams.get('tab'),tab);assert.equal(url.searchParams.get('taskId'),base.id);
 }
 const ret=new URL(projectTaskDestination({...base,relation:'returns',note:JSON.stringify({sourceType:'return_basis',sourceId:'r',sourceVersion:2,contentHash:'a'.repeat(64),fundId:'f',dealId:'d'})}),'http://local');assert.equal(ret.searchParams.get('returnVersion'),'2');assert.equal(ret.hash,'#returns');
 assert.equal(projectTaskView([base],[])[0].dataPurpose,'engineering_fixture');
 const cap=otherBusinessTaskView([],[{id:'c1',fundId:'f1',company:'主体',fund:'基金',status:'未收',dueDate:'2026-11-08'}] as any)[0];const dest=new URL(cap.href!,'http://local');assert.equal(dest.searchParams.get('fundId'),'f1');assert.equal(dest.hash,'#capital-record-c1');assert.equal(cap.title,'资金事项待收：主体');
});

test('pending minutes and unresolved risks are real source work, with no invented deadlines',async()=>{
 const {otherBusinessTaskView}=await import('../src/agent/business-task-view.ts');
 const meetings=[{id:'m1',title:'待确认纪要',status:'待确认',scheduleStatus:'ended',projectId:'p1'},{id:'m2',title:'已归档',status:'已归档'},{id:'m3',title:'已取消会议',status:'待确认',scheduleStatus:'cancelled'}];
 const risks=[{id:'r1',title:'待跟进风险',status:'待跟进',level:'高',projectId:'p1'},{id:'r2',status:'已处理'},{id:'r3',status:'待跟进',deletedAt:'2026-11-08'}];
 const rows=otherBusinessTaskView([],[],meetings as any,risks as any);assert.deepEqual(rows.map(r=>r.id),['meeting:m1','risk:r1']);assert.equal(rows[0].dueAt,undefined);assert.equal(rows[1].dueAt,undefined);assert.ok(rows[0].href?.includes('meetingId=m1'));assert.ok(rows[1].href?.includes('riskId=r1'));
});
