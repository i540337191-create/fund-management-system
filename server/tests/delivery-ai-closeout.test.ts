import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createMemoryLedgerStore,type LedgerStore} from '../src/ledger/store.ts';
import {createTestServer,registeredCookie} from './auth-fixture.ts';
import {workflowCatalog} from '../src/ai/workflow-tools.ts';
import {prepareEntity} from '../src/ai/entity-tools.ts';
const response=(actions:any[])=>({ok:true,status:200,text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify({actions})}}]})});
const report=(projectId:string,name:string)=>({kind:'report_draft',body:{name,targetId:projectId,targetType:'project',type:'项目初筛报告',sections:[{title:'待核对草稿',text:'本段为独立工程验证数据，待人工核对。'}]}});
async function make(server:any){const r=await server.inject({method:'POST',url:'/api/ai/conversations',payload:{requestId:randomUUID(),includeDemo:true}});assert.equal(r.statusCode,200,r.body);return r.json();}
async function waitBatch(server:any,c:any,status:string){for(let i=0;i<200;i++){const r=await server.inject({url:`/api/ai/conversations/${c.id}/actions/batch`});assert.equal(r.statusCode,200,r.body);if(r.json().batch?.status===status)return r.json().batch;await new Promise(r=>setTimeout(r,5));}assert.fail('batch did not reach '+status);}

test('meeting creation validates explicit task deadline, retries once, and distinct meetings never overwrite tasks',async()=>{
 const store=createMemoryLedgerStore(),project=(await store.listProjects())[0],server=createTestServer({ledgerStore:store});
 const body={requestId:randomUUID(),projectId:project.id,title:'工程验收会议甲',date:'2026-11-04',taskDueDate:'2026-11-10',attendees:'工程验收人员',summary:'独立工程验收记录',conclusions:['待人工核对'],todoItems:['核对工程样例'],riskItems:[]};
 try{
  const first=await server.inject({method:'POST',url:'/api/meetings',payload:body});assert.equal(first.statusCode,200,first.body);
  const id=first.json().meeting.id;const replay=await server.inject({method:'POST',url:'/api/meetings',payload:body});assert.equal(replay.json().meeting.id,id);
  const conflict=await server.inject({method:'POST',url:'/api/meetings',payload:{...body,title:'不同内容'}});assert.equal(conflict.statusCode,409);
  const missing=await server.inject({method:'POST',url:'/api/meetings',payload:{...body,requestId:randomUUID(),taskDueDate:undefined}});assert.equal(missing.statusCode,400);
  const c1=await server.inject({method:'POST',url:`/api/meetings/${id}/confirm`});assert.equal(c1.statusCode,200,c1.body);assert.equal(c1.json().tasks[0].dueDate,body.taskDueDate);
  const second=await server.inject({method:'POST',url:'/api/meetings',payload:{...body,requestId:randomUUID(),title:'工程验收会议乙'}});assert.equal(second.statusCode,200,second.body);
  const c2=await server.inject({method:'POST',url:`/api/meetings/${second.json().meeting.id}/confirm`});assert.equal(c2.statusCode,200,c2.body);assert.notEqual(c1.json().tasks[0].id,c2.json().tasks[0].id);
  const protectedServer=createTestServer({ledgerStore:store,auth:{mode:'password',sessionSecret:'delivery-fixture-only'}});try{const viewer=await registeredCookie(protectedServer,{id:'closeout-viewer',name:'工程只读',email:'closeout-viewer@example.test',role:'viewer'},'delivery-fixture-only');const denied=await protectedServer.inject({method:'POST',url:'/api/meetings',headers:{cookie:viewer},payload:{...body,requestId:randomUUID()}});assert.equal(denied.statusCode,403);}finally{await protectedServer.close();}
 }finally{await server.close();}
});

