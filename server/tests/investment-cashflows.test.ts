import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {createTestServer as createServer,registeredCookie} from './auth-fixture.ts';
import { createMemoryLedgerStore, createSeedLedgerState } from '../src/ledger/store.ts';
import { emptyPostInvestment } from '../src/ledger/post-investment.ts';
import { units, fixed } from '../src/ledger/exit-settlement.ts';
async function fixture(t: any, engineeringProject=false) {
    const root = await mkdtemp(join(tmpdir(), 'settle-')), state = createSeedLedgerState(), project = state.projects[0];
    project.ownerId = 'user-admin';
    state.projects.push({ ...structuredClone(project), id: 'other-exit' });
    const fund = state.funds[0].id, store = createMemoryLedgerStore(state,{sourcePurposes:engineeringProject?[{recordType:'project',recordId:project.id,projectId:'',dataPurpose:'engineering_fixture',evidence:{test:'exact project fixture'},classifiedBy:'test',classifiedAt:'2026-10-30',revision:1}]:[]}), secret = 'settlement-test', server = createServer({ ledgerStore: store, materialStorageRoot: root, auth: { mode: 'password', sessionSecret: secret } });
    t.after(async () => { await server.close(); await rm(root, { recursive: true, force: true }); });
    const admin = { id: 'user-admin', name: '管理员', email: 'admin@example.local', role: 'admin' }, finance = { ...admin, id: 'finance', email:'finance@example.local', role: 'finance' }, viewer = { ...admin, id: 'viewer', email:'viewer@example.local', role: 'viewer' }, legal = { ...admin, id: 'legal', email:'legal@example.local', role: 'legal' };
    const call = async(method: any, url: string, payload?: any, user: any = admin) => server.inject({ method, url, payload, headers: { cookie: await registeredCookie(server,user,secret), 'content-type': typeof payload === 'object' && !Buffer.isBuffer(payload) ? 'application/json' : 'application/octet-stream' } });
    const refs = new Map();
    for (const id of [project.id, 'other-exit']) {
        const r = await call('POST', '/api/materials/upload?' + new URLSearchParams({ projectId: id, requestId: randomUUID(), name: 'evidence.pdf', type: '法务资料' }), Buffer.from('%PDF-1.7\nactual evidence'));
        assert.equal(r.statusCode, 201, r.body);
        const ref = { materialId: r.json().material.id, versionId: r.json().version.id };
        refs.set(id, ref);
        const v = store.listMaterialVersions(ref.materialId)[0], m = { ...ref, name: v.name, sha256: v.sha256, sizeBytes: v.sizeBytes, packetBlobId: v.blobId, downloadHref: '/original' };
        await store.workflowTransaction(id, async (s) => { const terms = { id: 'terms', version: 1, status: 'approved', allocations: [{ fundId: fund, amount: '100.00' }] }; s.deals = [{ id: 'deal', projectId: id, title: '原始投资', status: 'closed', terms: [terms], closing: { termsId: 'terms', time: '2026-10-01T16:10:00Z', responsibility: { owner: admin } }, agreements: [] } as any]; s.postInvestment = { ...emptyPostInvestment(), exitPreparations: [{ id: 'plan', version: 1, dealId: 'deal', title: '退出', status: 'archived', portion: '60.0000', consideration: '100.01', investment: { termsId: 'terms', terms, allocations: terms.allocations }, documents: ['plan', 'negotiation', 'agreement'].map(kind => ({ kind, material: m, location: '签署件' })) } as any] }; });
    }
    const url = (id = project.id) => `/api/projects/${id}/exit-settlements`;
    const read = async (user: any = admin, id = project.id) => { const r = await call('GET', url(id), undefined, user); assert.equal(r.statusCode, 200, r.body); return r.json(); };
    const act = async (b: any, code = 200, user: any = admin, id = project.id) => { const before = await read(admin, id), r = await call('POST', url(id) + '/actions', { requestId: randomUUID(), expectedRevision: before.revision, ...b }, user); assert.equal(r.statusCode, code, r.body); return r; };
    const execute = (id = project.id) => ({ action: 'execute', planId: 'plan', planVersion: 1, date: '2026-10-03', note: '实际交割，历史时点', allocations: [{ fundId: fund, portion: '60', consideration: '100.01' }], signedAgreement: refs.get(id), evidence: [refs.get(id)] });
    const receive = (executionId: string, id = project.id) => ({ action: 'receive', executionId, fundId: fund, date: '2026-10-02', amount: '50.01', principal: '40', income: '10.01', bankAccount: ' ABC 12345678 ', bankReference: ' Ref 12345678 ', note: '提前到账有凭据', evidence: [refs.get(id)] });
    return { root, store, project, fund, refs, call, read, act, url, execute, receive, admin, finance, viewer, legal };
}
test('actual investment payments retain exact money, prepayment, privacy, original evidence and reversal history', async t=>{
 const f=await fixture(t),url=(id=f.project.id)=>`/api/projects/${id}/investment-cashflows`;
 const read=async(user:any=f.finance,id=f.project.id)=>{const r=await f.call('GET',url(id),undefined,user);assert.equal(r.statusCode,200,r.body);return r.json();};
 const post={action:'post',dealId:'deal',fundId:f.fund,kind:'investment_payment',currency:'CNY',amount:'999999999999999999.99',date:'2026-09-01',bankAccount:' ABC 12345678 ',bankReference:' Ref 12345678 ',note:'凭银行实付',evidence:[f.refs.get(f.project.id)]};
 const act=async(b:any,code=200,user:any=f.finance,id=f.project.id)=>{const r=await f.call('POST',url(id)+'/actions',{requestId:randomUUID(),expectedRevision:(await read(f.finance,id)).revision,...b},user);assert.equal(r.statusCode,code,r.body);return r;};
 assert.equal((await f.call('GET',url(),undefined,f.legal)).statusCode,403);
 assert.deepEqual((await read()).rows,[]);
 for(const bad of [{amount:'0'},{amount:1},{amount:'1.001'},{amount:'1e3'},{kind:'refund'},{currency:'USD'},{currency:undefined},{date:'2026-02-30'},{date:'2099-01-01'},{fundId:'unknown'},{dealId:'unknown'}])await act({...post,...bad},400);
 await act(post,403,f.viewer);
 const req={...post,requestId:randomUUID(),expectedRevision:(await read()).revision};
 const rs=await Promise.all([act(req),act(req)]);assert.equal(rs.filter(r=>r.json().created).length,1);
 let v=await read();assert.equal(v.rows[0].amount,post.amount);assert.equal(v.rows[0].date,post.date);assert.equal(v.rows[0].bankAccount,'ABC12345678');assert.equal(JSON.stringify(v).includes('packetBlobId'),false);
 assert.equal((await read(f.viewer)).rows[0].bankAccount,'****5678');assert.equal((await f.call('GET',v.rows[0].evidence[0].downloadHref)).statusCode,200);
 const old=await f.call('GET',`/api/projects/${f.project.id}/post-investment`);assert.equal(old.body.includes('ABC12345678'),false);assert.equal('investmentCashflows' in old.json().postInvestment,false);
 assert.equal((await f.call('GET','/api/investment-cashflows?fundId='+f.fund)).json().rows.length,1);
 await act({...post,kind:'project_fee'},409,f.finance,'other-exit');
 const reverse={action:'reverse',cashflowId:v.rows[0].id,reason:'纠错登记，没有银行退款',evidence:post.evidence};await act(reverse);await act(reverse,409);await act({...post,kind:'project_tax'});v=await read();assert.equal(v.rows.length,2);assert.equal(v.rows[0].reversal.type,'correction_of_registration');assert.equal(v.rows[0].status,'reversed');
});
async function cashFixture(t:any,engineeringProject=false){
 const f=await fixture(t,engineeringProject),url=(id=f.project.id)=>`/api/projects/${id}/investment-cashflows`;
 const read=async(user:any=f.finance,id=f.project.id)=>{const r=await f.call('GET',url(id),undefined,user);assert.equal(r.statusCode,200,r.body);return r.json();};
 const body=(id=f.project.id)=>({action:'post',dealId:'deal',fundId:f.fund,kind:'investment_payment',currency:'CNY',amount:'10.01',date:'2026-09-01',bankAccount:' ACC 12345678 ',bankReference:' ref 12345678 ',note:'实际银行登记',evidence:[f.refs.get(id)]});
 const send=async(b:any,id=f.project.id)=>f.call('POST',url(id)+'/actions',{requestId:randomUUID(),expectedRevision:(await read(f.finance,id)).revision,...b},f.finance);
 return {...f,url,cashRead:read,body,send};
}
test('both cross-project payment/payment and payment/legacy receive races share a serialized bank identity',async t=>{
 for(const direction of ['pay-pay','pay-receive','receive-pay']){
  const f=await cashFixture(t);await f.act(f.execute('other-exit'),200,f.admin,'other-exit');const e=(await f.read(f.admin,'other-exit')).executions[0];
  const left={...f.body(),requestId:randomUUID(),expectedRevision:(await f.cashRead()).revision};
  const right={...(direction==='pay-pay'?f.body('other-exit'):{...f.receive(e.id,'other-exit'),bankAccount:'acc12345678',bankReference:'REF12345678'}),requestId:randomUUID(),expectedRevision:(await f.cashRead(f.finance,'other-exit')).revision};
  const payment=()=>f.call('POST',f.url()+'/actions',left,f.finance),other=()=>f.call('POST',(direction==='pay-pay'?f.url('other-exit'):f.url('other-exit').replace('investment-cashflows','exit-settlements'))+'/actions',right,f.finance);
  const rs=await Promise.all(direction==='receive-pay'?[other(),payment()]:[payment(),other()]);assert.deepEqual(rs.map(r=>r.statusCode),[200,409]);assert.equal(rs[1].json().error,'duplicate_bank_receipt');
 }
});
test('degraded evidence keeps amount and history, download rechecks hash/authorization; source changes do not rewrite snapshots',async t=>{
 const f=await cashFixture(t);assert.equal((await f.send(f.body())).statusCode,200);const initial=await f.cashRead(),proof=initial.rows[0].evidence[0];
 const source=f.store.listMaterialVersions(f.refs.get(f.project.id).materialId)[0];await writeFile(join(f.root,source.blobId),'changed source');assert.equal((await f.call('GET',proof.downloadHref)).statusCode,200);
 let packet='';await f.store.workflowTransaction(f.project.id,async s=>{packet=s.postInvestment!.investmentCashflows![0].evidence[0].packetBlobId!;});await writeFile(join(f.root,packet),'damaged');let v=await f.cashRead();assert.equal(v.rows[0].amount,'10.01');assert.equal(v.rows[0].readIssue,'material_integrity_mismatch');assert.equal((await f.call('GET',proof.downloadHref)).statusCode,409);
 const mat=f.store.listMaterials().find(m=>m.id===f.refs.get(f.project.id).materialId)!;mat.projectId=null;mat.fundId=null;mat.relationships={projects:[],funds:[]};v=await f.cashRead();assert.equal(v.rows[0].amount,'10.01');assert.equal(v.rows[0].evidence[0].readIssue,'material_not_linked');assert.equal(v.rows[0].evidence[0].downloadHref,undefined);assert.equal((await f.call('GET',proof.downloadHref)).statusCode,400);
});
test('confirmed audit failure rolls back rows/revision/receipt and snapshots; unknown commit preserves originals for replay',async t=>{
 for(const mode of ['unknown','audit_rollback']){
  const f=await cashFixture(t),before=await f.cashRead(),files=await readdir(f.root),original=f.store.workflowTransaction.bind(f.store);let trigger=true;
  f.store.workflowTransaction=(async(id:any,fn:any,options:any)=>{
   if(mode==='audit_rollback')return original(id,async s=>{const result=await fn(s);if(trigger&&result?.created&&result?.ledger){assert.equal(s.auditEvents.length,1);assert.equal(s.auditEvents[0].detail.includes('ACC12345678'),false);assert.equal(s.auditEvents[0].detail.includes('REF12345678'),false);trigger=false;throw new Error('audit persistence failed');}return result;},options);
   const result=await original(id,fn,options);if(trigger&&(result as any)?.created&&(result as any)?.ledger){trigger=false;throw Object.assign(new Error('commit acknowledgement lost'),{safeToDeleteBlob:false});}return result;
  }) as any;
  const b={...f.body(),requestId:randomUUID(),expectedRevision:before.revision};assert.equal((await f.send(b)).statusCode,500);
  if(mode==='audit_rollback'){assert.deepEqual(await readdir(f.root),files);const v=await f.cashRead();assert.equal(v.rows.length,0);assert.equal(v.revision,before.revision);assert.equal((await f.send(b)).statusCode,200);}else{
   assert.equal((await readdir(f.root)).length,files.length+1);const replay=await f.send(b);assert.equal(replay.statusCode,200,replay.body);assert.equal(replay.json().created,false);assert.equal(replay.json().ledger.rows.length,1);assert.equal((await f.call('GET',replay.json().ledger.rows[0].evidence[0].downloadHref)).statusCode,200);
  }
 }
});
test('reads never initialize post state; partial/missing fund map, unapproved/current terms and stale revision are rejected',async t=>{
 const f=await cashFixture(t),blank=f.store.listProjects()[2];
 if(blank){assert.equal((await f.call('GET',f.url(blank.id),undefined,f.finance)).statusCode,200);assert.equal((await f.store.readExitStates()).some(s=>s.project.id===blank.id),false);}
 if(blank){await f.store.workflowTransaction(blank.id,async s=>{s.deals=[{id:'closed-no-post',title:'历史交割',status:'closed',terms:[],closing:{termsId:'missing'}} as any];});assert.equal((await f.cashRead(f.finance,blank.id)).rows.length,0);assert.equal((await f.store.readExitStates()).find(s=>s.project.id===blank.id)!.postInvestment,undefined);}
 const global=await f.call('GET','/api/investment-cashflows',undefined,f.finance);assert.equal(global.statusCode,200);assert.equal((await f.cashRead()).rows.length,0);assert.equal((await f.store.readExitStates()).find(s=>s.project.id===f.project.id)!.postInvestment!.investmentCashflows,undefined);
 for(const mutation of ['unknown-map','draft','wrong-terms','active']){
  const saved=await f.store.workflowTransaction(f.project.id,async s=>structuredClone(s.deals));await f.store.workflowTransaction(f.project.id,async s=>{const d=s.deals![0];if(mutation==='unknown-map')d.terms[0].allocations.push({fundId:'missing',amount:'1'});if(mutation==='draft')d.terms[0].status='draft';if(mutation==='wrong-terms')d.closing!.termsId='old';if(mutation==='active')d.status='active';});assert.equal((await f.send(f.body())).statusCode,400);await f.store.workflowTransaction(f.project.id,async s=>{s.deals=saved;});
 }
 const b={...f.body(),requestId:randomUUID(),expectedRevision:(await f.cashRead()).revision};assert.equal((await f.send(b)).statusCode,200);assert.equal((await f.send({...b,requestId:randomUUID(),bankReference:'OTHER'})).statusCode,409);assert.equal((await f.send({...b,amount:'2'})).statusCode,409);
 const legacy=await f.call('POST',`/api/projects/${f.project.id}/post-investment/actions`,{requestId:randomUUID(),expectedRevision:(await f.cashRead()).revision,dealId:'deal',action:'reconcile'});assert.equal(legacy.statusCode,200,legacy.body);assert.equal(legacy.body.includes('ACC12345678'),false);assert.equal(legacy.body.includes('investmentCashflows'),false);
});
test('reversal replay stays idempotent after same-event re-registration, preserves original downloads and only releases that event',async t=>{
 const f=await cashFixture(t);assert.equal((await f.send(f.body())).statusCode,200);const old=(await f.cashRead()).rows[0];
 const reverse={action:'reverse',cashflowId:old.id,reason:'登记纠错',evidence:f.body().evidence,requestId:randomUUID(),expectedRevision:(await f.cashRead()).revision};
 assert.equal((await f.send(reverse)).statusCode,200);assert.equal((await f.send({...f.body('other-exit'),kind:'project_fee'},'other-exit')).statusCode,200);
 const replay=await f.send(reverse);assert.equal(replay.statusCode,200,replay.body);assert.equal(replay.json().created,false);assert.equal((await f.cashRead(f.finance,'other-exit')).rows[0].status,'posted');assert.equal((await f.call('GET',old.evidence[0].downloadHref)).statusCode,200);
 assert.equal((await f.send({...reverse,requestId:randomUUID(),expectedRevision:(await f.cashRead()).revision})).statusCode,409);
 const filtered=await f.call('GET','/api/investment-cashflows?projectId=other-exit&fundId='+f.fund,undefined,f.viewer);assert.equal(filtered.statusCode,200);assert.equal(filtered.json().rows.length,1);assert.equal(filtered.json().rows[0].bankReference,'****5678');
});
test('new post evidence authorizes whole input before reads and removes partial staged copies on failure',async t=>{
 const f=await cashFixture(t),before=await readdir(f.root),ref=f.refs.get(f.project.id),other=f.refs.get('other-exit');
 assert.equal((await f.send({...f.body(),evidence:[ref,{...ref,versionId:'missing'}]})).statusCode,409);assert.deepEqual(await readdir(f.root),before);assert.equal((await f.cashRead()).rows.length,0);
 const original=f.store.listMaterialVersions.bind(f.store);let reads=0;f.store.listMaterialVersions=(id:any)=>{reads++;return original(id);};
 assert.equal((await f.send({...f.body(),evidence:[ref,other]})).statusCode,400);assert.equal(reads,0);assert.deepEqual(await readdir(f.root),before);
 assert.equal((await f.send({...f.body(),evidence:[]})).statusCode,400);assert.equal((await f.send({...f.body(),evidence:[ref,ref]})).statusCode,400);
});
test('finance global ledger supplies first-payment eligible scope without project-read and keeps historical rows after eligibility disappears',async t=>{
 const f=await cashFixture(t),otherFund={...f.store.listFunds()[0],id:'another-known-fund'};await f.store.fundTransaction(s=>{s.funds.push(otherFund);});await f.store.accessTransaction(s=>{s.data.funds[otherFund.id]={visibility:'public',memberIds:[],revision:1};});
 await f.store.workflowTransaction(f.project.id,async s=>{s.deals![0].terms[0].allocations.push({fundId:otherFund.id,amount:'2'});});
 const get=async(query='')=>{const r=await f.call('GET','/api/investment-cashflows'+query,undefined,f.finance);assert.equal(r.statusCode,200,r.body);return r.json();};
 const before=await get();assert.equal(before.rows.length,0);const project=before.projects.find((v:any)=>v.id===f.project.id);assert.equal(project.name,f.project.name);assert.equal(project.deals[0].id,'deal');assert.equal(project.deals[0].title,'原始投资');assert.deepEqual(project.deals[0].fundIds,[f.fund,otherFund.id]);
 assert.equal((await f.call('GET',`/api/projects/${f.project.id}/deals`,undefined,f.finance)).statusCode,403);
 const filtered=await get('?projectId='+f.project.id+'&fundId='+otherFund.id);assert.equal(filtered.projects.length,1);assert.deepEqual(filtered.projects[0].deals[0].fundIds,[otherFund.id]);assert.equal((await get('?fundId=unknown')).projects.length,0);
 const blank=f.store.listProjects()[2];if(blank){await f.store.workflowTransaction(blank.id,async s=>{s.deals=[{id:'valid-no-post',title:'未登记付款',status:'closed',terms:[{id:'t',status:'approved',allocations:[{fundId:f.fund,amount:'1'}]}],closing:{termsId:'t'}} as any];});assert.ok((await get()).projects.some((p:any)=>p.id===blank.id));assert.equal((await f.store.readExitStates()).find(s=>s.project.id===blank.id)!.postInvestment,undefined);}
 assert.equal((await f.send(f.body())).statusCode,200);
 for(const mutation of ['draft','missing-map','active','no-deals']){
  const saved=await f.store.workflowTransaction(f.project.id,async s=>structuredClone(s.deals));await f.store.workflowTransaction(f.project.id,async s=>{if(mutation==='draft')s.deals![0].terms[0].status='draft';if(mutation==='missing-map')s.deals![0].terms[0].allocations.push({fundId:'unknown',amount:'1'});if(mutation==='active')s.deals![0].status='active';if(mutation==='no-deals')s.deals=[];});
  const v=await get('?projectId='+f.project.id);assert.equal(v.projects.length,0);assert.equal(v.rows.length,1);assert.equal(v.rows[0].amount,'10.01');await f.store.workflowTransaction(f.project.id,async s=>{s.deals=saved;});
 }
});

