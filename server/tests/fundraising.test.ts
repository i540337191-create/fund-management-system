import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import {createTestServer,registeredCookie} from './auth-fixture.ts';
import {raisingInput,raisingView} from '../src/ledger/fundraising.ts';
test('raising validates strict payloads and dates without numeric coercion',()=>{
 for(const amount of ['-1','0','1e2','1.001',12])assert.throws(()=>raisingInput({requestId:randomUUID(),expectedRevision:1,action:'plan',name:'plan',amount,ownerId:'owner',dueDate:'2026-11-02'}));
 assert.throws(()=>raisingInput({requestId:randomUUID(),expectedRevision:1,action:'review',decision:'approve',note:'basis',amount:'1'}));
 assert.throws(()=>raisingInput({requestId:randomUUID(),expectedRevision:1,action:'requirement',name:'doc',required:'true',ownerId:'owner',dueDate:'2026-02-30'}));
});
test('LP materials, assessment, schedule and allocations form one durable scoped workflow',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'raising-')),store=createMemoryLedgerStore(),secret='raising-synthetic-secret-at-least-32-chars';
 const auth={mode:'password' as const,sessionSecret:secret,adminEmail:'admin@example.invalid',adminPassword:'password'},server=createTestServer({ledgerStore:store,auth,materialStorageRoot:dir});
 try{
 const cookies:Record<string,string>={};for(const role of ['admin','investment_manager','finance','legal','viewer'])cookies[role]=await registeredCookie(server,{id:'raising-'+role,name:role,email:'raising-'+role+'@example.invalid',role:role as any},secret);
 const fund=(await store.listFunds())[0],base='/api/funds/'+fund.id+'/investors';let revision=1;
 const req=async(role:string,url:string,payload?:any,method='POST')=>server.inject({url,method:method as any,headers:{cookie:cookies[role]},...(payload?{payload}:{})});
 const created=await req('investment_manager',base,{requestId:randomUUID(),name:'LP with unique phone 13012345678',type:'机构'});assert.equal(created.statusCode,200);const id=created.json().investor.id,member=base+'/'+id;
 const act=async(action:string,body:any={},role='investment_manager')=>{const r=await req(role,member+'/fundraising/actions',{requestId:randomUUID(),expectedRevision:revision,action,...(action==='submit'?{reviewerId:'raising-investment_manager'}:{}),...body});if(r.statusCode===200)revision=r.json().revision;return r;};
 const ownerId='raising-investment_manager',dueDate='2026-11-01';
 const before=(await req('admin',member,undefined,'GET')).json().investor;
 assert.equal((await act('review',{decision:'approve',note:'no requirements'})).statusCode,400);
 assert.equal((await act('requirement',{name:'身份证 13098765432',required:true,ownerId:'missing',dueDate})).statusCode,400);
 let r=await act('requirement',{name:'身份证 13098765432',required:true,ownerId,dueDate});assert.equal(r.statusCode,200,r.body);const itemId=r.json().requirements[0].id;
 assert.equal(r.json().tasks[0].status,'已逾期');assert.equal((await act('review',{decision:'approve',note:'must fail'})).statusCode,409);
 assert.equal((await act('plan',{name:'一期',amount:'30',ownerId,dueDate},'finance')).statusCode,409);
 const up=await server.inject({url:member+'/materials/upload?'+new URLSearchParams({requestId:randomUUID(),expectedRevision:String(revision),name:'proof.txt',type:'LP材料'}),method:'POST',headers:{cookie:cookies.admin,'content-type':'application/octet-stream'},payload:Buffer.from('synthetic owned LP document')});assert.equal(up.statusCode,200,up.body);revision=up.json().investor.revision;const proof={materialId:up.json().material.id,versionId:up.json().version.id};
 const submitPayload={requestId:randomUUID(),expectedRevision:revision,action:'submit',reviewerId:'raising-investment_manager',itemId,proof};r=await req('investment_manager',member+'/fundraising/actions',submitPayload);assert.equal(r.statusCode,200,r.body);revision=r.json().revision;assert.deepEqual((await req('investment_manager',member+'/fundraising/actions',submitPayload)).json(),r.json());
 r=await act('review',{decision:'approve',note:'人工核对指定原件版本'});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().approved,true);assert.equal(r.json().tasks[0].status,'已完成');
 const commitment=await req('investment_manager',member+'/commitments',{requestId:randomUUID(),expectedRevision:revision,amount:'100.00',currency:'CNY',unit:'元',effectiveDate:'2026-01-01',changeReason:'initial',proof});assert.equal(commitment.statusCode,200,commitment.body);revision=commitment.json().investor.revision;
 r=await act('plan',{name:'一期',amount:'60.01',ownerId:'raising-finance',dueDate},'finance');assert.equal(r.statusCode,200,r.body);const p1=r.json().plans[0].id;
 r=await act('plan',{name:'二期',amount:'39.99',ownerId:'raising-finance',dueDate},'finance');assert.equal(r.statusCode,200,r.body);const p2=r.json().plans[1].id;
 assert.equal((await act('plan',{name:'超额',amount:'0.01',ownerId:'raising-finance',dueDate},'finance')).statusCode,409);
 const lower=await req('investment_manager',member+'/commitments',{requestId:randomUUID(),expectedRevision:revision,amount:'99.99',currency:'CNY',unit:'元',effectiveDate:'2026-01-01',changeReason:'must preserve scheduled obligations',proof});assert.equal(lower.statusCode,409,lower.body);
 const receipt=await req('finance',member+'/receipts',{requestId:randomUUID(),expectedRevision:revision,amount:'70.02',currency:'CNY',unit:'元',bankDate:'2026-01-02',reference:'bank',proof});assert.equal(receipt.statusCode,200,receipt.body);revision=receipt.json().investor.revision;const receiptId=receipt.json().receipts[0].id;
 assert.equal((await act('allocate',{planId:p1,receiptId,amount:'1'},'investment_manager')).statusCode,403);
 r=await act('allocate',{planId:p1,receiptId,amount:'60.01'},'finance');assert.equal(r.statusCode,200,r.body);assert.equal(r.json().plans[0].status,'已到账');
 r=await act('allocate',{planId:p2,receiptId,amount:'10.01'},'finance');assert.equal(r.statusCode,200,r.body);assert.equal(r.json().plans[1].status,'部分到账');assert.equal(r.json().unallocatedReceipts[0].remaining,'0.00');
 assert.equal((await act('allocate',{planId:p2,receiptId,amount:'10.02'},'finance')).statusCode,409);
 const corrected=await req('finance',member+'/receipts/'+receiptId+'/corrections',{requestId:randomUUID(),expectedRevision:revision,amount:'50.01',currency:'CNY',unit:'元',bankDate:'2026-01-02',reference:'bank-corrected',reason:'typo',proof});assert.equal(corrected.statusCode,200,corrected.body);revision=corrected.json().investor.revision;
 r=await req('admin',member+'/fundraising',undefined,'GET');assert.equal(r.json().plans[0].paid,'0.00');assert.equal(r.json().invalidAllocations.length,2);assert.equal(r.json().tasks.find((t:any)=>t.kind==='payment').status,'已逾期');
 r=await act('requirement',{name:'additional',required:true,ownerId,dueDate});assert.equal(r.statusCode,200);assert.equal(r.json().approved,false);assert.equal(r.json().tasks[0].status,'已逾期');assert.equal(r.json().history.some((h:any)=>h.action==='review'),true);
 const viewer=await req('viewer',member+'/fundraising',undefined,'GET');assert.equal(viewer.statusCode,200);assert.equal(viewer.body.includes('13098765432'),false);assert.equal(viewer.body.includes('人工核对'),false);
 assert.equal((await act('requirement',{name:'unauthorized',required:true,ownerId,dueDate},'legal')).statusCode,403);
 const taskList=await req('viewer','/api/fundraising/tasks',undefined,'GET');assert.equal(taskList.statusCode,200);assert.equal(taskList.body.includes('13098765432'),false);
 const after=(await req('admin',member,undefined,'GET')).json().investor;assert.equal(after.suitabilityStatus,before.suitabilityStatus);assert.equal(after.signStatus,before.signStatus);
 const stale=await req('investment_manager',member+'/fundraising/actions',{requestId:randomUUID(),expectedRevision:1,action:'review',decision:'return',note:'stale'});assert.equal(stale.statusCode,409);
 }finally{await server.close();await rm(dir,{recursive:true,force:true});}
});

