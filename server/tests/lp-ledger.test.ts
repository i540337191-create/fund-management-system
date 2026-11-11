import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import {lpInput,lpWrite,lpTotals} from '../src/ledger/lp-ledger.ts';
import {lpProjection} from '../src/ledger/lp-privacy.ts';
import {createTestServer,registeredCookie} from './auth-fixture.ts';
const actor={id:'lp-admin',name:'LP operator'};
test('LP master CAS replay, rollback, duplicate names, optional clears and durable contact privacy',async()=>{
 const store=createMemoryLedgerStore(),fund=(await store.listFunds())[0],fund2={...fund,id:'lp-second-fund'};await store.fundTransaction(s=>{s.funds.push(fund2);});
 const b=lpInput({requestId:randomUUID(),name:'Shared LP',type:'机构',contactPhone:'13000112233'},'master');
 const write=(input:any,id?:string,fundId=fund.id)=>store.lpTransaction(s=>lpWrite(s,fundId,id,'master',input,actor));
 const first:any=await write(b);assert.equal(first.investor.revision,1);assert.deepEqual(await write(b),first);
 await assert.rejects(write({...b,name:'conflict'}),/lp_request_conflict/);
 const second:any=await write({...b,requestId:randomUUID()},undefined,fund2.id);assert.notEqual(first.investor.id,second.investor.id);
 const edit=lpInput({requestId:randomUUID(),expectedRevision:1,contactPhone:''},'master');await write(edit,first.investor.id);
 const current=(await store.getFundDetail(fund.id))!.investors.find(i=>i.id===first.investor.id)!;assert.equal(current.name,'Shared LP');assert.equal(current.contactPhone,'');
 assert.equal((await lpProjection(store)).text('Contact 13000112233'),'[LP信息已脱敏]');
 await assert.rejects(write({...edit,requestId:randomUUID()},first.investor.id),/lp_revision_conflict/);
 await assert.rejects(store.lpTransaction(s=>{s.investors[0].name='ROLLBACK';throw Error('rollback');}));assert.notEqual((await store.getFundDetail(fund.id))!.investors[0].name,'ROLLBACK');
 assert.equal(lpTotals([current],{commitments:[],entries:[],requests:{},history:[]}).commitment,null);
});
test('LP money/date and strict input boundaries reject invalid values',()=>{
 for(const amount of ['-1','1.001','1e2',1,'NaN','01','999999999999999999999'])assert.throws(()=>lpInput({requestId:randomUUID(),amount,currency:'CNY',unit:'元',effectiveDate:'2026-01-01',changeReason:'initial',proof:{materialId:'m',versionId:'v'}},'commitment'));
 for(const day of ['2026-02-30','2026-13-01','2026-2-1','2999-01-01'])assert.throws(()=>lpInput({requestId:randomUUID(),amount:'0',currency:'CNY',unit:'元',effectiveDate:day,changeReason:'initial',proof:{materialId:'m',versionId:'v'}},'commitment'));
 assert.throws(()=>lpInput({requestId:randomUUID(),name:'A',type:'机构',fundId:'other'},'master'));
});
test('LP upload, exact totals, correction chains, proof scope and role boundaries through API',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'lp22-'));const store=createMemoryLedgerStore();const secret='batch22-long-synthetic-secret';const auth={mode:'password' as const,sessionSecret:secret,adminEmail:'admin@example.invalid',adminPassword:'password'};
 const server=createTestServer({ledgerStore:store,auth,materialStorageRoot:dir});
 try{
 const cookies:Record<string,string>={};for(const role of ['investment_manager','finance','legal','viewer'])cookies[role]=await registeredCookie(server,{id:'lp-'+role,name:role,email:role+'@example.invalid',role:role as any},secret);
 const fund=(await store.listFunds())[0],base=`/api/funds/${fund.id}/investors`;
 const call=async(role:string,url:string,payload?:any,method='POST')=>server.inject({url,method:method as any,headers:{cookie:cookies[role]},...(payload?{payload}:{})});
 assert.equal((await call('finance',base,{requestId:randomUUID(),name:'LP',type:'机构'})).statusCode,403);
 const created=await call('investment_manager',base,{requestId:randomUUID(),name:'Proof LP',type:'机构'});assert.equal(created.statusCode,200,created.body);const id=created.json().investor.id,member=base+'/'+id;
 const upload=await server.inject({url:member+'/materials/upload?'+new URLSearchParams({requestId:randomUUID(),expectedRevision:'1',name:'proof.txt',type:'LP凭证'}),method:'POST',headers:{cookie:cookies.finance,'content-type':'application/octet-stream'},payload:Buffer.from('LP receipt proof')});assert.equal(upload.statusCode,200,upload.body);const u=upload.json();assert.deepEqual(u.material.relationships.projects,[]);assert.equal(u.investor.revision,2);const proof={materialId:u.material.id,versionId:u.version.id};
 const commitment={requestId:randomUUID(),expectedRevision:2,amount:'100.1',currency:'CNY',unit:'元',effectiveDate:'2026-01-01',changeReason:'initial',proof};
 assert.equal((await call('finance',member+'/commitments',commitment)).statusCode,403);
 const committed=await call('investment_manager',member+'/commitments',commitment);assert.equal(committed.statusCode,200,committed.body);assert.equal(committed.json().totals.commitment,'100.10');
 const receipt={requestId:randomUUID(),expectedRevision:3,amount:'30.01',currency:'CNY',unit:'元',bankDate:'2026-01-02',reference:'BANK-1',proof};
 assert.equal((await call('investment_manager',member+'/receipts',receipt)).statusCode,403);
 const received=await call('finance',member+'/receipts',receipt);assert.equal(received.statusCode,200,received.body);assert.equal(received.json().totals.paidIn,'30.01');
 const receiptId=received.json().receipts[0].id;const correction={...receipt,requestId:randomUUID(),expectedRevision:4,amount:'25',reason:'bank transcription correction'};
 const corrected=await call('finance',member+'/receipts/'+receiptId+'/corrections',correction);assert.equal(corrected.statusCode,200,corrected.body);assert.equal(corrected.json().totals.paidIn,'25.00');assert.equal(corrected.json().receipts.length,2);assert.equal(corrected.json().receipts[0].active,false);
 assert.deepEqual((await call('finance',member+'/receipts/'+receiptId+'/corrections',correction)).json(),corrected.json());
 assert.equal((await call('finance',member+'/receipts/'+receiptId+'/corrections',{...correction,requestId:randomUUID(),expectedRevision:5})).statusCode,409);
 const lp2=(await call('investment_manager',base,{requestId:randomUUID(),name:'Other LP',type:'机构'})).json().investor;
 assert.equal((await call('finance',base+'/'+lp2.id+'/receipts',{...receipt,requestId:randomUUID(),expectedRevision:1})).statusCode,400);
 const download=`${member}/evidence/${corrected.json().receipts[1].proof.id}/file`;
 assert.equal((await call('legal',download,undefined,'GET')).statusCode,403);
 assert.equal((await call('finance',download,undefined,'GET')).body,'LP receipt proof');
 const csv=await call('viewer',base+'/ledger.csv',undefined,'GET');assert.equal(csv.statusCode,200,csv.body);assert.equal(csv.json().csv.includes('Proof LP'),false);assert.equal(csv.json().totals.paidIn,'25.00');
 const before=(await store.getFundDetail(fund.id))!.investors.find(i=>i.id===id)!.suitabilityStatus;
 const signed=await call('investment_manager',`/api/fund-investors/${id}/confirm-signature`,{requestId:randomUUID(),expectedRevision:5});assert.equal(signed.statusCode,200,signed.body);assert.equal(signed.json().investor.suitabilityStatus,before);
 const activeId=corrected.json().receipts[1].id;
 const chain=await call('finance',member+'/receipts/'+activeId+'/corrections',{...correction,requestId:randomUUID(),expectedRevision:6,amount:'20'});assert.equal(chain.statusCode,200,chain.body);assert.equal(chain.json().totals.paidIn,'20.00');assert.equal(chain.json().receipts.filter((x:any)=>x.active).length,1);
 const races=await Promise.all([0,1].map(()=>call('investment_manager',member+'/commitments',{...commitment,requestId:randomUUID(),expectedRevision:7,amount:'0'})));assert.deepEqual(races.map(r=>r.statusCode).sort(),[200,409]);assert.equal(races.find(r=>r.statusCode===200)!.json().totals.commitment,'0.00');
 const totals=(await call('viewer',base+'/ledger',undefined,'GET')).json().totals;assert.equal(totals.commitment,'0.00');assert.equal(totals.commitmentKnown,1);assert.equal(totals.paidIn,'20.00');
 await writeFile(join(dir,u.version.id),'tampered');
 assert.equal((await call('finance',member+'/receipts',{...receipt,requestId:randomUUID(),expectedRevision:8})).statusCode,409);
 assert.equal((await call('investment_manager','/api/fund-investors/missing/confirm-signature',{requestId:randomUUID(),expectedRevision:1})).statusCode,404);

 }finally{await server.close();await rm(dir,{recursive:true,force:true});}
});

