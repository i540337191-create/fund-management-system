import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import {createPostgresLedgerStore} from '../src/ledger/postgres-store.ts';
import {createTestServer,registeredCookie} from './auth-fixture.ts';
const secret='report-cas-synthetic-secret';
const reviewer={id:'report-cas-reviewer',name:'实际审核人甲',email:'report-cas@example.invalid',role:'investment_manager' as const};
async function authoredReport(store:ReturnType<typeof createMemoryLedgerStore>){const project=store.listProjects()[0];return store.createReport({name:'报告审核并发工程样例',target:project.name,targetType:'project',targetId:project.id,type:'项目报告',status:'草稿',owner:'经办人',updatedAt:'2026-11-01T00:00:00.000Z',sections:[{title:'第一版正文',text:'仅用于隔离工程验收'}]}).report;}

test('HTTP approval requires the reviewed token and stale windows cannot approve newly edited content',async()=>{
 const store=createMemoryLedgerStore(),report=await authoredReport(store),id=report.id,originalToken=report.updatedAt;
 const server=createTestServer({ledgerStore:store,auth:{mode:'password',sessionSecret:secret,adminEmail:'admin@example.invalid',adminPassword:'password'}});
 try{const cookie=await registeredCookie(server,reviewer,secret),headers={cookie},url=`/api/reports/${id}/approve`;
 for(const payload of [undefined,{}, {expectedUpdatedAt:''},{expectedUpdatedAt:null},{expectedUpdatedAt:originalToken,extra:true}]){const r=await server.inject({method:'POST',url,headers,...(payload===undefined?{}:{payload})});assert.equal(r.statusCode,400,r.body);}
 const latest=await store.saveReportContent(id,[{title:'第二版正文',text:'由另一经办人编辑，旧窗口尚未核对。'}],originalToken,{id:'another-editor',name:'另一经办人'});assert.ok(latest);const before=structuredClone(store.listReports().find(r=>r.id===id));const auditBefore=store.listAuditEvents().length;
 const stale=await server.inject({method:'POST',url,headers,payload:{expectedUpdatedAt:originalToken}});assert.equal(stale.statusCode,409,stale.body);assert.equal(stale.json().error,'report_revision_conflict');assert.deepEqual(store.listReports().find(r=>r.id===id),before);assert.equal(store.listAuditEvents().length,auditBefore);assert.equal(before!.status,'草稿');
 const approved=await server.inject({method:'POST',url,headers,payload:{expectedUpdatedAt:latest.updatedAt}});assert.equal(approved.statusCode,200,approved.body);assert.equal(approved.json().report.status,'已完成');assert.deepEqual(approved.json().report.sections,latest.sections);assert.equal(approved.json().auditEvent.actor,reviewer.name);assert.notEqual(approved.json().report.updatedAt,latest.updatedAt);
 const state=structuredClone(store.listReports().find(r=>r.id===id)),events=store.listAuditEvents().length;
 const duplicate=await server.inject({method:'POST',url,headers,payload:{expectedUpdatedAt:latest.updatedAt}});assert.equal(duplicate.statusCode,409);assert.deepEqual(store.listReports().find(r=>r.id===id),state);assert.equal(store.listAuditEvents().length,events);
 }finally{await server.close();}
});