test('authorized batch persists steps, stops on partial failure, and resumes after server restart without duplicate business records',async()=>{
 const raw=createMemoryLedgerStore(),project=(await raw.listProjects())[0];let failSecond=true;
 const store=new Proxy(raw,{get(target,key){if(key==='createReport')return async(...args:any[])=>{if(failSecond&&args[0].name==='工程批次乙')throw Error('synthetic second step unavailable');return (target.createReport as any)(...args);};return Reflect.get(target,key);}}) as LedgerStore;
 const options={ledgerStore:store,ai:{env:{QWEN_API_KEY:'synthetic'},fetchImpl:async()=>response([report(project.id,'工程批次甲'),report(project.id,'工程批次乙')])}};
 let server=createTestServer(options);
 try{
  const c=await make(server),url=`/api/ai/conversations/${c.id}/actions`;
  const p=await server.inject({method:'POST',url,payload:{requestId:randomUUID(),expectedRevision:c.revision,instruction:'保存这两份工程草稿'}});assert.equal(p.statusCode,200,p.body);assert(p.json().actions.every((x:any)=>x.batchEligible));
  assert.equal((await raw.listReports()).filter(r=>r.name.startsWith('工程批次')).length,0);
  const payload={requestId:randomUUID(),confirmed:true,actionIds:p.json().actions.map((x:any)=>x.id)};
  const run=await server.inject({method:'POST',url:url+'/batch',payload});assert.equal(run.statusCode,200,run.body);
  const interrupted=await waitBatch(server,c,'interrupted');assert.equal(interrupted.completed,1);
  await server.close();failSecond=false;server=createTestServer(options);
  const resumed=await server.inject({method:'POST',url:url+'/batch',payload});assert.equal(resumed.statusCode,200,resumed.body);assert.equal((await waitBatch(server,c,'complete')).completed,2);
  const replay=await server.inject({method:'POST',url:url+'/batch',payload});assert.equal(replay.statusCode,200);assert.equal((await raw.listReports()).filter(r=>r.name.startsWith('工程批次')).length,2);
 }finally{await server.close();}
});

test('entity preparation rejects missing scope, duplicate names and unauthorized actors; workflow catalog offers explicit confirmation boundaries',()=>{
 const context={companies:[{id:'company-a',name:'已有企业'}],projects:[],funds:[],users:[]};
 const admin={id:'admin',name:'管理员',email:'admin',role:'admin' as const};
 assert.throws(()=>prepareEntity('company_create',{name:'已有企业',shortName:'已有',industry:'测试'},admin,randomUUID(),context),/company_name_conflict/);
 assert.throws(()=>prepareEntity('company_create',{name:'新企业',shortName:'新',industry:'测试'},{...admin,role:'viewer'},randomUUID(),context),/forbidden/);
 assert.throws(()=>prepareEntity('meeting_create',{projectId:'outside',title:'测试',date:'2026-11-04',attendees:'测试',summary:'测试',conclusions:[],todoItems:[],riskItems:[]},admin,randomUUID(),context),/action_object_unavailable/);
 for(const module of workflowCatalog())assert(module.boundary.includes('逐项确认'));assert(workflowCatalog().find(x=>x.module==='approvals')!.operations.some(x=>x.operation==='decide'));
 assert(workflowCatalog().find(x=>x.module==='investors')!.operations.some(x=>x.operation==='create'));
});

