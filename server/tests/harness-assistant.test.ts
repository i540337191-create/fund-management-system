import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTestServer} from './auth-fixture.ts';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
const done=(body:string)=>JSON.parse(body.split('\n\n').find(f=>f.startsWith('event: done'))!.split('\ndata: ')[1]).conversation;
const root=await mkdtemp(join(tmpdir(),'harness-api-test-'));const modulePath=join(root,'runner.mjs');await writeFile(modulePath,'export async function runBusinessHarness(args){return globalThis.__testBusinessHarness(args)}');process.env.FUNDAPP_HARNESS_MODULE=modulePath;
async function setup(run:(x:any)=>Promise<any>){(globalThis as any).__testBusinessHarness=run;const store=createMemoryLedgerStore();const server=createTestServer({ledgerStore:store,ai:{env:{QWEN_API_KEY:'synthetic'},fetchImpl:async()=>{throw Error('legacy provider must not run');}}});const c=(await server.inject({method:'POST',url:'/api/ai/conversations',payload:{requestId:randomUUID(),includeDemo:true}})).json();const body={requestId:randomUUID(),expectedRevision:c.revision,prompt:'工程验收，请先核对再准备报告'};return {store,server,c,body,path:`/api/ai/conversations/${c.id}`};}
test('context overflow and output truncation retain partial text and expose the right failure instead of a connection error',async()=>{
 for(const [code,message] of [['CONTEXT_WINDOW_EXCEEDED','上下文容量'],['MODEL_OUTPUT_LIMIT','生成长度限制']]){
  const f=await setup(async x=>{await x.onDelta('已收到的部分回复。');throw Object.assign(new Error('private provider diagnostic'),{code});});
  try{const res=await f.server.inject({method:'POST',url:f.path+'/turns',payload:f.body}),saved=done(res.body),reply=saved.messages.at(-1);assert.equal(reply.status,'error');assert.equal(reply.content,'已收到的部分回复。');assert(reply.error.includes(message));assert(!reply.error.includes('连接中断'));assert(!res.body.includes('private provider diagnostic'));assert.equal((await f.store.listTasks()).some(t=>t.name==='未授权写入'),false);}finally{await f.server.close();}
 }
});

