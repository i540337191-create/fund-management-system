import test from 'node:test';
import assert from 'node:assert/strict';
import {createPostgresLedgerStore} from '../src/ledger/postgres-store.ts';
function fixture(actorId:string,registered:boolean){
 let saved:unknown[]|undefined,audit:unknown[]|undefined;
 const store=createPostgresLedgerStore({runWithClient:async callback=>callback({query:async(sql,values=[])=>{
  const q=sql.replace(/\s+/g,' ').trim().toLowerCase();
  if(q.startsWith('select pg_advisory_xact_lock')||['begin','commit','rollback'].includes(q)||q.startsWith('select record_type,record_id'))return {rows:[]};
  if(q.includes('from funds'))return {rows:[{id:'fund-fixture',name:'样例基金'}]};
  if(q.includes('from projects p'))return {rows:[{id:'project-fixture',fundId:'fund-fixture',name:'样例项目'}]};
  if(q==='select id from users where id = $1')return {rows:registered?[{id:actorId}]:[]};
  if(q.startsWith('insert into ai_intake_items')){saved=values;assert.equal(values[4],registered?actorId:null);assert.equal(values[17],actorId);assert.equal(values[18],'同名人员');return {rows:[]};}
  if(q.includes('from ai_intake_items i'))return {rows:[{id:'item-fixture',title:'样例收件',input_type:'会议纪要',source:'测试',submitted_by_user_id:registered?actorId:null,submitted_by_actor_id:actorId,submitted_by_name:'同名人员',submitted_at_label:'2026-11-04 11:00',summary:'摘要',confidence:'待核对',suggested_fund_id:'fund-fixture',suggested_fund_name:'样例基金',suggested_project_label:'样例项目',suggested_path:'样例路径',extracted:[],generated_tasks:[],status:'待确认',data_origin:'user_input'}]};
  if(q.startsWith('insert into audit_events')){audit=values;assert.equal(values[6],registered?actorId:null);return {rows:[]};}
  if(q.includes('from audit_events a'))return {rows:[{id:audit?.[0],module:'AI 收件箱',action:'模拟上传资料',target_type:'资料',target_id:'item-fixture',target_name:'样例收件',actor_name:'同名人员',event_time_label:'2026-11-04 11:00',detail:'测试',source:'测试'}]};
  throw Error('Unexpected SQL: '+q);
 }})});return {store,saved:()=>saved};
}
for(const [actorId,registered] of [['user-admin',false],['actual-user',true]] as const)test(`AI intake retains actor ${actorId} without using display-name identity`,async()=>{
 const f=fixture(actorId,registered),r=await f.store.createAiIntakeItem({id:'item-fixture',title:'样例收件',inputType:'会议纪要',source:'测试',ownerId:actorId,submittedBy:'同名人员',submittedAt:'2026-11-04 11:00',summary:'摘要',confidence:'待核对',suggestedFund:'样例基金',suggestedFundId:'fund-fixture',suggestedProject:'样例项目',suggestedPath:'样例路径',extracted:[],generatedTasks:[],dataOrigin:'user_input'});
 assert(f.saved());assert.equal(r.item.ownerId,actorId);assert.equal(r.item.submittedBy,'同名人员');
});
test('missing ordinary actor is rejected before writing an intake record',async()=>{
 const f=fixture('deleted-user',false);await assert.rejects(f.store.createAiIntakeItem({id:'item-fixture',title:'样例收件',inputType:'会议纪要',source:'测试',ownerId:'deleted-user',submittedBy:'同名人员',submittedAt:'2026-11-04 11:00',summary:'摘要',confidence:'待核对',suggestedFund:'样例基金',suggestedProject:'样例项目',suggestedPath:'样例路径',extracted:[],generatedTasks:[],dataOrigin:'user_input'}),e=>(e as {code?:string}).code==='actor_unavailable');assert.equal(f.saved(),undefined);
});
