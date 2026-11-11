import test from 'node:test';import assert from 'node:assert/strict';import Fastify from 'fastify';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';import {AgentRepository} from '../src/agent/repository.ts';import {registerReportRoutes} from '../src/http/reports.ts';
import {savePreparedReport} from '../../src/lib/reportPreparationSave.ts';import {parseReportDraft} from '../../src/lib/reportCatalogue.ts';
test('catalogue draft binds template, requires review, exports Word/PDF and invalidates approval on edit',async()=>{
 const store=createMemoryLedgerStore(),repository=new AgentRepository(),server=Fastify();registerReportRoutes(server,store,{auth:{mode:'local-bypass'},agentRepository:repository});
 const fund=store.listFunds()[0],template={id:'catalogue-flow-template',ownerId:'user-admin',scope:'organization' as const,title:'季度报告测试模板',objectType:'report' as const,stage:'',fields:[],materials:[],version:1,status:'published' as const};await repository.transaction(s=>s.templates.push(template));
 const sections=parseReportDraft('## 运营情况\n隔离验收正文，非真实基金经营数据。\n## 资料依据\n数据负责人：隔离测试账号；原件第1页。',['运营情况','资料依据']);
 const draft={id:'catalogue-flow-report',name:'隔离报告中心链路验收',type:'基金季度报告',target:fund.name,targetType:'fund' as const,targetId:fund.id,fundId:fund.id,projectId:null,status:'草稿' as const,owner:'测试经办人',updatedAt:new Date().toISOString(),sections};
 const call=async(method:string,url:string,payload?:unknown)=>{const response=await server.inject({method:method as any,url,...(payload?{payload}:{})});assert.ok(response.statusCode<300,response.body);return response.json();};
 try{
 const report=await savePreparedReport(draft,{id:template.id,version:1},{list:async()=>(await call('GET','/api/reports?includeDemo=true')).reports,create:async r=>(await call('POST','/api/reports',r)).report,bind:async(r,ref)=>(await call('PATCH',`/api/reports/${r.id}/content`,{sections:r.sections,expectedUpdatedAt:r.updatedAt,templateRef:ref})).report});assert.equal(report.templateSnapshot?.id,template.id);assert.equal(report.status,'草稿');
 let r=await server.inject({method:'POST',url:`/api/reports/${report.id}/export`,payload:{format:'DOCX'}});assert.equal(r.statusCode,409);
 const approved=(await call('POST',`/api/reports/${report.id}/approve`,{expectedUpdatedAt:report.updatedAt})).report;assert.equal(approved.status,'已完成');
 for(const format of ['DOCX','PDF']){const exported=await call('POST',`/api/reports/${report.id}/export`,{format});const file=await server.inject({url:`/api/reports/exports/${exported.exportRecord.id}/file`});assert.equal(file.statusCode,200,file.body);assert.ok(file.rawPayload.subarray(0,format==='PDF'?5:2).equals(Buffer.from(format==='PDF'?'%PDF-':'PK')));}
 const edited=(await call('PATCH',`/api/reports/${report.id}/content`,{sections:[{title:'重新核对',text:'人工修改正文，须重审。'}],expectedUpdatedAt:approved.updatedAt})).report;assert.notEqual(edited.status,'已完成');r=await server.inject({method:'POST',url:`/api/reports/${report.id}/export`,payload:{format:'PDF'}});assert.equal(r.statusCode,409);
 }finally{await server.close();}
});