test('agent reads business then prepares task/report; no business write before explicit confirmation, retries reuse saved result',async()=>{
 let toolNames:string[]=[];
 const {store,server,c,body,path}=await setup(async x=>{assert.equal(x.tools.some((t:any)=>/bash|sql|shell|confirm/.test(t.name)),false);const context=await x.onTool('read_business_context',{});const project=context.projects[0],owner=context.users.find((u:any)=>u.role==='admin');assert(project&&owner);
 const actions=[{kind:'task_create',body:{projectId:project.id,name:'Harness合成验收任务',type:'人工任务',stage:'投后',ownerId:owner.id,dueDate:'2026-11-05',priority:'中',relation:'工程验收'}},{kind:'report_draft',body:{targetType:'project',targetId:project.id,name:'Harness合成验收报告',type:'项目初筛报告',sections:[{title:'范围',text:'仅工程验证，缺业务资料不可定稿。'}]}}];
 const a=await x.onTool('prepare_actions',{actions:JSON.stringify(actions)});assert.equal(a.pendingOnly,true);const replay=await x.onTool('prepare_actions',{actions:JSON.stringify(actions)});assert.deepEqual(replay,a);toolNames=x.tools.map((t:any)=>t.name);await x.onDelta('已整理两项待确认事项。');return {text:'已整理两项待确认事项。',toolCalls:3};});
 try{const beforeTasks=(await store.listTasks()).length,beforeReports=(await store.listReports()).length;const response=await server.inject({method:'POST',url:path+'/turns',payload:body});assert.equal(response.statusCode,200,response.body);const saved=done(response.body);assert.equal(saved.messages.at(-1).status,'complete');assert.equal(saved.messages.at(-1).activities.length,3);assert(saved.messages.at(-1).activities.every((x:any)=>x.status==='complete'));assert.match(response.body,/event: activity/);assert.equal((await store.listTasks()).length,beforeTasks);assert.equal((await store.listReports()).length,beforeReports);
 const cards=(await server.inject({url:path+'/actions'})).json().actions;assert.equal(cards.length,2);assert(cards.every((x:any)=>x.state==='pending'));
 const first=await server.inject({method:'POST',url:path+'/actions/'+cards[0].id+'/confirm',payload:{confirmed:true}});assert.equal(first.statusCode,200,first.body);const retry=await server.inject({method:'POST',url:path+'/actions/'+cards[0].id+'/confirm',payload:{confirmed:true}});assert.equal(retry.statusCode,200);assert.equal((await store.listTasks()).length,beforeTasks+1);
 const report=await server.inject({method:'POST',url:path+'/actions/'+cards[1].id+'/confirm',payload:{confirmed:true}});assert.equal(report.statusCode,200,report.body);assert.match(report.json().action.resultHref,/^\/reports\?reportId=report-/);assert.equal((await store.listReports()).length,beforeReports+1);const again=await server.inject({method:'POST',url:path+'/turns',payload:body});assert.equal(again.json().replay,true);assert.equal((await server.inject({url:path+'/actions'})).json().actions.length,2);assert.ok(toolNames.includes('read_selected_materials'));assert.deepEqual(new Set(toolNames),new Set(['inspect_selected_image','read_skill_materials','read_agent_workspace','prepare_agent_workspace','read_plugin','read_business_context','read_selected_materials','search_materials','read_conversation','read_workflow','prepare_workflow','prepare_actions']));
 }finally{await server.close();}
});
test('unknown proposal identity fails without cards or business mutation and ends with verified failure',async()=>{
 const {store,server,body,path}=await setup(async x=>{await x.onDelta('正在核对。49afeb41-1b4a-41a2-');await x.onTool('prepare_actions',{actions:JSON.stringify([{kind:'report_draft',body:{targetType:'project',targetId:randomUUID(),name:'不可保存',sections:[{title:'x',text:'x'}]}}])});throw Error('unreachable');});
 try{const before=(await store.listReports()).length;const response=await server.inject({method:'POST',url:path+'/turns',payload:body});const saved=done(response.body);assert.equal(saved.messages.at(-1).status,'error');assert.match(saved.messages.at(-1).content,/未能生成办理确认卡/);assert.doesNotMatch(saved.messages.at(-1).content,/49afeb41/);assert.equal((await server.inject({url:path+'/actions'})).json().actions.length,0);assert.equal((await store.listReports()).length,before);}finally{await server.close();}
});
test('stop aborts the runtime and late tools cannot prepare cards',async()=>{
 let ready!:()=>void;const started=new Promise<void>(r=>ready=r);let stopped=false,lateDenied=false;
 const {server,body,path}=await setup(async x=>{await x.onDelta('已开始查阅。金额169.86');ready();await new Promise<void>(r=>x.signal.addEventListener('abort',()=>{stopped=true;r();},{once:true}));try{await x.onTool('read_business_context',{});}catch{lateDenied=true;}throw Error('aborted');});
 try{const pending=server.inject({method:'POST',url:path+'/turns',payload:body});await started;const stop=await server.inject({method:'POST',url:path+'/stop',payload:{}});assert.equal(stop.statusCode,200);const saved=done((await pending).body);assert(stopped&&lateDenied);assert.equal(saved.messages.at(-1).status,'stopped');assert.equal(saved.messages.at(-1).content,'已开始查阅。金额169.86');assert.equal((await server.inject({url:path+'/actions'})).json().actions.length,0);}finally{await server.close();}
});