test('explicit engineering version proofs exclude new payment and receipt amounts, retaining labelled history',async t=>{
 const f=await cashFixture(t,true),ref=f.refs.get(f.project.id),versions=f.store.listMaterialVersions;
 f.store.listMaterialVersions=(id:string)=>versions(id).map(v=>({...v,dataPurpose:v.id===ref.versionId?'engineering_fixture':v.dataPurpose}));
 assert.equal((await f.send(f.body())).statusCode,200);await f.act(f.execute());const execution=(await f.read()).executions[0];await f.act({...f.receive(execution.id),currency:'CNY'},200,f.finance);
 const payment=(await f.cashRead()).rows[0];assert.equal(payment.dataOrigin,'user_input');assert.equal(payment.dataPurpose,'unknown');assert.ok(payment.sourceBasis.some((v:any)=>v.recordType==='material_version'&&v.projectId===''&&v.id===ref.versionId&&v.dataPurpose==='engineering_fixture'));
 const hidden=await f.call('GET',f.url()+'?includeDemo=false',undefined,f.finance);assert.equal(hidden.statusCode,200,hidden.body);assert.equal(hidden.json().rows.length,0);
 const ledger=await f.call('GET','/api/investment-ledger?includeDemo=false',undefined,f.finance);assert.equal(ledger.statusCode,200,ledger.body);assert.equal(ledger.json().totals.investmentPrincipal,'0.00');assert.equal(ledger.json().totals.exitReceipts,'0.00');
 assert.equal((await f.read(f.finance)).payments.length,1);assert.equal((await f.read()).executions.length,1);
});

test('real independently selected payment proof remains effective inside a classified engineering project',async t=>{
 const f=await cashFixture(t,true);assert.equal((await f.send(f.body())).statusCode,200);
 const hidden=await f.call('GET',f.url()+'?includeDemo=false',undefined,f.finance);assert.equal(hidden.statusCode,200,hidden.body);assert.equal(hidden.json().rows.length,1);
 const ledger=await f.call('GET',`/api/projects/${f.project.id}/investment-ledger?includeDemo=false`,undefined,f.finance);assert.equal(ledger.statusCode,200,ledger.body);assert.equal(ledger.json().totals.investmentPrincipal,'10.01');assert.equal(ledger.json().counts.primaryFundProjects,0);
 const own=(await f.store.readInvestmentLedgerSnapshot()).states.find(v=>v.project.id===f.project.id)!;assert.equal(own.project.dataPurpose,'engineering_fixture');assert.equal(own.postInvestment!.investmentCashflows![0].dataPurpose,'unknown');
});