test('LP source read view filters own typed identities and never revives hidden replacements',async()=>{
 const {lpReadView,emptyLpData}=await import('../src/ledger/lp-ledger.ts');const {purposeLookup}=await import('../src/ledger/source-purposes.ts');
 const store=createMemoryLedgerStore();const fund=(await store.listFunds())[0],base=(await store.getFundDetail(fund.id))!.investors[0];
 const ordinary={...base,id:'ordinary',name:'Ordinary',dataOrigin:'user_input'},engineering={...base,id:'engineering',name:'Engineering',dataOrigin:'user_input'};
 const proof={id:'snap',materialId:'same-id',versionId:'v',name:'proof',sha256:'a'.repeat(64),sizeBytes:1,blobId:randomUUID(),sourceBasis:[{id:'same-id',recordType:'material',projectId:'',dataOrigin:'user_input',dataPurpose:'unknown' as const}]};
 const entry=(id:string,amount:string,extra:any={})=>({id,fundId:fund.id,requestId:randomUUID(),investorId:'ordinary',amount,currency:'CNY' as const,unit:'元' as const,actorId:actor.id,actor:actor.name,createdAt:'2026-01-01T00:00:00Z',proof:structuredClone(proof),dataOrigin:'user_input',...extra});
 const state:any={funds:[fund],investors:[ordinary,engineering],materials:[],versions:[],auditEvents:[],data:{...emptyLpData(),commitments:[entry('c1','100.00'),entry('c2','200.00',{sourceBasis:proof.sourceBasis})],entries:[entry('r1','40.00'),entry('r2','30.00',{corrects:'r1',sourceBasis:proof.sourceBasis})]},purposes:purposeLookup([{recordType:'investor',recordId:'engineering',dataPurpose:'engineering_fixture'},{recordType:'material',recordId:'same-id',dataPurpose:'engineering_fixture'},{recordType:'investor',recordId:'same-id',dataPurpose:'engineering_fixture'}])};
 const before=structuredClone(state.data);const all=lpReadView(state),defaultAll=lpReadView(state,true);assert.deepEqual(all,defaultAll);assert.equal(lpTotals(all.investors,all.data).commitment,'200.00');assert.equal(lpTotals(all.investors,all.data).paidIn,'30.00');
 const filtered=lpReadView(state,false);assert.equal(filtered.investors.length,1);const totals=lpTotals(filtered.investors,filtered.data);assert.equal(totals.commitment,null);assert.equal(totals.paidIn,null);assert.equal(totals.commitmentKnown,0);assert.equal(totals.receiptKnown,0);assert.equal(totals.excludedCommitments,1);assert.equal(totals.excludedReceipts,1);assert.deepEqual(state.data,before);
 state.purposes=purposeLookup([{recordType:'investor',recordId:'same-id',dataPurpose:'engineering_fixture'}]);const collision=lpReadView(state,false);assert.equal(lpTotals(collision.investors,collision.data).commitment,'200.00');assert.equal(lpTotals(collision.investors,collision.data).paidIn,'30.00');
});

