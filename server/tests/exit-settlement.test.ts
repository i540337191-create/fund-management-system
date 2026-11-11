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
async function fixture(t: any) {
    const root = await mkdtemp(join(tmpdir(), 'settle-')), state = createSeedLedgerState(), project = state.projects[0];
    project.ownerId = 'user-admin';
    state.projects.push({ ...structuredClone(project), id: 'other-exit' });
    const fund = state.funds[0].id, store = createMemoryLedgerStore(state), secret = 'settlement-test', server = createServer({ ledgerStore: store, materialStorageRoot: root, auth: { mode: 'password', sessionSecret: secret } });
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
        await store.workflowTransaction(id, async (s) => { const terms = { id: 'terms', version: 1, allocations: [{ fundId: fund, amount: '100.00' }] }; s.deals = [{ id: 'deal', projectId: id, title: '原始投资', status: 'closed', terms: [terms], closing: { termsId: 'terms', time: '2026-10-01T16:10:00Z', responsibility: { owner: admin } }, agreements: [] } as any]; s.postInvestment = { ...emptyPostInvestment(), exitPreparations: [{ id: 'plan', version: 1, dealId: 'deal', title: '退出', status: 'archived', portion: '60.0000', consideration: '100.01', investment: { termsId: 'terms', terms, allocations: terms.allocations }, documents: ['plan', 'negotiation', 'agreement'].map(kind => ({ kind, material: m, location: '签署件' })) } as any] }; });
    }
    const url = (id = project.id) => `/api/projects/${id}/exit-settlements`;
    const read = async (user: any = admin, id = project.id) => { const r = await call('GET', url(id), undefined, user); assert.equal(r.statusCode, 200, r.body); return r.json(); };
    const act = async (b: any, code = 200, user: any = admin, id = project.id) => { const before = await read(admin, id), r = await call('POST', url(id) + '/actions', { requestId: randomUUID(), expectedRevision: before.revision, ...b }, user); assert.equal(r.statusCode, code, r.body); return r; };
    const execute = (id = project.id) => ({ action: 'execute', planId: 'plan', planVersion: 1, date: '2026-10-03', note: '实际交割，历史时点', allocations: [{ fundId: fund, portion: '60', consideration: '100.01' }], signedAgreement: refs.get(id), evidence: [refs.get(id)] });
    const receive = (executionId: string, id = project.id) => ({ action: 'receive', executionId, fundId: fund, date: '2026-10-02', amount: '50.01', principal: '40', income: '10.01', bankAccount: ' ABC 12345678 ', bankReference: ' Ref 12345678 ', note: '提前到账有凭据', evidence: [refs.get(id)] });
    return { root, store, project, fund, refs, call, read, act, url, execute, receive, admin, finance, viewer, legal };
}
test('exact cent/portion primitives reject unsafe monetary inputs', () => { assert.equal(fixed(units('999999999999999999.99') + 1n), '1000000000000000000.00'); assert.equal(fixed(units('0.0001', 4), 4), '0.0001'); for (const x of ['-1', '1e2', '1.001', 'NaN', 1])
    assert.throws(() => units(x)); });
