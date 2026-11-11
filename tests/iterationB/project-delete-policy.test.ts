import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {registerRecordManagementRoutes} from '../../server/src/http/record-management.ts';
import {managedLedgerStore} from '../../server/src/ledger/record-management.ts';
import {writeCompany} from '../../server/src/ledger/company-project-master.ts';
import {createMemoryLedgerStore} from '../../server/src/ledger/store.ts';
const require=createRequire(new URL('../../server/package.json',import.meta.url)),Fastify=require('fastify');
test('actual project deletion is non-restorable in application, retains underlying records and rejects old direct reads',async()=>{
 const route={registerRecordManagementRoutes},policy={managedLedgerStore};
 const raw=createMemoryLedgerStore(),app=Fastify(),managed=policy.managedLedgerStore(raw);
 await writeCompany(raw,{requestId:randomUUID(),name:'B隔离企业',shortName:'B隔离',industry:'测试'},{id:'user-admin',name:'隔离验收',email:'b@example.invalid',role:'admin'});route.registerRecordManagementRoutes(app,raw,{auth:{mode:'local-bypass'}});
 try{
 const project=(await raw.listProjects())[0],count=(await raw.listProjects()).length,before=await raw.getProjectDetail(project.id);
 let meta=(await app.inject('/api/record-management/project')).json();const request={requestId:randomUUID(),expectedVersion:meta.versions[project.id]};
 const rejected=await app.inject({method:'POST',url:`/api/record-management/project/${project.id}/delete`,payload:{...request,expectedVersion:'0'.repeat(64)}});assert.equal(rejected.statusCode,409);
 const deleted=await app.inject({method:'POST',url:`/api/record-management/project/${project.id}/delete`,payload:request});assert.equal(deleted.statusCode,200,deleted.body);
 assert.equal((await raw.listProjects()).length,count);const after=await raw.getProjectDetail(project.id);assert.ok(before&&after);const {auditEvents:oldAudit,...oldBusiness}=before,{auditEvents:newAudit,...newBusiness}=after;assert.deepEqual(newBusiness,oldBusiness,'business fields and linked data remain');for(const event of oldAudit)assert.ok(newAudit.some(candidate=>JSON.stringify(candidate)===JSON.stringify(event)),'existing audit remains unchanged');const oldIds=new Set(oldAudit.map(event=>event.id)),added=newAudit.filter(event=>!oldIds.has(event.id));assert.equal(added.length,1);assert.equal(added[0].action,'删除项目');assert.equal(added[0].targetId,project.id);assert.match(added[0].detail,/不可恢复/);
 assert.ok(!(await managed.listProjects()).some((row:{id:string})=>row.id===project.id));assert.equal(await managed.getProjectDetail(project.id),null);
 meta=(await app.inject('/api/record-management/project')).json();assert.deepEqual(meta.records,[]);
 const restored=await app.inject({method:'POST',url:`/api/record-management/project/${project.id}/restore`,payload:{requestId:randomUUID(),expectedVersion:meta.versions[project.id]}});assert.equal(restored.statusCode,409);assert.equal(restored.json().error,'record_restore_unavailable');
 const replay=await app.inject({method:'POST',url:`/api/record-management/project/${project.id}/delete`,payload:request});assert.equal(replay.statusCode,200);assert.equal((await raw.readRecordManagement()).entries.filter(row=>row.id===project.id).length,1);

 for(const kind of ['company','fund'] as const){
  const rows=kind==='company'?await raw.listCompanies():await raw.listFunds(),record=rows[0];assert.ok(record,kind+' fixture');
  const before=(await app.inject('/api/record-management/'+kind)).json(),payload={requestId:randomUUID(),expectedVersion:before.versions[record.id]};
  const deleted=await app.inject({method:'POST',url:`/api/record-management/${kind}/${record.id}/delete`,payload});assert.equal(deleted.statusCode,200,deleted.body);
  const after=(await app.inject('/api/record-management/'+kind)).json();
  const restored=await app.inject({method:'POST',url:`/api/record-management/${kind}/${record.id}/restore`,payload:{requestId:randomUUID(),expectedVersion:after.versions[record.id]}});
  if(kind==='company'){assert.deepEqual(after.records,[]);assert.equal(restored.json().error,'record_restore_unavailable');}else{assert.ok(after.records.some((row:{id:string})=>row.id===record.id));assert.equal(restored.statusCode,200,restored.body);}
 }
 }finally{await app.close();}
});

test('legacy recoverable records stay recoverable; only a new deletion gets the permanent marker',async()=>{
 const route={registerRecordManagementRoutes},raw=createMemoryLedgerStore(),app=Fastify();route.registerRecordManagementRoutes(app,raw,{auth:{mode:'local-bypass'}});
 try{const project=(await raw.listProjects())[0];await raw.recordManagementTransaction(state=>{state.data.entries.push({id:project.id,kind:'project',title:project.name,deletedAt:'2026-01-01T00:00:00Z',deletedBy:'user-admin',revision:1});});
  let meta=(await app.inject('/api/record-management/project')).json();assert.equal(meta.records.length,1);assert.equal(meta.records[0].nonRestorable,undefined);
  const restored=await app.inject({method:'POST',url:`/api/record-management/project/${project.id}/restore`,payload:{requestId:randomUUID(),expectedVersion:meta.versions[project.id]}});assert.equal(restored.statusCode,200,restored.body);
  const audit=(await raw.listAuditEvents()).find(event=>event.action==='恢复项目'&&event.targetId===project.id);assert.ok(audit);assert.ok(!audit.detail.includes('不可恢复'),'legacy restoration must not log permanent deletion');assert.match(audit.detail,/恢复/);
  meta=(await app.inject('/api/record-management/project')).json();const removed=await app.inject({method:'POST',url:`/api/record-management/project/${project.id}/delete`,payload:{requestId:randomUUID(),expectedVersion:meta.versions[project.id]}});assert.equal(removed.statusCode,200);assert.equal(removed.json().record.nonRestorable,true);
  meta=(await app.inject('/api/record-management/project')).json();assert.deepEqual(meta.records,[]);const denied=await app.inject({method:'POST',url:`/api/record-management/project/${project.id}/restore`,payload:{requestId:randomUUID(),expectedVersion:meta.versions[project.id]}});assert.equal(denied.json().error,'record_restore_unavailable');
 }finally{await app.close();}
});