test('fundraising rechecks live authorization after the request starts and before transactional mutation',async()=>{
 const original=createMemoryLedgerStore();let armed=false;const user={id:'raising-race',name:'manager',email:'raising-race@example.invalid',role:'investment_manager' as const};
 const store={...original,lpTransaction:async(action:any)=>{if(armed){armed=false;await original.accountTransaction(s=>{s.users.find(u=>u.id===user.id)!.enabled=false;});}return original.lpTransaction(action);}};
 const secret='raising-lock-check-synthetic-secret';const server=createTestServer({ledgerStore:store,auth:{mode:'password',sessionSecret:secret,adminEmail:'admin@example.invalid',adminPassword:'password'}});
 try{const cookie=await registeredCookie(server,user,secret),fund=(await original.listFunds())[0];const created=await server.inject({url:`/api/funds/${fund.id}/investors`,method:'POST',headers:{cookie},payload:{requestId:randomUUID(),name:'Race LP',type:'机构'}});assert.equal(created.statusCode,200);const id=created.json().investor.id;armed=true;
 const denied=await server.inject({url:`/api/funds/${fund.id}/investors/${id}/fundraising/actions`,method:'POST',headers:{cookie},payload:{requestId:randomUUID(),expectedRevision:1,action:'requirement',name:'must not persist',required:true,ownerId:user.id,dueDate:'2026-11-01'}});assert.equal(denied.statusCode,401);assert.equal(await original.lpTransaction(s=>s.data.fundraising?.[id]),undefined);
 }finally{await server.close();}
});