test('execution, receipt, privacy, reversal and cancellation preserve a same-source ledger', async (t) => { const f = await fixture(t); assert.equal((await f.call('GET', f.url(), undefined, f.legal)).statusCode, 403); assert.equal((await f.read(f.finance)).mayReceive, true); await f.act(f.execute(), 403, f.finance); await f.act(f.execute()); let v = await f.read(), e = v.executions[0]; assert.equal(v.positions[0].remainingPortion, '40.0000'); assert.equal(v.positions[0].outstanding, '100.01'); await f.act(f.execute(), 409); await f.act(f.receive(e.id), 403, f.viewer); await f.act(f.receive(e.id), 200, f.finance); v = await f.read(f.viewer); assert.equal(v.payments[0].bankAccount, '****5678'); assert.equal(v.payments[0].bankReference, '****5678'); assert.equal(v.positions[0].received, '50.01'); assert.equal(v.positions[0].outstanding, '50.00'); assert.equal((await f.read(f.finance)).payments[0].bankAccount, 'ABC12345678'); const legacy = await f.call('GET', `/api/projects/${f.project.id}/post-investment`); assert.equal(legacy.body.includes('ABC12345678'), false); assert.equal('exitPayments' in legacy.json().postInvestment, false); const mutation = await f.call('POST', `/api/projects/${f.project.id}/post-investment/actions`, { requestId: randomUUID(), expectedRevision: v.revision, dealId: 'deal', action: 'reconcile' }); assert.equal(mutation.body.includes('ABC12345678'), false); await f.act({ action: 'cancel_execution', executionId: e.id, reason: '取消', evidence: [f.refs.get(f.project.id)] }, 409); await f.act({ action: 'reverse_payment', paymentId: v.payments[0].id, reason: '纠正登记，未执行银行退款', evidence: [f.refs.get(f.project.id)] }, 200, f.finance); await f.act({ action: 'cancel_execution', executionId: e.id, reason: '取消', evidence: [f.refs.get(f.project.id)] }); v = await f.read(); assert.equal(v.executions[0].status, 'cancelled'); assert.equal(v.payments[0].status, 'reversed'); assert.equal(v.positions[0].received, '0.00'); assert.equal(v.positions[0].remainingPortion, '100.0000'); assert.equal((await f.call('GET', '/api/exit-settlements?fundId=' + f.fund, undefined, f.finance)).json().payments.length, 1); });
test('date, plan scope, cents, rollback, revision and idempotency boundaries', async (t) => { const f = await fixture(t), base = f.execute(), files = await readdir(f.root); for (const b of [{ ...base, date: '2026-10-01' }, { ...base, date: '2099-01-01' }, { ...base, allocations: [{ fundId: f.fund, portion: '60.0001', consideration: '100.01' }] }, { ...base, allocations: [{ fundId: f.fund, portion: '60', consideration: '100' }] }, { ...base, allocations: [base.allocations[0], base.allocations[0]] }, { ...base, evidence: [f.refs.get('other-exit')] }])
    await f.act(b, 400); await f.act({...base,evidence:[{...f.refs.get(f.project.id),versionId:'unavailable-version'}]},409); assert.deepEqual(await readdir(f.root), files); const b = { ...base, requestId: randomUUID(), expectedRevision: (await f.read()).revision }; const rs = await Promise.all([f.call('POST', f.url() + '/actions', b), f.call('POST', f.url() + '/actions', b)]); assert.deepEqual(rs.map(r => r.statusCode), [200, 200]); assert.equal(rs.filter(r => r.json().created).length, 1); assert.equal((await f.call('POST', f.url() + '/actions', { ...b, requestId: randomUUID() })).statusCode, 409); const e = (await f.read()).executions[0]; await f.act({ ...f.receive(e.id), amount: '100.02', principal: '100.02', income: '0' }, 409, f.finance); for (const b of [{ ...f.receive(e.id), amount: '0', principal: '0', income: '0' }, { ...f.receive(e.id), principal: '1' }, { ...f.receive(e.id), date: '2026-10-01' }, { ...f.receive(e.id), bankReference: ' ' }])
    await f.act(b, 400, f.finance); });