test('workflow tool prepares a real diligence action without writing; confirmation and retry use original workflow gates',async()=>{
 const f=await setup(async x=>{const context=await x.onTool('read_business_context',{}),project=context.projects[0],owner=context.users.find((u:any)=>u.role==='admin');
 const read=await x.onTool('read_workflow',{module:'diligence',targetId:project.id});assert(read.operations.some((v:any)=>v.operation==='add_item'));assert(read.operations.some((v:any)=>v.operation==='review_item'));assert(!read.operations.some((v:any)=>/delete/.test(v.operation)));
 await x.onTool('prepare_workflow',{module:'diligence',targetId:project.id,operation:'add_item',body:JSON.stringify({title:'对话尽调补充资料',category:'法务',ownerId:owner.id,dueDate:'2026-11-05',requirements:[{id:'req-1',title:'补充验收说明'}]})});await x.onDelta('已准备一项尽调事项，尚未执行。');return {text:'已准备一项尽调事项，尚未执行。',toolCalls:3};});
 try{const project=(await f.store.listProjects())[0];await f.store.workflowTransaction(project.id,s=>{s.project.ownerId='user-admin';});const init=await f.server.inject({method:'POST',url:`/api/projects/${project.id}/diligence`,payload:{requestId:randomUUID(),reviewerIds:['user-admin'],note:'仅工程验收'}});assert.equal(init.statusCode,201,init.body);
 const response=await f.server.inject({method:'POST',url:f.path+'/turns',payload:f.body});assert.equal(done(response.body).messages.at(-1).status,'complete',response.body);const before=(await f.server.inject({url:`/api/projects/${project.id}/diligence`})).json();assert.equal(before.diligence.items.length,0);
 const cards=(await f.server.inject({url:f.path+'/actions'})).json().actions;assert.equal(cards.length,1);assert.equal(cards[0].title,'新增尽调事项');
 for(let i=0;i<2;i++){const saved=await f.server.inject({method:'POST',url:f.path+'/actions/'+cards[0].id+'/confirm',payload:{confirmed:true}});assert.equal(saved.statusCode,200,saved.body);}
 const after=(await f.server.inject({url:`/api/projects/${project.id}/diligence`})).json();assert.equal(after.diligence.items.length,1);assert.equal(after.diligence.items[0].title,'对话尽调补充资料');
 (globalThis as any).__testBusinessHarness=async(x:any)=>{const context=await x.onTool('read_business_context',{}),read=await x.onTool('read_workflow',{module:'diligence',targetId:project.id}),item=read.data.diligence.items[0];assert(item.id);await x.onTool('prepare_workflow',{module:'diligence',targetId:project.id,operation:'update_item',body:JSON.stringify({itemId:item.id,title:'已核对后的尽调事项',category:item.category,ownerId:item.owner.id,dueDate:item.dueDate,requirements:item.requirements})});return {text:'修改建议待确认。',toolCalls:3};};
 const c2=(await f.server.inject({url:f.path})).json();const updated=await f.server.inject({method:'POST',url:f.path+'/turns',payload:{...f.body,requestId:randomUUID(),expectedRevision:c2.revision}});assert.equal(done(updated.body).messages.at(-1).status,'complete',updated.body);
 const pending=(await f.server.inject({url:f.path+'/actions'})).json().actions.find((x:any)=>x.state==='pending');assert(pending);const change=pending.details.find((x:any)=>x.label==='标题');assert.equal(change.before,'对话尽调补充资料');assert.equal(change.after,'已核对后的尽调事项');const saved=await f.server.inject({method:'POST',url:f.path+'/actions/'+pending.id+'/confirm',payload:{confirmed:true}});assert.equal(saved.statusCode,200,saved.body);assert.equal((await f.server.inject({url:`/api/projects/${project.id}/diligence`})).json().diligence.items[0].title,'已核对后的尽调事项');

 }finally{await f.server.close();}
});
test('workflow catalog rejects arbitrary modules, cross-object and approval operations without preparing cards',async()=>{
 const f=await setup(async x=>{const context=await x.onTool('read_business_context',{}),targetId=context.projects[0].id;await assert.rejects(x.onTool('read_workflow',{module:'../../users',targetId}));await assert.rejects(x.onTool('read_workflow',{module:'diligence',targetId:randomUUID()}));await assert.rejects(x.onTool('prepare_workflow',{module:'diligence',targetId,operation:'review_report',body:'{}'}));await x.onDelta('该操作需要责任人处理。');return {text:'该操作需要责任人处理。',toolCalls:4};});
 try{const response=await f.server.inject({method:'POST',url:f.path+'/turns',payload:f.body});assert.equal(done(response.body).messages.at(-1).status,'error');assert.equal((await f.server.inject({url:f.path+'/actions'})).json().actions.length,0);assert(done(response.body).messages.at(-1).activities.some((x:any)=>x.status==='error'));}finally{await f.server.close();}
});
test('historical retrieval returns a window containing a match beyond the first 2000 characters',async()=>{
 const f=await setup(async x=>{const result=await x.onTool('read_conversation',{query:'中段关键约定'});assert(result.messages.some((m:any)=>m.content.includes('中段关键约定')));assert(result.messages.every((m:any)=>m.content.length<=2000));return {text:'已回查原文。',toolCalls:1};});
 try{await f.store.assistantTransaction('user-admin:admin',s=>{const c=s.conversations.find(c=>c.id===f.c.id)!;c.messages.push({id:randomUUID(),role:'user',content:'前'.repeat(5000)+'中段关键约定',status:'complete',createdAt:new Date().toISOString()},{id:randomUUID(),role:'assistant',content:'已收到。',status:'complete',createdAt:new Date().toISOString()});c.revision++;});const res=await f.server.inject({method:'POST',url:f.path+'/turns',payload:{...f.body,expectedRevision:f.c.revision+1}});assert.equal(done(res.body).messages.at(-1).status,'complete',res.body);}finally{await f.server.close();}
});
test('a caught preparation failure cannot be reported as a prepared card',async()=>{
 const f=await setup(async x=>{await x.onTool('read_business_context',{});try{await x.onTool('prepare_actions',{actions:JSON.stringify([{kind:'report_draft',body:{targetType:'project',targetId:randomUUID(),name:'不存在的对象',sections:[{title:'范围',text:'合成'}]}}])});}catch{}await x.onDelta('确认卡已准备好，请确认。');return {text:'确认卡已准备好，请确认。',toolCalls:2};});
 try{const res=await f.server.inject({method:'POST',url:f.path+'/turns',payload:f.body}),saved=done(res.body);assert.equal(saved.messages.at(-1).status,'error');assert.doesNotMatch(saved.messages.at(-1).content,/已准备好/);assert.match(saved.messages.at(-1).content,/未能生成/);assert.match(res.body,/event: replace/);assert.equal((await f.server.inject({url:f.path+'/actions'})).json().actions.length,0);}finally{await f.server.close();}
});
test('task preparation uses normal manual category and actual project stage, then confirmation succeeds',async()=>{
 const f=await setup(async x=>{const context=await x.onTool('read_business_context',{}),p=context.projects[0],u=context.users.find((u:any)=>u.role==='admin');await x.onTool('prepare_actions',{actions:JSON.stringify([{kind:'task_create',body:{projectId:p.id,name:'缺省类别验收任务',type:'',stage:'',ownerId:u.id,dueDate:'2026-11-05',priority:'中',relation:'',note:''}}])});return {text:'请核对确认卡。',toolCalls:2};});
 try{const res=await f.server.inject({method:'POST',url:f.path+'/turns',payload:f.body});assert.equal(done(res.body).messages.at(-1).status,'complete');const cards=(await f.server.inject({url:f.path+'/actions'})).json().actions;assert.equal(cards[0].details.find((x:any)=>x.label==='类别').after,'人工任务');assert.equal(cards[0].details.find((x:any)=>x.label==='阶段').after,(await f.store.listProjects())[0].stage);const confirm=await f.server.inject({method:'POST',url:f.path+'/actions/'+cards[0].id+'/confirm',payload:{confirmed:true}});assert.equal(confirm.statusCode,200,confirm.body);}finally{await f.server.close();}
});
test('preparation failure followed by recovery reports actual saved cards and rejects invalid dates early',async()=>{
 const f=await setup(async x=>{await assert.rejects(x.onTool('prepare_actions',{actions:'[]'}),/business_context_read_required/);const context=await x.onTool('read_business_context',{}),p=context.projects[0],u=context.users.find((u:any)=>u.role==='admin');const body={projectId:p.id,name:'恢复验收任务',ownerId:u.id,dueDate:'2026-02-30',priority:'中'};await assert.rejects(x.onTool('prepare_actions',{actions:JSON.stringify([{kind:'task_create',body}])}));body.dueDate='2026-11-05';await x.onTool('prepare_actions',{actions:JSON.stringify([{kind:'task_create',body}])});await x.onDelta('两项卡片均已准备好。');return {text:'两项卡片均已准备好。',toolCalls:4};});
 try{const res=await f.server.inject({method:'POST',url:f.path+'/turns',payload:f.body}),saved=done(res.body);assert.equal(saved.messages.at(-1).status,'complete');assert.match(saved.messages.at(-1).content,/实际生成了1项/);assert.doesNotMatch(saved.messages.at(-1).content,/两项卡片/);assert.equal((await f.server.inject({url:f.path+'/actions'})).json().actions.length,1);}finally{await f.server.close();}
});
test('empty preparations and failures followed by disconnect cannot persist a false success claim',async()=>{
 for(const interrupted of [false,true]){const f=await setup(async x=>{await x.onTool('read_business_context',{});if(interrupted){try{await x.onTool('prepare_actions',{actions:'broken-json'});}catch{}}else await x.onTool('prepare_actions',{actions:'[]'});await x.onDelta('确认卡已生成，请确认。');if(interrupted)throw Error('connection lost');return {text:'确认卡已生成，请确认。',toolCalls:2};});try{const res=await f.server.inject({method:'POST',url:f.path+'/turns',payload:f.body}),saved=done(res.body);assert.equal(saved.messages.at(-1).status,'error');assert.doesNotMatch(saved.messages.at(-1).content,/确认卡已生成/);assert.match(saved.messages.at(-1).content,/未能生成/);assert(!res.body.split('event: replace')[0].includes('确认卡已生成'));}finally{await f.server.close();}}
});
test('stopping after a failed preparation preserves stopped status and no invented success',async()=>{
 let ready!:()=>void;const started=new Promise<void>(r=>ready=r);const f=await setup(async x=>{await x.onTool('read_business_context',{});try{await x.onTool('prepare_actions',{actions:'bad-json'});}catch{}await x.onDelta('确认卡已生成，请确认。');ready();await new Promise<void>(r=>x.signal.addEventListener('abort',()=>r(),{once:true}));throw Error('stopped');});try{const pending=f.server.inject({method:'POST',url:f.path+'/turns',payload:f.body});await started;await f.server.inject({method:'POST',url:f.path+'/stop',payload:{}});const saved=done((await pending).body);assert.equal(saved.messages.at(-1).status,'stopped');assert.match(saved.messages.at(-1).content,/本轮已停止/);assert.doesNotMatch(saved.messages.at(-1).content,/确认卡已生成/);}finally{await f.server.close();}
});
test.after(async()=>{delete process.env.FUNDAPP_HARNESS_MODULE;delete (globalThis as any).__testBusinessHarness;await rm(root,{recursive:true,force:true});});
test('business advice receives clickable authorized entries even when the model omits them',async()=>{
 const f=await setup(async x=>{assert.match(x.system,/必须在对应建议旁提供Markdown可点击入口/);const pack=await x.onTool('read_business_context',{});assert.equal(pack.projects[0].href,`/projects/${encodeURIComponent(pack.projects[0].id)}`);return {text:'请补齐资料，然后查看报告并审核。',toolCalls:1};});
 try{const response=await f.server.inject({method:'POST',url:f.path+'/turns',payload:f.body}),reply=done(response.body).messages.at(-1);assert.equal(reply.status,'complete',response.body);assert.match(reply.content,/\[上传与管理资料\]\(\/materials\)/);assert.match(reply.content,/\[报告审核与正文\]\(\/reports\)/);const history=(await f.server.inject({url:f.path})).json();assert.match(history.messages.at(-1).content,/\]\(\/reports\)/);}finally{await f.server.close();}
});
test('explicit entry requests bypass provider guesses and ambiguous requests ask a contextual question',async()=>{
 for(const [prompt,prior,pattern] of [['资料库/文件列表 的入口','报告还有缺件',/\[上传并补充资料\]\(\/materials\?upload=1\)/],['给我一个入口','资料库和报告都要补全',/哪个入口/],['给我一个入口','请补充资料库原件',/\[资料库 \/ 文件列表\]\(\/materials\)/]] as const){
  const f=await setup(async()=>{throw Error('entry navigation must not guess through provider');});
  try{await f.store.assistantTransaction('user-admin:admin',s=>{s.conversations.find(c=>c.id===f.c.id)!.messages.push({id:randomUUID(),role:'assistant',status:'complete',content:prior,createdAt:new Date().toISOString()});});const response=await f.server.inject({method:'POST',url:f.path+'/turns',payload:{...f.body,prompt}});const reply=done(response.body).messages.at(-1);assert.equal(reply.status,'complete',response.body);assert.match(reply.content,pattern);if(prior.includes('都要'))assert(!reply.content.includes('](/materials)'));}finally{await f.server.close();}
 }
});
test('failed tool activity safely persists a reason without replacing historical errors',async()=>{
 const f=await setup(async x=>{try{await x.onTool('prepare_actions',{actions:'[]'});}catch{}return {text:'请先核对业务。',toolCalls:1};});
 try{const res=await f.server.inject({method:'POST',url:f.path+'/turns',payload:f.body}),reply=done(res.body).messages.at(-1);const failed=reply.activities.find((x:any)=>x.status==='error');assert.equal(failed.errorCode,'business_context_read_required');assert.match(failed.errorMessage,/业务上下文/);const saved=(await f.server.inject({url:f.path})).json().messages.at(-1);assert.equal(saved.activities[0].errorCode,failed.errorCode);}finally{await f.server.close();}
});

