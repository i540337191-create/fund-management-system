import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import {registerReportRoutes} from '../src/http/reports.ts';
import {assertReportReady} from '../src/ledger/report-readiness.ts';

function fixture(){
 const store=createMemoryLedgerStore(),project=store.listProjects()[0],server=Fastify();
 registerReportRoutes(server,store,{auth:{mode:'local-bypass'}});
 const report=store.createReport({name:'工程验收报告（非客户报告）',target:project.name,targetType:'project',targetId:project.id,type:'项目报告',status:'草稿',owner:'管理员',updatedAt:'2026-11-09T00:00:00.000Z',sections:[{title:'企业情况',text:'企业名称：{{企业名称}}；日期：{\n{报告\n日期}\n}'}]}).report;
 return {store,server,report};
}

test('placeholders block approval and new exports without audit writes; corrected saved version permits self review',async()=>{
 const {store,server,report}=fixture();
 try{
  const before=structuredClone(report),events=store.listAuditEvents().length,exports=store.listReportExports().length;
  const rejected=await server.inject({method:'POST',url:`/api/reports/${report.id}/approve`,payload:{expectedUpdatedAt:report.updatedAt}});
  assert.equal(rejected.statusCode,409,rejected.body);assert.equal(rejected.json().error,'report_not_ready');assert.ok(rejected.json().fields.some((f:string)=>f.includes('第1章「企业情况」')&&f.includes('{{企业名称}}')));assert.ok(rejected.json().fields.some((f:string)=>f.includes('{{报告日期}}')));
  assert.deepEqual(report,before);assert.equal(store.listAuditEvents().length,events);assert.equal(store.listReportExports().length,exports);
  report.status='已完成';const approvedBefore=structuredClone(report);
  for(const format of ['DOCX','PDF']){const r=await server.inject({method:'POST',url:`/api/reports/${report.id}/export`,payload:{format}});assert.equal(r.statusCode,409,r.body);assert.equal(r.json().error,'report_not_ready');assert.ok(r.json().fields.length);}
  assert.throws(()=>store.exportReport(report.id,'DOCX'),{code:'report_not_ready'});assert.deepEqual(report,approvedBefore);assert.equal(store.listAuditEvents().length,events);assert.equal(store.listReportExports().length,exports);
  const saved=await store.saveReportContent(report.id,[{title:'企业情况',text:'隔离测试中的人工填写内容，不证明客户报告真实性。'}],report.updatedAt,{id:'user-admin',name:'管理员'});assert.ok(saved);
  const stale=await server.inject({method:'POST',url:`/api/reports/${report.id}/approve`,payload:{expectedUpdatedAt:before.updatedAt}});assert.equal(stale.json().error,'report_revision_conflict');
  const own=await server.inject({method:'POST',url:`/api/reports/${report.id}/approve`,payload:{expectedUpdatedAt:saved.updatedAt}});assert.equal(own.statusCode,200,own.body);assert.equal(own.json().report.status,'已完成');assert.equal(own.json().auditEvent.actor,own.json().report.owner);
  const exported=await server.inject({method:'POST',url:`/api/reports/${report.id}/export`,payload:{format:'DOCX'}});assert.equal(exported.statusCode,201,exported.body);assert.deepEqual(exported.json().exportRecord.sectionsSnapshot,saved.sections);
 }finally{await server.close();}
});

test('saved published schema requires enabled required chapters; legitimate missing-fact prose, optional and disabled fields remain allowed',()=>{
 const {report}=fixture();report.sections=[{title:'业务结论',text:'未核实的事项待补充，不能认定已完成。'}];
 report.templateSnapshot={id:'test-template',title:'测试模板',version:1,status:'published',objectType:'report',scope:'organization',ownerId:'user-admin',stage:'',materials:[],fields:[{id:'required',label:'业务结论',type:'text',required:true,enabled:true},{id:'optional',label:'选填附件',type:'text',required:false,enabled:true},{id:'disabled',label:'停用章节',type:'text',required:true,enabled:false}]};
 assert.doesNotThrow(()=>assertReportReady(report));
 report.sections=[{title:'其他章节',text:'已填正文'}];assert.throws(()=>assertReportReady(report),(e:any)=>e.code==='report_not_ready'&&e.fields.some((f:string)=>f.includes('业务结论')));
 report.sections=[{title:'业务结论',text:'   '}];assert.throws(()=>assertReportReady(report),{code:'report_not_ready'});
 report.sections=[];assert.throws(()=>assertReportReady(report),{code:'report_content_required'});
});

test('title variables and line-split delimiters are caught while ordinary braces are allowed',()=>{
 const {report}=fixture();report.sections=[{title:'结论',text:'JSON示例 {"name":"业务"}。该数据未核实，仍需人工核对。'}];
 assert.doesNotThrow(()=>assertReportReady(report));report.name='报告 {{企业名称}}';assert.throws(()=>assertReportReady(report),(e:any)=>e.fields.some((f:string)=>f.startsWith('报告名称')));
 report.name='工程样例';report.sections=[{title:'{\n{企业名称}\n}',text:'正文'}];assert.throws(()=>assertReportReady(report),(e:any)=>e.fields.some((f:string)=>f.includes('标题')&&f.includes('{{企业名称}}')));
});

test('historical placeholder export remains downloadable unchanged even when current content is unfinished',async()=>{
 const {store,server,report}=fixture();
 try{
  report.sections=[{title:'当时正文',text:'工程历史导出样例'}];await store.approveReport(report.id);
  const historical=store.exportReport(report.id,'DOCX')!;
  // Simulate an imported snapshot produced before readiness validation existed.
  historical.exportRecord.sectionsSnapshot=[{title:'历史模板正文',text:'{{企业名称}} {{报告日期}}'}];
  const savedSnapshot=structuredClone(historical.exportRecord);report.sections=[{title:'当前未完成',text:'{{当前变量}}'}];report.status='草稿';
  const events=store.listAuditEvents().length,exports=store.listReportExports().length;
  const r=await server.inject({url:`/api/reports/exports/${historical.exportRecord.id}/file`});assert.equal(r.statusCode,200,r.body);assert.equal(r.rawPayload.subarray(0,2).toString(),'PK');
  assert.deepEqual(store.listReportExports().find(e=>e.id===historical.exportRecord.id),savedSnapshot);assert.equal(store.listAuditEvents().length,events);assert.equal(store.listReportExports().length,exports);
 }finally{await server.close();}
});

test('queued edit is checked before approval and a stale review stays a revision conflict',async()=>{
 const {store,report}=fixture();report.sections=[{title:'正文',text:'编辑前的可审核正文'}];const token=report.updatedAt;
 const edit=store.saveReportContent(report.id,[{title:'正文',text:'{{新变量}}'}],token,{id:'editor',name:'经办人'});
 const approve=store.approveReport(report.id,{id:'editor',name:'经办人'},token);
 await edit;await assert.rejects(approve,{code:'report_revision_conflict'});
 await assert.rejects(store.approveReport(report.id,{id:'editor',name:'经办人'},report.updatedAt),{code:'report_not_ready'});
 assert.equal(report.status,'草稿');assert.equal(store.listAuditEvents().filter(e=>e.targetId===report.id&&e.action==='审核通过报告').length,0);
});

test('custom company template markers with punctuation and empty markers cannot pass formal review',()=>{
 const {report}=fixture();for(const marker of ['{{投资金额（万元）}}','{{GP/LP名称}}','{{报告-日期}}','{{}}']){report.sections=[{title:'核对',text:'尚待替换 '+marker}];assert.throws(()=>assertReportReady(report),{code:'report_not_ready'});}
});