test('one confirmed batch creates a project then resolves its real ID into the dependent report',async()=>{
 const store=createMemoryLedgerStore(),fund=(await store.listFunds())[0];let actions:any[]=[];
 const server=createTestServer({ledgerStore:store,ai:{env:{QWEN_API_KEY:'synthetic'},fetchImpl:async()=>response(actions)}});
 try{
  const users=(await server.inject({url:'/api/users'})).json().users,manager=users.find((u:any)=>u.canLogin&&u.role==='admin');assert(manager);
  actions=[{kind:'project_create',body:{name:'工程依赖项目',shortName:'工程依赖',industry:'工程测试',fundId:fund.id,manager:manager.name,collaborators:'',sourceChannel:'独立测试',description:'不代表真实业务'}},{kind:'report_draft',body:{targetType:'project',targetRef:'工程依赖项目',name:'工程依赖报告',type:'项目初筛报告',sections:[{title:'范围',text:'工程验收草稿'}]}}];
  const c=await make(server),url=`/api/ai/conversations/${c.id}/actions`,p=await server.inject({method:'POST',url,payload:{requestId:randomUUID(),expectedRevision:c.revision,instruction:'先建立工程项目并保存关联报告草稿'}});assert.equal(p.statusCode,200,p.body);
  const started=await server.inject({method:'POST',url:url+'/batch',payload:{requestId:randomUUID(),confirmed:true,actionIds:p.json().actions.map((x:any)=>x.id)}});assert.equal(started.statusCode,200,started.body);
  await waitBatch(server,c,'complete');const project=(await store.listProjects()).find(p=>p.name==='工程依赖项目')!,r=(await store.listReports()).find(r=>r.name==='工程依赖报告')!;assert(project&&r);assert.equal(r.projectId,project.id);assert(!project.id.startsWith('pending-'));
 }finally{await server.close();}
});