test('cross-project identity serializes concurrent receipts; full reversal permits re-post', async (t) => { const f = await fixture(t); await f.act(f.execute()); await f.act(f.execute('other-exit'), 200, f.admin, 'other-exit'); const e = (await f.read()).executions[0], e2 = (await f.read(f.admin, 'other-exit')).executions[0]; const r = await Promise.all([f.act(f.receive(e.id), 200, f.finance), f.act({ ...f.receive(e2.id, 'other-exit'), bankAccount: 'abc12345678', bankReference: 'ref12345678' }, 409, f.finance, 'other-exit')]); assert.equal(r[1].json().error, 'duplicate_bank_receipt'); let v = await f.read(); await f.act({ action: 'reverse_payment', paymentId: v.payments[0].id, reason: '全额冲销登记', evidence: [f.refs.get(f.project.id)] }, 200, f.finance); await f.act(f.receive(e2.id, 'other-exit'), 200, f.finance, 'other-exit'); });
test('damaged or newly forbidden evidence never removes monetary rows or cash positions', async (t) => { const f = await fixture(t); await f.act(f.execute()); const e = (await f.read()).executions[0]; await f.act(f.receive(e.id), 200, f.finance); let packet = ''; await f.store.workflowTransaction(f.project.id, async (s) => { packet = s.postInvestment!.exitPayments![0].evidence[0].packetBlobId!; }); await writeFile(join(f.root, packet), 'damaged'); let v = await f.read(f.finance); assert.equal(v.payments.length, 1); assert.equal(v.positions[0].received, '50.01'); assert.equal(v.payments[0].evidence[0].readIssue, 'material_integrity_mismatch'); assert.equal((await f.call('GET', e.evidence[0].downloadHref)).statusCode, 200); const mat = f.store.listMaterials().find(m => m.id === f.refs.get(f.project.id).materialId)!; mat.projectId = null; mat.fundId = null; mat.relationships = { projects: [], funds: [] }; v = await f.read(f.finance); assert.equal(v.payments.length, 1); assert.equal(v.positions[0].received, '50.01'); assert.equal(v.payments[0].evidence[0].readIssue, 'material_not_linked'); assert.equal(v.payments[0].evidence[0].downloadHref, undefined); });
test('latest archived plan and original batch portions cannot be bypassed through versions or partial scope',async t=>{
 const f=await fixture(t);
 await f.store.workflowTransaction(f.project.id,async s=>{const p=s.postInvestment!.exitPreparations![0];s.postInvestment!.exitPreparations!.push({...structuredClone(p),version:2,status:'draft'});});
 await f.act(f.execute(),409);
 await f.store.workflowTransaction(f.project.id,async s=>{s.postInvestment!.exitPreparations![1].status='archived';});
 await f.act({...f.execute(),planVersion:2});
 const p=(await f.read()).positions[0];assert.equal(p.disposedPortion,'60.0000');assert.equal(p.remainingPortion,'40.0000');
 await f.store.workflowTransaction(f.project.id,async s=>{const old=s.postInvestment!.exitPreparations![1];s.postInvestment!.exitPreparations!.push({...structuredClone(old),version:3});});
 await f.act({...f.execute(),planVersion:3},409);
 await f.act({...f.execute(),planVersion:3,allocations:[{fundId:f.fund,portion:'40.0000',consideration:'100.01'}]});
 assert.equal((await f.read()).positions[0].remainingPortion,'0.0000');
 const unrelated={...f.admin,id:'unassigned', email:'unassigned@example.local',role:'post_investment'};
 assert.equal((await f.read(unrelated)).mayExecute,false);
 await f.act({action:'cancel_execution',executionId:(await f.read()).executions[0].id,reason:'越权',evidence:[f.refs.get(f.project.id)]},403,unrelated);
});
test('ledger reads only existing post states and loads the evidence authorization index once while object authorization uses a separate snapshot',async t=>{
 const f=await fixture(t);await f.act(f.execute());const e=(await f.read()).executions[0];await f.act(f.receive(e.id),200,f.finance);
 const states=await f.store.readExitStates();assert.equal(states.length,2);assert.ok(states.every(s=>s.postInvestment));
 const original=f.store.listMaterials.bind(f.store);let materialQueries=0;f.store.listMaterials=()=>{materialQueries++;return original();};
 const global=await f.call('GET','/api/exit-settlements',undefined,f.viewer);assert.equal(global.statusCode,200,global.body);assert.equal(materialQueries,1);assert.equal(global.json().payments[0].bankAccount,'****5678');assert.equal(global.json().positions[0].received,'50.01');assert.equal(global.json().plans,undefined);
 materialQueries=0;const project=await f.read(f.viewer);assert.equal(materialQueries,1);assert.equal(project.plans.length,1);assert.equal(project.executions.length,1);assert.equal(project.payments.length,1);
});
test('global positions retain closed investments before any post-state has been created',async()=>{
 const state=createSeedLedgerState(),store=createMemoryLedgerStore(state),id=state.projects[0].id,fundId=state.funds[0].id;
 assert.equal((await store.readExitStates()).length,0);
 await store.workflowTransaction(id,async s=>{s.deals=[{id:'closed-only',status:'closed',terms:[{id:'t',allocations:[{fundId,amount:'1.00'}]}],closing:{termsId:'t',time:'2026-10-01'}} as any];});
 const global=await store.readExitStates();assert.equal(global.length,1);assert.equal(global[0].project.id,id);assert.equal(global[0].postInvestment,undefined);
 const {settlementPositions}=await import('../src/ledger/exit-settlement.ts');assert.equal(settlementPositions(global[0])[0].remainingPortion,'100.0000');
});
async function historicalFixture(t:any){
 const f=await fixture(t),u=`/api/projects/${f.project.id}/asset-history`;
 const readAsset=async(user:any=f.admin)=>{const r=await f.call('GET',u,undefined,user);assert.equal(r.statusCode,200,r.body);return r.json();};
 const historyAct=async(b:any,code=200,user:any=f.admin)=>{const r=await f.call('POST',u+'/actions',{requestId:randomUUID(),expectedRevision:(await readAsset()).revision,...b},user);assert.equal(r.statusCode,code,r.body);return r;};
 const archive={action:'archive_exit',reason:'退出归档',completionReview:'人工核对工商变更、核心交割、清算及收益确认均已完成，无未决缺口；附件为核对记录。',evidence:[f.refs.get(f.project.id)]};
 const claim={action:'create_claim',title:'补充法务追索',description:'追索事项人工核对登记，未对外发送',reason:'收到补充凭证',evidence:[f.refs.get(f.project.id)]};
 const complete=async()=>{await f.store.workflowTransaction(f.project.id,async s=>{s.postInvestment!.exitPreparations![0].portion='100.0000';});await f.act({...f.execute(),allocations:[{fundId:f.fund,portion:'100',consideration:'100.01'}]});const e=(await f.read()).executions[0];await f.act({...f.receive(e.id),amount:'100.01',principal:'100',income:'0.01'},200,f.finance);return e;};
 return {...f,u,readAsset,historyAct,archive,claim,complete};
}
test('history requires every actual batch/fund, no active trade, settled receipts, explicit completion review and owner permissions',async t=>{
 const f=await historicalFixture(t);await f.historyAct(f.archive,409);await f.complete();
 await f.historyAct(f.archive,403,f.finance);await f.historyAct(f.archive,403,{...f.admin,id:'unassigned', email:'unassigned@example.local',role:'post_investment'});
 await f.historyAct({...f.archive,completionReview:''},400);
 await f.store.workflowTransaction(f.project.id,async s=>{s.deals!.push({id:'active-trade',status:'active'} as any);});
 assert.ok((await f.readAsset()).blockers.includes('active_deals'));await f.historyAct(f.archive,409);
 await f.store.workflowTransaction(f.project.id,async s=>{s.deals!.pop();s.deals!.push({...structuredClone(s.deals![0]),id:'second-batch'});});
 assert.ok((await f.readAsset()).blockers.includes('remaining_positions'));await f.historyAct(f.archive,409);
 await f.store.workflowTransaction(f.project.id,async s=>{s.deals!.pop();s.deals![0].terms[0].allocations.push({fundId:'second-fund',amount:'1.00'});});
 await f.historyAct(f.archive,409);
 await f.store.workflowTransaction(f.project.id,async s=>{s.deals![0].terms[0].allocations.pop();});
 const before=await f.readAsset();assert.equal(before.status,'exiting');assert.equal(before.inManagedMetrics,true);
 const result=await f.historyAct(f.archive);const asset=result.json().asset;assert.equal(asset.status,'exited');assert.equal(asset.inManagedMetrics,false);assert.equal(asset.archives[0].completionReview,f.archive.completionReview);assert.equal('packetBlobId' in asset.archives[0].evidence[0],false);assert.equal(asset.legacyStatus,'已投');await f.historyAct(f.archive,409);
});
test('archive invalidation survives reversal then identical cash restoration; claims retain immutable versions and reopen history',async t=>{
 const f=await historicalFixture(t);const e=await f.complete();await f.historyAct(f.archive);const initial=await f.readAsset();await f.historyAct(f.claim);let v=await f.readAsset();const c=v.latestClaims[0];
 await f.historyAct({action:'revise_claim',claimId:c.id,title:c.title,description:'已完成核对及追索处理',status:'resolved',reason:'处理完成有原件',evidence:f.claim.evidence});
 v=await f.readAsset();assert.equal(v.claims.length,2);assert.equal(v.claims[0].status,'open');assert.equal(v.openClaimCount,0);
 const payment=(await f.read()).payments[0];await f.act({action:'reverse_payment',paymentId:payment.id,reason:'更正原登记',evidence:f.claim.evidence},200,f.finance);
 v=await f.readAsset();assert.equal(v.status,'exiting');assert.equal(v.archiveCurrent,false);assert.equal(v.inManagedMetrics,true);assert.equal(v.archives[0].current,false);
 await f.act({...f.receive(e.id),amount:'100.01',principal:'100',income:'0.01'},200,f.finance);
 v=await f.readAsset();assert.equal(v.blockers.length,0);assert.equal(v.archiveCurrent,false);assert.equal(v.status,'exiting');
 await f.historyAct({action:'revise_claim',claimId:c.id,title:c.title,description:'补证后重新追索',status:'open',reason:'重开依据',evidence:f.claim.evidence});
 assert.equal((await f.readAsset()).openClaimCount,1);await f.historyAct(f.archive);v=await f.readAsset();assert.equal(v.archives.length,2);assert.equal(v.archives[0].id,initial.archives[0].id);assert.equal(v.archives[0].current,false);assert.equal(v.archives[1].current,true);
 assert.equal((await f.call('GET',`/api/projects/${f.project.id}/post-investment`)).body.includes('exitClaims'),false);
});
test('legacy historical markers retain unknown proof, searchable claims, safe evidence and actor checks',async t=>{
 const f=await historicalFixture(t);await f.store.workflowTransaction(f.project.id,async s=>{s.project.status='已退出';s.deals=[];});
 let v=await f.readAsset();assert.equal(v.status,'legacy_exited');assert.equal(v.legacyUnverified,true);assert.equal(v.inManagedMetrics,false);await f.historyAct(f.archive,409);
 await f.historyAct(f.claim,403,f.viewer);await f.historyAct(f.claim,403,f.finance);await f.historyAct(f.claim);
 const global=await f.call('GET','/api/asset-history?q='+encodeURIComponent('补充法务追索'),undefined,f.viewer);assert.equal(global.statusCode,200,global.body);assert.equal(global.json().projects.length,1);assert.equal(global.body.includes('bankAccount'),false);
 v=await f.readAsset();const proof=v.claims[0].evidence[0];assert.equal((await f.call('GET',proof.downloadHref)).statusCode,200);
 const mat=f.store.listMaterials().find(m=>m.id===proof.materialId)!;mat.projectId=null;mat.relationships={projects:[],funds:[]};mat.fundId=null;
 v=await f.readAsset(f.viewer);assert.equal(v.claims.length,1);assert.equal(v.claims[0].evidence[0].readIssue,'material_not_linked');assert.equal(v.claims[0].evidence[0].downloadHref,undefined);
 assert.equal((await f.call('GET',proof.downloadHref,undefined,f.viewer)).statusCode,400);
});
test('history actions serialize revisions/replay and roll back source failures without orphan blobs',async t=>{
 const f=await historicalFixture(t);await f.complete();const files=await readdir(f.root);
 await f.historyAct({...f.archive,evidence:[{...f.refs.get(f.project.id),versionId:'missing'}]},409);assert.deepEqual(await readdir(f.root),files);
 const b={...f.archive,requestId:randomUUID(),expectedRevision:(await f.readAsset()).revision};const rs=await Promise.all([f.call('POST',f.u+'/actions',b),f.call('POST',f.u+'/actions',b)]);assert.deepEqual(rs.map(r=>r.statusCode),[200,200]);assert.equal(rs.filter(r=>r.json().created).length,1);assert.equal((await f.readAsset()).archives.length,1);
 assert.equal((await f.call('POST',f.u+'/actions',{...b,requestId:randomUUID()})).statusCode,409);
 const archive=(await f.readAsset()).archives[0];let blob='';await f.store.workflowTransaction(f.project.id,async s=>{blob=s.postInvestment!.exitArchives![0].evidence[0].packetBlobId!;});await writeFile(join(f.root,blob),'corrupted');const v=await f.readAsset();assert.equal(v.archives.length,1);assert.equal(v.archives[0].evidence[0].readIssue,'material_integrity_mismatch');assert.equal((await f.call('GET',archive.evidence[0].downloadHref)).statusCode,409);
});
test('history snapshots survive unknown commit and replay; confirmed rollback removes only staged copies',async t=>{
 for(const mode of ['unknown','rollback']){
  const f=await historicalFixture(t);await f.complete();const files=await readdir(f.root),original=f.store.workflowTransaction.bind(f.store);let trigger=true;
  f.store.workflowTransaction=(async(id:any,fn:any,options:any)=>{
   if(mode==='rollback')return original(id,async s=>{const result=await fn(s);if(trigger&&result?.created&&result?.asset){trigger=false;throw Object.assign(new Error('confirmed rollback'),{safeToDeleteBlob:true});}return result;},options);
   const result=await original(id,fn,options);if(trigger&&(result as any)?.created&&(result as any)?.asset){trigger=false;throw Object.assign(new Error('lost commit acknowledgement'),{safeToDeleteBlob:false});}return result;
  }) as any;
  const b={...f.archive,requestId:randomUUID(),expectedRevision:(await f.readAsset()).revision};const r=await f.call('POST',f.u+'/actions',b);assert.equal(r.statusCode,500);
  if(mode==='rollback'){assert.deepEqual(await readdir(f.root),files);assert.equal((await f.readAsset()).archives.length,0);}else{
   assert.equal((await readdir(f.root)).length,files.length+1);const replay=await f.call('POST',f.u+'/actions',b);assert.equal(replay.statusCode,200,replay.body);assert.equal(replay.json().created,false);assert.equal(replay.json().asset.archives.length,1);assert.equal((await f.call('GET',replay.json().asset.archives[0].evidence[0].downloadHref)).statusCode,200);
  }
 }
});
test('global historical projection retains unverified source-only legacy records without creating post states',async()=>{
 const state=createSeedLedgerState();state.projects[0].status='已退出';const store=createMemoryLedgerStore(state),server=createServer({ledgerStore:store});try{
  const r=await server.inject({method:'GET',url:'/api/asset-history?status=legacy_exited'});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().projects[0].projectId,state.projects[0].id);assert.equal(r.json().projects[0].legacyUnverified,true);assert.equal((await store.readExitStates()).length,0);
 }finally{await server.close();}
});
test('legacy exit labels never hide real active trades, residual fund positions or unsettled receipts; old-history claims remain available',async t=>{
 const f=await historicalFixture(t);await f.store.workflowTransaction(f.project.id,async s=>{s.project.status='已退出';});
 let v=await f.readAsset();assert.equal(v.status,'exiting');assert.equal(v.legacyUnverified,true);assert.equal(v.inManagedMetrics,true);assert.ok(v.blockers.includes('remaining_positions'));
 await f.historyAct(f.claim);assert.equal((await f.readAsset()).openClaimCount,1);
 await f.store.workflowTransaction(f.project.id,async s=>{s.postInvestment!.exitPreparations![0].portion='100.0000';});await f.act({...f.execute(),allocations:[{fundId:f.fund,portion:'100',consideration:'100.01'}]});
 v=await f.readAsset();assert.equal(v.status,'exiting');assert.ok(v.blockers.includes('outstanding_receipts'));
 const e=(await f.read()).executions[0];await f.act({...f.receive(e.id),amount:'100.01',principal:'100',income:'0.01'},200,f.finance);
 v=await f.readAsset();assert.equal(v.status,'legacy_exited');assert.equal(v.legacyUnverified,true);
 await f.store.workflowTransaction(f.project.id,async s=>{s.deals!.push({id:'new-active',status:'active'} as any);});
 v=await f.readAsset();assert.equal(v.status,'exiting');assert.equal(v.legacyStatus,'已退出');assert.equal(v.inManagedMetrics,true);assert.equal(v.legacyUnverified,true);
 const global=(await f.call('GET','/api/asset-history')).json().projects.find((p:any)=>p.projectId===f.project.id);assert.equal(global.status,'exiting');assert.equal(global.inManagedMetrics,true);
});
test('global projection includes a legacy project with only a newly active deal and no post state',async()=>{
 const state=createSeedLedgerState();state.projects[0].status='已退出';const store=createMemoryLedgerStore(state),server=createServer({ledgerStore:store});try{
  await store.workflowTransaction(state.projects[0].id,async s=>{s.deals=[{id:'reinvestment',status:'active'} as any];});
  const r=await server.inject({method:'GET',url:'/api/asset-history'});assert.equal(r.statusCode,200,r.body);const v=r.json().projects.find((p:any)=>p.projectId===state.projects[0].id);assert.equal(v.status,'exiting');assert.equal(v.inManagedMetrics,true);assert.equal(v.legacyUnverified,true);assert.ok(v.blockers.includes('active_deals'));assert.equal((await store.readExitStates())[0].postInvestment,undefined);
 }finally{await server.close();}
});