test('LP API list detail CSV and fund totals share includeDemo read policy',async()=>{
 const {createSeedLedgerState}=await import('../src/ledger/store.ts');const initial=createSeedLedgerState(),fund=initial.funds[0],legacy=initial.investors[0];
 initial.investors=[{...legacy,id:'lp-ordinary',name:'Ordinary LP',dataOrigin:'user_input'},{...legacy,id:'lp-engineering',name:'Engineering LP',dataOrigin:'user_input'}];
 const store=createMemoryLedgerStore(initial,{sourcePurposes:[{recordType:'investor',recordId:'lp-engineering',dataPurpose:'engineering_fixture',classifiedBy:'test',classifiedAt:'2026-01-01T00:00:00Z',revision:1,evidence:{}}]});
 const server=createTestServer({ledgerStore:store,auth:{mode:'local-bypass'}});try{
 const base=`/api/funds/${fund.id}/investors`;
 assert.equal((await server.inject(base)).json().investors.length,2);assert.equal((await server.inject(base+'?includeDemo=true')).json().investors.length,2);
 const filtered=(await server.inject(base+'?includeDemo=false')).json();assert.equal(filtered.investors.length,1);assert.equal(filtered.investors[0].id,'lp-ordinary');
 const detail=await server.inject(base+'/lp-engineering?includeDemo=false');assert.equal(detail.statusCode,404);
 const csv=(await server.inject(base+'/ledger.csv?includeDemo=false')).json();assert.equal(csv.csv.includes('Engineering LP'),false);assert.deepEqual(csv.totals,filtered.totals);
 const fundDetail=(await server.inject(`/api/funds/${fund.id}?includeDemo=false`)).json();assert.deepEqual(fundDetail.registeredTotals,filtered.totals);assert.equal(fundDetail.registeredTotalsIncludeDemo,false);
 const funds=(await server.inject('/api/funds?includeDemo=false')).json();assert.deepEqual(funds.funds[0].registeredTotals,filtered.totals);assert.equal(funds.funds[0].registeredTotalsIncludeDemo,false);
 for(const url of [base,base+'/ledger',base+'/ledger.csv',base+'/lp-ordinary','/api/funds',`/api/funds/${fund.id}`])assert.equal((await server.inject(url+'?includeDemo=bad')).statusCode,400,url);
 }finally{await server.close();}
});