test('memory approval and edits share serialization; two approvals of one token produce one approval audit',async()=>{
 const store=createMemoryLedgerStore(),report=await authoredReport(store),token=report.updatedAt;
 const results=await Promise.allSettled([store.approveReport(report.id,reviewer,token),store.approveReport(report.id,reviewer,token)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const rejected=results.find(r=>r.status==='rejected') as PromiseRejectedResult;assert.equal(rejected.reason.code,'report_revision_conflict');assert.equal(store.listAuditEvents().filter(a=>a.action==='审核通过报告').length,1);assert.equal(store.listReports().find(r=>r.id===report.id)!.status,'已完成');
});

function postgresFixture(){
 const calls:{sql:string;values:unknown[]}[]=[];let exportRow:Record<string,unknown>|undefined,audit:Record<string,unknown>|undefined;
 const report={id:'report-pg-cas',fund_id:'fund-cas',project_id:null,name:'PG审核样例',target:'验收基金',type:'基金报告',status:'已完成',owner_name:'经办人',updated_at_label:'2026-11-02T04:00:00.000002Z',content_sections:[{title:'正文',text:'当前真实保存版本'}],data_origin:'user_input'};
 const store=createPostgresLedgerStore({runWithClient:async callback=>callback({query:async(sql,values=[])=>{
  const normalized=sql.replace(/\s+/g,' ').trim().toLowerCase();calls.push({sql:normalized,values});
  if(['begin','commit','rollback'].includes(normalized))return {rows:[]};
  if(normalized.startsWith('select record_type,record_id,project_id,data_purpose from source_record_purposes'))return {rows:[]};
  if(normalized==='select id from reports where id=$1 for update')return {rows:[{id:report.id}]};
  if(normalized.includes('from reports r'))return {rows:[{...report}]};
  if(normalized.startsWith('update reports set status')){report.status='已完成';report.updated_at_label='2026-11-02T04:00:00.000003Z';return {rows:[{id:report.id}]};}
  if(normalized.startsWith('select id from users'))return {rows:[]};
  if(normalized.startsWith('select to_char(now()'))return {rows:[{value:'2026-11-02 12:00'}]};
  if(normalized.startsWith('insert into report_exports')){assert.match(normalized,/sections_snapshot,actor_label/);assert.equal(values[7],null);exportRow={id:values[0],report_id:values[1],report_name:values[2],file_name:values[3],download_file_name:values[4],download_mime_type:values[5],format:values[6],actor_user_id:values[7],watermark:values[8],sources:JSON.parse(String(values[9])),sections_snapshot:JSON.parse(String(values[10])),actor_label:values[11],exported_at_label:'2026-11-02 12:00',data_origin:'system_generated',report_data_origin:'user_input'};return {rows:[]};}
  if(normalized.includes('from report_exports e')){assert.match(normalized,/coalesce\(e\.actor_label,u\.name,e\.actor_user_id,'未分配'\) as actor_name/);return {rows:exportRow?[{...exportRow,actor_name:exportRow.actor_label??'未分配'}]:[]};}
  if(normalized.startsWith('insert into audit_events')){audit={id:values[0],module:values[1],action:values[2],target_type:values[3],target_id:values[4],target_name:values[5],actor_name:values[7],event_time_label:'2026-11-02 12:00',detail:values[9],source:values[10],data_origin:values[11]};return {rows:[]};}
  if(normalized.includes('from audit_events a'))return {rows:audit?[audit]:[]};
  throw Error('unexpected_sql: '+normalized);
 }})});return {store,calls,report,clearActorLabel:()=>{if(exportRow)exportRow.actor_label=null;}};
}

test('PostgreSQL approval locks before comparing the microsecond token and stale requests roll back without updates or audit',async()=>{
 const {store,calls,report}=postgresFixture(),before=structuredClone(report);
 await assert.rejects(store.approveReport(report.id,reviewer,'2026-11-02T04:00:00.000001Z'),(e:any)=>e.code==='report_revision_conflict'&&e.status===409);
 assert.deepEqual(report,before);assert.ok(calls.some(c=>c.sql==='select id from reports where id=$1 for update'));assert.ok(calls.some(c=>c.sql==='rollback'));assert.ok(!calls.some(c=>c.sql.startsWith('update ')||c.sql.startsWith('insert ')));
 const approved=await store.approveReport(report.id,reviewer,report.updated_at_label);assert.equal(approved!.auditEvent.actor,reviewer.name);assert.ok(calls.some(c=>c.sql.includes("greatest(clock_timestamp(),updated_at+interval '1 microsecond')")));
});

test('PostgreSQL exports retain the exact actor label without a users row or watermark parsing',async()=>{
 const {store,report,clearActorLabel}=postgresFixture(),actor={id:'configured-bootstrap-admin',name:'配置主管理员 / 甲'};
 const result=await store.exportReport(report.id,'DOCX',actor);assert.ok(result);assert.equal(result.exportRecord.actor,actor.name);assert.ok(result.exportRecord.watermark.includes(actor.name));assert.equal((await store.listReportExports())[0].actor,actor.name);clearActorLabel();assert.equal((await store.listReportExports())[0].actor,'未分配');
});


test('PostgreSQL locked approval/export rejects unresolved markers without update, export or audit inserts',async()=>{
 for(const action of ['approve','export']){
  const {store,calls,report}=postgresFixture();report.content_sections=[{title:'企业情况',text:'{{企业名称}}'}];const before=structuredClone(report);
  await assert.rejects(action==='approve'?store.approveReport(report.id,reviewer,report.updated_at_label):store.exportReport(report.id,'DOCX',reviewer),(e:any)=>e.code==='report_not_ready'&&e.fields.some((f:string)=>f.includes('{{企业名称}}')));
  assert.deepEqual(report,before);assert.ok(calls.some(c=>c.sql==='select id from reports where id=$1 for update'));assert.ok(calls.some(c=>c.sql==='rollback'));assert.ok(!calls.some(c=>c.sql.startsWith('update ')||c.sql.startsWith('insert ')));
 }
});
