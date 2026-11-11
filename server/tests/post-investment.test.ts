import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,createHash } from 'node:crypto';
import { mkdtemp, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {createTestServer as createServer,registeredCookie} from './auth-fixture.ts';
import { createMemoryLedgerStore, createSeedLedgerState } from '../src/ledger/store.ts';
import { sixMonthsBefore, canonicalPeriod, periodContains, shanghaiDay, reconcilePostClauses, emptyPostInvestment } from '../src/ledger/post-investment.ts';
const secret = 'post-test';
async function fixture(t: any,archivePurposes=false) {
    const root = await mkdtemp(join(tmpdir(), 'post-')), state = createSeedLedgerState(), p = state.projects[0];
    p.ownerId = 'user-admin';
    state.projects.push({ ...structuredClone(p), id: 'other-project' });
    const sourcePurposes=archivePurposes?[['post_report','sealed-report'],['exit_preparation','sealed-exit'],['deal_terms','sealed-terms']].map(([recordType,recordId])=>({recordType,recordId,projectId:p.id,dataPurpose:'engineering_fixture' as const,evidence:{test:'exact archived identity'},classifiedBy:'test',classifiedAt:'2026-11-01',revision:1})):[];
    const store = createMemoryLedgerStore(state,{sourcePurposes}), server = createServer({ ledgerStore: store, materialStorageRoot: root, auth: { mode: 'password', sessionSecret: secret } });
    t.after(async () => { await server.close(); await rm(root, { recursive: true, force: true }); });
    const admin = { id: 'user-admin', name: '管理员', email: 'admin@example.local', role: 'admin' }, viewer = { ...admin, id: 'viewer', email:'viewer@example.local', role: 'viewer' }, legal = { ...admin, id: 'legal', email:'legal@example.local', role: 'legal' }, url = `/api/projects/${p.id}/post-investment`;
    const call = async(method: any, url: string, payload?: any, user: any = admin) => server.inject({ method, url, payload, headers: { cookie: await registeredCookie(server,user,secret) } });
    const upload = async (projectId = p.id) => { const r = await call('POST', '/api/materials/upload?' + new URLSearchParams({ requestId: randomUUID(), name: 'post.pdf', type: '法务资料', projectId }), Buffer.from('%PDF-1.7\nreal post bytes')); return r; };
    async function ref(projectId = p.id) { const r = await server.inject({ method: 'POST', url: '/api/materials/upload?' + new URLSearchParams({ requestId: randomUUID(), name: 'post.pdf', type: '法务资料', projectId }), payload: Buffer.from('%PDF-1.7\nreal post bytes'), headers: { cookie: await registeredCookie(server,admin as any,secret), 'content-type': 'application/octet-stream' } }); assert.equal(r.statusCode, 201, r.body); return { materialId: r.json().material.id, versionId: r.json().version.id }; }
    const material = await ref(), v = store.listMaterialVersions(material.materialId)[0];
    await store.workflowTransaction(p.id, async (s) => { s.deals = [{ id: 'closed', projectId: p.id, ownerId: admin.id, title: '真实交割测试批次', revision: 1, status: 'closed', reviewers: [admin], createdBy: admin, createdAt: '2026-10-01', terms: [{ id: 'terms', version:1, amount:'100.00', valuation:'1000.00', share:'10.0000', date:'2026-10-01', status:'approved', allocations: [{ fundId: state.funds[0].id, amount: '100.00' }] }], agreements: [{ id: 'agreement', title: '签署协议', termsId: 'terms', signed: { material: { ...material, name: v.name, sha256: v.sha256, sizeBytes: v.sizeBytes, packetBlobId: v.blobId, downloadHref: '/fixture-signed' } } }], confirmations: [], closing: { actor: admin, time: '2026-10-01', evidence: [], note: '测试交割', termsId: 'terms', responsibility: { owner: admin, duties: '跟进', schedules: [] } } }] as any; });
    const read = async () => { const r = await call('GET', url); assert.equal(r.statusCode, 200, r.body); return r.json().postInvestment; };
    const act = async (b: any, code = 200, user: any = admin) => { const before = await read(), r = await call('POST', `${url}/actions`, { requestId: randomUUID(), expectedRevision: before.revision, dealId: 'closed', ...b }, user); assert.equal(r.statusCode, code, r.body); return r; };
    const financial = { period: { kind: 'quarter', value: '2026-Q3' }, asOfDate: '2026-09-30', currency: 'CNY', basis: '合并报表，人民币元', revenue: '0', netProfit: '-0.25', netAssets: '-100', valuation: null, employees: 0, missingReasons: { valuation: '本期无估值报告' }, source: '实际报表人工录入', evidence: [material], reviewerId: 'user-admin' };
    const clause = { agreementId: 'agreement', title: '用户约定回购', quote: '用户录入原文', sourceLocation: '签章协议第3页2.1', obligation: '履行用户约定义务', threshold: '人工输入，非系统违约认定', triggerDate: '2026-10-01', ownerId: 'user-admin' };
    return { root, store, p, server, call, read, act, url, admin, viewer, legal, material, ref, financial, clause };
}
test('canonical periods, Shanghai midnight and six calendar months clamp leap/month-end', () => {
    for (const [value, expected] of [['2027-08-31', '2027-02-28'], ['2028-08-31', '2028-02-29'], ['2028-02-29', '2027-08-29'], ['2027-01-31', '2026-07-31']])
        assert.equal(sixMonthsBefore(value), expected);
    assert.equal(shanghaiDay(new Date('2026-10-28T16:00:00Z')), '2026-10-29');
    for (const [kind, value] of [['day', '2026-09-30'], ['month', '2026-09'], ['quarter', '2026-Q3'], ['half', '2026-H2'], ['year', '2026']])
        assert.equal(periodContains(canonicalPeriod({ kind, value }), '2026-09-30'), true);
    assert.throws(() => canonicalPeriod({ kind: 'day', value: '2026-02-29' }));
    assert.throws(() => canonicalPeriod({ kind: 'quarter', value: '2026-Q5' }));
    assert.equal(periodContains({ kind: 'half', value: '2026-H1' }, '2026-09-30'), false);
});
test('financial actual closed gate, strict decimals/null reasons, immutable versions/review/veto, scoped replay and concurrent revision', async (t) => {
    const f = await fixture(t);
    assert.equal((await f.read()).revision, 1);
    await f.act({ action: 'save_financial', reason: '初始', financial: f.financial, dealId: 'missing' }, 409);
    await f.act({ action: 'save_financial', reason: '越权', financial: f.financial }, 403, f.viewer);
    await f.act({ action: 'save_financial', reason: '越权', financial: f.financial }, 403, f.legal);
    for (const change of [{ revenue: '-1' }, { netProfit: 1 }, { valuation: null, missingReasons: {} }, { employees: 1.2 }, { currency: 'USD' }, { asOfDate: '2026-10-01' }, { evidence: [] }, { evidence: [await f.ref('other-project')] }])
        await f.act({ action: 'save_financial', reason: '非法', financial: { ...f.financial, ...change } }, 400);
    const b = { requestId: randomUUID(), expectedRevision: 1, dealId: 'closed', action: 'save_financial', reason: '初始', financial: f.financial };
    const rs = await Promise.all([f.call('POST', `${f.url}/actions`, b), f.call('POST', `${f.url}/actions`, b)]);
    assert.deepEqual(rs.map(r => r.statusCode), [200, 200]);
    assert.equal(rs.filter(r => r.json().created).length, 1);
    let p = await f.read(), v = p.financials[0];
    assert.equal(v.netProfit, '-0.25');
    assert.equal(v.revenue, '0.00');
    assert.equal(v.valuation, null);
    await f.act({ action: 'save_financial', reason: '不能静默覆盖', financial: f.financial }, 409);
    assert.equal((await f.call('POST', `${f.url}/actions`, { ...b, requestId: randomUUID() })).json().error, 'post_revision_conflict');
    await f.act({ action: 'submit_financial', recordId: v.id });
    await f.act({ action: 'save_financial', recordId: v.id, reason: '提交冻结', financial: f.financial }, 409);
    await f.act({ action: 'review_financial', recordId: v.id, decision: 'return', opinion: '补充说明' });
    const returned = structuredClone((await f.read()).financials[0]);
    await f.act({ action: 'save_financial', recordId: v.id, reason: '补充', financial: { ...f.financial, netProfit: '-1' } });
    p = await f.read();
    assert.deepEqual(p.financials[0], returned);
    assert.equal(p.financials[1].version, 2);
    await f.act({ action: 'save_financial', recordId: v.id, reason: '不能改期间', financial: { ...f.financial, period: { kind: 'month', value: '2026-09' } } }, 409);
    await f.act({ action: 'submit_financial', recordId: v.id });
    await f.act({ action: 'review_financial', recordId: v.id, decision: 'reject', opinion: '否决' });
    await f.act({ action: 'save_financial', recordId: v.id, reason: '不能绕过否决', financial: f.financial }, 409);
    assert.ok(f.store.listTasks().filter(t => t.type === '投后审核').every(t => t.status === '已完成'));
});
test('visits preserve completed history, cancel open old tasks; archives canonical dedup and immutable allocation snapshots', async (t) => {
    const f = await fixture(t), visit = { date: '2026-09-30', ownerId: 'user-admin', analysis: '实地走访记录', evidence: [f.material], followUps: [{ title: '已完成行动', ownerId: 'user-admin', dueDate: '2026-10-01' }, { title: '未完成行动', ownerId: 'user-admin', dueDate: '2026-10-02' }] };
    await f.act({ action: 'save_visit', reason: '首次走访', visit });
    let p = await f.read(), v = p.visits[0];
    assert.equal(f.store.listTasks().find(t=>t.id===v.followUps[0].taskId).dataOrigin,'system_generated');
    const done = await f.call('PATCH', `/api/tasks/${v.followUps[0].taskId}`, { requestId: randomUUID(), expectedRevision: 1, status: '已完成', completionNote: '实际完成' });
    assert.equal(done.statusCode, 200, done.body);
    await f.act({ action: 'save_visit', recordId: v.id, reason: '补充走访', visit: { ...visit, followUps: [{ title: '新行动', ownerId: 'user-admin', dueDate: '2026-10-03' }] } });
    assert.equal(f.store.listTasks().find(t => t.id === v.followUps[0].taskId).status, '已完成');
    assert.equal(f.store.listTasks().find(t => t.id === v.followUps[1].taskId).status, '已取消');
    for (const [kind, value] of [['day', '2026-09-30'], ['month', '2026-09'], ['quarter', '2026-Q3'], ['half', '2026-H2'], ['year', '2026']])
        await f.act({ action: 'archive', period: { kind, value }, category: '经营', note: '真实原件归档', materials: [f.material] });
    p = await f.read();
    assert.equal(p.archives.length, 5);
    assert.equal(p.archives[0].allocations[0].amount, '100.00');
    await f.act({ action: 'archive', period: { kind: 'year', value: '2026' }, category: '经营', note: '重复', materials: [f.material] }, 409);
    await f.store.workflowTransaction(f.p.id, async (s) => { s.deals![0].terms[0].allocations[0].amount = '999.00'; });
    assert.equal((await f.read()).archives[0].allocations[0].amount, '100.00');
});
test('clause warnings catch up once, reassign/date version reconciles, evidence lock prevents generic bypass and rollback cleans files', async (t) => {
    const f = await fixture(t);
    await f.act({ action: 'save_clause', reason: '初始条款', clause: f.clause });
    let p = await f.read(), c = p.clauses[0];
    assert.ok(c.warningTaskId);
    const warning = f.store.listTasks().find(t => t.id === c.warningTaskId);
    assert.equal(warning.kind, 'post_clause');
    await f.act({ action: 'reconcile' });
    assert.equal(f.store.listTasks().filter(t => t.type === '条款预警').length, 1);
    const bypass = await f.call('PATCH', `/api/tasks/${warning.id}`, { requestId: randomUUID(), expectedRevision: 1, status: '已完成', completionNote: '绕过证据' });
    assert.equal(bypass.statusCode, 409, bypass.body);
    await f.act({ action: 'save_clause', recordId: c.id, reason: '延后到未来', clause: { ...f.clause, triggerDate: '2030-08-31' } });
    p = await f.read();
    assert.equal(p.clauses[1].warningTaskId, undefined);
    assert.equal(f.store.listTasks().find(t => t.id === warning.id).status, '已取消');
    const beforeFiles = await readdir(f.root);
    await f.act({ action: 'resolve_clause', recordId: c.id, status: 'fulfilled', reason: '实际履行', evidence: [f.material, { materialId: 'missing', versionId: 'bad' }] }, 400);
    assert.deepEqual(await readdir(f.root), beforeFiles);
    assert.equal((await f.read()).clauses[1].status, 'active');
    await f.act({ action: 'resolve_clause', recordId: c.id, status: 'fulfilled', reason: '实际履行', evidence: [f.material] });
    await f.act({ action: 'save_clause', recordId: c.id, reason: '不能重开', clause: f.clause }, 409);
    const raw = await f.store.workflowTransaction(f.p.id, async (s) => s.postInvestment!.clauses[1].resolution!.evidence[0]);
    const href = raw.downloadHref;
    assert.notEqual(href.split('/').at(-1), raw.packetBlobId);
    assert.equal((await f.call('GET', `${f.url}/files/${raw.packetBlobId}`)).statusCode,404);
    assert.equal(JSON.stringify(await f.read()).includes(raw.packetBlobId!),false);
    assert.equal((await f.call('GET', href)).statusCode, 200);
    assert.equal((await f.call('GET', href, undefined, f.legal)).statusCode, 403);
    await writeFile(join(f.root, raw.packetBlobId!), 'corrupt');
    assert.equal((await f.call('GET', href)).json().error, 'material_integrity_mismatch');
});
test('pure reconciler handles restart, backwards/forwards clock, past triggers and one current-version warning', () => {
    const a = { id: 'a', name: '责任人', role: 'post_investment', email: 'a@example.local' }, s: any = { project: { id: 'p', name: '项目', stage: '投后' }, tasks: [], auditEvents: [], postInvestment: emptyPostInvestment() };
    s.postInvestment.clauses.push({ id: 'c', version: 1, owner: a, status: 'active', triggerDate: '2028-08-31', title: '约定', obligation: '义务', threshold: '阈值' });
    assert.equal(reconcilePostClauses(s, '2028-02-28'), false);
    assert.equal(reconcilePostClauses(s, '2028-02-29'), true);
    assert.equal(reconcilePostClauses(s, '2028-03-01'), false);
    assert.equal(reconcilePostClauses(s, '2027-01-01'), false);
    assert.equal(reconcilePostClauses(structuredClone(s), '2030-01-01'), false);
    assert.equal(s.tasks.length, 1);
    assert.equal(s.auditEvents.length, 1);
});
test('startup skips projects without persisted post-investment state', async () => {
    const store = createMemoryLedgerStore(createSeedLedgerState());
    assert.deepEqual(await store.listPostInvestmentProjectIds(), []);
    store.workflowTransaction = async () => { throw new Error('unrelated project must not be scanned'); };
    const server = createServer({ ledgerStore: store });
    try { await server.ready(); } finally { await server.close(); }
});
test('background startup catches persisted due clauses after restart; two instances serialize without duplicate warnings', async (t) => {
    const f = await fixture(t);
    await f.act({ action: 'save_clause', reason: '未来约定', clause: { ...f.clause, triggerDate: '2030-08-31' } });
    await f.store.workflowTransaction(f.p.id, async (s) => { s.postInvestment!.clauses[0].triggerDate = '2026-01-01'; });
    const make = () => createServer({ ledgerStore: f.store, materialStorageRoot: f.root, auth: { mode: 'password', sessionSecret: secret } }), a = make(), b = make();
    t.after(async () => { await a.close(); await b.close(); });
    await Promise.all([a.ready(), b.ready()]);
    const deadline=Date.now()+2000;
    while(a.postInvestmentMaintenance?.state!=='idle'||b.postInvestmentMaintenance?.state!=='idle'){
        if(Date.now()>deadline)throw Error('startup reconciliation did not complete');
        await new Promise(resolve=>setTimeout(resolve,5));
    }
    assert.equal(f.store.listTasks().filter(t => t.type === '条款预警').length, 1);
    const s = await f.store.workflowTransaction(f.p.id, async (s) => s);
    assert.equal(s.postInvestment!.clauses[0].warningTaskId, f.store.listTasks().find(t => t.type === '条款预警').id);
    assert.equal(s.auditEvents.length, 0);
    const audits = f.store.listAuditEvents().filter(e => e.action === '投后条款预警');
    assert.equal(audits.length, 1);
    assert.equal(audits[0].actor, '投后预警后台');
    assert.equal(JSON.parse(audits[0].detail).detail.responsibleOwnerId, 'user-admin');
});
test('assigned clause owner may resolve own evidence; unrelated manager/disabled assignee and cross-resource request replay rejected', async (t) => {
    const f = await fixture(t), assignee = { id: 'post-owner', name: '履约责任人', email: 'post@example.local', role: 'post_investment' };
    await f.store.insertUser({ ...assignee, passwordHash: 'enabled-test-password' } as any);
    await f.store.insertUser({ ...assignee, id: 'disabled', email: 'disabled@example.local', passwordHash: null } as any);
    await f.act({ action: 'save_clause', reason: '禁用用户', clause: { ...f.clause, ownerId: 'disabled' } }, 400);
    await f.act({ action: 'save_clause', reason: '指定负责人', clause: { ...f.clause, ownerId: assignee.id } });
    const p = await f.read(), c = p.clauses[0];
    assert.equal(f.store.listTasks().find(t => t.id === c.warningTaskId).ownerId, assignee.id);
    await f.act({ action: 'save_visit', reason: '非总负责人', visit: { date: '2026-09-30', ownerId: assignee.id, analysis: '越权', evidence: [f.material], followUps: [] } }, 403, assignee);
    const request = { requestId: randomUUID(), expectedRevision: p.revision, dealId: 'closed', action: 'resolve_clause', recordId: c.id, status: 'fulfilled', reason: '责任人提交实际证据', evidence: [f.material] };
    const r = await f.call('POST', `${f.url}/actions`, request, assignee);
    assert.equal(r.statusCode, 200, r.body);
    const retry = await f.call('POST', `${f.url}/actions`, request, assignee);
    assert.equal(retry.statusCode, 200, retry.body);
    assert.equal(retry.json().created, false);
    const crossed = await f.call('POST', `${f.url}/actions`, { ...request, dealId: 'different' }, assignee);
    assert.equal(crossed.json().error, 'request_conflict');
    assert.equal(f.store.listTasks().find(t => t.id === c.warningTaskId).status, '已完成');
});
test('financial project owner can independently review, only approval roles can be selected and rejected outcome stays terminal', async (t) => {
    const f = await fixture(t), reviewer = { id: 'other-reviewer', name: '投资经理', role: 'investment_manager', email: 'review@example.local' }, post = { id: 'post-reviewer', name: '投后', role: 'post_investment', email: 'post-review@example.local' };
    await f.store.insertUser({ ...reviewer, passwordHash: 'enabled' } as any);
    await f.store.insertUser({ ...post, passwordHash: 'enabled' } as any);
    await f.act({ action: 'save_financial', reason: '不能指定投后审核角色', financial: { ...f.financial, reviewerId: post.id } }, 400);
    await f.act({ action: 'save_financial', reason: '指定投资经理', financial: { ...f.financial, reviewerId: reviewer.id } });
    const v = (await f.read()).financials[0];
    await f.act({ action: 'submit_financial', recordId: v.id });
    await f.act({ action: 'review_financial', recordId: v.id, decision: 'reject', opinion: '项目负责人独立否决' });
    assert.equal((await f.read()).financials[0].decisions[0].actor.id, 'user-admin');
    await f.act({ action: 'review_financial', recordId: v.id, decision: 'approve', opinion: '不能覆盖否决' }, 409, reviewer);
});
test('unknown post commit outcome retains snapshot bytes, confirmed rollback removes only failed snapshots', async (t) => {
    const f = await fixture(t), original = f.store.workflowTransaction.bind(f.store);
    let mode = 'unknown';
    f.store.workflowTransaction = async (id, action) => {
        if (mode === 'rollback')
            return original(id, async (s) => { const result = await action(s); if ((result as any)?.created) {
                const e = new Error('confirmed_rollback');
                Object.assign(e, { safeToDeleteBlob: true });
                throw e;
            } return result; });
        const result = await original(id, action);
        if (mode === 'unknown' && (result as any)?.created) {
            mode = 'normal';
            throw new Error('commit_ack_lost');
        }
        return result;
    };
    const r = await f.act({ action: 'save_financial', reason: '提交回执丢失', financial: f.financial }, 500), p = await f.read();
    assert.equal(p.financials.length, 1);
    assert.equal((await f.call('GET', p.financials[0].evidence[0].downloadHref)).statusCode, 200);
    const files = await readdir(f.root);
    mode = 'rollback';
    await f.act({ action: 'archive', period: { kind: 'year', value: '2026' }, category: '失败测试', note: '确认回滚', materials: [f.material] }, 500);
    assert.deepEqual(await readdir(f.root), files);
    assert.equal((await f.read()).archives.length, 0);
});
test('actual timer retries disabled due assignee, catches up after re-enable, and stops scanning onClose', async (t) => {
    const f = await fixture(t), owner = { id: 'timed-owner', name: '定时责任人', role: 'post_investment', email: 'timer@example.local' };
    await f.store.insertUser({ ...owner, passwordHash: 'enabled' } as any);
    await f.act({ action: 'save_clause', reason: '等待时间推进', clause: { ...f.clause, ownerId: owner.id, triggerDate: '2030-08-31' } });
    const readUsers = f.store.listUsers.bind(f.store);
    let disabled = true;
    f.store.listUsers = async () => (await readUsers()).map(u => u.id === owner.id ? { ...u, passwordHash: disabled ? null : 'enabled' } : u);
    const { default: Fastify } = await import('fastify'), { registerPostInvestmentRoutes } = await import('../src/http/post-investment.ts');
    const timer = Fastify({ logger: false });
    let scans = 0, clock = new Date('2030-02-28T00:00:00Z');
    const original = f.store.listPostInvestmentProjectIds.bind(f.store);
    f.store.listPostInvestmentProjectIds = () => { scans++; return original(); };
    registerPostInvestmentRoutes(timer, f.store, { auth: { mode: 'password', sessionSecret: secret }, projectRoot: f.root, storageRoot: f.root, clock: () => clock, reconcileIntervalMs: 10 });
    t.after(() => timer.close());
    await timer.ready();
    assert.equal(f.store.listTasks().filter(t => t.type === '条款预警').length, 0);
    await new Promise(r => setTimeout(r, 25));
    assert.ok(scans >= 2);
    assert.equal(f.store.listTasks().filter(t => t.type === '条款预警').length, 0);
    disabled = false;
    const deadline = Date.now() + 1000;
    while (!f.store.listTasks().some(t => t.type === '条款预警') && Date.now() < deadline)
        await new Promise(r => setTimeout(r, 10));
    assert.equal(f.store.listTasks().filter(t => t.type === '条款预警').length, 1);
    clock = new Date('2031-01-01T00:00:00Z');
    await new Promise(r => setTimeout(r, 25));
    assert.equal(f.store.listTasks().filter(t => t.type === '条款预警').length, 1);
    const originalTransaction=f.store.workflowTransaction.bind(f.store);
    let unblock:()=>void=()=>{},entered:()=>void=()=>{},closed=false;
    const gate=new Promise<void>(resolve=>{unblock=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
    f.store.workflowTransaction=async(id,action)=>{if(id===f.p.id){entered();await gate;}return originalTransaction(id,action);};
    await Promise.race([started,new Promise((_,reject)=>setTimeout(()=>reject(new Error('timer did not scan')),1000))]);
    const closing=timer.close().then(()=>{closed=true;});
    await new Promise(r=>setTimeout(r,25));assert.equal(closed,false);
    unblock();await closing;
    const stopped = scans;
    await new Promise(r => setTimeout(r, 25));
    assert.equal(scans, stopped);
});

test('one disabled clause owner isolates warning failure; other warnings and unrelated writes commit and retry clears issue once',async t=>{
 const f=await fixture(t),a={id:'isolated-owner',name:'受阻责任人',email:'isolated@example.local',role:'post_investment'};
 await f.store.insertUser({...a,passwordHash:'enabled'} as any);
 await f.act({action:'save_clause',reason:'未来A',clause:{...f.clause,title:'A受阻条款',ownerId:a.id,triggerDate:'2030-08-31'}});
 await f.act({action:'save_clause',reason:'未来B',clause:{...f.clause,title:'B正常条款',triggerDate:'2030-08-31'}});
 const users=f.store.listUsers.bind(f.store);let disabled=true;
 f.store.listUsers=async()=> (await users()).map(u=>u.id===a.id?{...u,passwordHash:disabled?null:'enabled'}:u);
 await f.store.workflowTransaction(f.p.id,async s=>{for(const c of s.postInvestment!.clauses)c.triggerDate='2026-01-01';});
 await f.act({action:'reconcile'});let p=await f.read();const failed=p.clauses[0],valid=p.clauses[1];assert.equal(failed.warningIssue.code,'owner_unavailable');assert.equal(failed.warningTaskId,undefined);assert.ok(valid.warningTaskId);
 assert.equal(f.store.listTasks().filter(t=>t.type==='条款预警').length,1);
 const rev=p.revision,audits=f.store.listAuditEvents().filter(e=>e.action==='投后条款预警受阻').length;
 await f.act({action:'reconcile'});p=await f.read();assert.equal(p.revision,rev);assert.equal(f.store.listAuditEvents().filter(e=>e.action==='投后条款预警受阻').length,audits);
 await f.act({action:'save_financial',reason:'受阻不影响财务',financial:f.financial});
 await f.act({action:'save_visit',reason:'受阻不影响走访',visit:{date:'2026-09-30',ownerId:'user-admin',analysis:'真实走访',evidence:[f.material],followUps:[]}});
 await f.act({action:'archive',period:{kind:'year',value:'2026'},category:'隔离测试',note:'受阻不影响归档',materials:[f.material]});
 p=await f.read();assert.equal(p.financials.length,1);assert.equal(p.visits.length,1);assert.equal(p.archives.length,1);assert.ok(p.clauses[0].warningIssue);
 disabled=false;await f.act({action:'reconcile'});p=await f.read();assert.equal(p.clauses[0].warningIssue,undefined);assert.ok(p.clauses[0].warningTaskId);assert.equal(f.store.listTasks().filter(t=>t.type==='条款预警').length,2);
 const recoveredRevision=p.revision;await f.act({action:'reconcile'});assert.equal((await f.read()).revision,recoveredRevision);assert.equal(f.store.listTasks().filter(t=>t.type==='条款预警').length,2);
});

test('terminal resolution clears warning issue and re-enable never creates a warning for fulfilled or cancelled clauses',async t=>{
 const f=await fixture(t),owner={id:'resolved-unavailable',name:'已处理责任人',email:'resolved@example.local',role:'post_investment'};
 await f.store.insertUser({...owner,passwordHash:'enabled'} as any);
 for(const status of ['fulfilled','cancelled']) await f.act({action:'save_clause',reason:'待到期义务',clause:{...f.clause,title:`待处理 ${status}`,ownerId:owner.id,triggerDate:'2030-08-31'}});
 const users=f.store.listUsers.bind(f.store);let disabled=true;f.store.listUsers=async()=> (await users()).map(u=>u.id===owner.id?{...u,passwordHash:disabled?null:'enabled'}:u);
 await f.store.workflowTransaction(f.p.id,async s=>{for(const c of s.postInvestment!.clauses)c.triggerDate='2026-01-01';});
 await f.act({action:'reconcile'});let p=await f.read();assert.ok(p.clauses.every(c=>c.warningIssue?.code==='owner_unavailable'));
 for(const [i,status] of ['fulfilled','cancelled'].entries()) await f.act({action:'resolve_clause',recordId:p.clauses[i].id,status,reason:'有实际证据的终态处理',evidence:[f.material]});
 p=await f.read();assert.deepEqual(p.clauses.map(c=>c.status),['fulfilled','cancelled']);assert.ok(p.clauses.every(c=>c.warningIssue===undefined));
 assert.equal(f.store.listAuditEvents().filter(e=>e.action==='投后条款预警受阻').length,2);
 disabled=false;await f.act({action:'reconcile'});assert.equal(f.store.listTasks().filter(t=>t.type==='条款预警').length,0);assert.ok((await f.read()).clauses.every(c=>c.warningIssue===undefined&&c.warningTaskId===undefined));
});

test('period report captures approved version and real scoped sources; return/revise/owner review/archive retain old snapshots',async t=>{
 const f=await fixture(t);
 await f.act({action:'save_financial',reason:'本期经营',financial:f.financial});let post=await f.read();const fid=post.financials[0].id;
 await f.act({action:'submit_financial',recordId:fid});await f.act({action:'review_financial',recordId:fid,decision:'approve',opinion:'已核对'});
 await f.store.handleRisk({title:'本期风险 <script>alert(1)</script>',projectId:f.p.id,time:'2026-09-10',summary:'真实录入风险',source:'原件',result:'核对中'});
 await f.store.createCapitalRecord({projectId:f.p.id,fundId:f.p.fundId,company:f.p.name,fund:'test',received:'0.00',date:'2026-09-20',rule:'合成未收事项，其他经营指标仍保留未知',receivable:'10.00',dueDate:'2026-09-30',status:'未收',dataOrigin:'user_input'});
 const report={title:'季度报告 <img onerror=alert(1)>',period:f.financial.period,analysis:'核对经营与缺件，未知不能当零。',evidence:[f.material]};
 await f.act({action:'save_report',reason:'首版报告',report});post=await f.read();let r=post.reports[0];
 assert.equal(r.snapshot.financial.netProfit,'-0.25');assert.equal(r.snapshot.financial.employees,0);assert.equal(r.snapshot.financial.valuation,null);
 assert.ok(r.missing.some((m:any)=>m.key==='valuation'));assert.ok(r.missing.some((m:any)=>m.key==='cashEvidence'));
 assert.equal(r.snapshot.risks.length,1);assert.equal(r.snapshot.capitalRecords.length,1);
 assert.equal(JSON.stringify(post).includes('packetBlobId'),false);
 const original=structuredClone(r);
 await f.act({action:'save_report',reason:'重复期间',report},409);
 await f.act({action:'submit_report',recordId:r.id});r=(await f.read()).reports[0];
 assert.ok(r.taskIds.length>1);
 const bypass=await f.call('PATCH',`/api/tasks/${r.taskIds[0]}`,{requestId:randomUUID(),expectedRevision:1,status:'已完成',completionNote:'不能绕过审核'});assert.equal(bypass.statusCode,409);
 await f.act({action:'review_report',recordId:r.id,decision:'approve',opinion:'未确认缺件',acceptMissing:false},409);
 await f.act({action:'save_report',recordId:r.id,reason:'待审不可改',report},409);
 await f.act({action:'review_report',recordId:r.id,decision:'return',opinion:'补充分析说明',acceptMissing:false});
 const returned=structuredClone((await f.read()).reports[0]);
 await f.act({action:'save_financial',recordId:fid,reason:'经营新版尚未审批',financial:{...f.financial,netProfit:'999'}});
 await f.act({action:'save_report',recordId:r.id,reason:'按退回意见修订',report:{...report,analysis:'第二版分析'}});post=await f.read();r=post.reports[1];
 assert.deepEqual(post.reports[0],returned);assert.equal(r.version,2);assert.equal(r.snapshot.financial,null);assert.ok(r.missing.some((m:any)=>m.key==='financial'));
 assert.equal(original.snapshot.financial.netProfit,'-0.25');
 await f.act({action:'submit_report',recordId:r.id});await f.act({action:'review_report',recordId:r.id,decision:'approve',opinion:'明确保留资料缺口，作为有限资料报告。',acceptMissing:true});await f.act({action:'archive_report',recordId:r.id});
 post=await f.read();r=post.reports[1];assert.equal(r.status,'archived');
 assert.equal(f.store.listTasks().find(t=>t.id===r.taskIds[0]).status,'已完成');assert.ok(r.taskIds.slice(1).every((id:string)=>f.store.listTasks().find(t=>t.id===id).status==='已取消'));assert.equal(r.archived.actor.id,f.admin.id);
 const path=`${f.url}/reports/${r.id}/versions/2/`;
 const html=await f.call('GET',path+'html');assert.equal(html.statusCode,200,html.body);assert.match(html.headers['content-type'] as string,/text\/html/);assert.ok(!html.body.includes('<img onerror'));assert.ok(html.body.includes('&lt;img onerror'));
 const json=await f.call('GET',path+'json');assert.equal(json.statusCode,200);assert.equal(json.json().sourceHash,r.sourceHash);
 const {reportSourceHash}=await import('../src/ledger/post-report.ts');assert.equal(reportSourceHash(json.json()),r.sourceHash);
 assert.equal((await f.call('GET',path+'json',undefined,f.legal)).statusCode,403);
 assert.equal((await f.server.inject({method:'GET',url:path+'html'})).statusCode,401);
 assert.equal((await f.call('GET',`${f.url}/reports/${r.id}/versions/1/html`)).statusCode,409);
});
test('report identity, veto, non-owner review, concurrent idempotence and unknown commit retry',async t=>{
 const f=await fixture(t),manager={...f.admin,id:'unrelated-manager',email:'other@test.local',role:'investment_manager'};
 await f.store.insertUser({...manager,passwordHash:'enabled'} as any);
 const report={title:'缺件报告',period:{kind:'month',value:'2026-09'},analysis:'限制明确列项',evidence:[f.material]};
 await f.act({action:'save_report',reason:'跨项目原件',report:{...report,evidence:[await f.ref('other-project')]}},400);
 await f.act({action:'save_report',reason:'无交割',report,dealId:'not-closed'},409);
 await f.act({action:'save_report',reason:'无权限',report},403,f.viewer);
 const request={requestId:randomUUID(),expectedRevision:(await f.read()).revision,dealId:'closed',action:'save_report',reason:'幂等',report};
 const responses=await Promise.all([f.call('POST',f.url+'/actions',request),f.call('POST',f.url+'/actions',request)]);assert.deepEqual(responses.map(r=>r.statusCode),[200,200]);assert.equal(responses.filter(r=>r.json().created).length,1);
 let r=(await f.read()).reports[0];assert.equal((await f.read()).reports.length,1);
 assert.equal((await f.call('POST',f.url+'/actions',{...request,report:{...report,title:'改请求'}})).statusCode,409);
 await f.act({action:'save_report',recordId:r.id,reason:'期间不能改变',report:{...report,period:{kind:'month',value:'2026-08'}}},409);
 await f.act({action:'submit_report',recordId:r.id});
 await f.act({action:'review_report',recordId:r.id,decision:'approve',opinion:'非项目负责人',acceptMissing:true},403,manager);
 await f.act({action:'review_report',recordId:r.id,decision:'reject',opinion:'来源不满足要求',acceptMissing:false});
 await f.act({action:'review_report',recordId:r.id,decision:'approve',opinion:'不能覆盖否决',acceptMissing:true},409);
 await f.act({action:'save_report',reason:'另建也不能绕过',report},409);await f.act({action:'save_report',recordId:r.id,reason:'否决冻结',report},409);
 const original=f.store.workflowTransaction.bind(f.store);let lost=true;
 f.store.workflowTransaction=async(id,action,options)=>{const result=await original(id,action,options);if(lost&&(result as any)?.created){lost=false;throw Error('commit_ack_lost');}return result;};
 const next={...request,requestId:randomUUID(),expectedRevision:(await f.read()).revision,report:{...report,period:{kind:'month',value:'2026-08'}}};
 assert.equal((await f.call('POST',f.url+'/actions',next)).statusCode,500);
 const retry=await f.call('POST',f.url+'/actions',next);assert.equal(retry.statusCode,200,retry.body);assert.equal(retry.json().created,false);assert.equal((await f.read()).reports.length,2);
});

test('report source fingerprint survives JSONB key reordering and strips private storage IDs',async()=>{
 const {reportSourceHash,reportSourcePayload}=await import('../src/ledger/post-report.ts');
 const report:any={snapshot:{project:{name:'甲',id:'p'},nested:{z:1,a:2}},evidence:[{sha256:'source',packetBlobId:'private'}],missing:[]};
 const reordered:any={missing:[],evidence:[{packetBlobId:'private',sha256:'source'}],snapshot:{nested:{a:2,z:1},project:{id:'p',name:'甲'}}};
 assert.equal(reportSourceHash(report),reportSourceHash(reordered));assert.ok(!reportSourcePayload(report).includes('private'));
 reordered.snapshot.nested.a=3;assert.notEqual(reportSourceHash(report),reportSourceHash(reordered));
});
test('unreadable report snapshots are isolated from legacy post access, while export remains blocked',async t=>{
 const f=await fixture(t);assert.equal((await f.call('GET',f.url,undefined,f.legal)).statusCode,200);
 await f.act({action:'save_report',reason:'隔离测试',report:{title:'原件异常报告',period:{kind:'month',value:'2026-09'},analysis:'保留原功能',evidence:[f.material]}});
 assert.equal((await f.call('GET',f.url,undefined,f.legal)).statusCode,200);
 assert.deepEqual((await f.call('GET',f.url,undefined,f.legal)).json().postInvestment.reports,[]);
 const raw=await f.store.workflowTransaction(f.p.id,async s=>s.postInvestment!.reports![0]);
 await writeFile(join(f.root,raw.evidence[0].packetBlobId!),'damaged');
 const response=await f.call('GET',f.url);assert.equal(response.statusCode,200,response.body);assert.equal(response.json().postInvestment.reports[0].readIssue,'material_integrity_mismatch');
 await f.act({action:'submit_report',recordId:raw.id},409);
});
test('reports include cross-period open warnings and omit unrelated closed-batch conditions',async()=>{
 const {capturePostReport}=await import('../src/ledger/post-report.ts');
 const s:any={project:{id:'p',name:'test'},deals:[{id:'d',closing:{termsId:'t'},terms:[{id:'t',allocations:[]}]}],tasks:[],reportSources:{risks:[],capitalRecords:[]},postInvestment:{financials:[],visits:[],archives:[],clauses:[{id:'c',dataOrigin:'user_input',version:1,dealId:'d',status:'active',triggerDate:'2026-12-01',warningTaskId:'w'},{id:'other',version:1,dealId:'other',status:'active',triggerDate:'2026-12-01',warningTaskId:'w2'}]}};
 const report=capturePostReport(s,'d',{kind:'month',value:'2026-09'},'2026-10-29');assert.deepEqual(report.snapshot.clauses.map(c=>c.id),['c']);
});
test('a broken first report file cannot short-circuit authorization of later sources',async t=>{
 const f=await fixture(t);
 const uploaded=await f.server.inject({method:'POST',url:'/api/materials/upload?'+new URLSearchParams({requestId:randomUUID(),name:'second-report-source.txt',type:'投后资料',projectId:f.p.id}),payload:Buffer.from('second actual source'),headers:{cookie:await registeredCookie(f.server,f.admin as any,secret),'content-type':'application/octet-stream'}});
 assert.equal(uploaded.statusCode,201,uploaded.body);const second={materialId:uploaded.json().material.id,versionId:uploaded.json().version.id};
 await f.act({action:'save_report',reason:'多来源授权',report:{title:'多来源报告',period:{kind:'month',value:'2026-09'},analysis:'逐个授权',evidence:[f.material,second]}});
 const raw=await f.store.workflowTransaction(f.p.id,async s=>s.postInvestment!.reports![0]);
 await writeFile(join(f.root,raw.evidence[0].packetBlobId!),'damaged');
 await f.store.setMaterialProjects(second.materialId,['other-project'],f.admin);
 const response=await f.call('GET',f.url);assert.equal(response.statusCode,200,response.body);assert.deepEqual(response.json().postInvestment.reports,[]);
});

test('exit preparation has closed gate, exact money/portion, missing-data blocking, owner return/revise/archive without exiting holdings',async t=>{
 const f=await fixture(t),start=await f.store.getProjectDetail(f.p.id),capitalBefore=structuredClone(await f.store.listCapitalRecords());
 const exit={title:'回购准备',exitType:'repurchase',scope:'partial',portion:'25',expectedDate:'2026-12-31',consideration:null,priceReason:'谈判中未定价',pricingBasis:'按谈判原件核对拟定价格',currency:'CNY',counterparty:'合成回购方',strategy:'先批准方案，再单独核对签署、交割及分笔回款。',documents:[{kind:'plan',location:'合并材料第1页',material:f.material}]};
 await f.act({action:'save_exit',reason:'未交割不能退出',exit,dealId:'missing'},409);await f.act({action:'save_exit',reason:'越权',exit},403,f.viewer);
 for(const change of [{portion:'101'},{scope:'full',portion:'25'},{scope:'partial',portion:'100'},{portion:'0'},{consideration:'-1'},{consideration:1},{expectedDate:'2026-09-01'},{exitType:'unsupported'}])await f.act({action:'save_exit',reason:'边界',exit:{...exit,...change}},400);
 await f.act({action:'save_exit',reason:'真实未知价格',exit});let p=await f.read(),v=p.exitPreparations[0];assert.equal(v.consideration,null);
 await f.act({action:'submit_exit',recordId:v.id},409);await f.act({action:'save_exit',reason:'不能另建绕过',exit},409);
 const full={...exit,consideration:'0',priceReason:'',pricingBasis:'清算损失全额减值，拟定对价为真实零，后续不能虚构收款。',documents:['plan','negotiation','agreement'].map((kind,i)=>({kind,location:`合并材料第${i+1}页`,material:f.material}))};
 await f.act({action:'save_exit',recordId:v.id,reason:'明确零对价并补件',exit:full});p=await f.read();v=p.exitPreparations[1];assert.equal(v.consideration,'0.00');assert.equal(v.portion,'25.0000');assert.deepEqual(v.investment.allocations,[{fundId:f.p.fundId,amount:'100.00'}]);
 await f.act({action:'submit_exit',recordId:v.id});v=(await f.read()).exitPreparations[1];
 assert.equal((await f.call('PATCH',`/api/tasks/${v.reviewerTaskId}`,{requestId:randomUUID(),expectedRevision:1,status:'已完成',completionNote:'不能旁路'})).statusCode,409);
 await f.act({action:'save_exit',recordId:v.id,reason:'待审不可改',exit:full},409);await f.act({action:'review_exit',recordId:v.id,decision:'return',opinion:'补充风险策略'});
 const old=structuredClone((await f.read()).exitPreparations[1]);await f.act({action:'save_exit',recordId:v.id,reason:'依退回意见改版',exit:{...full,strategy:'已补风险策略与退出材料，后续回款单独确认。'}});
 await f.act({action:'submit_exit',recordId:v.id});await f.act({action:'review_exit',recordId:v.id,decision:'approve',opinion:'负责人本人独立核对通过'});await f.act({action:'archive_exit',recordId:v.id});
 p=await f.read();v=p.exitPreparations[2];assert.deepEqual(p.exitPreparations[1],old);assert.equal(v.status,'archived');assert.equal(v.decisions[0].actor.id,f.admin.id);
 const after=await f.store.getProjectDetail(f.p.id);assert.equal(after.project.stage,start.project.stage);assert.equal(after.project.status,start.project.status);assert.deepEqual(await f.store.listCapitalRecords(),capitalBefore);
 const json=await f.call('GET',`${f.url}/exit-preparations/${v.id}/versions/${v.version}/json`);assert.equal(json.statusCode,200,json.body);assert.equal(json.json().currency,'CNY');assert.equal(json.json().investment.terms.share,'10.0000');assert.equal(json.json().investment.terms.amount,'100.00');assert.ok(!json.body.includes('packetBlobId'));
 assert.equal((await f.call('GET',v.documents[0].material.downloadHref)).statusCode,200);assert.equal((await f.call('GET',`${f.url}/exit-preparations/${v.id}/versions/1/json`)).statusCode,409);
});
test('exit preparation veto, scoped retry/concurrency, full source authorization and rollback preserve all records',async t=>{
 const f=await fixture(t),manager={...f.admin,id:'exit-manager',email:'exit-manager@test.local',role:'investment_manager'};await f.store.insertUser({...manager,passwordHash:'enabled'} as any);
 const exit={title:'股权转让退出准备',exitType:'equity_transfer',scope:'full',portion:'100',expectedDate:'2026-12-31',consideration:'150.25',priceReason:'',pricingBasis:'真实材料拟定对价（非回款）',currency:'CNY',counterparty:'合成受让方',strategy:'核对先决条件及资金风险。',documents:['plan','negotiation','agreement'].map((kind,i)=>({kind,location:`合并材料${i+1}页`,material:f.material}))};
 const beforeFiles=await readdir(f.root);await f.act({action:'save_exit',reason:'跨项目材料',exit:{...exit,documents:[exit.documents[0],{...exit.documents[1],material:await f.ref('other-project')}]}},400);assert.deepEqual((await f.read()).exitPreparations??[],[]);assert.equal((await readdir(f.root)).length,beforeFiles.length+1);
 const b={requestId:randomUUID(),expectedRevision:(await f.read()).revision,dealId:'closed',action:'save_exit',reason:'并发重试',exit};const results=await Promise.all([f.call('POST',f.url+'/actions',b),f.call('POST',f.url+'/actions',b)]);assert.deepEqual(results.map(v=>v.statusCode),[200,200]);assert.equal(results.filter(v=>v.json().created).length,1);
 assert.equal((await f.call('POST',f.url+'/actions',{...b,exit:{...exit,title:'修改同请求'}})).statusCode,409);const p=await f.read(),v=p.exitPreparations[0];await f.act({action:'submit_exit',recordId:v.id});
 await f.act({action:'review_exit',recordId:v.id,decision:'approve',opinion:'非本人项目'},403,manager);await f.act({action:'review_exit',recordId:v.id,decision:'reject',opinion:'否决方案'});await f.act({action:'save_exit',recordId:v.id,reason:'不可改否决',exit},409);await f.act({action:'save_exit',reason:'不可另建绕过',exit},409);await f.act({action:'review_exit',recordId:v.id,decision:'approve',opinion:'不能覆盖'},409);
});

test('exit dates compare the actual Shanghai closing day while historical date-only closings stay valid',async t=>{
 const f=await fixture(t);await f.store.workflowTransaction(f.p.id,async s=>{s.deals![0].closing!.time='2026-10-28T16:30:00Z';});
 const exit={title:'上海日期边界',exitType:'ipo',scope:'full',portion:'100',expectedDate:'2026-10-28',consideration:null,priceReason:'未定价',pricingBasis:'根据原件核对',currency:'CNY',counterparty:'待上市安排',strategy:'拟定方案不执行退出',documents:[]};
 await f.act({action:'save_exit',reason:'上海交割前一日',exit},400);await f.act({action:'save_exit',reason:'上海交割当日',exit:{...exit,expectedDate:'2026-10-29'}});
 const plan=(await f.read()).exitPreparations[0];assert.equal(plan.investment.terms.share,'10.0000');
 await f.store.workflowTransaction(f.p.id,async s=>{s.deals![0].terms[0].share='99.0000';});assert.equal((await f.read()).exitPreparations[0].investment.terms.share,'10.0000');
});

test('explicit engineering version evidence cannot enter approved financial captures or new post records as confirmed business sources',async t=>{
 const f=await fixture(t),versions=f.store.listMaterialVersions;f.store.listMaterialVersions=(id:string)=>versions(id).map(v=>({...v,dataPurpose:v.id===f.material.versionId?'engineering_fixture':v.dataPurpose}));
 const {confirmedSource}=await import('../src/ledger/source-policy.ts');
 await f.act({action:'save_financial',reason:'明确选择工程版本',financial:f.financial});let record=(await f.read()).financials[0];assert.equal(record.dataOrigin,'user_input');assert.equal(confirmedSource(record),false);assert.ok(record.sourceBasis.some((v:any)=>v.recordType==='material_version'&&v.projectId===''&&v.id===f.material.versionId&&v.dataPurpose==='engineering_fixture'));
 await f.act({action:'submit_financial',recordId:record.id});await f.act({action:'review_financial',recordId:record.id,decision:'approve',opinion:'历史仍可核查'});
 await f.act({action:'save_visit',reason:'明确工程证据',visit:{date:'2026-09-20',ownerId:f.admin.id,analysis:'保留历史',evidence:[f.material],followUps:[]}});
 await f.act({action:'archive',period:f.financial.period,category:'工程凭证',note:'保留历史',materials:[f.material]});
 await f.act({action:'save_clause',reason:'签章工程版本',clause:f.clause});
 await f.act({action:'save_report',reason:'不得洗入',report:{title:'证据依赖核验',period:f.financial.period,analysis:'保留证据边界',evidence:[f.material]}});
 const post=await f.read();for(const row of [post.financials[0],post.visits[0],post.archives[0],post.clauses[0],post.reports[0]])assert.equal(confirmedSource(row),false);
 assert.equal(post.reports[0].snapshot.financial,null);assert.deepEqual(post.reports[0].snapshot.visits,[]);assert.deepEqual(post.reports[0].snapshot.archives,[]);
 const hidden=await f.call('GET',f.url+'?includeDemo=false');assert.equal(hidden.statusCode,200,hidden.body);for(const key of ['financials','visits','archives','clauses','reports'])assert.equal(hidden.json().postInvestment[key].length,0);
 assert.equal((await f.call('GET',post.financials[0].evidence[0].downloadHref)).statusCode,200);
 const {reportSourceHash}=await import('../src/ledger/post-report.ts');assert.equal(reportSourceHash(post.reports[0]),post.reports[0].sourceHash);
});

test('archived report and exit JSON preserve original bytes and stored provenance while ordinary lists retain purpose overlays',async t=>{
 const f=await fixture(t,true),version=f.store.listMaterialVersions(f.material.materialId)[0];
 const proof={...f.material,name:version.name,sha256:version.sha256,sizeBytes:version.sizeBytes,packetBlobId:version.blobId,downloadHref:'/original-sealed'};
 const report:any={id:'sealed-report',version:2,dealId:'closed',title:'历史封存报告',dataOrigin:'system_generated',period:{kind:'month',value:'2026-09'},analysis:'原封存内容',status:'archived',reviewer:f.admin,owner:f.admin,time:'2026-10-01',reason:'封存',evidence:[proof],snapshot:{project:{id:f.p.id,name:f.p.name},capturedAt:'2026-10-01',financial:null,visits:[],archives:[],clauses:[],risks:[],capitalRecords:[],fundIds:[f.p.fundId]},missing:[],taskIds:[],decisions:[],archived:{actor:f.admin,time:'2026-10-01'}};
 const {reportSourceHash}=await import('../src/ledger/post-report.ts');report.sourceHash=reportSourceHash(report);
 const plan:any={id:'sealed-exit',version:3,dealId:'closed',title:'历史封存退出',dataOrigin:'user_input',status:'archived',documents:[{kind:'plan',location:'已封存原件',material:proof}],investment:{termsId:'sealed-terms',terms:{id:'sealed-terms',dataOrigin:'user_input',dataPurpose:'unknown',sourceBasis:[{id:'original',dataOrigin:'source_file',dataPurpose:'unknown'}],allocations:[{fundId:f.p.fundId,amount:'10.00'}]},allocations:[{fundId:f.p.fundId,amount:'10.00'}]}};
 const publicBytes=(value:any)=>JSON.stringify(JSON.parse(JSON.stringify(value,(key,val)=>key==='packetBlobId'?undefined:val)),null,2),hash=(value:string)=>createHash('sha256').update(value).digest('hex');
 const expectedReport=hash(publicBytes(report)),expectedPlan=hash(publicBytes(plan));
 await f.store.workflowTransaction(f.p.id,async s=>{s.postInvestment={...emptyPostInvestment(),reports:[structuredClone(report)],exitPreparations:[structuredClone(plan)]};});
 const listed=await f.read();assert.equal(listed.reports[0].dataPurpose,'engineering_fixture');assert.equal(listed.exitPreparations[0].dataPurpose,'engineering_fixture');assert.equal(listed.exitPreparations[0].investment.terms.dataPurpose,'engineering_fixture');assert.equal(Object.hasOwn(listed.exitPreparations[0].documents[0].material,'currentVersionPurpose'),false);
 const reportPath=`${f.url}/reports/sealed-report/versions/2/json`,planPath=`${f.url}/exit-preparations/sealed-exit/versions/3/json`;
 for(const [path,expected]of [[reportPath,expectedReport],[planPath,expectedPlan]]){const downloaded=await f.call('GET',path);assert.equal(downloaded.statusCode,200,downloaded.body);assert.equal(hash(downloaded.body),expected);}
 await f.act({action:'save_visit',reason:'同项目新增记录',visit:{date:'2026-09-20',ownerId:f.admin.id,analysis:'不改旧封存',evidence:[f.material],followUps:[]}});
 for(const [path,expected]of [[reportPath,expectedReport],[planPath,expectedPlan]]){const downloaded=await f.call('GET',path);assert.equal(downloaded.statusCode,200,downloaded.body);assert.equal(hash(downloaded.body),expected);}
 const saved=await f.store.readPostInvestmentArchive(f.p.id,'exit_preparation','sealed-exit','3');assert.deepEqual(saved,plan);assert.equal((saved as any).investment.terms.sourceBasis[0].dataPurpose,'unknown');
});

 test('fund clause summary returns latest linked project clauses without exposing inaccessible funds',async t=>{
 const f=await fixture(t);await f.act({action:'save_clause',reason:'登记真实履约约定',clause:{...f.clause,triggerDate:'2030-08-31'}});const first=(await f.read()).clauses[0];await f.act({action:'save_clause',recordId:first.id,reason:'更新约定',clause:{...f.clause,title:'修订后的项目条款',triggerDate:'2031-08-31'}});
 const path=`/api/funds/${f.p.fundId}/project-clauses`;const r=await f.call('GET',path);assert.equal(r.statusCode,200,r.body);const rows=r.json().clauses.filter((c:any)=>c.id===first.id);assert.equal(rows.length,1);assert.equal(rows[0].title,'修订后的项目条款');assert.equal(rows[0].project.id,f.p.id);assert.deepEqual(Object.keys(rows[0]).sort(),['id','project','status','title','trigger']);
 await f.store.accessTransaction(s=>{s.data.funds[f.p.fundId]={visibility:'members',memberIds:[],revision:2};});const hidden=await f.call('GET',path,undefined,f.viewer);assert.equal(hidden.statusCode,403,hidden.body);assert.equal((await f.call('GET',path+'?includeDemo=invalid')).statusCode,400);
 });

test('archived post report projects structured content before ZIP generation while source downloads stay private',async t=>{
 const f=await fixture(t);
 await f.store.lpTransaction(s=>{s.investors.push({...s.investors[0],id:'post-short-lp-a',name:'A'},{...s.investors[0],id:'post-short-lp-b',name:'B'});});
 await f.act({action:'save_report',reason:'导出权限反证',report:{title:'期间审核报告',period:{kind:'month',value:'2026-09'},analysis:'已核验分析，缺口明确保留。',evidence:[f.material]}});
 const r=(await f.read()).reports[0],path=`${f.url}/reports/${r.id}/versions/1/docx`;
 assert.equal((await f.call('GET',path,undefined,f.viewer)).statusCode,409);
 await f.act({action:'submit_report',recordId:r.id});await f.act({action:'review_report',recordId:r.id,decision:'approve',opinion:'保留资料限制并通过内容审核',acceptMissing:true});await f.act({action:'archive_report',recordId:r.id});
 const allowed=await f.call('GET',path,undefined,f.viewer);assert.equal(allowed.statusCode,200,allowed.headers['content-type']?.includes('json')?allowed.body:'binary incorrectly denied');assert.equal(allowed.rawPayload.subarray(0,2).toString(),'PK');
 await f.store.accessTransaction(s=>{s.data.projects[f.p.id]={visibility:'members',memberIds:[f.admin.id],revision:1};});
 assert.equal((await f.call('GET',path,undefined,f.viewer)).statusCode,403);
});

test('archived report HTML and JSON project the full structure with a truthful hash notice and retain access boundaries',async t=>{
 const f=await fixture(t),privateName='QA隐私LP仅投影测试';await f.store.lpTransaction(s=>{s.investors.push({...s.investors[0],id:'post-view-private-lp',name:privateName});});
 await f.act({action:'save_report',reason:'跨格式隐私反证',report:{title:'周期跨格式报告',period:{kind:'month',value:'2026-09'},analysis:'项目分析提及'+privateName+'，授权不足时须脱敏。',evidence:[f.material]}});const r=(await f.read()).reports[0];await f.act({action:'submit_report',recordId:r.id});await f.act({action:'review_report',recordId:r.id,decision:'approve',opinion:'核对已知限制',acceptMissing:true});await f.act({action:'archive_report',recordId:r.id});const before=(await f.read()).reports;
 for(const format of ['html','json']){const path=`${f.url}/reports/${r.id}/versions/1/${format}`,admin=await f.call('GET',path);assert.equal(admin.statusCode,200,admin.body);assert.ok(admin.body.includes(privateName));assert.ok(!admin.body.includes('projectionNotice'));assert.ok(!admin.body.includes('已脱敏视图'));const viewer=await f.call('GET',path,undefined,f.viewer);assert.equal(viewer.statusCode,200,viewer.body);assert.ok(!viewer.body.includes(privateName));assert.ok(viewer.body.includes('已脱敏视图'));assert.ok(viewer.body.includes('sourceHash属于原归档快照'));if(format==='json')assert.equal(viewer.json().sourceHash,r.sourceHash);assert.equal(viewer.headers['cache-control'],'private, no-store');assert.equal(viewer.headers['x-content-type-options'],'nosniff');}
 assert.deepEqual((await f.read()).reports,before);await f.store.accessTransaction(s=>{s.data.projects[f.p.id]={visibility:'members',memberIds:[f.admin.id],revision:1};});for(const format of ['html','json'])assert.equal((await f.call('GET',`${f.url}/reports/${r.id}/versions/1/${format}`,undefined,f.viewer)).statusCode,403);
});
