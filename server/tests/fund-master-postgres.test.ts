import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {createPostgresLedgerStore} from '../src/ledger/postgres-store.ts';
import {writeFund} from '../src/ledger/fund-master.ts';
const actor={id:'user-admin',name:'管理员'};
function databaseDouble(fail?:'audit'|'receipt') {
 let funds:Record<string,unknown>[]=[],audits:Record<string,unknown>[]=[],receipts:Record<string,unknown>[]=[];
 let before={funds,audits,receipts};const calls:string[]=[];
 const store=createPostgresLedgerStore({runWithClient:async action=>action({query:async(sql,values=[])=>{
 if(sql.trim().toLowerCase()==='select record_type,record_id,project_id,data_purpose from source_record_purposes')return {rows:[]};
  const q=sql.replace(/\s+/g,' ').trim().toLowerCase();calls.push(q);
 if(q==='select object_type,payload from custom_field_schemas')return {rows:[]};
 if(q==='update custom_field_schemas set payload=$2::jsonb where object_type=$1')return {rows:[]};
 if(q==='update funds set custom_fields=$2::jsonb,schema_revision=$3 where id=$1'){Object.assign(funds.find(c=>c.id===values[0])!,{custom_fields:JSON.parse(String(values[1])),schema_revision:values[2]});return {rows:[]};}

  if(q==='begin'){before=structuredClone({funds,audits,receipts});return {rows:[]};}
  if(q==='rollback'){({funds,audits,receipts}=before);return {rows:[]};}
  if(q==='commit'||q.includes('pg_advisory_xact_lock'))return {rows:[]};
  if(q.includes('from funds f'))return {rows:funds};
  if(q.includes('from users order by id'))return {rows:[{id:'manager',name:'真实经理',role:'investment_manager',email:'m@test',enabled:true,revision:1,password_hash:null}]};
  if(q.includes('from fund_write_requests'))return {rows:receipts};
  if(q.startsWith('insert into funds')){funds.push({id:values[0],name:values[1],short_name:values[2],manager_user_id:values[3],manager_name:'真实经理',stage:values[4],scale_label:values[5],paid_in_label:values[6],invested_label:values[7],balance_label:values[8],next_action:values[9],revision:values[10],updated_at_label:'2026-10-30',data_origin:values[11]});return {rows:[]};}
  if(q.startsWith('update funds')){const f=funds.find(f=>f.id===values[0])!;Object.assign(f,{name:values[1],short_name:values[2],manager_user_id:values[3],stage:values[4],scale_label:values[5],next_action:values[6],revision:values[7]});return {rows:[]};}
  if(q.startsWith('insert into audit_events')){if(fail==='audit')throw Error('audit failed');audits.push({id:values[0],module:values[1],action:values[2],target_type:values[3],target_id:values[4],target_name:values[5],actor_user_id:values[6],actor_name:values[7],event_time_label:values[8],detail:values[9],source:values[10],data_origin:values[11]});return {rows:[]};}
  if(q.includes('from audit_events a'))return {rows:audits.filter(a=>a.id===values[0])};
  if(q.startsWith('insert into fund_write_requests')){if(fail==='receipt')throw Error('receipt failed');receipts.push({request_id:values[0],fingerprint:values[2],result:JSON.parse(String(values[3]))});return {rows:[]};}
  throw Error(`Unexpected SQL ${q}`);
 }})});
 return {store,calls,state:()=>({funds,audits,receipts})};
}
const input=()=>({requestId:randomUUID(),name:'基金',shortName:'基金',managerId:'manager',stage:'投资期',scale:'待确认',nextAction:''});
test('SQL double: fund/audit/receipt commit together; retry original snapshot after edit',async()=>{
 const db=databaseDouble(),body=input();const created=await writeFund(db.store,body,actor);
 assert.deepEqual(db.state().audits.map(a=>a.actor_user_id),[null]);
 await writeFund(db.store,{...body,requestId:randomUUID(),name:'改名',expectedRevision:1},actor,created.fund.id);
 assert.deepEqual(await writeFund(db.store,body,actor),{...created,created:false});
 assert.equal(db.state().funds.length,1);assert.equal(db.state().audits.length,2);assert.equal(db.state().receipts.length,2);
 assert.ok(db.calls.includes("select pg_advisory_xact_lock(hashtextextended($1, 0))"));assert.equal(db.calls.at(-1),'commit');
});
for(const failure of ['audit','receipt'] as const)test(`SQL double: ${failure} failure rolls back fund, audit and receipt`,async()=>{
 const db=databaseDouble(failure);await assert.rejects(writeFund(db.store,input(),actor),new RegExp(`${failure} failed`));assert.deepEqual(db.state(),{funds:[],audits:[],receipts:[]});assert.equal(db.calls.at(-1),'rollback');
});
