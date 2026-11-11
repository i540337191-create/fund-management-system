import test from 'node:test';
import assert from 'node:assert/strict';
import {workflowRequestFingerprint,workflowProposal,workflowCatalog,rememberWorkflowNames,readWorkflow} from '../src/ai/workflow-tools.ts';
import {batchEligible} from '../src/ai/batch-actions.ts';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import {randomUUID} from 'node:crypto';
import {createTestServer} from './auth-fixture.ts';
const actor={id:'user-admin',name:'管理员',role:'admin',email:'synthetic@example.test'} as const;
const pack=()=>({projects:[{id:'p',name:'项目'}],funds:[{id:'f',name:'基金'}],investors:[{id:'lp',name:'投资者',fundId:'f'}],names:new Map([['p','项目'],['f','基金'],['lp','投资者'],['user-admin','管理员']])}) as any;
const read=(module:string,targetId:string,data:any,subjectId?:string)=>({module,targetId,data,href:'/test',...(subjectId?{subjectId}:{})}) as any;
const prepare=(module:string,operation:string,body:any,data:any,extra:any={})=>{const p=pack();rememberWorkflowNames(data,p.names);return workflowProposal({module,targetId:module==='lp_ledger'?'f':'p',operation,body,...extra},read(module,module==='lp_ledger'?'f':'p',data,extra.subjectId),p,actor,'test');};
test('approval decision binds a real read round revision, strips path fields, and stays individually confirmed',()=>{
 const p=prepare('approvals','decide',{roundId:'r',decision:'approve',opinion:'本人审核'},{rounds:[{id:'r',name:'立项会',revision:7}]});
 assert.equal(p.path,'/api/projects/p/approvals/r/decisions');assert.equal(p.body.expectedRevision,7);assert.equal(p.body.roundId,undefined);assert.equal(p.body.action,undefined);assert.equal(p.state,'pending');assert.equal(batchEligible(p),false);
 assert.throws(()=>prepare('approvals','decide',{roundId:'unknown',decision:'approve',opinion:'x'},{rounds:[]}));
 assert.throws(()=>prepare('approvals','decide',{roundId:'r',decision:'approved',opinion:'x'},{rounds:[{id:'r',revision:7}]}),(e:any)=>e.code==='invalid_decision');
});
test('initialization is callable before diligence or deal state exists',()=>{
 for(const module of ['diligence','deals']){const p=prepare(module,'initialize',module==='diligence'?{reviewerIds:['user-admin']}:{title:'交易',reviewerIds:['user-admin']},{});assert.equal(p.path,`/api/projects/p/${module}`);assert.equal(p.body.expectedRevision,undefined);assert.equal(p.body.action,undefined);if(module==='diligence')assert.equal(p.body.note,'');}
});
test('LP detail is bound to the named fund and investor; correction path keeps the actual revision',()=>{
 const data={investor:{id:'lp',name:'投资者',revision:4},receipts:[{id:'receipt',name:'旧实缴'}]},body={receiptId:'receipt',amount:'1',currency:'CNY',unit:'元',bankDate:'2026-11-04',reference:'reference',note:'更正',reason:'录入错误',proof:{materialId:'m',versionId:'v'}};
 const p=pack();p.names.set('m','原件');p.names.set('v','V1');rememberWorkflowNames(data,p.names);
 const args={module:'lp_ledger',targetId:'f',subjectId:'lp',operation:'correction',body};
 const card=workflowProposal(args,read('lp_ledger','f',data,'lp'),p,actor,'test');assert.equal(card.path,'/api/funds/f/investors/lp/receipts/receipt/corrections');assert.equal(card.body.expectedRevision,4);assert.equal(card.body.receiptId,undefined);
 assert.throws(()=>workflowProposal({...args,subjectId:'other'},read('lp_ledger','f',data,'lp'),p,actor,'test'));
 assert.throws(()=>workflowProposal(args,read('lp_ledger','f',data,'other'),p,actor,'test'));
});
test('read record versions become server-owned optimistic tokens and unknown records cannot be targeted',()=>{
 const p=prepare('reports','content',{reportId:'report',sections:[{title:'正文',text:'测试'}]},{reports:[{id:'report',name:'报告',projectId:'p',updatedAt:'2026-11-04 21:00'}]});assert.equal(p.method,'PATCH');assert.equal(p.body.expectedUpdatedAt,'2026-11-04 21:00');assert.equal(p.body.expectedRevision,undefined);assert.equal(p.body.requestId,undefined);
 assert.throws(()=>prepare('reports','content',{reportId:'private',sections:[]},{reports:[]}));
});
test('bank references resembling UUIDs remain business values, but unresolved object IDs still fail',()=>{
 const p=pack();p.names.set('d','交易');
 const body={dealId:'d',fundId:'f',kind:'investment_payment',currency:'CNY',amount:'1',date:'2026-11-04',bankAccount:'TEST123',bankReference:'QA-12345678-1234-1234-1234-123456789abc',note:'虚构',evidence:[]};
 assert.equal(workflowProposal({module:'investment_cashflows',targetId:'p',operation:'post',body},read('investment_cashflows','p',{revision:1}),p,actor,'test').body.bankReference,body.bankReference);
 assert.throws(()=>workflowProposal({module:'investment_cashflows',targetId:'p',operation:'post',body:{...body,fundId:'private'}},read('investment_cashflows','p',{revision:1}),p,actor,'test'));
});
test('all backend lifecycle actions are exposed, sensitive steps are not batch eligible, and viewers cannot prepare',()=>{
 const catalog=workflowCatalog(),ops=catalog.find(m=>m.module==='fund_lifecycle')!.operations;
 for(const name of ['review','submission','archive','voidReceipt','unallocate','distribution','payDistribution','reconcile'])assert(ops.some(x=>x.operation===name));
 const p=pack(),args={module:'fund_lifecycle',targetId:'f',operation:'review',body:{caseId:'case',decision:'approve',note:'本人决定'}};p.names.set('case','事项');const r=read('fund_lifecycle','f',{revision:2});const card=workflowProposal(args,r,p,actor,'test');assert.equal(batchEligible(card),false);
 assert.throws(()=>workflowProposal(args,r,p,{...actor,role:'viewer'},'test'));
});
test('meeting confirmation rejects a stale draft atomically and replays a completed unchanged confirmation',async()=>{
 const store=createMemoryLedgerStore(),project=(await store.listProjects())[0];
 const input={id:'meeting-'+randomUUID(),projectId:project.id,project:project.name,title:'版本确认测试',date:'2026-11-04',attendees:'测试',summary:'原稿',conclusions:[],todoItems:[],riskItems:[],status:'待确认',todos:0,risks:0} as any;
 const m=await store.createMeeting(input,actor),edited=await store.updateMeeting(m.id!,{...input,summary:'修改稿'},m.revision!,actor);
 await assert.rejects(Promise.resolve().then(()=>store.confirmMeeting(m.id!,actor,1)),(e:any)=>e.code==='meeting_revision_conflict');
 assert.equal((await store.listMeetings()).find(x=>x.id===m.id)?.status,'待确认');
 const before=(await store.listMaterials()).length;
 await store.confirmMeeting(m.id!,actor,edited.revision);await store.confirmMeeting(m.id!,actor,edited.revision);
 assert.equal((await store.listMaterials()).length,before+1);
});
test('record removal binds a server-read version and never enters automatic batches',()=>{
 const p=pack();p.names.set('material','原件');const args={module:'records_material',targetId:'workspace',operation:'delete',body:{recordId:'material'}};
 const card=workflowProposal(args,read('records_material','workspace',{versions:{material:'a'.repeat(64)}}),p,actor,'test');assert.equal(card.path,'/api/record-management/material/material/delete');assert.equal(card.body.expectedVersion,'a'.repeat(64));assert.equal(card.body.expectedRevision,undefined);assert.equal(batchEligible(card),false);
 assert.throws(()=>workflowProposal({...args,body:{recordId:'private'}},read('records_material','workspace',{versions:{material:'a'.repeat(64)}}),p,actor,'test'));
});
test('action document downloads reject pending, unknown and arbitrary paths and recheck the business endpoint',async()=>{
 const store=createMemoryLedgerStore(),app=createTestServer({ledgerStore:store,auth:{mode:'local-bypass'}});
 try{const c=(await app.inject({method:'POST',url:'/api/ai/conversations',payload:{requestId:randomUUID(),includeDemo:true}})).json();
 const proposal={id:randomUUID(),requestId:randomUUID(),promptRequestId:'test',kind:'workflow_action',title:'生成业务文书',path:'/api/funds/missing/document-templates/missing/generate/pdf',method:'POST',body:{templateVersion:1},details:[],state:'pending',createdAt:new Date().toISOString()} as any;
 const set=async()=>store.assistantTransaction('user-admin:admin',s=>{s.conversations.find(x=>x.id===c.id)!.proposals=[structuredClone(proposal)];});await set();
 const url=`/api/ai/conversations/${c.id}/actions/${proposal.id}/document`;assert.equal((await app.inject(url)).statusCode,404);
 proposal.state='applied';proposal.path='/api/session/login';await set();assert.equal((await app.inject(url)).statusCode,404);
 proposal.path='/api/funds/missing/document-templates/missing/generate/pdf';await set();const response=await app.inject(url);assert(response.statusCode>=400);assert(!response.headers['content-disposition']);
 }finally{await app.close();}
});
test('returns reads use its strict query contract and can select actual scoped cashflow inputs',async()=>{
 const urls:string[]=[],server={inject:async({url}:any)=>{urls.push(url);return {statusCode:200,json:()=>url.endsWith('/deals')?{deals:[]}:{scopes:[],revision:1}};}} as any,p=pack();
 await readWorkflow(server,{headers:{}} as any,p,{module:'returns',targetId:'p'},true,actor);assert.equal(urls[0],'/api/projects/p/returns');
 const query={dealId:'d',fundId:'f',asOfDate:'2026-11-04',knownAt:'2026-11-04T00:00:00Z'};const r=await readWorkflow(server,{headers:{}} as any,p,{module:'returns',targetId:'p',query},true,actor);assert.deepEqual(r.query,query);assert(urls.some(url=>url.includes('dealId=d&fundId=f&asOfDate=')));assert(!urls.some(url=>url.includes('includeDemo')));
 await assert.rejects(readWorkflow(server,{headers:{}} as any,p,{module:'returns',targetId:'p',query:{unexpected:'value'}},true,actor));
});

test('workflow retry fingerprints ignore object key order but retain changed values and section order',()=>{
 const a={module:'fund_reports',body:{reportId:'r',sections:[{title:'一',text:'甲'},{title:'二',text:'乙'}]}};
 assert.equal(workflowRequestFingerprint(a),workflowRequestFingerprint({body:{sections:[{text:'甲',title:'一'},{text:'乙',title:'二'}],reportId:'r'},module:'fund_reports'}));
 assert.notEqual(workflowRequestFingerprint(a),workflowRequestFingerprint({...a,body:{...a.body,sections:[...a.body.sections].reverse()}}));
 assert.notEqual(workflowRequestFingerprint(a),workflowRequestFingerprint({...a,body:{...a.body,reportId:'another'}}));
});