test('workflow discovery is available before the first call and a fund report query is bound to the fund scope',async()=>{
 const f=await setup(async x=>{
  const initial=JSON.parse(x.prompt).controlledContext;
  assert(initial.workflowCatalog.some((m:any)=>m.module==='reports'&&m.scope==='project'));
  assert(initial.workflowCatalog.some((m:any)=>m.module==='fund_reports'&&m.scope==='fund'));
  const tool=x.tools.find((t:any)=>t.name==='read_workflow');
  assert(tool.parameters.module.enum.includes('fund_reports'));
  assert(!tool.parameters.module.enum.includes('report_review'));
  const fund=initial.funds[0];assert(tool.parameters.targetId.enum.includes(fund.id));
  const read=await x.onTool('read_workflow',{module:'reports',targetId:fund.id});
  assert.equal(read.module,'fund_reports');assert.equal(read.targetId,fund.id);
  assert(read.data.reports.every((r:any)=>r.fundId===fund.id));
  return {text:'已读取当前基金报告，请进入报告页面核对。',toolCalls:1};
 });
 try{const before=(await f.store.listReports()).length;const response=await f.server.inject({method:'POST',url:f.path+'/turns',payload:f.body}),reply=done(response.body).messages.at(-1);assert.equal(reply.status,'complete');assert(reply.activities.every((s:any)=>s.status==='complete'));assert.equal((await f.store.listReports()).length,before);}finally{await f.server.close();}
});

