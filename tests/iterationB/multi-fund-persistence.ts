// A provisions and runs this only against a separately migrated/seeded disposable database.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {registerRecordManagementRoutes} from '../../server/src/http/record-management.ts';
import {managedLedgerStore} from '../../server/src/ledger/record-management.ts';
import {createPostgresLedgerStore} from '../../server/src/ledger/postgres-store.ts';
import {lifecycleWrite,lifecycleView,type LifecycleProof} from '../../server/src/ledger/fund-lifecycle.ts';
import {bankIdentity} from '../../server/src/ledger/exit-settlement.ts';
import {fundOperationsProjection} from '../../server/src/http/fund-operations-readmodel.ts';
import {filterCapitalRecords} from '../../src/lib/capitalLedger.ts';
const value=process.env.B_QA_DATABASE_URL;assert.ok(value,'A must provide B_QA_DATABASE_URL securely');
const url=new URL(value),database=decodeURIComponent(url.pathname.slice(1));assert.match(database,/^fundapp_iterationb_qa_[a-z0-9_]+$/,'refuse current/user databases');
const require=createRequire(new URL('../../server/package.json',import.meta.url)),{Pool}=require('pg');
let pool=new Pool({connectionString:value});
const openStore=()=>createPostgresLedgerStore({runWithClient:async action=>{const client=await pool.connect();try{return await action(client);}finally{client.release();}}});
let store=openStore(),deletionApp:any=null;const runId=randomUUID(),actor={id:'user-admin',name:'B独立数据库验收',email:'b@example.invalid',role:'admin' as const};
// Synthetic preverified proof tests persistence/domain rules; it does not test HTTP file-byte verification.
const proof:LifecycleProof={materialId:'b-fixture-'+runId,versionId:'b-fixture-version-'+runId,name:'B隔离合成凭证（仅域层持久化测试）',sha256:'b'.repeat(64),sizeBytes:1};
try{
 const identity=await pool.query('select current_database() as name');assert.equal(identity.rows[0].name,database);
 const funds=(await store.listFunds()).slice(0,2),projects=(await store.listProjects()).slice(0,2);assert.equal(funds.length,2,'A must seed >=2 funds');assert.equal(projects.length,2,'A must seed >=2 projects');
 const ids:string[]=[];
 for(const fund of funds)for(const project of projects){const id='bqa-'+randomUUID();ids.push(id);await store.createCapitalRecord({id,fundId:fund.id,projectId:project.id,company:'B隔离事项 '+runId,fund:fund.name,received:'0',date:'',rule:'B隔离人工登记',receivable:'10.01',dueDate:'2026-12-01',status:'未收',source:'B隔离工程测试',dataOrigin:'seed_demo'},actor);}
 for(const fund of funds){
  const act=async(action:string,body:Record<string,unknown>={})=>store.lifecycleTransaction(fund.id,s=>lifecycleWrite(s,{requestId:randomUUID(),expectedRevision:s.data.revision,action,...body},actor,{proof}));
  await act('rule',{name:'B验收费率 '+runId,rate:'2',dayBasis:'365',rounding:'half_up',basis:'B隔离工程测试',approvedBy:'合成审批人',validFrom:'2026-01-01',validTo:'2026-12-31'});
  const ruleId=await store.lifecycleTransaction(fund.id,s=>s.data.rules.find(r=>r.name==='B验收费率 '+runId)!.id);
  const charge={ruleId,title:'B验收分期 '+runId,tranche:runId,principal:'100000.00',from:'2026-01-01',to:'2026-12-31',dueDate:'2026-12-31',ownerId:actor.id};await act('charge',charge);await assert.rejects(act('charge',charge),/duplicate_fee_charge/);
  await act('account',{name:'B验收账户 '+runId,kind:'basic',number:'B-QA-'+runId});
  const accountId=await store.lifecycleTransaction(fund.id,s=>s.data.accounts.find(a=>a.name==='B验收账户 '+runId)!.id);
  await act('receipt',{accountId,direction:'in',confirmed:true,amount:'1000.00',date:'2026-11-06',reference:'B-QA-'+runId,counterparty:'合成验收方',purpose:'B隔离费用核销'});
  const receiptId=await store.lifecycleTransaction(fund.id,s=>s.data.receipts.find(r=>r.accountId===accountId&&r.reference===bankIdentity('B-QA-'+runId))?.id),chargeId=await store.lifecycleTransaction(fund.id,s=>s.data.charges.find(c=>c.title==='B验收分期 '+runId)!.id);
  assert.ok(receiptId,'persisted receipt must be found by canonical bank identity');
  await assert.rejects(act('allocate',{receiptId,chargeId,amount:'1000.01'}),/allocation_exceeds_available/);
  await act('allocate',{receiptId,chargeId,amount:'1000.00'});
  await store.lifecycleTransaction(fund.id,s=>{const row=fundOperationsProjection(s,true,'2026-11-06').feeLedger!.rows.find(row=>row.id===chargeId)!;assert.equal(row.received,'1000.00');assert.equal(row.remaining,'1000.00');});
  await act('voidReceipt',{itemId:receiptId,note:'B隔离核销失败恢复'});
  await store.lifecycleTransaction(fund.id,s=>{const row=lifecycleView(s).charges.find(row=>row.id===chargeId)!;assert.equal(row.received,'0.00');assert.equal(row.remaining,'2000.00');});
 }
 const Fastify=require('fastify');deletionApp=Fastify({logger:false});registerRecordManagementRoutes(deletionApp,store,{auth:{mode:'local-bypass'}});
 await store.recordManagementTransaction(state=>{state.data.entries.push({id:projects[0].id,kind:'project',title:projects[0].name,deletedAt:'2026-01-01T00:00:00.000Z',deletedBy:actor.id,revision:1});});
 const initialMeta=(await deletionApp.inject('/api/record-management/project')).json();assert.ok(initialMeta.records.some((row:{id:string})=>row.id===projects[0].id));
 const deletion=await deletionApp.inject({method:'POST',url:`/api/record-management/project/${projects[1].id}/delete`,payload:{requestId:randomUUID(),expectedVersion:initialMeta.versions[projects[1].id]}});assert.equal(deletion.statusCode,200,deletion.body);assert.equal(deletion.json().record.nonRestorable,true);
 await deletionApp.close();deletionApp=null;
 await pool.end();pool=new Pool({connectionString:value});store=openStore();
 deletionApp=Fastify({logger:false});registerRecordManagementRoutes(deletionApp,store,{auth:{mode:'local-bypass'}});
 const persisted=await store.readRecordManagement();assert.equal(persisted.entries.find(row=>row.id===projects[1].id)!.nonRestorable,true);
 const reopenMeta=(await deletionApp.inject('/api/record-management/project')).json();assert.ok(reopenMeta.records.some((row:{id:string})=>row.id===projects[0].id));assert.ok(!reopenMeta.records.some((row:{id:string})=>row.id===projects[1].id));
 const denied=await deletionApp.inject({method:'POST',url:`/api/record-management/project/${projects[1].id}/restore`,payload:{requestId:randomUUID(),expectedVersion:reopenMeta.versions[projects[1].id]}});assert.equal(denied.json().error,'record_restore_unavailable');
 const restored=await deletionApp.inject({method:'POST',url:`/api/record-management/project/${projects[0].id}/restore`,payload:{requestId:randomUUID(),expectedVersion:reopenMeta.versions[projects[0].id]}});assert.equal(restored.statusCode,200,restored.body);
 const restoreAudit=(await store.listAuditEvents(projects[0].id)).find(event=>event.action==='恢复项目');assert.ok(restoreAudit);assert.ok(!restoreAudit.detail.includes('不可恢复'));
 const deleteAudit=(await store.listAuditEvents(projects[1].id)).find(event=>event.action==='删除项目');assert.ok(deleteAudit);assert.match(deleteAudit.detail,/不可恢复/);
 assert.equal(await managedLedgerStore(store).getProjectDetail(projects[1].id),null);assert.ok(await store.getProjectDetail(projects[1].id),'retained business history must not be physically erased');
 const records=(await store.listCapitalRecords()).filter(row=>ids.includes(row.id));assert.equal(records.length,4);
 for(const fund of funds)for(const project of projects)assert.equal(filterCapitalRecords(records,{fundId:fund.id,projectId:project.id}).length,1);
 for(const fund of funds)await store.lifecycleTransaction(fund.id,s=>{const row=fundOperationsProjection(s,true,'2026-11-06').feeLedger!.rows.find(row=>row.title==='B验收分期 '+runId)!;assert.equal(row.received,'0.00');assert.equal(row.remaining,'2000.00');});
 await writeFile(new URL('../../../evidence/design-review-20261106/双线程交接/B/multi-fund-persistence-result.json',import.meta.url),JSON.stringify({databaseIsDisposable:true,runId,result:'passed',scope:'Postgres domain persistence, two funds x two projects, fee charge/partial allocation/void/reopen pool; new nonRestorable marker and legacy restore after reconnect',notCovered:['HTTP proof byte verification','real bank payments','browser end-to-end','production database']},null,2));
 console.log('PASS isolated Postgres domain persistence; no current/user database used');
}finally{if(deletionApp)await deletionApp.close();await pool.end();}