test('LP RID replay binds stable actor ID across profile changes for writes and uploads',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'lp-rid-'));const store=createMemoryLedgerStore(),secret='batch22-actor-replay-synthetic-secret';
 const auth={mode:'password' as const,sessionSecret:secret,adminEmail:'admin@example.invalid',adminPassword:'password'};
 const server=createTestServer({ledgerStore:store,auth,materialStorageRoot:dir});try{
 const original={id:'lp-replay-actor',name:'Original operator',email:'original@example.invalid',role:'investment_manager' as const};
 const cookie=await registeredCookie(server,original,secret),otherCookie=await registeredCookie(server,{...original,id:'lp-other-actor',email:'other@example.invalid'},secret);
 const fund=(await store.listFunds())[0],base=`/api/funds/${fund.id}/investors`,payload={requestId:randomUUID(),name:'Stable RID LP',type:'机构'};
 const write=(cookieValue:string)=>server.inject({url:base,method:'POST',headers:{cookie:cookieValue},payload});
 const first=await write(cookie);assert.equal(first.statusCode,200,first.body);const id=first.json().investor.id;
 await store.accountTransaction(s=>{const user=s.users.find(u=>u.id===original.id)!;user.name='Renamed operator';user.email='renamed@example.invalid';user.role='finance';});
 // The current role still controls permission before replay; restore a permitted role to test identity.
 assert.equal((await write(cookie)).statusCode,403);
 await store.accountTransaction(s=>{s.users.find(u=>u.id===original.id)!.role='admin';});
 const replay=await write(cookie);assert.equal(replay.statusCode,200,replay.body);assert.deepEqual(replay.json(),first.json());assert.equal(replay.json().auditEvent.actor,'Original operator');
 assert.equal((await write(otherCookie)).statusCode,409);
 const query=new URLSearchParams({requestId:randomUUID(),expectedRevision:'1',name:'replay.txt',type:'LP凭证'}),url=`${base}/${id}/materials/upload?${query}`;
 const upload=(cookieValue:string)=>server.inject({url,method:'POST',headers:{cookie:cookieValue,'content-type':'application/octet-stream'},payload:Buffer.from('stable proof bytes')});
 const uploaded=await upload(cookie);assert.equal(uploaded.statusCode,200,uploaded.body);
 await store.accountTransaction(s=>{const user=s.users.find(u=>u.id===original.id)!;user.name='Renamed again';user.email='again@example.invalid';user.role='investment_manager';});
 const replayUpload=await upload(cookie);assert.equal(replayUpload.statusCode,200,replayUpload.body);assert.deepEqual(replayUpload.json(),uploaded.json());assert.equal(replayUpload.json().version.uploadedBy,'Renamed operator');
 assert.equal((await upload(otherCookie)).statusCode,409);
 }finally{await server.close();await rm(dir,{recursive:true,force:true});}
});