test('equivalent workflow preparations reuse one card across report aliases, key order and JSON whitespace',async()=>{
 const f=await setup(async x=>{
  const c=await x.onTool('read_business_context',{}),fund=c.funds[0];
  const read=await x.onTool('read_workflow',{module:'reports',targetId:fund.id}),report=read.data.reports[0];
  const body={reportId:report.id,sections:[{title:'核对范围',text:'待人工核对的正文。'}]};
  const one=await x.onTool('prepare_workflow',{module:'reports',targetId:fund.id,operation:'content',body:JSON.stringify(body)});
  const two=await x.onTool('prepare_workflow',{body:JSON.stringify({sections:[{text:'待人工核对的正文。',title:'核对范围'}],reportId:report.id},null,2),operation:'content',targetId:fund.id,module:'fund_reports'});
  assert.deepEqual(two,one);
  return {text:'已准备一张待确认的报告正文修改卡。',toolCalls:4};
 });
 try{const r=await f.server.inject({method:'POST',url:f.path+'/turns',payload:f.body});assert.equal(done(r.body).messages.at(-1).status,'complete');const cards=(await f.server.inject({url:f.path+'/actions'})).json().actions;assert.equal(cards.length,1);assert.equal(cards[0].state,'pending');}finally{await f.server.close();}
});

