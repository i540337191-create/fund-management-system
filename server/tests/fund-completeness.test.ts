import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryLedgerStore,createSeedLedgerState} from '../src/ledger/store.ts';
import {createTestServer,registeredCookie} from './auth-fixture.ts';
async function fundServer(options:Parameters<typeof createTestServer>[0]){const root=await mkdtemp(join(tmpdir(),'fund-review-test-'));const server=createTestServer({...options,materialStorageRoot:root});server.addHook('onClose',async()=>{await rm(root,{recursive:true,force:true});});return server;}
const response=(value:unknown)=>({ok:true,status:200,text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]})});
const ai={env:{QWEN_API_KEY:'fixture-only',QWEN_BASE_URL:'https://example.invalid/v1',QWEN_MODEL:'fixture'}};
test('fresh scoped scan calls AI with real metadata, preserves zero, returns fund-specific destinations without writes',async()=>{
 const state=createSeedLedgerState();state.funds[0].scale='0元';state.funds[0].balance='待确认';
 const store=createMemoryLedgerStore(state),id=state.funds[0].id;let calls=0,payload='';
 const before=JSON.stringify(await store.getFundDetail(id));
 const server=await fundServer({ledgerStore:store,ai:{...ai,fetchImpl:async(_u,init)=>{calls++;payload=init!.body!;return response({findings:[{fundId:id,label:'资金数据待补充',detail:'资金信息待核对',tab:'概览'},{fundId:id,label:'核对资料分类',detail:'按现有资料登记核对分类和归属。',tab:'资料档案'}]});}}});
 try{
  const r=await server.inject({method:'POST',url:'/api/ai/fund-completeness',payload:{fundIds:[id],includeDemo:true}});assert.equal(r.statusCode,200,r.body);
  const body=r.json();assert.equal(body.fundCount,1);assert.equal(calls,1);assert.match(payload,/0元/);assert.match(payload,/资料登记/);
  const row=body.rows[0];assert.ok(!row.fields.some((f:any)=>f.label==='资金数据待补充'));assert.equal(row.fund.id,id);assert.ok(!row.fields.some((f:any)=>f.label==='基金规模'));assert.ok(row.fields.some((f:any)=>f.label==='账户余额'&&f.tab==='账户资金'));assert.ok(row.fields.some((f:any)=>f.kind==='review'&&f.tab==='资料档案'));
  assert.equal(JSON.stringify(await store.getFundDetail(id)),before,'scan must not change funds or archives');
  const bad=await server.inject({method:'POST',url:'/api/ai/fund-completeness',payload:{fundIds:['unknown'],includeDemo:true}});assert.equal(bad.statusCode,403);assert.equal(calls,1);
 }finally{await server.close();}
});
test('model errors and out-of-scope suggestions are failures, never successful empty scans',async()=>{
 for(const mode of ['unconfigured','provider','invalid','foreign'] as const){
  const store=createMemoryLedgerStore(),id=(await store.listFunds())[0].id;
  const server=await fundServer({ledgerStore:store,ai:{...ai,env:{...ai.env,...(mode==='unconfigured'?{QWEN_API_KEY:''}:{})},fetchImpl:async()=>mode==='provider'?{ok:false,status:500,text:async()=>''}:response(mode==='foreign'?{findings:[{fundId:'foreign',label:'x',detail:'x',tab:'资料档案'}]}:{invalid:true})}});
  try{const r=await server.inject({method:'POST',url:'/api/ai/fund-completeness',payload:{fundIds:[id],includeDemo:true}});assert.equal(r.statusCode,mode==='unconfigured'?503:502,r.body);assert.ok(!r.json().checkedAt);}finally{await server.close();}
 }
});
test('registered viewer cannot scan an inaccessible fund or send it to the model',async()=>{
 const store=createMemoryLedgerStore(),secret='fund-completeness-fixture',id=(await store.listFunds())[0].id;let calls=0;
 const server=await fundServer({ledgerStore:store,auth:{mode:'password',sessionSecret:secret},ai:{...ai,fetchImpl:async()=>{calls++;return response({findings:[]});}}});
 try{
  await store.accessTransaction(s=>{s.data.funds[id]={visibility:'members',memberIds:[],revision:2};});
  const cookie=await registeredCookie(server,{id:'fund-check-viewer',name:'核查测试',email:'fund-check@example.test',role:'viewer'},secret);
  const r=await server.inject({method:'POST',url:'/api/ai/fund-completeness',headers:{cookie},payload:{fundIds:[id],includeDemo:true}});assert.equal(r.statusCode,403,r.body);assert.equal(calls,0);
 }finally{await server.close();}
});
test('larger ledgers are batched without dropping funds; failure in a later batch is not a partial success',async()=>{
 for(const failSecond of [false,true]){
  const state=createSeedLedgerState();state.funds=Array.from({length:21},(_,i)=>({...state.funds[0],id:`batch-fund-${i}`,name:`核查样例${i}`}));
  const store=createMemoryLedgerStore(state);let calls=0;
  const server=await fundServer({ledgerStore:store,ai:{...ai,fetchImpl:async()=>{calls++;return failSecond&&calls===2?{ok:false,status:500,text:async()=>''}:response({findings:[]});}}});
  try{const r=await server.inject({method:'POST',url:'/api/ai/fund-completeness',payload:{fundIds:state.funds.map(f=>f.id),includeDemo:false}});
   if(failSecond){assert.equal(r.statusCode,502);assert.equal(calls,2);assert.ok(!r.json().checkedAt);}else{assert.equal(r.statusCode,200,r.body);assert.equal(r.json().rows.length,21);assert.equal(calls,3);}
  }finally{await server.close();}
 }
});

test('saved fund concerns survive a new server, do not invoke AI on read, respect source scope and expire on snapshot change',async()=>{
 const root=await mkdtemp(join(tmpdir(),'fund-attention-')),store=createMemoryLedgerStore(),fund=(await store.listFunds())[0];let calls=0;
 const server=createTestServer({ledgerStore:store,materialStorageRoot:root,ai:{...ai,fetchImpl:async()=>{calls++;return response({findings:[{fundId:fund.id,label:'核对附件版本',detail:'依据当前资料登记核对版本。',tab:'资料档案'}]});}}});
 try{
 const checked=await server.inject({method:'POST',url:'/api/ai/fund-completeness',payload:{fundIds:[fund.id],includeDemo:true}});assert.equal(checked.statusCode,200,checked.body);
 const next=createTestServer({ledgerStore:store,materialStorageRoot:root});try{
 const saved=await next.inject({url:'/api/ai/fund-completeness/findings?includeDemo=true'});assert.equal(saved.statusCode,200,saved.body);assert.ok(saved.json().findings[0].fields.some((f:any)=>f.label==='核对附件版本'));assert.equal(calls,1);
 assert.equal((await next.inject({url:'/api/ai/fund-completeness/findings?includeDemo=false'})).json().findings.length,0);
 await store.archiveMaterial({fundId:fund.id,name:'新登记附件.txt',type:'协议',uploader:'fixture',time:'2026-11-10',source:'fixture',status:'待确认',quotes:'0',project:fund.name,dataOrigin:'user_input'});
 assert.equal((await next.inject({url:'/api/ai/fund-completeness/findings?includeDemo=true'})).json().findings.length,0,'changed fund inventory invalidates older suggestions');
 }finally{await next.close();}
 }finally{await server.close();await rm(root,{recursive:true,force:true});}
});
