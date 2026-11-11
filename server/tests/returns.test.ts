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
    const admin = { id: 'user-admin', name: '管理员', email: 'admin@example.local', role: 'admin' }, finance = { ...admin, id: 'finance', email: 'finance@example.local', role: 'finance' }, viewer = { ...admin, id: 'viewer', email:'viewer@example.local', role: 'viewer' }, legal = { ...admin, id: 'legal', email:'legal@example.local', role: 'legal' };
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
import { termChoices, coverageKeys } from '../src/ledger/return-basis.ts';
import { returnInputs } from '../src/ledger/return-inputs.ts';
async function returnsFixture(t: any) { const f = await fixture(t), base = `/api/projects/${f.project.id}/returns`; const query = { dealId: 'deal', fundId: f.fund, asOfDate: '2026-10-30', knownAt: '2026-10-30T23:00:00Z' }; const read = async (user: any = f.admin) => { const r = await f.call('GET', base + '?' + new URLSearchParams(query), undefined, user); assert.equal(r.statusCode, 200, r.body); return r.json(); }; const send = async (b: any, code = 200, user: any = f.admin) => { const r = await f.call('POST', base + '/actions', { requestId: randomUUID(), expectedRevision: (await read()).revision, ...b }, user); assert.equal(r.statusCode, code, r.body); return r.json(); }; const terms = { ...Object.fromEntries(Object.entries(termChoices).map(([k, v]) => [k, v[0]])), cashflowMapping: { investment_payment: 'outflow', project_fee: 'outflow', project_tax: 'outflow', exit_receipt: 'inflow' }, irrDecimals: 8, amountDecimals: 2, moicDecimals: 6, tolerance: '0.00000001', lowerRateBound: '-0.99', upperRateBound: '1000', maxIterations: 1000, explanation: '工程用显式规则；不代表财务批准' }; const evidence = [f.refs.get(f.project.id)]; const create = { action: 'create_basis', dealId: 'deal', fundId: f.fund, terms, evidence }; const identify = (v: any) => ({ recordId: v.id, version: v.version, contentHash: v.contentHash }); const submit = (v: any, reviewerId = 'user-admin') => ({ action: 'submit_basis', ...identify(v), reviewerId, dueDate: '2026-11-01' }); const decide = (v: any, decision = 'approve') => ({ action: 'decide_basis', ...identify(v), decision, opinion: '核对原件与授权；仅技术流程测试', authorizationEvidence: evidence }); return { ...f, base, readReturns: read, send, terms, evidence, create, identify, submit, decide, query }; }
test('return drafts are incomplete, immutable versions preserve reject/return history and owner independent review', async (t) => { const f = await returnsFixture(t); await f.send({ ...f.create, terms: {}, evidence: [] }); let v = (await f.readReturns()).bases[0]; assert(v.missingReasons.includes('evidence')); await f.send(f.submit(v), 400); await f.send({ ...f.create }, 409); await f.send({ action: 'revise_basis', ...f.identify(v), terms: f.terms, evidence: f.evidence }); let all = (await f.readReturns()).bases; assert.equal(all.length, 2); v = all[1]; assert.notEqual(v.contentHash, all[0].contentHash); await f.send(f.submit(all[0]), 409); await f.send(f.submit(v)); await f.send({ ...f.decide(v), authorizationEvidence: [] }, 400); await f.send(f.decide(v, 'reject')); await f.send(f.decide(v), 409); await f.send({ action: 'revise_basis', ...f.identify(v), terms: f.terms, evidence: f.evidence }, 400); await f.send({ action: 'revise_basis', ...f.identify(v), terms: f.terms, evidence: f.evidence, revisionReason: '重新整理证据' }); v = (await f.readReturns()).bases.at(-1); await f.send(f.submit(v)); await f.send(f.decide(v, 'return')); await f.send(f.submit(v), 409); await f.send({ action: 'revise_basis', ...f.identify(v), terms: f.terms, evidence: f.evidence }); v = (await f.readReturns()).bases.at(-1); await f.send(f.submit(v)); await f.send(f.decide(v)); all = (await f.readReturns()).bases; assert.deepEqual(all.map((v: any) => v.status), ['draft', 'rejected', 'returned', 'approved']); assert.equal(all[1].decisions.length, 1); assert.equal(all[2].revisionReason, '重新整理证据'); assert.equal((await f.readReturns()).metrics.irr.value, null); assert.equal((await f.readReturns()).metrics.moic.value, null); assert.equal((await f.readReturns()).publicationStatus.status, 'not_published'); });
test('reviewers must be designated, current and login-enabled; finance author cannot self-review, owner can', async (t) => {
    const f = await returnsFixture(t);
    await f.store.insertUser({ ...f.finance, passwordHash: 'test-hash' } as any);
    await f.store.insertUser({ ...f.finance, id: 'finance2', email: 'other@example.local', passwordHash: 'test-hash' } as any);
    await f.send(f.create, 200, f.finance);
    let v = (await f.readReturns()).bases[0];
    await f.send(f.submit(v, 'finance'), 403, f.finance);
    await f.send(f.submit(v, 'viewer'), 409, f.finance);
    await f.send(f.submit(v, 'finance2'), 200, f.finance);
    await f.send(f.decide(v), 403, f.finance);
    await f.store.insertUser({ ...f.finance, id: 'third', email: 'third@example.local', passwordHash: 'test-hash' } as any);
    await f.send(f.decide(v), 403, { ...f.finance, id: 'third', email: 'third@example.local' });
    await f.send(f.decide(v), 200, f.admin);
    assert.equal((await f.readReturns()).bases[0].status, 'approved');
    const users = f.store.listUsers();
    const target = users.find((u: any) => u.id === 'finance2');
    assert(target); // Directory snapshots are copies; simulate a disabled account at the boundary.
    const original = f.store.listUsers;
    f.store.listUsers = () => original().map((u: any) => u.id === 'finance2' ? { ...u, passwordHash: null } : u);
    await f.send({ action: 'revise_basis', ...f.identify(v), terms: f.terms, evidence: f.evidence });
    v = (await f.readReturns()).bases.at(-1);
    await f.send(f.submit(v, 'finance2'), 409);
    f.store.listUsers = original;
    await f.send(f.submit(v, 'finance2'));
    f.store.listUsers = () => original().map((u: any) => u.id === 'finance2' ? { ...u, role: 'viewer' } : u);
    await f.send(f.decide(v), 409, { ...f.finance, id: 'finance2', email: 'other@example.local' });
});
test('pending task cancellation, exact hash, engineering fixture and independent derivation cannot publish metrics', async (t) => { const f = await returnsFixture(t); await f.send(f.create); let b = (await f.readReturns()).bases[0]; await f.send({ ...f.submit(b), contentHash: 'wrong' }, 409); await f.send(f.submit(b)); b = (await f.readReturns()).bases.at(-1); await f.send({ action: 'revise_basis', ...f.identify(b), terms: f.terms, evidence: f.evidence }); const states = await f.store.workflowTransaction(f.project.id, async (s) => structuredClone(s.tasks)); assert.equal(states.find((t: any) => t.id === b.taskIds[0])!.status, '已取消'); b = (await f.readReturns()).bases.at(-1); await f.send(f.submit(b)); await f.send(f.decide(b)); const sample = { basisId: b.id, basisVersion: b.version, basisContentHash: b.contentHash, origin: 'engineering_fixture', cashflows: [{ date: '2025-01-01', amount: '100', direction: 'outflow', kind: 'investment_payment', currency: 'CNY' }, { date: '2026-01-01', amount: '110', direction: 'inflow', kind: 'exit_receipt', currency: 'CNY' }], asOfDate: '2026-01-01', terminalValue: { amount: '0', date: '2026-01-01', currency: 'CNY', scope: 'explicit zero engineering fixture', evidence: f.evidence }, expected: { irr: '0.1', irrUnit: 'annual_fraction', moic: '1.1', resultStatus: 'ok', tolerance: '0.00001' }, derivationText: '' }; await f.send({ action: 'create_sample', dealId: 'deal', fundId: f.fund, sample, evidence: f.evidence }); let v = (await f.readReturns()).samples[0]; await f.send({ action: 'submit_sample', ...f.identify(v), reviewerId: 'user-admin', dueDate: '2026-11-01' }, 400); await f.send({ action: 'revise_sample', ...f.identify(v), sample: { ...sample, derivationText: '110/100=1.1; 365日, (1+r)=1.1，仅工程fixture' }, evidence: f.evidence }); v = (await f.readReturns()).samples.at(-1); await f.send({ action: 'submit_sample', ...f.identify(v), reviewerId: 'user-admin', dueDate: '2026-11-01' }); await f.send({ ...f.decide(v), action: 'decide_sample' }); let out = await f.readReturns(); assert(out.publicationStatus.reasonCodes.includes('pending_independent_sample')); assert.equal(out.metrics.irr.value, null); await f.send({ action: 'revise_basis', ...f.identify(b), terms: { ...f.terms, explanation: '新口径' }, evidence: f.evidence }); out = await f.readReturns(); assert.equal(out.samples.at(-1).isApplicable, false); assert.equal(out.bases[0].decisions.length, 0); await f.send({ action: 'revise_sample', ...f.identify(v), sample: { ...sample, derivationText: '旧basis推导' }, evidence: f.evidence }); v = (await f.readReturns()).samples.at(-1); await f.send({ action: 'submit_sample', ...f.identify(v), reviewerId: 'user-admin', dueDate: '2026-11-01' }, 409); });
test('historical projection honors economic and known times, late entries, four reversal quadrants and stable exact cents', () => {
    const scope = { type: 'project_fund_deal' as const, projectId: 'p', dealId: 'd', fundId: 'f' }, cash = { id: 'c', projectId: 'p', dealId: 'd', fundId: 'f', kind: 'investment_payment', currency: 'CNY', amount: '999999999999999999.99', date: '2026-01-01', time: '2026-02-01T00:00:00Z', evidence: [], status: 'posted' } as any;
    const input = (c: any, asOf = '2026-01-31', known = '2026-02-15T00:00:00.000Z') => returnInputs({ postInvestment: { investmentCashflows: [c] } as any }, scope, asOf, known);
    assert.equal(input(cash).rows[0].amountMinor, '99999999999999999999');
    assert.equal(input(cash, '2026-01-31', '2026-01-31T00:00:00.000Z').rows[0].included, false);
    assert.equal(input(cash, '2025-12-31').rows[0].included, false);
    for (const date of ['2025-12-31', '2026-01-31'])
        for (const time of ['2026-02-01T00:00:00Z', '2026-03-01T00:00:00Z']) {
            const c = { ...cash, status: 'reversed', reversal: { time, reason: '登记纠错', evidence: [] } };
            assert.equal(input(c, date).rows[0].included, date === '2026-01-31' && time.startsWith('2026-03'));
        }
    assert(input({ ...cash, status: 'reversed' }).missingReasons.includes('history_incomplete'));
    assert(input({ ...cash, time: 'bad' }).missingReasons.includes('history_incomplete'));
    const a = input({ ...cash, evidence: [{ sha256: 'abc', downloadHref: '/a' }] }), b = input({ ...cash, evidence: [{ sha256: 'abc', downloadHref: '/b' }] });
    assert.equal(a.sourceHash, b.sourceHash);
    assert.notEqual(a.sourceHash, input({ ...cash, evidence: [{ sha256: 'def' }] }).sourceHash);
    assert.equal(input({ ...cash, status: 'reversed', reversal: { time: '2026-03-01T00:00:00Z', evidence: [] } }).rows[0].included, true);
});
test('input completeness needs proof and explanation; source changes invalidate approval and zero is never inferred', async (t) => { const f = await returnsFixture(t); await f.send({ ...f.create, terms: { ...f.terms, measure: 'realized', moicNumerator: 'distributions_only', terminalPolicy: 'not_applicable_with_evidence' } }); const basis = (await f.readReturns()).bases[0]; await f.send(f.submit(basis)); await f.send(f.decide(basis)); let out = await f.readReturns(); const review = { asOfDate: f.query.asOfDate, knownAt: f.query.knownAt, sourceHash: out.inputs.sourceHash, coverage: {} }; await f.send({ action: 'create_review', dealId: 'deal', fundId: f.fund, review, evidence: f.evidence }); let v = (await f.readReturns()).reviews[0]; const submit = () => ({ action: 'submit_review', ...f.identify(v), reviewerId: 'user-admin', dueDate: '2026-11-01' }); await f.send(submit(), 400); const coverage = Object.fromEntries(coverageKeys.map(k => [k, { status: 'confirmed_not_applicable', explanation: '工程测试明确无项目流水，原件说明范围', evidence: f.evidence }])); await f.send({ action: 'revise_review', ...f.identify(v), review: { ...review, coverage }, evidence: f.evidence }); v = (await f.readReturns()).reviews.at(-1); await f.send(submit()); await f.send({ ...f.decide(v), action: 'decide_review' }); out = await f.readReturns(); assert.equal(out.reviews.at(-1).isApplicable, true); assert(out.inputs.missingReasons.includes('missing_actual_investment_payments')); assert(out.inputs.missingReasons.includes('missing_actual_receipts')); assert.equal(out.metrics.moic.value, null); await f.store.workflowTransaction(f.project.id, async (s) => { s.postInvestment!.investmentCashflows = [{ id: 'late', projectId: f.project.id, dealId: 'deal', fundId: f.fund, kind: 'investment_payment', currency: 'CNY', amount: '1.00', date: '2026-01-01', time: '2026-10-30T10:00:00Z', status: 'posted', evidence: [], bankAccount: 'SECRET', bankReference: 'SECRET' } as any]; }); out = await f.readReturns(); assert.equal(out.reviews.at(-1).isApplicable, false); assert(out.inputs.missingReasons.includes('unreviewed_fees')); assert.equal(JSON.stringify(out).includes('SECRET'), false); });
import { compareDecimal, termsMissing, sampleMissing, recordHash } from '../src/ledger/return-basis.ts';
test('accepted 18-place decimals compare exactly; solver implementation settings are optional financial terms', async (t) => { const f = await returnsFixture(t); assert.equal(Number('-0.999999999999999999'), -1); assert.equal(compareDecimal('-0.999999999999999999', '-1'), 1); assert.equal(compareDecimal('999999999999999999.99', '999999999999999999.98'), 1); const { lowerRateBound, upperRateBound, maxIterations, ...terms } = f.terms; assert.deepEqual(termsMissing(terms), []); assert(!termsMissing({ ...terms, lowerRateBound: '-0.999999999999999999' }).includes('terms.lowerRateBound_above_minus_one')); assert(termsMissing({ ...terms, lowerRateBound: '-1.000000000000000001' }).includes('terms.lowerRateBound_above_minus_one')); assert(!termsMissing({ ...terms, lowerRateBound: '0.999999999999999998', upperRateBound: '0.999999999999999999' }).includes('terms.invalid_rate_bounds')); await f.send({ ...f.create, terms }); let v = (await f.readReturns()).bases[0]; await f.send(f.submit(v)); await f.send(f.decide(v)); assert.equal((await f.readReturns()).bases[0].status, 'approved'); });
test('legacy exit projection uses only net received once, retains unknown currency, same-day order and late corrections', () => { const scope = { type: 'project_fund_deal' as const, projectId: 'p', dealId: 'd', fundId: 'f' }, p = { exitExecutions: [{ id: 'e', dealId: 'd' }], exitPayments: [{ id: 'receipt', projectId: 'p', executionId: 'e', fundId: 'f', date: '2026-01-01', amount: '110.00', principal: '100', income: '10', time: '2026-01-02T00:00:00Z', status: 'posted', evidence: [{ sha256: 'original' }], bankAccount: 'PRIVATE', bankReference: 'PRIVATE' }], investmentCashflows: [{ id: 'invest', projectId: 'p', dealId: 'd', fundId: 'f', date: '2026-01-01', amount: '100.00', kind: 'investment_payment', currency: 'CNY', time: '2026-01-02T00:00:00Z', status: 'posted', evidence: [] }] } as any; const a = returnInputs({ postInvestment: p }, scope, '2026-01-01', '2026-01-03T00:00:00.000Z'), b = returnInputs({ postInvestment: { ...p, investmentCashflows: [...p.investmentCashflows].reverse(), exitPayments: [...p.exitPayments].reverse() } }, scope, '2026-01-01', '2026-01-03T00:00:00.000Z'); assert.equal(a.rows.length, 2); assert.equal(a.rows.find(v => v.sourceId === 'receipt')!.amount, '110.00'); assert.equal(a.rows.find(v => v.sourceId === 'receipt')!.currency, 'unknown'); assert(a.missingReasons.includes('unknown_currency')); assert(a.missingReasons.includes('unreviewed_terminalValue')); assert(a.missingReasons.includes('unreviewed_fees')); assert.equal(a.sourceHash, b.sourceHash); assert(!JSON.stringify(a).includes('PRIVATE')); assert(!JSON.stringify(a).includes('principal')); });
test('return read/download authorizes originals, retains damaged history and blocks approval; old post never exposes records', async (t) => {
    const f = await returnsFixture(t);
    await f.send(f.create, 403, f.viewer);
    assert.equal((await f.call('GET', f.base, undefined, f.legal)).statusCode, 403);
    await f.send(f.create);
    let v = (await f.readReturns()).bases[0];
    const href = v.evidence[0].downloadHref;
    assert.equal((await f.call('GET', href, undefined, f.viewer)).statusCode, 200);
    const old = await f.call('GET', `/api/projects/${f.project.id}/post-investment`);
    assert(!('returnBases' in old.json().postInvestment));
    assert(!old.body.includes(v.contentHash));
    assert(!JSON.stringify(v).includes('packetBlobId'));
    await f.send(f.submit(v));
    let packet = '';
    await f.store.workflowTransaction(f.project.id, async (s) => { packet = s.postInvestment!.returnBases![0].evidence[0].packetBlobId!; });
    await writeFile(join(f.root, packet), 'damaged');
    const out = await f.readReturns();
    assert.equal(out.bases[0].status, 'pending');
    assert(out.bases[0].missingReasons.includes('evidence_unavailable'));
    assert.equal(out.bases[0].evidence[0].readIssue, 'material_integrity_mismatch');
    assert.equal((await f.call('GET', href)).statusCode, 409);
    await f.send(f.decide(v), 409);
    const m = f.store.listMaterials().find(m => m.id === f.refs.get(f.project.id).materialId)!;
    m.projectId = null;
    m.fundId = null;
    m.relationships = { projects: [], funds: [] };
    const hidden = await f.readReturns(f.viewer);
    assert.equal(hidden.bases[0].evidence[0].readIssue, 'material_not_linked');
    assert.equal(hidden.bases[0].evidence[0].downloadHref, undefined);
    assert.equal((await f.call('GET', href, undefined, f.viewer)).statusCode, 400);
    const blank = f.store.listProjects()[2];
    if (blank) {
        assert.equal((await f.call('GET', `/api/projects/${blank.id}/returns`)).statusCode, 200);
        assert.equal((await f.store.readExitStates()).some(s => s.project.id === blank.id), false);
    }
});
test('return mutations enforce request whitelist, revision, idempotency, immutable hashes, rollback and unknown commit retention', async (t) => {
    for (const mode of ['normal', 'audit_rollback', 'unknown']) {
        const f = await returnsFixture(t), before = await f.readReturns(), files = await readdir(f.root);
        await f.send({ ...f.create, bankAccount: 'PRIVATE' }, 400);
        const payload = { ...f.create, requestId: randomUUID(), expectedRevision: before.revision };
        let trigger = mode !== 'normal';
        const original = f.store.workflowTransaction.bind(f.store);
        f.store.workflowTransaction = (async (id: any, fn: any, options: any) => {
            if (mode === 'audit_rollback')
                return original(id, async (s) => {
                    const result = await fn(s);
                    if (trigger && result?.created && result?.ledger) {
                        trigger = false;
                        assert.equal(s.auditEvents.length, 1);
                        assert(!s.auditEvents[0].detail.includes('packetBlobId'));
                        throw new Error('audit persistence failed');
                    }
                    return result;
                }, options);
            const result = await original(id, fn, options);
            if (trigger && (result as any)?.created && (result as any)?.ledger) {
                trigger = false;
                throw Object.assign(new Error('unknown commit'), { safeToDeleteBlob: false });
            }
            return result;
        }) as any;
        if (mode === 'normal') {
            const rs = await Promise.all([f.send(payload), f.send(payload)]);
            assert.equal(rs.filter(r => r.created).length, 1);
            await f.send({ ...payload, terms: {} }, 409);
            await f.send({ ...f.create, requestId: randomUUID(), expectedRevision: before.revision }, 409);
        }
        else {
            await f.send(payload, 500);
            if (mode === 'audit_rollback') {
                assert.deepEqual(await readdir(f.root), files);
                assert.equal((await f.readReturns()).bases.length, 0);
                assert.equal((await f.send(payload)).created, true);
            }
            else {
                assert.equal((await readdir(f.root)).length, files.length + 1);
                const result = await f.send(payload);
                assert.equal(result.created, false);
                assert.equal((await f.call('GET', result.ledger.bases[0].evidence[0].downloadHref)).statusCode, 200);
            }
        }
        const out = await f.readReturns();
        assert.equal(out.bases.length, 1);
        assert.equal(out.metrics.irr.value, null);
    }
});
test('action preauthorizes every submitted proof before reading any private byte', async (t) => { const f = await returnsFixture(t); const bad = f.refs.get('other-exit'); const source = f.store.listMaterialVersions(f.refs.get(f.project.id).materialId)[0]; await writeFile(join(f.root, source.blobId), 'corrupted authorized first evidence'); await f.send({ ...f.create, evidence: [...f.evidence, bad] }, 400); const r = await f.call('POST', f.base + '/actions', { ...f.create, evidence: [...f.evidence, bad], requestId: randomUUID(), expectedRevision: (await f.readReturns()).revision }); assert.equal(r.json().error, 'material_not_linked'); assert.equal((await f.readReturns()).bases.length, 0); });
test('fixed historical source hash survives later registrations and later corrections; new knownAt changes facts', () => { const scope = { type: 'project_fund_deal' as const, projectId: 'p', dealId: 'd', fundId: 'f' }, cash = { id: 'first', projectId: 'p', dealId: 'd', fundId: 'f', kind: 'investment_payment', currency: 'CNY', amount: '100.00', date: '2026-01-01', time: '2026-01-02T00:00:00Z', status: 'posted', evidence: [{ sha256: 'first' }] } as any; const run = (cashflows: any[], knownAt = '2026-01-31T00:00:00.000Z') => returnInputs({ postInvestment: { investmentCashflows: cashflows } as any }, scope, '2026-01-31', knownAt), before = run([cash]), future = { ...cash, id: 'late', date: '2026-01-01', time: '2026-02-01T00:00:00Z', evidence: [{ sha256: 'future-corrupt' }] }, reversed = { ...cash, status: 'reversed', reversal: { time: '2026-02-02T00:00:00Z', reason: '后来纠错', evidence: [{ sha256: 'future-reversal-corrupt' }] } }; const old = run([reversed, future]); assert.equal(old.sourceHash, before.sourceHash); assert.equal(old.rows.filter(v => v.included).length, 1); assert.deepEqual(old.rows.find(v => v.sourceId === 'first')!.evidence, before.rows[0].evidence); assert.equal(old.rows.find(v => v.sourceId === 'first')!.reversal, undefined); assert.equal(old.rows.find(v => v.sourceId === 'late')!.evidence.length, 0); assert.deepEqual(old.missingReasons, before.missingReasons); const current = run([reversed, future], '2026-02-03T00:00:00.000Z'); assert.notEqual(current.sourceHash, before.sourceHash); assert.equal(current.rows.find(v => v.sourceId === 'first')!.included, false); assert.equal(current.rows.find(v => v.sourceId === 'late')!.included, true); const badA = run([{ ...cash, amount: 'bad-a' }]), badB = run([{ ...cash, amount: 'bad-b' }]); assert.equal(badA.rows[0].amount, null); assert.equal(badA.rows[0].amountMinor, null); assert.notEqual(badA.sourceHash, badB.sourceHash); assert(badA.missingReasons.includes('invalid_source_amount')); });
test('actual review needs structured currency proof and terminal value; mapping does not mutate legacy flows and expires on changed sources', async (t) => { const f = await returnsFixture(t); await f.send(f.create); const basis = (await f.readReturns()).bases[0]; await f.send(f.submit(basis)); await f.send(f.decide(basis)); const version = f.store.listMaterialVersions(f.evidence[0].materialId)[0], sourceProof = { ...f.evidence[0], name: version.name, sha256: version.sha256, sizeBytes: version.sizeBytes, packetBlobId: version.blobId, downloadHref: '/original' }; await f.store.workflowTransaction(f.project.id, async (s) => { s.postInvestment!.exitExecutions = [{ id: 'actual-exit', projectId: f.project.id, dealId: 'deal', status: 'recorded' } as any]; s.postInvestment!.exitPayments = [{ id: 'legacy-receipt', projectId: f.project.id, executionId: 'actual-exit', fundId: f.fund, date: '2026-01-10', amount: '110.00', principal: '100', income: '10', time: '2026-01-11T00:00:00Z', status: 'posted', evidence: [sourceProof] } as any]; }); let out = await f.readReturns(); assert.equal(out.inputs.effectiveInput.rows[0].currency, 'unknown'); assert(out.inputs.missingReasons.includes('missing_valuation')); let coverage = Object.fromEntries(coverageKeys.map(k => [k, { status: k === 'inflows' || k === 'currency' || k === 'terminalValue' ? 'confirmed_complete' : 'confirmed_not_applicable', explanation: '合成工程测试：按原件核定范围；不表示真实财务批准', evidence: f.evidence }])); const review = { asOfDate: f.query.asOfDate, knownAt: f.query.knownAt, sourceHash: out.inputs.sourceHash, coverage, currencyConfirmations: [], terminalValue: null }; await f.send({ action: 'create_review', dealId: 'deal', fundId: f.fund, review, evidence: f.evidence }); let v = (await f.readReturns()).reviews.at(-1); const submit = (v: any) => ({ action: 'submit_review', ...f.identify(v), reviewerId: 'user-admin', dueDate: '2026-11-01' }); await f.send(submit(v), 400); assert(v.missingReasons.includes('currency_confirmation.legacy-receipt')); assert(v.missingReasons.includes('missing_valuation')); const valid = { ...review, currencyConfirmations: [{ sourceId: 'legacy-receipt', currency: 'CNY', evidence: f.evidence }], terminalValue: { amount: '0.00', date: f.query.asOfDate, currency: 'CNY', scope: '合成测试：本项目/交易/基金的剩余权益显式零，不以退出比例推断', evidence: f.evidence } }; await f.send({ action: 'revise_review', ...f.identify(v), review: valid, evidence: f.evidence }); v = (await f.readReturns()).reviews.at(-1); out = await f.readReturns(); assert.equal(out.inputs.effectiveInput.rows[0].currency, 'unknown'); await f.send(submit(v)); await f.send({ ...f.decide(v), action: 'decide_review' }); out = await f.readReturns(); assert.equal(out.inputs.rows[0].currency, 'unknown'); assert.equal(out.inputs.effectiveInput.rows[0].sourceCurrency, 'unknown'); assert.equal(out.inputs.effectiveInput.rows[0].currency, 'CNY'); assert.equal(out.inputs.effectiveInput.terminalValue.amount, '0.00'); assert(!out.inputs.missingReasons.includes('unknown_currency')); assert(!out.inputs.missingReasons.includes('missing_valuation')); assert.equal(out.metrics.irr.value, null); assert.equal(out.publicationStatus.status, 'not_published'); assert.equal((await f.store.readExitStates()).find(s => s.project.id === f.project.id)!.postInvestment!.exitPayments![0].currency, undefined); let packet = ''; await f.store.workflowTransaction(f.project.id, async (s) => { packet = s.postInvestment!.cashflowReviews!.at(-1)!.currencyConfirmations[0].evidence[0].packetBlobId!; }); await writeFile(join(f.root, packet), 'damaged currency original'); out = await f.readReturns(); assert.equal(out.inputs.effectiveInput.rows[0].currency, 'unknown'); assert.equal(out.inputs.effectiveInput.terminalValue, null); const material = f.store.listMaterials().find(m => m.id === f.evidence[0].materialId)!; material.projectId = null; material.relationships = { projects: [], funds: [] }; out = await f.readReturns(f.viewer); assert.equal(out.inputs.effectiveInput.rows[0].evidence[0].readIssue, 'material_not_linked'); assert.equal(out.inputs.effectiveInput.rows[0].evidence[0].downloadHref, undefined); await f.store.workflowTransaction(f.project.id, async (s) => { s.postInvestment!.exitPayments![0].amount = '111.00'; }); out = await f.readReturns(); assert.equal(out.reviews.at(-1).isApplicable, false); assert.equal(out.inputs.effectiveInput.reviewId, null); assert(out.inputs.missingReasons.includes('unknown_currency')); });
test('future unknown originals do not invalidate an approved historical review or its preserved hash', async (t) => { const f = await returnsFixture(t); await f.send({ ...f.create, terms: { ...f.terms, measure: 'realized', moicNumerator: 'distributions_only', terminalPolicy: 'not_applicable_with_evidence' } }); const basis = (await f.readReturns()).bases[0]; await f.send(f.submit(basis)); await f.send(f.decide(basis)); let out = await f.readReturns(); const coverage = Object.fromEntries(coverageKeys.map(k => [k, { status: 'confirmed_not_applicable', explanation: '合成工程：此旧knownAt无业务来源，逐项核对无项目业务', evidence: f.evidence }])); const review = { asOfDate: f.query.asOfDate, knownAt: f.query.knownAt, sourceHash: out.inputs.sourceHash, coverage, currencyConfirmations: [], terminalValue: null }; await f.send({ action: 'create_review', dealId: 'deal', fundId: f.fund, review, evidence: f.evidence }); const v = (await f.readReturns()).reviews[0]; await f.send({ action: 'submit_review', ...f.identify(v), reviewerId: 'user-admin', dueDate: '2026-11-01' }); await f.send({ ...f.decide(v), action: 'decide_review' }); out = await f.readReturns(); assert.equal(out.inputs.effectiveInput.reviewId, v.id); const oldHash = out.inputs.sourceHash; await f.store.workflowTransaction(f.project.id, async (s) => { s.postInvestment!.investmentCashflows = [{ id: 'unknown-future', projectId: f.project.id, dealId: 'deal', fundId: f.fund, kind: 'investment_payment', currency: 'CNY', amount: '100.00', date: '2026-01-01', time: '2026-10-31T00:00:00Z', status: 'posted', evidence: [{ materialId: 'not-authorized-future', versionId: 'future', name: 'future', sha256: 'bad', packetBlobId: 'no-bytes', downloadHref: '/future' }] } as any]; }); out = await f.readReturns(); assert.equal(out.inputs.sourceHash, oldHash); assert.equal(out.reviews[0].isApplicable, true); assert.equal(out.inputs.effectiveInput.reviewId, v.id); assert(!out.inputs.missingReasons.includes('source_evidence_unavailable')); assert(!out.inputs.missingReasons.includes('missing_source_evidence')); assert.equal(out.inputs.rows[0].evidence.length, 0); });
test('one completeness review resource cannot fork around rejection; every newer version blocks old approval fallback', async (t) => {
    const f = await returnsFixture(t);
    await f.send(f.create);
    const b = (await f.readReturns()).bases[0];
    await f.send(f.submit(b));
    await f.send(f.decide(b));
    let out = await f.readReturns();
    const coverage = Object.fromEntries(coverageKeys.map(k => [k, { status: k === 'terminalValue' ? 'confirmed_complete' : 'confirmed_not_applicable', explanation: '合成测试：独立核对无业务，终值明确零并有原件', evidence: f.evidence }]));
    const review = { asOfDate: f.query.asOfDate, knownAt: f.query.knownAt, sourceHash: out.inputs.sourceHash, coverage, currencyConfirmations: [], terminalValue: { amount: '0', date: f.query.asOfDate, currency: 'CNY', scope: '合成scope终值原件', evidence: f.evidence } };
    const create = { action: 'create_review', dealId: 'deal', fundId: f.fund, review, evidence: f.evidence };
    const submit = (v: any) => f.send({ action: 'submit_review', ...f.identify(v), reviewerId: 'user-admin', dueDate: '2026-11-01' });
    const decide = (v: any, decision: string) => f.send({ ...f.decide(v, decision), action: 'decide_review' });
    await f.send(create);
    let v = (await f.readReturns()).reviews.at(-1);
    await submit(v);
    await decide(v, 'approve');
    assert.equal((await f.readReturns()).inputs.effectiveInput.reviewId, v.id);
    const duplicate = await f.call('POST', f.base + '/actions', { ...create, requestId: randomUUID(), expectedRevision: (await f.readReturns()).revision });
    assert.equal(duplicate.statusCode, 409);
    const revise = async (reason?: string) => { await f.send({ action: 'revise_review', ...f.identify(v), review, evidence: f.evidence, ...(reason ? { revisionReason: reason } : {}) }); v = (await f.readReturns()).reviews.at(-1); };
    for (const decision of ['return', 'reject']) {
        await revise();
        out = await f.readReturns();
        assert.equal(out.inputs.effectiveInput.reviewId, null);
        assert.equal(out.inputs.effectiveInput.terminalValue, null);
        assert.equal(out.inputs.coverageStatus, 'unreviewed');
        await submit(v);
        assert.equal((await f.readReturns()).inputs.effectiveInput.reviewId, null);
        await decide(v, decision);
        out = await f.readReturns();
        assert.equal(out.inputs.effectiveInput.reviewId, null);
        assert.equal(out.reviews.filter((r: any) => r.latest).length, 1);
        assert.equal(out.reviews[0].status, 'approved');
        assert.equal(out.reviews.at(-1).status, decision === 'return' ? 'returned' : 'rejected');
        if (decision === 'reject')
            await revise('否决后补充核验说明');
    }
    await submit(v);
    await decide(v, 'approve');
    out = await f.readReturns();
    assert.equal(out.inputs.effectiveInput.reviewId, v.id);
    assert.deepEqual(out.reviews.map((r: any) => r.status), ['approved', 'returned', 'rejected', 'approved']);
    await f.send({ action: 'revise_review', ...f.identify(v), review: { ...review, knownAt: '2026-10-31T23:00:00Z' }, evidence: f.evidence }, 400);
    // A different economic/knowledge cutoff has its own resource, never borrowed by the old cutoff.
    const otherQuery = { ...f.query, knownAt: '2026-10-31T23:00:00Z' }, readOther = async () => { const r = await f.call('GET', f.base + '?' + new URLSearchParams(otherQuery)); assert.equal(r.statusCode, 200, r.body); return r.json(); };
    let other = await readOther();
    const otherReview = { ...review, knownAt: otherQuery.knownAt, sourceHash: other.inputs.sourceHash };
    await f.send({ ...create, review: otherReview });
    let otherV = (await f.readReturns()).reviews.at(-1);
    await submit(otherV);
    await decide(otherV, 'reject');
    assert.equal((await readOther()).inputs.effectiveInput.reviewId, null);
    assert.equal((await f.readReturns()).inputs.effectiveInput.reviewId, v.id);
    // A corrected source at the same cutoff requires a new version rather than a second group.
    await f.store.workflowTransaction(f.project.id, async (s) => { s.postInvestment!.investmentCashflows = [{ id: 'known-correction', projectId: f.project.id, dealId: 'deal', fundId: f.fund, kind: 'investment_payment', currency: 'CNY', amount: '100', date: '2026-01-01', time: '2026-10-30T00:00:00Z', status: 'posted', evidence: [] } as any]; });
    out = await f.readReturns();
    assert.notEqual(out.inputs.sourceHash, review.sourceHash);
    assert.equal(out.inputs.effectiveInput.reviewId, null);
    await f.send({ ...create, review: { ...review, sourceHash: out.inputs.sourceHash } }, 409);
    await f.send({ action: 'revise_review', ...f.identify(v), review: { ...review, sourceHash: out.inputs.sourceHash }, evidence: f.evidence });
    out = await f.readReturns();
    assert.equal(out.reviews.at(-1).groupId, v.groupId);
    assert.equal(out.reviews.at(-1).version, v.version + 1);
    assert.equal(out.inputs.effectiveInput.reviewId, null);
    assert(out.reviews.some((r: any) => r.status === 'rejected'));
});
test('legacy duplicate completeness groups choose newest resource before status and never fall back to old approval', async (t) => {
    const f = await returnsFixture(t);
    await f.send(f.create);
    const b = (await f.readReturns()).bases[0];
    await f.send(f.submit(b));
    await f.send(f.decide(b));
    let out = await f.readReturns();
    const coverage = Object.fromEntries(coverageKeys.map(k => [k, { status: k === 'terminalValue' ? 'confirmed_complete' : 'confirmed_not_applicable', explanation: '合成历史多组回归样本', evidence: f.evidence }]));
    const review = { asOfDate: f.query.asOfDate, knownAt: f.query.knownAt, sourceHash: out.inputs.sourceHash, coverage, currencyConfirmations: [], terminalValue: { amount: '0', date: f.query.asOfDate, currency: 'CNY', scope: '合成终值范围', evidence: f.evidence } };
    await f.send({ action: 'create_review', dealId: 'deal', fundId: f.fund, review, evidence: f.evidence });
    const v = (await f.readReturns()).reviews[0];
    await f.send({ action: 'submit_review', ...f.identify(v), reviewerId: 'user-admin', dueDate: '2026-11-01' });
    await f.send({ ...f.decide(v), action: 'decide_review' });
    await f.store.workflowTransaction(f.project.id, async (s) => { const old = s.postInvestment!.cashflowReviews![0]; const denied = { ...structuredClone(old), id: randomUUID(), groupId: randomUUID(), status: 'rejected' as const, decisions: [{ ...structuredClone(old.decisions[0]), decision: 'reject' as const, opinion: '合成此前版本接受过的独立组否决' }], taskIds: [] }; denied.contentHash = recordHash(denied); s.postInvestment!.cashflowReviews!.push(denied); });
    out = await f.readReturns();
    assert.equal(out.inputs.effectiveInput.reviewId, null);
    assert.equal(out.inputs.coverageStatus, 'unreviewed');
    assert.equal(out.reviews.filter((r: any) => r.latest).length, 1);
    assert.equal(out.reviews[0].latest, false);
    assert.equal(out.reviews[0].isApplicable, false);
    assert.equal(out.reviews[1].status, 'rejected');
    assert.equal(out.reviews[0].decisions[0].decision, 'approve');
    await f.send({ action: 'revise_review', ...f.identify(v), review, evidence: f.evidence }, 409);
});
test('an approved realized basis explicitly requiring valuation cannot use N/A to bypass terminal policy in writes or reads', async (t) => {
    const f = await returnsFixture(t);
    await f.send({ ...f.create, terms: { ...f.terms, measure: 'realized', moicNumerator: 'distributions_only', terminalPolicy: 'explicit_valuation_required' } });
    const b = (await f.readReturns()).bases[0];
    await f.send(f.submit(b));
    await f.send(f.decide(b));
    let out = await f.readReturns();
    const coverage = Object.fromEntries(coverageKeys.map(k => [k, { status: 'confirmed_not_applicable', explanation: '合成测试：即使点选N/A不能绕过明确NAV规则', evidence: f.evidence }]));
    const review = { asOfDate: f.query.asOfDate, knownAt: f.query.knownAt, sourceHash: out.inputs.sourceHash, coverage, currencyConfirmations: [], terminalValue: null };
    await f.send({ action: 'create_review', dealId: 'deal', fundId: f.fund, review, evidence: f.evidence });
    const v = (await f.readReturns()).reviews[0];
    const submitted = await f.call('POST', f.base + '/actions', { action: 'submit_review', ...f.identify(v), requestId: randomUUID(), expectedRevision: (await f.readReturns()).revision, reviewerId: 'user-admin', dueDate: '2026-11-01' });
    assert.equal(submitted.statusCode, 400);
    out = await f.readReturns();
    assert(out.reviews[0].missingReasons.includes('missing_valuation'));
    assert(out.inputs.missingReasons.includes('missing_valuation'));
    assert.equal(out.inputs.effectiveInput.reviewId, null);
    // Existing persisted approvals with this contradictory assertion must not pass the GET gate either.
    await f.store.workflowTransaction(f.project.id, async (s) => { s.postInvestment!.cashflowReviews![0].status = 'approved'; });
    out = await f.readReturns();
    assert(out.inputs.missingReasons.includes('missing_valuation'));
    assert.equal(out.inputs.effectiveInput.reviewId, null);
    assert.equal(out.inputs.coverageStatus, 'unreviewed');
});
test('terminal policy contradictions stay draft and cannot submit; review task navigation scope remains bound to source', async (t) => {
    const f = await returnsFixture(t), terms = { ...f.terms, measure: 'realized', moicNumerator: 'distributions_plus_terminal', terminalPolicy: 'not_applicable_with_evidence' };
    assert(termsMissing(terms).includes('terms.inconsistent_terminal_policy'));
    await f.send({ ...f.create, terms });
    let v = (await f.readReturns()).bases[0];
    await f.send(f.submit(v), 400);
    await f.send({ action: 'revise_basis', ...f.identify(v), terms: { ...terms, moicNumerator: 'distributions_only' }, evidence: f.evidence });
    v = (await f.readReturns()).bases.at(-1);
    await f.send(f.submit(v));
    const task = await f.store.workflowTransaction(f.project.id, async (s) => structuredClone(s.tasks.find(t => t.id === s.postInvestment!.returnBases!.at(-1)!.taskIds[0])));
    assert(task);
    const note = JSON.parse(task.note);
    assert.equal(note.dealId, 'deal');
    assert.equal(note.fundId, f.fund);
    assert.equal(note.sourceId, v.id);
    assert.equal(note.sourceVersion, v.version);
    assert.equal(note.contentHash, v.contentHash);
    await f.store.workflowTransaction(f.project.id, async (s) => { const task = s.tasks.find(t => t.id === s.postInvestment!.returnBases!.at(-1)!.taskIds[0])!; task.note = JSON.stringify({ ...JSON.parse(task.note), fundId: 'different-fund' }); });
    await f.send(f.decide(v), 409);
});
test('explicit zero terminal policy applies to actual reviews and samples without rewriting positive draft amounts', async (t) => {
    const f = await returnsFixture(t);
    await f.send({ ...f.create, terms: { ...f.terms, terminalPolicy: 'explicit_zero_with_evidence' } });
    const basis = (await f.readReturns()).bases[0];
    await f.send(f.submit(basis));
    await f.send(f.decide(basis));
    let out = await f.readReturns();
    const coverage = Object.fromEntries(coverageKeys.map(k => [k, { status: k === 'terminalValue' ? 'confirmed_complete' : 'confirmed_not_applicable', explanation: '合成测试：仅核验明确零终值，正值需改口径', evidence: f.evidence }]));
    const terminalValue = { amount: '15.00', date: f.query.asOfDate, currency: 'CNY', scope: '合成项目基金交易范围', evidence: f.evidence };
    const review = { asOfDate: f.query.asOfDate, knownAt: f.query.knownAt, sourceHash: out.inputs.sourceHash, coverage, currencyConfirmations: [], terminalValue };
    await f.send({ action: 'create_review', dealId: 'deal', fundId: f.fund, review, evidence: f.evidence });
    let r = (await f.readReturns()).reviews[0];
    const submitReview = (v: any) => ({ action: 'submit_review', ...f.identify(v), reviewerId: 'user-admin', dueDate: '2026-11-01' });
    const bad = await f.call('POST', f.base + '/actions', { ...submitReview(r), requestId: randomUUID(), expectedRevision: (await f.readReturns()).revision });
    assert.equal(bad.statusCode, 400);
    assert.equal((await f.readReturns()).reviews[0].terminalValue.amount, '15.00');
    const sample = { basisId: basis.id, basisVersion: basis.version, basisContentHash: basis.contentHash, origin: 'engineering_fixture', cashflows: [{ date: '2025-01-01', amount: '100', direction: 'outflow', kind: 'investment_payment', currency: 'CNY' }, { date: '2026-01-01', amount: '110', direction: 'inflow', kind: 'exit_receipt', currency: 'CNY' }], asOfDate: f.query.asOfDate, terminalValue, expected: { irr: null, irrUnit: 'annual_fraction', moic: null, resultStatus: 'not_applicable', tolerance: '0.00001' }, derivationText: '合成终值政策验证样本；非财务独立验收' };
    await f.send({ action: 'create_sample', dealId: 'deal', fundId: f.fund, sample, evidence: f.evidence });
    let s = (await f.readReturns()).samples[0];
    const submitSample = (v: any) => ({ action: 'submit_sample', ...f.identify(v), reviewerId: 'user-admin', dueDate: '2026-11-01' });
    await f.send(submitSample(s), 400);
    assert.equal((await f.readReturns()).samples[0].terminalValue.amount, '15.00');
    const zero = { ...terminalValue, amount: '0.00' };
    await f.send({ action: 'revise_review', ...f.identify(r), review: { ...review, terminalValue: zero }, evidence: f.evidence });
    r = (await f.readReturns()).reviews.at(-1);
    await f.send(submitReview(r));
    await f.send({ ...f.decide(r), action: 'decide_review' });
    await f.send({ action: 'revise_sample', ...f.identify(s), sample: { ...sample, terminalValue: zero }, evidence: f.evidence });
    s = (await f.readReturns()).samples.at(-1);
    await f.send(submitSample(s));
    await f.send({ ...f.decide(s), action: 'decide_sample' });
    out = await f.readReturns();
    assert.equal(out.inputs.effectiveInput.terminalValue.amount, '0.00');
    assert.equal(out.samples.at(-1).status, 'approved');
    assert.equal(out.reviews[0].terminalValue.amount, '15.00');
    assert.equal(out.metrics.irr.value, null);
});
test('a later explicit-zero basis invalidates prior positive actual valuation and does not reuse an older-policy sample', async (t) => {
    const f = await returnsFixture(t);
    await f.send(f.create);
    let basis = (await f.readReturns()).bases[0];
    await f.send(f.submit(basis));
    await f.send(f.decide(basis));
    let out = await f.readReturns();
    const coverage = Object.fromEntries(coverageKeys.map(k => [k, { status: k === 'terminalValue' ? 'confirmed_complete' : 'confirmed_not_applicable', explanation: '合成：实际正终值的政策变更反证', evidence: f.evidence }]));
    const terminalValue = { amount: '15.00', date: f.query.asOfDate, currency: 'CNY', scope: '合成实际终值范围', evidence: f.evidence }, review = { asOfDate: f.query.asOfDate, knownAt: f.query.knownAt, sourceHash: out.inputs.sourceHash, coverage, currencyConfirmations: [], terminalValue };
    await f.send({ action: 'create_review', dealId: 'deal', fundId: f.fund, review, evidence: f.evidence });
    let r = (await f.readReturns()).reviews[0];
    await f.send({ action: 'submit_review', ...f.identify(r), reviewerId: 'user-admin', dueDate: '2026-11-01' });
    await f.send({ ...f.decide(r), action: 'decide_review' });
    const sample = { basisId: basis.id, basisVersion: basis.version, basisContentHash: basis.contentHash, origin: 'engineering_fixture', cashflows: [{ date: '2025-01-01', amount: '100', direction: 'outflow', kind: 'investment_payment', currency: 'CNY' }], asOfDate: f.query.asOfDate, terminalValue, expected: { irr: null, irrUnit: 'annual_fraction', moic: null, resultStatus: 'not_applicable', tolerance: '0.00001' }, derivationText: '合成政策变更，不是计算期望结果' };
    await f.send({ action: 'create_sample', dealId: 'deal', fundId: f.fund, sample, evidence: f.evidence });
    const s = (await f.readReturns()).samples[0];
    await f.send({ action: 'submit_sample', ...f.identify(s), reviewerId: 'user-admin', dueDate: '2026-11-01' });
    await f.send({ ...f.decide(s), action: 'decide_sample' });
    assert.equal((await f.readReturns()).inputs.effectiveInput.terminalValue.amount, '15.00');
    await f.send({ action: 'revise_basis', ...f.identify(basis), terms: { ...f.terms, terminalPolicy: 'explicit_zero_with_evidence' }, evidence: f.evidence });
    basis = (await f.readReturns()).bases.at(-1);
    await f.send(f.submit(basis));
    await f.send(f.decide(basis));
    out = await f.readReturns();
    assert.equal(out.inputs.effectiveInput.terminalValue, null);
    assert(out.reviews[0].missingReasons.includes('terminal_policy_requires_zero'));
    assert.equal(out.reviews[0].terminalValue.amount, '15.00');
    assert.equal(out.samples[0].isApplicable, false);
    assert.equal(out.samples[0].terminalValue.amount, '15.00');
    assert(out.inputs.missingReasons.includes('missing_valuation'));
});
test('persisted positive pending or approved records cannot bypass explicit-zero policy through decide or GET', async (t) => {
    const f = await returnsFixture(t);
    await f.send({ ...f.create, terms: { ...f.terms, terminalPolicy: 'explicit_zero_with_evidence' } });
    const basis = (await f.readReturns()).bases[0];
    await f.send(f.submit(basis));
    await f.send(f.decide(basis));
    let out = await f.readReturns();
    const terminalValue = { amount: '15.00', date: f.query.asOfDate, currency: 'CNY', scope: '合成旧持久化记录范围', evidence: f.evidence }, coverage = Object.fromEntries(coverageKeys.map(k => [k, { status: k === 'terminalValue' ? 'confirmed_complete' : 'confirmed_not_applicable', explanation: '合成旧版待审/已审正值；政策收紧时原值不可抹掉', evidence: f.evidence }]));
    await f.send({ action: 'create_review', dealId: 'deal', fundId: f.fund, review: { asOfDate: f.query.asOfDate, knownAt: f.query.knownAt, sourceHash: out.inputs.sourceHash, coverage, currencyConfirmations: [], terminalValue }, evidence: f.evidence });
    await f.send({ action: 'create_sample', dealId: 'deal', fundId: f.fund, sample: { basisId: basis.id, basisVersion: basis.version, basisContentHash: basis.contentHash, origin: 'engineering_fixture', cashflows: [{ date: '2025-01-01', amount: '100', direction: 'outflow', kind: 'investment_payment', currency: 'CNY' }], asOfDate: f.query.asOfDate, terminalValue, expected: { irr: null, irrUnit: 'annual_fraction', moic: null, resultStatus: 'not_applicable', tolerance: '0.00001' }, derivationText: '合成已持久化正值政策反例' }, evidence: f.evidence });
    await f.store.workflowTransaction(f.project.id, async (state) => { for (const [kind, record] of [['cashflow_review', state.postInvestment!.cashflowReviews![0]], ['return_sample', state.postInvestment!.returnSamples![0]]] as const) {
        const task = { ...structuredClone(state.tasks.find(t => t.id === state.postInvestment!.returnBases![0].taskIds[0])!), id: randomUUID(), status: '未开始', completedAt: null, note: JSON.stringify({ sourceType: kind, sourceId: record.id, sourceVersion: record.version, contentHash: record.contentHash, section: 'returns', dealId: record.scope.dealId, fundId: record.scope.fundId }) };
        state.tasks.push(task);
        record.status = 'pending';
        record.reviewer = f.admin as any;
        record.taskIds = [task.id];
    } });
    out = await f.readReturns();
    await f.send({ ...f.decide(out.reviews[0]), action: 'decide_review' }, 400);
    await f.send({ ...f.decide(out.samples[0]), action: 'decide_sample' }, 400);
    await f.store.workflowTransaction(f.project.id, async (state) => { state.postInvestment!.cashflowReviews![0].status = 'approved'; state.postInvestment!.returnSamples![0].status = 'approved'; });
    out = await f.readReturns();
    assert(out.reviews[0].missingReasons.includes('terminal_policy_requires_zero'));
    assert(out.samples[0].missingReasons.includes('terminal_policy_requires_zero'));
    assert.equal(out.reviews[0].terminalValue.amount, '15.00');
    assert.equal(out.samples[0].terminalValue.amount, '15.00');
    assert.equal(out.inputs.effectiveInput.reviewId, null);
    assert.equal(out.inputs.effectiveInput.terminalValue, null);
    assert(out.inputs.missingReasons.includes('terminal_policy_requires_zero'));
    assert.equal(out.metrics.moic.value, null);
});
test('a damaged approved policy cannot grant its dependent review the no-valuation exception',async t=>{
 const f=await returnsFixture(t);await f.send({...f.create,terms:{...f.terms,measure:'realized',moicNumerator:'distributions_only',terminalPolicy:'not_applicable_with_evidence'}});const basis=(await f.readReturns()).bases[0];await f.send(f.submit(basis));await f.send(f.decide(basis));let out=await f.readReturns();const coverage=Object.fromEntries(coverageKeys.map(k=>[k,{status:'confirmed_not_applicable',explanation:'合成：合法无NAV审核，依赖完整的已批准口径',evidence:f.evidence}]));const review={asOfDate:f.query.asOfDate,knownAt:f.query.knownAt,sourceHash:out.inputs.sourceHash,coverage,currencyConfirmations:[],terminalValue:null};await f.send({action:'create_review',dealId:'deal',fundId:f.fund,review,evidence:f.evidence});const approved=(await f.readReturns()).reviews[0];await f.send({action:'submit_review',...f.identify(approved),reviewerId:'user-admin',dueDate:'2026-11-01'});await f.send({...f.decide(approved),action:'decide_review'});assert.equal((await f.readReturns()).inputs.effectiveInput.reviewId,approved.id);
 await f.store.workflowTransaction(f.project.id,async s=>{s.postInvestment!.returnBases![0].terms.explanation='合成损坏：未经新版本和hash变更而改写说明';});out=await f.readReturns();assert(out.bases[0].missingReasons.includes('content_hash_mismatch'));assert(out.reviews[0].missingReasons.includes('missing_valuation'));assert.equal(out.inputs.effectiveInput.reviewId,null);assert.equal(out.inputs.coverageStatus,'unreviewed');assert(out.inputs.missingReasons.includes('missing_valuation'));
 await f.send({action:'revise_review',...f.identify(approved),review,evidence:f.evidence});const revised=(await f.readReturns()).reviews.at(-1);const response=await f.call('POST',f.base+'/actions',{action:'submit_review',...f.identify(revised),reviewerId:'user-admin',dueDate:'2026-11-01',requestId:randomUUID(),expectedRevision:(await f.readReturns()).revision});assert.equal(response.statusCode,400);assert.equal(response.json().error,'incomplete_return_record');assert.equal((await f.readReturns()).reviews[0].status,'approved');assert.equal((await f.readReturns()).reviews[0].decisions[0].decision,'approve');
});
test('engine publishes only after matching finance sample and exact reviewed sources; mismatches, revisions and damaged originals revoke output', async (t) => {
    const f = await returnsFixture(t);
    await f.send(f.create);
    const basis = (await f.readReturns()).bases[0];
    await f.send(f.submit(basis)); await f.send(f.decide(basis));
    const version = f.store.listMaterialVersions(f.evidence[0].materialId)[0];
    const sourceProof = { ...f.evidence[0], name: version.name, sha256: version.sha256, sizeBytes: version.sizeBytes, packetBlobId: version.blobId, downloadHref: '/original' };
    await f.store.workflowTransaction(f.project.id, async s => {
        s.postInvestment!.investmentCashflows = [{ id: 'invest-engine', projectId: f.project.id, dealId: 'deal', fundId: f.fund, kind: 'investment_payment', currency: 'CNY', amount: '100.00', date: '2025-01-01', time: '2025-01-02T00:00:00Z', status: 'posted', evidence: [sourceProof] } as any];
        s.postInvestment!.exitExecutions = [{ id: 'exit-engine', projectId: f.project.id, dealId: 'deal', status: 'recorded' } as any];
        s.postInvestment!.exitPayments = [{ id: 'receive-engine', projectId: f.project.id, executionId: 'exit-engine', fundId: f.fund, amount: '110.00', principal: '100.00', income: '10.00', date: '2026-01-01', time: '2026-01-02T00:00:00Z', status: 'posted', evidence: [sourceProof] } as any];
    });
    const terminalValue = { amount: '0', date: f.query.asOfDate, currency: 'CNY', scope: '合成项目/交易/基金明确终值测试，不代表真实财务', evidence: f.evidence };
    let out = await f.readReturns();
    const coverage = Object.fromEntries(coverageKeys.map(k => [k, { status: k === 'fees' || k === 'taxes' ? 'confirmed_not_applicable' : 'confirmed_complete', explanation: '合成原件全链路测试，不代表真实批准', evidence: f.evidence }]));
    const review = { asOfDate: f.query.asOfDate, knownAt: f.query.knownAt, sourceHash: out.inputs.sourceHash, coverage, currencyConfirmations: [{ sourceId: 'receive-engine', currency: 'CNY', evidence: f.evidence }], terminalValue };
    await f.send({ action: 'create_review', dealId: 'deal', fundId: f.fund, review, evidence: f.evidence });
    const approved = (await f.readReturns()).reviews.at(-1);
    await f.send({ ...f.submit(approved), action: 'submit_review' }); await f.send({ ...f.decide(approved), action: 'decide_review' });
    const sample = { basisId: basis.id, basisVersion: basis.version, basisContentHash: basis.contentHash, origin: 'finance_independent', cashflows: [{ date: '2025-01-01', amount: '100', direction: 'outflow', kind: 'investment_payment', currency: 'CNY' }, { date: '2026-01-01', amount: '110', direction: 'inflow', kind: 'exit_receipt', currency: 'CNY' }], asOfDate: f.query.asOfDate, terminalValue, expected: { irr: '0.2', irrUnit: 'annual_fraction', moic: '1.1', resultStatus: 'ok', tolerance: '0.000001' }, derivationText: '合成期望推导：365日，110/100=1.1，IRR=0.1；这里只验证接口门禁，不取得真实财务批准。' };
    await f.send({ action: 'create_sample', dealId: 'deal', fundId: f.fund, sample, evidence: f.evidence });
    let v = (await f.readReturns()).samples.at(-1);
    assert(v.missingReasons.includes('sample.calculation_mismatch'));
    await f.send({ ...f.submit(v), action: 'submit_sample' }, 400);
    await f.send({ action: 'revise_sample', ...f.identify(v), sample: { ...sample, origin: 'engineering_fixture', expected: { ...sample.expected, irr: '0.1' } }, evidence: f.evidence });
    v = (await f.readReturns()).samples.at(-1);
    await f.send({ ...f.submit(v), action: 'submit_sample' }); await f.send({ ...f.decide(v), action: 'decide_sample' });
    out = await f.readReturns();
    assert.equal(out.metrics.irr.value, null); assert(out.publicationStatus.reasonCodes.includes('pending_independent_sample'));
    await f.send({ action: 'revise_sample', ...f.identify(v), sample: { ...sample, expected: { ...sample.expected, irr: '0.1' } }, evidence: f.evidence });
    v = (await f.readReturns()).samples.at(-1);
    await f.send({ ...f.submit(v), action: 'submit_sample' }); await f.send({ ...f.decide(v), action: 'decide_sample' });
    out = await f.readReturns();
    assert.equal(out.publicationStatus.status, 'published');
    assert.equal(out.metrics.irr.value, '0.10000000'); assert.equal(out.metrics.moic.value, '1.100000');
    assert.equal(out.publicationStatus.sourceHash, review.sourceHash); assert.equal(out.publicationStatus.reviewId, approved.id);
    assert.equal(out.publicationStatus.basisId, basis.id); assert.deepEqual(out.publicationStatus.reasonCodes, []);
    await f.store.workflowTransaction(f.project.id, async s => {
        const current = s.postInvestment!.returnSamples!.at(-1)!;
        const other = { ...structuredClone(s.postInvestment!.returnBases![0]), id: 'other-basis', groupId: 'other-basis', scope: { ...basis.scope, fundId: 'other-scope-fund' } };
        other.contentHash = recordHash(other); s.postInvestment!.returnBases!.push(other);
        current.scope = other.scope; current.basisId = other.id; current.basisContentHash = other.contentHash; current.contentHash = recordHash(current);
    });
    assert((await f.readReturns()).publicationStatus.reasonCodes.includes('pending_independent_sample'));
    await f.store.workflowTransaction(f.project.id, async s => {
        const current = s.postInvestment!.returnSamples!.at(-1)!;
        current.scope = basis.scope; current.basisId = basis.id; current.basisContentHash = basis.contentHash; current.contentHash = recordHash(current);
        s.postInvestment!.returnBases!.pop();
    });
    assert.equal(JSON.stringify(out).includes('packetBlobId'), false);
    await f.store.workflowTransaction(f.project.id, async s => { s.postInvestment!.exitPayments![0].amount = '111.00'; });
    out = await f.readReturns(); assert.equal(out.metrics.irr.value, null); assert.equal(out.publicationStatus.status, 'not_published');
    await f.store.workflowTransaction(f.project.id, async s => { s.postInvestment!.exitPayments![0].amount = '110.00'; });
    assert.equal((await f.readReturns()).publicationStatus.status, 'published');
    await f.send({ action: 'revise_sample', ...f.identify(v), sample: { ...sample, expected: { ...sample.expected, irr: '0.1' } }, evidence: f.evidence });
    assert.equal((await f.readReturns()).metrics.irr.value, null);
    v = (await f.readReturns()).samples.at(-1);
    await f.send({ ...f.submit(v), action: 'submit_sample' }); await f.send({ ...f.decide(v), action: 'decide_sample' });
    let packet = '';
    await f.store.workflowTransaction(f.project.id, async s => { packet = s.postInvestment!.returnSamples!.at(-1)!.evidence[0].packetBlobId!; });
    await writeFile(join(f.root, packet), 'damaged independent evidence');
    out = await f.readReturns(); assert.equal(out.metrics.irr.value, null); assert(out.publicationStatus.reasonCodes.includes('pending_independent_sample'));
});

test('return approval immediately notifies the designated finance account and returns its decision to the submitter',async t=>{
 const f=await returnsFixture(t);await f.call('GET',f.base,undefined,f.finance);await f.send(f.create);const basis=(await f.readReturns()).bases[0];await f.send(f.submit(basis,'finance'));
 const notices=async(user:any)=>{const r=await f.call('GET','/api/agent-workspace',undefined,user);assert.equal(r.statusCode,200,r.body);return r.json().notifications.filter((n:any)=>n.businessKey==='returnBases:'+basis.id);};
 let incoming=await notices(f.finance);assert.equal(incoming.filter((n:any)=>!n.read).length,1);assert.ok(incoming[0].href.includes('returnRecordId='+basis.id));assert.ok(incoming[0].href.includes('returnHash='+basis.contentHash));
 await f.send(f.decide(basis,'return'),200,f.finance);incoming=await notices(f.finance);assert.ok(incoming.every((n:any)=>n.read));assert.equal((await notices(f.admin)).filter((n:any)=>n.businessKind==='result').length,1);
});