test('closing the browser stream does not cancel server preparation; the completed reply remains readable',async()=>{
 const previous=process.env.FUNDAPP_HARNESS_MODULE;delete process.env.FUNDAPP_HARNESS_MODULE;
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let providerAborted=false;
 const store=createMemoryLedgerStore(),server=createTestServer({ledgerStore:store,ai:{env:{QWEN_API_KEY:'synthetic'},fetchImpl:async(_url,init)=>{init?.signal?.addEventListener('abort',()=>{providerAborted=true;});return new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"已开始整理。"}}]}\n\n'));void gate.then(()=>{controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"后台整理已完成。"}}]}\n\ndata: [DONE]\n\n'));controller.close();});}}),{headers:{'content-type':'text/event-stream'}});}}});
 const clientAbort=new AbortController();
 try{
  await server.listen({host:'127.0.0.1',port:0});const address=server.server.address();assert(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}`,c=await make(server);
  const streamed=await fetch(base+`/api/ai/conversations/${c.id}/turns`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({requestId:randomUUID(),expectedRevision:c.revision,prompt:'请整理本轮说明'}),signal:clientAbort.signal});assert.equal(streamed.status,200);const reader=streamed.body!.getReader();await reader.read();clientAbort.abort();await new Promise(r=>setTimeout(r,30));assert.equal(providerAborted,false);release();
  let saved:any;for(let i=0;i<100;i++){saved=(await server.inject({url:`/api/ai/conversations/${c.id}`})).json();if(!saved.activeRequestId)break;await new Promise(r=>setTimeout(r,10));}
  assert.equal(saved.messages.at(-1).status,'complete');assert.match(saved.messages.at(-1).content,/后台整理已完成/);
 }finally{release();server.server.closeAllConnections();await server.close();if(previous!==undefined)process.env.FUNDAPP_HARNESS_MODULE=previous;else delete process.env.FUNDAPP_HARNESS_MODULE;}
});

test('AI updates an existing project with a before/after diff and refuses a concurrent newer revision',async()=>{
 const store=createMemoryLedgerStore(),project=(await store.listProjects())[0];let actions:any[]=[];
 const server=createTestServer({ledgerStore:store,ai:{env:{QWEN_API_KEY:'synthetic'},fetchImpl:async()=>response(actions)}});
 try{
  actions=[{kind:'project_update',body:{id:project.id,description:'工程验收：已核对原件。'}}];const c=await make(server),url=`/api/ai/conversations/${c.id}/actions`;
  const proposed=await server.inject({method:'POST',url,payload:{requestId:randomUUID(),expectedRevision:c.revision,instruction:'只修改该项目说明'}});assert.equal(proposed.statusCode,200,proposed.body);const card=proposed.json().actions[0];assert(card.details.some((x:any)=>x.label==='说明'&&x.after.includes('已核对原件')));
  const confirmed=await server.inject({method:'POST',url:url+'/'+card.id+'/confirm',payload:{confirmed:true}});assert.equal(confirmed.statusCode,200,confirmed.body);const saved=(await store.listProjects()).find(p=>p.id===project.id)!;assert.equal(saved.description,'工程验收：已核对原件。');assert.equal(saved.name,project.name);
  const c2=await make(server),url2=`/api/ai/conversations/${c2.id}/actions`,second=await server.inject({method:'POST',url:url2,payload:{requestId:randomUUID(),expectedRevision:c2.revision,instruction:'修改该项目说明'}});assert.equal(second.statusCode,200,second.body);
  const changed=await server.inject({method:'PATCH',url:'/api/projects/'+project.id,payload:{requestId:randomUUID(),expectedRevision:saved.masterRevision??1,name:saved.name,shortName:saved.shortName,industry:saved.industry,description:'另一个窗口的新说明'}});assert.equal(changed.statusCode,200,changed.body);
  const stale=await server.inject({method:'POST',url:url2+'/'+second.json().actions[0].id+'/confirm',payload:{confirmed:true}});assert.equal(stale.statusCode,409);assert.equal((await store.listProjects()).find(p=>p.id===project.id)!.description,'另一个窗口的新说明');
 }finally{await server.close();}
});

test('AI company and fund updates retain unchanged fields and show the actual prior values',async()=>{
 const store=createMemoryLedgerStore();let actions:any[]=[];const server=createTestServer({ledgerStore:store,ai:{env:{QWEN_API_KEY:'synthetic'},fetchImpl:async()=>response(actions)}});
 try{
  const manager={id:'delivery-manager',name:'工程基金负责人'};await store.accountTransaction(async s=>{s.users.push({...manager,email:'delivery-manager@example.test',role:'investment_manager',passwordHash:null,enabled:true,revision:1});});
  const originalCompany=(await server.inject({method:'POST',url:'/api/companies',payload:{requestId:randomUUID(),name:'独立AI更新验收企业',shortName:'更新验收',industry:'原行业'}}));assert.equal(originalCompany.statusCode,201,originalCompany.body);
  const originalFund=(await server.inject({method:'POST',url:'/api/funds',payload:{requestId:randomUUID(),name:'独立AI更新验收基金',shortName:'更新基金',managerId:manager.id,stage:'募集期',scale:'100万元（工程验证）',nextAction:'原下一步'}}));assert.equal(originalFund.statusCode,201,originalFund.body);
  const company=originalCompany.json().company,fund=originalFund.json().fund;
  actions=[{kind:'company_update',body:{id:company.id,industry:'新行业'}},{kind:'fund_update',body:{id:fund.id,nextAction:'核对已上传原件'}}];
  const c=await make(server),url=`/api/ai/conversations/${c.id}/actions`,proposed=await server.inject({method:'POST',url,payload:{requestId:randomUUID(),expectedRevision:c.revision,instruction:'按明确要求更新企业行业和基金下一步'}});assert.equal(proposed.statusCode,200,proposed.body);
  assert(proposed.json().actions[0].details.some((d:any)=>d.label==='行业'&&d.before==='原行业'&&d.after==='新行业'));
  assert(proposed.json().actions[1].details.some((d:any)=>d.label==='下一步'&&d.before==='原下一步'&&d.after==='核对已上传原件'));
  for(const card of proposed.json().actions){const confirmed=await server.inject({method:'POST',url:url+'/'+card.id+'/confirm',payload:{confirmed:true}});assert.equal(confirmed.statusCode,200,confirmed.body);}
  assert.equal((await store.listCompanies()).find(v=>v.id===company.id)!.industry,'新行业');const saved=(await store.listFunds()).find(v=>v.id===fund.id)!;assert.equal(saved.nextAction,'核对已上传原件');assert.equal(saved.managerId,fund.managerId);assert.equal(saved.scale,fund.scale);
 }finally{await server.close();}
});