test('explicit receipt currency persists and old absent currency remains unverified in shared ledger',async(t)=>{
 const f=await fixture(t);await f.act(f.execute());const execution=(await f.read()).executions[0];
 await f.act({...f.receive(execution.id),currency:'USD'},400,f.finance);
 await f.act({...f.receive(execution.id),currency:'CNY'},200,f.finance);
 await f.store.workflowTransaction(f.project.id,async s=>{s.deals![0].terms[0].status='approved';});
 const r=await f.call('GET',`/api/projects/${f.project.id}/investment-ledger?includeDemo=false`);assert.equal(r.statusCode,200);assert.equal(r.json().totals.exitReceipts,'50.01');assert.equal((await f.read()).payments[0].currency,'CNY');
 await f.store.workflowTransaction(f.project.id,async s=>{delete s.postInvestment!.exitPayments![0].currency;});
 const old=await f.call('GET',`/api/projects/${f.project.id}/investment-ledger?includeDemo=false`);assert.equal(old.json().totals.exitReceipts,'0.00');assert.ok(old.json().issues.some((v:any)=>v.code==='unknown_exit_currency'));
});

test('legacy read policies exclude sources before positions and filter clones without altering stored records',async(t)=>{
 const f=await fixture(t);await f.act(f.execute());const execution=(await f.read()).executions[0];await f.act({...f.receive(execution.id),currency:'CNY'},200,f.finance);
 await f.store.workflowTransaction(f.project.id,async s=>{const p=s.postInvestment!,base=p.exitPayments![0];s.project.dataOrigin='seed_demo';s.deals![0].dataOrigin='seed_demo';s.deals![0].terms[0].dataOrigin='seed_demo';p.exitExecutions![0].dataOrigin='seed_demo';p.exitPayments=[{...base,id:'real',amount:'100',principal:'100',income:'0',dataOrigin:'user_input'},{...base,id:'demo',amount:'900',dataOrigin:'seed_demo'},{...base,id:'unverified',amount:'50',dataOrigin:undefined}];p.investmentCashflows=p.exitPayments.map(v=>({...v,dealId:'deal',kind:'investment_payment',currency:'CNY'})) as any;p.visits=[{id:'seed-visit',dataOrigin:'seed_demo',version:1},{id:'unknown-visit',version:1},{id:'real-visit',dataOrigin:'user_input',version:1}] as any;p.exitPreparations=[];});
 await f.read();const before=JSON.stringify({states:await f.store.readExitStates(),tasks:f.store.listTasks(),audit:f.store.listAuditEvents()});
 for(const path of [f.url(),'/api/exit-settlements']){const r=await f.call('GET',path+'?includeDemo=false');assert.equal(r.statusCode,200,r.body);const v=r.json();assert.deepEqual(v.payments.map((v:any)=>v.id),['real','unverified']);assert.equal(v.positions.find((v:any)=>v.projectId===f.project.id).received,'100.00');assert.equal(v.positions.find((v:any)=>v.projectId===f.project.id).outstanding,null);assert.equal(v.executions[0].dataOrigin,'seed_demo');assert.equal((await f.call('GET',path+'?includeDemo=0')).statusCode,400);}
 for(const path of [`/api/projects/${f.project.id}/investment-cashflows`,'/api/investment-cashflows']){const r=await f.call('GET',path+'?includeDemo=false');assert.equal(r.statusCode,200,r.body);assert.deepEqual(r.json().rows.map((v:any)=>v.id),['real','unverified']);assert.equal(r.json().rows[1].dataOrigin,'unknown');assert.equal((await f.call('GET',path+'?includeDemo=no')).statusCode,400);}
 const post=await f.call('GET',`/api/projects/${f.project.id}/post-investment?includeDemo=false`);assert.equal(post.statusCode,200,post.body);assert.deepEqual(post.json().postInvestment.visits.map((v:any)=>v.id),['unknown-visit','real-visit']);assert.equal((await f.call('GET',`/api/projects/${f.project.id}/post-investment?includeDemo=no`)).statusCode,400);
 for(const path of [`/api/projects/${f.project.id}/asset-history`,'/api/asset-history']){const r=await f.call('GET',path+'?includeDemo=false');assert.equal(r.statusCode,200,r.body);const v=path==='/api/asset-history'?r.json().projects.find((v:any)=>v.projectId===f.project.id):r.json();assert.ok(v);assert.equal(v.positions[0].received,'100.00');assert.equal(v.archiveCurrent,false);assert.equal(v.sourceIssue,'unverified_source_amounts_excluded');assert.equal((await f.call('GET',path+'?includeDemo=1')).statusCode,400);}
 assert.equal(JSON.stringify({states:await f.store.readExitStates(),tasks:f.store.listTasks(),audit:f.store.listAuditEvents()}),before);
});
