import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {generateDocument} from '../src/ledger/document-output.ts';
import {registerDocumentTemplateRoutes} from '../src/http/document-templates.ts';
import {createMemoryLedgerStore,createSeedLedgerState} from '../src/ledger/store.ts';
import {resolve} from 'node:path';
const document={title:'中文报告',sections:[{title:'风险与建议',text:'原文 <&> 保留\n第二行'}]};
test('real DOCX/PDF signatures, hostile XML text and invalid formats',async()=>{
 const docx=await generateDocument(document,'docx');assert.equal(docx.subarray(0,2).toString(),'PK');
 const pdf=await generateDocument(document,'pdf');assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
 await assert.rejects(generateDocument(document,'html'),(e:any)=>e.code==='invalid_report_format');
 await assert.rejects(generateDocument({title:'',sections:[]},'docx'),(e:any)=>e.code==='invalid_document_content');
});
test('missing conversion executable fails closed and does not return mislabeled HTML',async()=>{
 const old=process.env.DOCUMENT_SOFFICE;process.env.DOCUMENT_SOFFICE='/nonexistent/fundapp-office';
 try{await assert.rejects(generateDocument(document,'pdf'),(e:any)=>e.code==='document_generation_unavailable');}finally{if(old===undefined)delete process.env.DOCUMENT_SOFFICE;else process.env.DOCUMENT_SOFFICE=old;}
});
test('template variables reject unknown fields, missing values and mismatched object names',async()=>{
 const store=createMemoryLedgerStore(createSeedLedgerState()),server=Fastify();
 registerDocumentTemplateRoutes(server,store,{auth:{mode:'local-bypass'},projectRoot:resolve(import.meta.dirname,'../..')});
 const investor=await store.lpTransaction(s=>s.investors[0]);
 const base=`/api/funds/${investor.fundId}/investors/${investor.id}/fundraising/templates/custodied/docx`;
 for(const variables of [{},{fundName:'伪造基金',investorName:'伪造LP',date:'2026-11-02'},{fundName:'x',investorName:'y',date:'2026-11-02',unknown:'x'}]){
  const r=await server.inject({method:'POST',url:base,payload:{variables}});assert.ok([400,409].includes(r.statusCode),r.body);
 }
 const fund=(await store.listFunds()).find(f=>f.id===investor.fundId)!;
 const r=await server.inject({method:'POST',url:base,payload:{variables:{fundName:fund.name,investorName:investor.name,date:'2026-11-02'}}});assert.equal(r.statusCode,200,r.body);assert.equal(r.rawPayload.subarray(0,2).toString(),'PK');assert.match(r.headers['content-type']!,/wordprocessingml/);
 await server.close();
});
test('report content is required, validated, saved with concurrency control and frozen at export',async()=>{
 const {registerReportRoutes}=await import('../src/http/reports.ts');
 const store=createMemoryLedgerStore(createSeedLedgerState()),server=Fastify();registerReportRoutes(server,store,{auth:{mode:'local-bypass'}});
 const report=(await store.listReports())[0],url=`/api/reports/${report.id}`;
 const missing=await server.inject({method:'POST',url:url+'/export',payload:{format:'DOCX'}});assert.equal(missing.statusCode,409);
 const invalid=await server.inject({method:'PATCH',url:url+'/content',payload:{sections:[{title:'标题',text:''}],expectedUpdatedAt:report.updatedAt}});assert.equal(invalid.statusCode,400);
 const saved=await server.inject({method:'PATCH',url:url+'/content',payload:{sections:document.sections,expectedUpdatedAt:report.updatedAt}});assert.equal(saved.statusCode,200,saved.body);
 const stale=await server.inject({method:'PATCH',url:url+'/content',payload:{sections:document.sections,expectedUpdatedAt:'1900-01-01'}});assert.equal(stale.statusCode,409,stale.body);
 const draftExport=await server.inject({method:'POST',url:url+'/export',payload:{format:'DOCX'}});assert.equal(draftExport.statusCode,409,draftExport.body);
 await store.approveReport(report.id);
 const exported=await server.inject({method:'POST',url:url+'/export',payload:{format:'DOCX'}});assert.equal(exported.statusCode,201,exported.body);
 const entry=exported.json().exportRecord;
 const before=await server.inject({url:`/api/reports/exports/${entry.id}/file`});assert.equal(before.statusCode,200,before.body);
 const current=(await store.listReports()).find(v=>v.id===report.id)!;
 await store.saveReportContent(report.id,[{title:'新正文',text:'修改后的内容'}],current.updatedAt,{id:'user-admin',name:'管理员'});
 const after=await server.inject({url:`/api/reports/exports/${entry.id}/file`});assert.equal(after.statusCode,200,after.body);
 assert.deepEqual(entry.sectionsSnapshot,document.sections);
 const {inflateRawSync}=await import('node:zlib');
 function xml(buffer:Buffer){let pos=0;while(buffer.readUInt32LE(pos)===0x04034b50){const size=buffer.readUInt32LE(pos+18),nameLength=buffer.readUInt16LE(pos+26),extra=buffer.readUInt16LE(pos+28),name=buffer.subarray(pos+30,pos+30+nameLength).toString(),start=pos+30+nameLength+extra;if(name==='word/document.xml')return inflateRawSync(buffer.subarray(start,start+size)).toString();pos=start+size;}throw new Error('missing_document_xml');}
 assert.match(xml(after.rawPayload),/风险与建议/);assert.doesNotMatch(xml(after.rawPayload),/修改后的内容/);
 assert.ok(!after.rawPayload.equals(Buffer.from('<html>')));await server.close();
});
test('template downloads require a session before resolving fund or investor',async()=>{
 const server=Fastify();registerDocumentTemplateRoutes(server,createMemoryLedgerStore(),{auth:{mode:'password'},projectRoot:resolve(import.meta.dirname,'../..')});
 const r=await server.inject({method:'POST',url:'/api/funds/unknown/investors/unknown/fundraising/templates/custodied/pdf',payload:{variables:{}}});assert.equal(r.statusCode,401);await server.close();
});
test('downloaded source checklist includes only applicable base evidence, copies and retention instructions',async()=>{
 const {inflateRawSync}=await import('node:zlib');
 const store=createMemoryLedgerStore(),server=Fastify();registerDocumentTemplateRoutes(server,store,{auth:{mode:'local-bypass'},projectRoot:resolve(import.meta.dirname,'../..')});
 try{
 const investor=await store.lpTransaction(s=>s.investors[0]),fund=(await store.listFunds()).find(f=>f.id===investor.fundId)!;
 const download=async()=>server.inject({method:'POST',url:`/api/funds/${fund.id}/investors/${investor.id}/fundraising/templates/custodied/docx`,payload:{variables:{fundName:fund.name,investorName:investor.name,date:'2026-11-02'}}});
 const xml=(buffer:Buffer)=>{let pos=0;while(buffer.readUInt32LE(pos)===0x04034b50){const size=buffer.readUInt32LE(pos+18),nl=buffer.readUInt16LE(pos+26),extra=buffer.readUInt16LE(pos+28),name=buffer.subarray(pos+30,pos+30+nl).toString(),start=pos+30+nl+extra;if(name==='word/document.xml')return inflateRawSync(buffer.subarray(start,start+size)).toString();pos=start+size;}throw Error('missing xml');};
 const institution=await download();assert.equal(institution.statusCode,200,institution.body);const text=xml(institution.rawPayload);assert.match(text,/三年一期审计报告或财务报表/);assert.match(text,/合伙协议 · 4份/);assert.match(text,/各投资人、管理人各留存1份/);assert.match(text,/法定代表人不能双录时适用/);assert.doesNotMatch(text,/预留银行账户/);
 await store.lpTransaction(async s=>{s.investors.find(i=>i.id===investor.id)!.type='产品';});
 const product=await download();assert.equal(product.statusCode,200,product.body);assert.doesNotMatch(xml(product.rawPayload),/三年一期审计报告或财务报表/);assert.match(xml(product.rawPayload),/未列明产品专属附件要求/);
 }finally{await server.close();}
});
test('projected report downloads do not scan compressed ZIP bytes as LP names; unprojected files remain protected',async()=>{
 const {createTestServer,registeredCookie}=await import('./auth-fixture.ts');const {inflateRawSync}=await import('node:zlib');const store=createMemoryLedgerStore();const secret='report-projection-fixture-secret';
 const server=createTestServer({ledgerStore:store,auth:{mode:'password',sessionSecret:secret,adminEmail:'test@fixture.invalid',adminPassword:'fixture'}});
 server.get('/api/test-private-binary',async()=>Buffer.from('A'));
 const admin=await registeredCookie(server,{id:'report-check-admin',name:'报告审核员',email:'report-check@fixture.invalid',role:'admin'},secret),reader=await registeredCookie(server,{id:'report-check-viewer',name:'报告只读员',email:'report-reader@fixture.invalid',role:'viewer'},secret);
 const xml=(buffer:Buffer)=>{let pos=0;while(buffer.readUInt32LE(pos)===0x04034b50){const size=buffer.readUInt32LE(pos+18),nl=buffer.readUInt16LE(pos+26),extra=buffer.readUInt16LE(pos+28),name=buffer.subarray(pos+30,pos+30+nl).toString(),start=pos+30+nl+extra;if(name==='word/document.xml')return inflateRawSync(buffer.subarray(start,start+size)).toString();pos=start+size;}throw Error('missing xml');};
 try{await store.lpTransaction(s=>{s.investors.push({...s.investors[0],id:'short-lp-a',name:'A'},{...s.investors[0],id:'short-lp-b',name:'B'});});const project=(await store.listProjects())[0];await store.accessTransaction(s=>{s.data.projects[project.id]={visibility:'members',memberIds:['report-check-viewer'],revision:1};});
 const body={name:'普通业务报告',target:project.name,targetType:'project',targetId:project.id,type:'企业监控报告',status:'草稿',owner:'报告审核员',updatedAt:'2026-11-06T00:00:00Z',sections:[{title:'核验',text:'不含投资者姓名的已核实正文'}]};
 const forged=await server.inject({method:'POST',url:'/api/reports',headers:{cookie:admin},payload:{...body,status:'已完成'}});assert.equal(forged.statusCode,400);assert.equal(forged.json().error,'invalid_report_status');
 const created=await server.inject({method:'POST',url:'/api/reports',headers:{cookie:admin},payload:body});assert.equal(created.statusCode,201,created.body);const report=created.json().report;
 const approved=await server.inject({method:'POST',url:`/api/reports/${report.id}/approve`,headers:{cookie:admin},payload:{expectedUpdatedAt:report.updatedAt}});assert.equal(approved.statusCode,200,approved.body);
 const exported=await server.inject({method:'POST',url:`/api/reports/${report.id}/export`,headers:{cookie:admin},payload:{format:'DOCX'}});assert.equal(exported.statusCode,201,exported.body);const file=await server.inject({url:`/api/reports/exports/${exported.json().exportRecord.id}/file`,headers:{cookie:reader}});assert.equal(file.statusCode,200,file.body);assert.match(xml(file.rawPayload),/不含投资者姓名的已核实正文/);const privateFile=await server.inject({url:'/api/test-private-binary',headers:{cookie:reader}});assert.equal(privateFile.statusCode,403);assert.equal(privateFile.json().error,'lp_privacy_forbidden');
 }finally{await server.close();}
});