test('later turns receive current confirmation receipts and distinct report module contracts',async()=>{
 let round=0;
 const f=await setup(async x=>{
  const context=JSON.parse(x.prompt).controlledContext;
  assert.match(context.workflowCatalog.find((m:any)=>m.module==='diligence').reportContract,/独立/);
  assert.match(context.workflowCatalog.find((m:any)=>m.module==='reports').reportContract,/不包含尽调/);
  if(round++===0){
   assert.deepEqual(context.workflowActions,[]);
   const data=await x.onTool('read_business_context',{});
   await x.onTool('prepare_actions',{actions:JSON.stringify([{kind:'report_draft',body:{targetType:'project',targetId:data.projects[0].id,name:'回执接续报告',type:'项目报告',sections:[{title:'摘要',text:'测试'}]}}])});
  }else{
   assert.equal(context.workflowActions.length,1);
   assert.equal(context.workflowActions[0].state,'applied');
   assert.match(context.workflowActions[0].resultHref,/reports\?reportId=/);
   assert.match(x.system,/优先于历史回复/);
   assert.match(x.system,/尽调报告使用diligence/);
  }
  await x.onDelta('已核对当前回执。');return {text:'已核对当前回执。',toolCalls:round===1?2:0};
 });
 try{
  assert.equal(done((await f.server.inject({method:'POST',url:f.path+'/turns',payload:f.body})).body).messages.at(-1).status,'complete');
  const card=(await f.server.inject(f.path+'/actions')).json().actions[0];
  assert.equal((await f.server.inject({method:'POST',url:f.path+'/actions/'+card.id+'/confirm',payload:{confirmed:true}})).statusCode,200);
  const c=(await f.server.inject(f.path)).json();
  const response=await f.server.inject({method:'POST',url:f.path+'/turns',payload:{requestId:randomUUID(),expectedRevision:c.revision,prompt:'继续刚才已确认的报告'}});
  assert.equal(done(response.body).messages.at(-1).status,'complete',response.body);
  assert.equal(round,2);
 }finally{await f.server.close();}
});
test('weekly preparation rejects a mismatched explicit week before creating any workspace card',async()=>{const f=await setup(async x=>{await x.onTool('read_agent_workspace',{});await assert.rejects(x.onTool('prepare_agent_workspace',{action:'save_weekly',title:'错误周次QA',data:JSON.stringify({title:'QA未保存',week:'2026-W45',thisWeek:'仅QA',nextWeek:'仅QA'})}),{code:'weekly_week_mismatch'});return {text:'请核对2027-W01的具体工作内容，尚未保存。',toolCalls:2};});try{f.body.prompt='请整理2027-W01周报，先准备确认卡，不保存。';const r=await f.server.inject({method:'POST',url:f.path+'/turns',payload:f.body});assert.equal(r.statusCode,200,r.body);const workspace=(await f.server.inject('/api/agent-workspace')).json();assert.equal(workspace.proposals.filter((p:any)=>p.action==='save_weekly').length,0);assert.equal(workspace.weeklyReports.length,0);}finally{await f.server.close();}});
test('weekly preparation refuses duplicate-shaped updates without an existing record identity',async()=>{const f=await setup(async x=>{await x.onTool('read_agent_workspace',{});await assert.rejects(x.onTool('prepare_agent_workspace',{action:'save_weekly',title:'QA已存周报',data:JSON.stringify({title:'QA已存周报',week:'2027-W01',thisWeek:'仅QA整理',nextWeek:'仅QA计划',status:'draft',taskIds:[]})}),{code:'weekly_target_required'});await assert.rejects(x.onTool('prepare_agent_workspace',{action:'save_weekly',title:'QA已存周报',data:JSON.stringify({id:'qa-existing',version:1,week:'2027-W01',thisWeek:'仅QA',nextWeek:'仅QA',taskIds:[]})}),{code:'weekly_fields_required'});return {text:'需要重新核对已有周报目标，尚未保存。',toolCalls:2};});try{const state=(await f.server.inject('/api/agent-workspace')).json();const saved=await f.server.inject({method:'POST',url:'/api/agent-workspace/actions',payload:{requestId:randomUUID(),expectedRevision:state.revision,action:'save_weekly',data:{title:'QA已存周报',week:'2027-W01',thisWeek:'仅QA',nextWeek:'仅QA计划',taskIds:[]}}});assert.equal(saved.statusCode,200,saved.body);f.body.prompt='请修改已有2027-W01周报，只整理不新增。';const r=await f.server.inject({method:'POST',url:f.path+'/turns',payload:f.body});assert.equal(r.statusCode,200,r.body);const after=(await f.server.inject('/api/agent-workspace')).json();assert.equal(after.weeklyReports.length,1);assert.equal(after.weeklyReports[0].thisWeek,'仅QA');assert.equal(after.proposals.filter((p:any)=>p.action==='save_weekly').length,0);}finally{await f.server.close();}});
