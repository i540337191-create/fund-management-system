import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {createTestServer as createServer,registeredCookie} from './auth-fixture.ts';
import { createMemoryLedgerStore } from '../src/ledger/store.ts';
const secret = 'workflow-test';
async function fixture(t: import('node:test').TestContext) {
    const root = await mkdtemp(join(tmpdir(), 'workflow-'));
    const store = createMemoryLedgerStore();
    const server = createServer({
        ledgerStore: store, materialStorageRoot: root, auth: {
            mode: 'password', sessionSecret: secret
        }
    });
    t.after(() => server.close());
    const admin = {
        id: 'user-admin', name: '管理员', email: 'admin@example.local', role: 'admin' as const
    };
    const cookie = await registeredCookie(server,admin,secret);
    const call = async(method: any, url: string, payload?: any, c: string|Promise<string> = cookie) => server.inject({
        method, url, payload, headers: {
            cookie: await c
        }
    });
    const users = [];
    for (const name of ['owner', 'reviewer', 'other']) {
        const r = await call('POST', '/api/users', {
            name, email: `${name}@example.local`, role: 'investment_manager', password: 'long-test-password'
        });
        assert.equal(r.statusCode, 201, r.body);
        users.push(r.json().user);
    }
    const project = (await call('POST', '/api/projects', {
        requestId: randomUUID(), name: '流程项目', shortName: '流程', industry: '制造', fundId: 'fundapp-growth-i', manager: 'owner', collaborators: '', sourceChannel: '', description: ''
    })).json().project;
    assert.equal(project.ownerId, null);
    const binding = await call('PUT', `/api/projects/${project.id}/owner`, { ownerId: users[0].id });
    assert.equal(binding.statusCode, 200, binding.body);
    Object.assign(project, binding.json().project);
    const upload = await server.inject({
        method: 'POST', url: '/api/materials/upload?' + new URLSearchParams({
            requestId: randomUUID(), name: '材料.pdf', type: '法务资料', projectId: project.id
        }), payload: Buffer.from('%PDF-1.7\noriginal'), headers: {
            cookie, 'content-type': 'application/octet-stream'
        }
    });
    assert.equal(upload.statusCode, 201, upload.body);
    const m = upload.json();
    const as = (u: any) => registeredCookie(server,u,secret);
    const submit = (patch = {}) => call('POST', `/api/projects/${project.id}/approvals`, {
        requestId: randomUUID(), meetingType: '立项会', reviewerIds: [users[1].id], materialIds: [m.material.id], dueDate: '2026-11-01', note: '提交', ...patch
    });
    const vote = (round: any, u: any, decision = 'approve', patch = {}) => call('POST', `/api/projects/${project.id}/approvals/${round.id}/decisions`, {
        requestId: randomUUID(), expectedRevision: round.revision, decision, opinion: '已核验', ...patch
    }, as(u));
    return {
        root, store, server, call, users, project, m, as, submit, vote
    };
}
test('real users login with stable signed name; directory excludes hashes and rejects spoofed roles', async (t) => {
    const f = await fixture(t);
    const r = await f.server.inject({
        method: 'POST', url: '/api/session/login', payload: {
            email: f.users[0].email, password: 'long-test-password'
        }
    });
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().user.id, f.users[0].id);
    const me = await f.server.inject({
        url: '/api/session/me', headers: {
            cookie: String(r.headers['set-cookie'])
        }
    });
    assert.equal(me.json().user.name, 'owner');
    assert.ok(!JSON.stringify((await f.call('GET', '/api/users')).json()).includes('password'));
    assert.equal((await f.call('POST', '/api/users', {
        name: 'bad', email: 'bad@example.local', role: 'admin', password: 'short'
    })).statusCode, 400);
    assert.equal((await f.call('POST', '/api/users', {
        name: 'bad', email: 'bad@example.local', role: 'admin', password: 'long-test-password'
    }, f.as(f.users[0]))).statusCode, 403);
});
test('sequence, reviewer and owner authorization, immutable material package and permanent veto', async (t) => {
    const f = await fixture(t);
    assert.equal((await f.submit({
        meetingType: '总办会'
    })).statusCode, 409);
    const first = await f.submit();
    assert.equal(first.statusCode, 201, first.body);
    const r = first.json().round;
    assert.equal(r.materials[0].versionId, f.m.version.id);
    assert.equal((await f.vote(r, f.users[2])).statusCode, 403);
    const closed = await f.vote(r, f.users[1], 'reject');
    assert.equal(closed.json().round.status, 'rejected');
    assert.equal((await f.vote(r, f.users[0])).statusCode, 409);
    assert.equal((await f.submit()).statusCode, 409);
    assert.equal((await f.call('PUT', `/api/projects/${f.project.id}/owner`, {
        ownerId: f.users[2].id
    })).statusCode, 200);
    assert.equal((await f.call('GET', `/api/projects/${f.project.id}/approvals`)).json().rounds[0].ownerId, f.users[0].id);
});
test('return creates one supplement, gates resubmission and preserves prior signatures', async (t) => {
    const f = await fixture(t);
    const r = (await f.submit()).json().round;
    assert.equal((await f.call('PUT', `/api/projects/${f.project.id}/owner`, {
        ownerId: f.users[2].id
    })).statusCode, 409);
    const input = {
        requestId: randomUUID(), expectedRevision: r.revision, decision: 'return', opinion: '请补件'
    };
    const url = `/api/projects/${f.project.id}/approvals/${r.id}/decisions`;
    const result = await f.call('POST', url, input, f.as(f.users[1]));
    assert.equal(result.statusCode, 200, result.body);
    const retry = await f.call('POST', url, input, f.as(f.users[1]));
    assert.equal(retry.json().created, false);
    assert.equal((await f.submit()).statusCode, 409);
    const task = result.json().tasks.find((t: any) => t.kind === 'supplement');
    const patch = {
        requestId: randomUUID(), expectedRevision: 1, status: '已完成', completionNote: '已补齐材料'
    };
    assert.equal((await f.call('PATCH', `/api/tasks/${task.id}`, patch)).statusCode, 200);
    const next = (await f.submit()).json().round;
    assert.equal(next.attempt, 2);
    const own = await f.vote(next, f.users[0]);
    assert.equal(own.json().round.status, 'approved');
    assert.equal(own.json().project.stage, '立项');
    const listing = (await f.call('GET', `/api/projects/${f.project.id}/approvals`)).json();
    assert.equal(listing.nextMeetingType, '总办会');
    assert.equal(listing.rounds[0].decisions[0].opinion, '请补件');
});
test('concurrent votes serialize, retry exact result, no lost veto; failed material integrity is atomic', async (t) => {
    const f = await fixture(t);
    const r = (await f.submit()).json().round;
    const results = await Promise.all([f.vote(r, f.users[1], 'reject'), f.vote(r, f.users[0])]);
    assert.deepEqual(results.map(r => r.statusCode).sort(), [200, 409]);
    const rounds = (await f.call('GET', `/api/projects/${f.project.id}/approvals`)).json().rounds;
    assert.equal(rounds[0].decisions.length, 1);
    const second = await fixture(t);
    await writeFile(join(second.root, second.m.version.id), 'corrupted');
    const before = JSON.stringify([second.store.listTasks(), second.store.listAuditEvents()]);
    assert.equal((await second.submit()).statusCode, 409);
    assert.equal(JSON.stringify([second.store.listTasks(), second.store.listAuditEvents()]), before);
    assert.equal((await second.store.readApprovals(second.project.id)).length, 0);
});
test('task strict whitelist, actor, optimistic revision, completion/reopen and review task protection', async (t) => {
    const f = await fixture(t);
    const base = {
        requestId: randomUUID(), projectId: f.project.id, name: '手工任务', type: '跟进', stage: '初筛', ownerId: f.users[0].id, dueDate: '2026-11-01', priority: '中', relation: '', note: ''
    };
    assert.equal((await f.call('POST', '/api/tasks', {
        ...base, actor: 'spoof'
    })).statusCode, 400);
    const created = await f.call('POST', '/api/tasks', base);
    assert.equal(created.json().auditEvent.actor, '管理员');
    assert.equal((await f.call('POST', '/api/tasks', base)).json().created, false);
    assert.equal((await f.call('POST', '/api/tasks', {
        ...base, name: 'changed'
    })).statusCode, 409);
    const task = created.json().task;
    const patch = (extra: any) => f.call('PATCH', `/api/tasks/${task.id}`, {
        requestId: randomUUID(), expectedRevision: 1, ...extra
    });
    assert.equal((await patch({
        status: '已完成'
    })).statusCode, 400);
    assert.equal((await patch({
        projectId: 'other'
    })).statusCode, 400);
    const done = await patch({
        status: '已完成', completionNote: '有记录'
    });
    assert.equal(done.json().task.status, '已完成');
    assert.equal((await patch({
        status: '进行中', completionNote: '重开'
    })).statusCode, 409);
    assert.equal((await f.call('PATCH', `/api/tasks/${task.id}`, {
        requestId: randomUUID(), expectedRevision: 2, status: '进行中', completionNote: '重新核验'
    })).statusCode, 200);
    assert.equal((await f.call('PATCH', `/api/tasks/${task.id}`, { requestId: randomUUID(), expectedRevision: 3, status: '已取消', completionNote: '已确认无需继续' })).statusCode, 200);
    const round = (await f.submit()).json();
    const review = round.tasks[0];
    assert.equal((await f.call('PATCH', `/api/tasks/${review.id}`, {
        requestId: randomUUID(), expectedRevision: 1, status: '已完成', completionNote: 'skip'
    })).statusCode, 409);
});
test('all selected reviewers must sign; later upload keeps old packet and complete sequence avoids DD assumptions', async (t) => {
    const f = await fixture(t);
    const submitted = await f.submit({ reviewerIds: [f.users[1].id, f.users[2].id] });
    const r = submitted.json().round;
    const upload = await f.server.inject({ method: 'POST', url: '/api/materials/upload?' + new URLSearchParams({ requestId: randomUUID(), materialId: f.m.material.id, expectedVersion: '1', name: '材料.pdf', type: '法务资料', projectId: f.project.id }), payload: Buffer.from('%PDF-1.7\nsecond version'), headers: { cookie: await registeredCookie(f.server,{ id: 'user-admin', name: '管理员', email: 'admin@example.local', role: 'admin' },secret), 'content-type': 'application/octet-stream' } });
    assert.equal(upload.statusCode, 201, upload.body);
    const intermediate = await f.vote(r, f.users[1]);
    assert.equal(intermediate.json().round.status, 'pending');
    assert.equal(intermediate.json().round.revision, 2);
    assert.equal(intermediate.json().round.materials[0].versionId, f.m.version.id);
    const done = await f.vote(intermediate.json().round, f.users[2]);
    assert.equal(done.json().round.status, 'approved');
    assert.equal(done.json().project.stage, '立项');
    const gm = (await f.submit({ meetingType: '总办会' })).json().round;
    const gmDone = await f.vote(gm, f.users[0]);
    assert.equal(gmDone.json().project.stage, '立项');
    assert.equal(gmDone.json().tasks[0].status, '已取消');
    const ic = (await f.submit({ meetingType: '投委会' })).json().round;
    assert.equal((await f.vote(ic, f.users[0])).json().project.stage, '投决');
});
test('request identity is bound to target project and invalid dates are 400 without writes', async (t) => {
    const f = await fixture(t);
    const id = randomUUID();
    const base = { requestId: id, meetingType: '立项会', reviewerIds: [f.users[1].id], materialIds: [f.m.material.id], dueDate: '2026-11-01', note: '提交' };
    const url = `/api/projects/${f.project.id}/approvals`;
    const first = await f.call('POST', url, base);
    assert.equal(first.statusCode, 201, first.body);
    assert.equal((await f.call('POST', url, base)).json().created, false);
    const other = f.store.listProjects().find(p => p.id !== f.project.id)!;
    assert.equal((await f.call('POST', `/api/projects/${other.id}/approvals`, base)).statusCode, 409);
    assert.equal((await f.submit({ dueDate: '2026-99-99' })).statusCode, 400);
    assert.equal((await f.submit({ dueDate: '2026-02-30' })).statusCode, 400);
});
test('same-name projects keep task audit histories separate by project and task IDs', async (t) => {
    const f = await fixture(t);
    const secondResult = await f.call('POST', '/api/projects', { requestId: randomUUID(), name: f.project.name, shortName: f.project.shortName, industry: '制造', fundId: 'fundapp-growth-i', manager: 'owner', collaborators: '', sourceChannel: '', description: '' });
    assert.equal(secondResult.statusCode, 201, secondResult.body);
    const second = secondResult.json().project;
    const taskInput = { name: '同名核验任务', type: '跟进', stage: '初筛', ownerId: f.users[0].id, dueDate: '2026-11-01', priority: '中', relation: '', note: '' };
    const firstTask = (await f.call('POST', '/api/tasks', { ...taskInput, requestId: randomUUID(), projectId: f.project.id })).json();
    const secondTask = (await f.call('POST', '/api/tasks', { ...taskInput, requestId: randomUUID(), projectId: second.id })).json();
    assert.equal(firstTask.auditEvent.targetType, '任务');
    assert.equal(firstTask.auditEvent.targetId, firstTask.task.id);
    assert.equal(JSON.parse(firstTask.auditEvent.detail).projectId, f.project.id);
    for (const [projectId, own, other] of [[f.project.id, firstTask, secondTask], [second.id, secondTask, firstTask]]) {
        const detail = (await f.call('GET', `/api/projects/${projectId}`)).json();
        assert.ok(detail.auditEvents.some((e: any) => e.id === own.auditEvent.id));
        assert.ok(!detail.auditEvents.some((e: any) => e.id === other.auditEvent.id));
        assert.ok(!detail.auditEvents.some((e: any) => e.targetId === other.task.projectId));
        const filtered = (await f.call('GET', `/api/audit-events?projectId=${projectId}`)).json().auditEvents;
        assert.ok(filtered.some((e: any) => e.id === own.auditEvent.id));
        assert.ok(!filtered.some((e: any) => e.id === other.auditEvent.id));
    }
});
test('logout revokes its registered session without a delayed response clearing a newer browser cookie', async (t) => {
    const f = await fixture(t);
    assert.equal((await f.server.inject({ method: 'POST', url: '/api/session/logout' })).statusCode, 401);
    const loggedOut = await f.call('POST', '/api/session/logout');
    assert.equal(loggedOut.statusCode, 200);
    assert.deepEqual(loggedOut.json(), { ok: true });
    assert.equal(loggedOut.headers['set-cookie'],undefined);
    assert.equal((await f.call('GET','/api/session/me')).statusCode,401);
    const secure = createServer({ auth: { mode: 'password', sessionSecret: secret, sessionCookieSecure: true } });
    t.after(() => secure.close());
    const secureCookie=await registeredCookie(secure,{id:'user-admin',name:'管理员',email:'admin@example.local',role:'admin'},secret);
    const result=await secure.inject({method:'POST',url:'/api/session/logout',headers:{cookie:secureCookie}});
    assert.equal(result.headers['set-cookie'],undefined);
    assert.equal((await secure.inject({url:'/api/session/me',headers:{cookie:secureCookie}})).statusCode,401);
});
test('supplement cannot cancel and becomes immutable once a later attempt consumes completion', async (t) => {
    const f = await fixture(t);
    const round = (await f.submit()).json().round;
    const returned = await f.vote(round, f.users[1], 'return');
    const task = returned.json().tasks.find((task: any) => task.kind === 'supplement');
    const patch = (revision: number, extra: any) => f.call('PATCH', `/api/tasks/${task.id}`, { requestId: randomUUID(), expectedRevision: revision, ...extra });
    const cancel = await patch(1, { status: '已取消', completionNote: '取消补件' });
    assert.equal(cancel.statusCode, 409);
    assert.equal(cancel.json().error, 'supplement_cannot_cancel');
    const done = await patch(1, { status: '已完成', completionNote: '已补齐' });
    assert.equal(done.statusCode, 200, done.body);
    assert.equal((await f.submit()).statusCode, 201);
    const reopen = await patch(2, { status: '进行中', completionNote: '重开旧补件' });
    assert.equal(reopen.statusCode, 409);
    assert.equal(reopen.json().error, 'supplement_consumed_by_resubmission');
    assert.equal((await patch(2, { note: '改写旧补件' })).statusCode, 409);
    const persisted = (await f.call('GET', `/api/tasks?projectId=${f.project.id}`)).json().tasks.find((t: any) => t.id === task.id);
    assert.equal(persisted.status, '已完成');
    assert.equal(persisted.revision, 2);
});
test('duplicate user display names cannot implicitly grant project ownership; exact ID assignment can', async (t) => {
    const f = await fixture(t);
    const duplicate = await f.call('POST', '/api/users', { name: 'owner', email: 'owner-duplicate@example.local', role: 'investment_manager', password: 'long-test-password' });
    assert.equal(duplicate.statusCode, 201);
    const p = (await f.call('POST', '/api/projects', { requestId: randomUUID(), name: '同名负责人项目', shortName: '同名负责人', industry: '制造', fundId: 'fundapp-growth-i', manager: 'owner', collaborators: '', sourceChannel: '', description: '' })).json().project;
    assert.equal(p.ownerId, null);
    const attempt = await f.call('POST', `/api/projects/${p.id}/approvals`, { requestId: randomUUID(), meetingType: '立项会', reviewerIds: [f.users[1].id], materialIds: [f.m.material.id], dueDate: '2026-11-01', note: '' }, f.as(duplicate.json().user));
    assert.equal(attempt.statusCode, 409);
    assert.equal(attempt.json().error, 'project_owner_required');
    const assigned = await f.call('PUT', `/api/projects/${p.id}/owner`, { ownerId: duplicate.json().user.id });
    assert.equal(assigned.statusCode, 200);
    assert.equal(assigned.json().project.ownerId, duplicate.json().user.id);
    assert.notEqual(assigned.json().project.ownerId, f.users[0].id);
});
test('legacy meeting confirmation and intake archival cannot overwrite completed/reassigned tasks', async (t) => {
    const f = await fixture(t);
    const meeting = f.store.listMeetings().find(meeting => meeting.todoItems.length)!;
    const first = await f.call('POST', `/api/meetings/${meeting.id}/confirm`);
    assert.equal(first.statusCode, 200, first.body);
    const task = first.json().tasks[0];
    assert.ok(task);
    const finish = await f.call('PATCH', `/api/tasks/${task.id}`, { requestId: randomUUID(), expectedRevision: 1, ownerId: f.users[0].id, status: '已完成', completionNote: '已核验' });
    assert.equal(finish.statusCode, 200, finish.body);
    const retry = await f.call('POST', `/api/meetings/${meeting.id}/confirm`);
    assert.equal(retry.statusCode, 200, retry.body);
    const retained = retry.json().tasks.find((task: any) => task.id === finish.json().task.id);
    assert.deepEqual(retained, finish.json().task);
    assert.deepEqual(retry.json().auditEvents, []);
    const item = (await f.call('GET', '/api/ai-intake-items')).json().items.find((item: any) => item.generatedTasks.length && f.store.listProjects().some(project => project.name === item.suggestedProject || project.id === item.suggestedProject));
    await f.store.createTask({...task,id:`ai-${item.id}-1`,status:'未开始',revision:1});
    const archived = await f.call('POST', `/api/ai-intake-items/${item.id}/archive`);
    assert.equal(archived.statusCode, 201, archived.body);
    const aiTask = archived.json().tasks[0];
    assert.ok(aiTask);
    const aiDone = await f.call('PATCH', `/api/tasks/${aiTask.id}`, { requestId: randomUUID(), expectedRevision: 1, ownerId: 'user-admin', status: '已完成', completionNote: '完成源待办' });
    assert.equal(aiDone.statusCode, 200, aiDone.body);
    const again = await f.call('POST', `/api/ai-intake-items/${item.id}/archive`);
    assert.equal(again.statusCode, 201, again.body);
    assert.deepEqual(again.json().tasks.find((task: any) => task.id === aiTask.id), aiDone.json().task);
    assert.deepEqual(again.json().auditEvents, []);
});