test('LP mutations recheck live account and session under the LP transaction before replay or writes',async()=>{
 for(const change of ['disable','revoke','downgrade'])for(const operation of ['create','replay','patch','signature','commitment','receipt','correction','upload','uploadReplay']){
 const dir=await mkdtemp(join(tmpdir(),'lp-auth-race-')),original=createMemoryLedgerStore();const secret='lp-transaction-auth-race-synthetic-secret',auth={mode:'password' as const,sessionSecret:secret,adminEmail:'admin@example.invalid',adminPassword:'password'};
 let armed=false;const user={id:'lp-race-actor',name:'LP race actor',email:'race@example.invalid',role:'admin' as const};
 const store={...original,lpTransaction:async(action:any)=>{if(armed){armed=false;await original.accountTransaction(s=>{if(change==='revoke')s.sessions=s.sessions.filter(x=>x.actorId!==user.id);else{const actor=s.users.find(u=>u.id===user.id)!;if(change==='disable')actor.enabled=false;else actor.role='viewer';}});}return original.lpTransaction(action);}};
 const server=createTestServer({ledgerStore:store,auth,materialStorageRoot:dir});try{
 const cookie=await registeredCookie(server,user,secret),headers={cookie},fund=(await original.listFunds())[0],base=`/api/funds/${fund.id}/investors`,master={requestId:randomUUID(),name:'Transaction actor LP',type:'机构'};
 const created=await server.inject({url:base,method:'POST',headers,payload:master});assert.equal(created.statusCode,200,created.body);const id=created.json().investor.id,member=base+'/'+id;
 const uploadUrl=member+'/materials/upload?'+new URLSearchParams({requestId:randomUUID(),expectedRevision:'1',name:'race.txt',type:'凭证'}),uploadHeaders={cookie,'content-type':'application/octet-stream'};
 if(operation==='uploadReplay')assert.equal((await server.inject({url:uploadUrl,method:'POST',headers:uploadHeaders,payload:Buffer.from('race proof')})).statusCode,200);
 const money={requestId:randomUUID(),expectedRevision:1,amount:'1.00',currency:'CNY',unit:'元',proof:{materialId:'not-reached',versionId:'not-reached'},bankDate:'2026-01-01',reference:'BANK'};
 const routes:any={create:{url:base,payload:{...master,requestId:randomUUID()}},replay:{url:base,payload:master},patch:{url:member,method:'PATCH',payload:{requestId:randomUUID(),expectedRevision:1,name:'changed'}},signature:{url:`/api/fund-investors/${id}/confirm-signature`,payload:{requestId:randomUUID(),expectedRevision:1}},commitment:{url:member+'/commitments',payload:{requestId:randomUUID(),expectedRevision:1,amount:'1',currency:'CNY',unit:'元',effectiveDate:'2026-01-01',changeReason:'initial',proof:money.proof}},receipt:{url:member+'/receipts',payload:money},correction:{url:member+'/receipts/not-reached/corrections',payload:{...money,reason:'correction'}},upload:{url:uploadUrl,headers:uploadHeaders,payload:Buffer.from('race proof')},uploadReplay:{url:uploadUrl,headers:uploadHeaders,payload:Buffer.from('race proof')}};
 const capture=async()=>({...await original.lpTransaction(s=>({investors:s.investors,data:s.data,materials:s.materials,versions:s.versions})),audit:await original.listAuditEvents()});const before=await capture();armed=true;
 const denied=await server.inject({method:'POST',headers,...routes[operation]});assert.equal(denied.statusCode,change==='downgrade'?403:401,`${operation}/${change}: ${denied.body}`);assert.deepEqual(await capture(),before,`${operation}/${change} changed LP state`);
 }finally{await server.close();await rm(dir,{recursive:true,force:true});}
 }
});
