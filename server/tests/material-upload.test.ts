import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, readdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import {createTestServer as createServer,registeredCookie} from './auth-fixture.ts';
import { createMemoryLedgerStore, createSeedLedgerState, type Material } from '../src/ledger/store.ts';
const bytes = Buffer.from('%PDF-1.7\nfirst immutable original\n%%EOF');
const payload = {
    requestId: randomUUID(), name: '真实原件.pdf', type: '法务资料', projectId: 'huaxin-materials'
};
function url(query: Record<string, unknown>) { return '/api/materials/upload?' + new URLSearchParams(Object.entries(query).map(([key, value]) => [key, String(value)])).toString(); }
async function fixture(t: import('node:test').TestContext, password = false) {
    const root = await mkdtemp(join(tmpdir(), 'material-upload-'));
    const store = createMemoryLedgerStore();
    const server = createServer({ ledgerStore: store, materialStorageRoot: root, auth: password ? { mode: 'password', sessionSecret: 'upload-secret' } : { mode: 'local-bypass' } });
    t.after(() => server.close());
    const projectId = store.listProjects()[0].id;
    return {
        root, store, server, input: { ...payload, requestId: randomUUID(), projectId }
    };
}
test('upload persists bytes, idempotency, immutable versions and protected downloads', async (t) => {
    const { server, store, root, input } = await fixture(t);
    const upload = (query: Record<string, unknown>, data = bytes) => server.inject({
        method: 'POST', url: url(query), headers: { 'content-type': 'application/octet-stream' }, payload: data
    });
    const result = await upload(input);
    assert.equal(result.statusCode, 201, result.body);
    const first = result.json();
    assert.equal(first.material.currentVersion, 1);
    assert.equal(first.material.dataOrigin, 'user_input');
    assert.equal(first.material.uploader, '管理员');
    assert.equal(first.material.status, '待复核');
    assert.equal(first.version.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(first.version.blobId, undefined);
    assert.deepEqual(await readFile(join(root, first.version.id)), bytes);
    const retries = await Promise.all(Array.from({ length: 5 }, () => upload(input)));
    for (const retry of retries)
        assert.equal(retry.statusCode, 200, retry.body);
    assert.equal((await readdir(root)).filter(name=>/^[0-9a-f-]{36}$/.test(name)).length, 1);
    assert.equal(store.listAuditEvents().filter(a => a.targetId === first.material.id).length, 1);
    const conflict = await upload({ ...input, requestId: randomUUID() });
    assert.equal(conflict.statusCode, 409);
    assert.equal(conflict.json().existingMaterialId, first.material.id);
    assert.equal((await upload(input, Buffer.from('%PDF-1.7\nchanged'))).statusCode, 409);
    const query = {
        ...input, requestId: randomUUID(), materialId: first.material.id, expectedVersion: 1
    };
    assert.equal((await upload({ ...query, name: 'renamed.pdf' })).statusCode, 409);
    assert.equal((await upload({ ...query, type: '财务资料' })).statusCode, 409);
    const concurrent = await Promise.all([upload(query, Buffer.from('%PDF-1.7\nversion2')), upload({ ...query, requestId: randomUUID() }, Buffer.from('%PDF-1.7\nversion3'))]);
    assert.equal(concurrent.filter(r => r.statusCode === 201).length, 1);
    assert.equal(concurrent.filter(r => r.statusCode === 409).length, 1);
    const list = await server.inject('/api/materials/' + first.material.id + '/versions');
    assert.equal(list.json().versions.length, 2);
    assert.equal(list.json().versions[0].version, 2);
    const download = await server.inject(first.version.downloadHref);
    assert.equal(download.statusCode, 200);
    assert.deepEqual(download.rawPayload, bytes);
    assert.equal(download.headers['x-content-type-options'], 'nosniff');
    assert.equal(download.headers['cache-control'], 'private, no-store');
    const head = await server.inject({ method: 'HEAD', url: first.version.downloadHref });
    assert.equal(head.statusCode, 200);
    assert.equal(head.body, '');
    assert.equal((await readdir(root)).filter(name=>/^[0-9a-f-]{36}$/.test(name)).length, 2);
    const second = createServer({ ledgerStore: store, materialStorageRoot: root, auth: { mode: 'local-bypass' } });
    t.after(() => second.close());
    assert.deepEqual((await second.inject(first.version.downloadHref)).rawPayload, bytes);
});
test('upload validates inputs, binary signatures, limits and prevents legacy path impersonation', async (t) => {
    const { server, root, input } = await fixture(t);
    const upload = (q: Record<string, unknown>, data = bytes) => server.inject({
        method: 'POST', url: url(q), headers: { 'content-type': 'application/octet-stream' }, payload: data
    });
    for (const patch of [{ name: '../escape.pdf' }, { name: 'bad\u0000.pdf' }, { requestId: 'bad' }, { expectedVersion: 1 }, { materialId: 'material-id' }, { type: '' }, { projectId: '' }, { name: 'test.html' }, { actor: 'spoof' }])
        assert.equal((await upload({ ...input, ...patch })).statusCode, patch.name === 'test.html' ? 415 : 400);
    assert.equal((await upload(input, Buffer.from('not pdf'))).statusCode, 415);
    assert.equal((await upload(input, Buffer.alloc(0))).statusCode, 400);
    assert.equal((await upload(input, Buffer.alloc(25 * 1024 * 1024 + 1))).statusCode, 413);
    assert.equal((await upload({ ...input, projectId: 'missing' })).statusCode, 404);
    assert.equal((await readdir(root)).filter(name=>/^[0-9a-f-]{36}$/.test(name)).length, 0);
    const created = await upload(input);
    assert.equal(created.statusCode, 201, created.body);
    const material = created.json().material;
    const archive = {
        name: 'poison.pdf', type: '法务资料', uploader: 'spoof', time: '2026-10-29', source: '用户上传', status: '待复核', quotes: '0', project: 'test'
    };
    for (const poison of [{ id: material.id }, { sourceMaterialId: material.id }, { originalFilePath: material.originalFilePath }, { currentVersionId: material.currentVersionId }])
        assert.equal((await server.inject({ method: 'POST', url: '/api/materials/archive', payload: { ...archive, ...poison } })).statusCode, 400);
    assert.deepEqual((await server.inject(created.json().version.downloadHref)).rawPayload, bytes);
});
test('project association uses existing ids, exact replace, audit and preserves version bytes', async (t) => {
    const { server, store, input } = await fixture(t);
    const created = await server.inject({
        method: 'POST', url: url(input), headers: { 'content-type': 'application/octet-stream' }, payload: bytes
    });
    const initial = created.json();
    const next = (await store.createProject({
        requestId: randomUUID(), name: '第二项目', shortName: '第二', industry: '科技', fundId: store.listFunds()[0].id, manager: '', collaborators: '', sourceChannel: '', description: ''
    }, { id: 'user-admin', name: '管理员' })).project;
    const endpoint = '/api/materials/' + initial.material.id + '/projects';
    for (const projectIds of [[], [input.projectId, input.projectId], ['missing']]) {
        const before = JSON.stringify(store.listMaterials());
        const result = await server.inject({ method: 'PUT', url: endpoint, payload: { projectIds } });
        assert.equal(result.statusCode, projectIds[0] === 'missing' ? 404 : 400);
        assert.equal(JSON.stringify(store.listMaterials()), before);
    }
    const linked = await server.inject({ method: 'PUT', url: endpoint, payload: { projectIds: [next.id, input.projectId] } });
    assert.equal(linked.statusCode, 200, linked.body);
    assert.equal(linked.json().material.projectId, next.id);
    assert.equal(linked.json().material.relationships.projects.length, 2);
    assert.equal(linked.json().material.currentVersionId, initial.version.id);
    assert.match(linked.json().auditEvent.detail, /从 \[.*\] 调整为 \[/);
    const history = await server.inject('/api/materials/' + initial.material.id + '/versions');
    assert.equal(history.json().versions[0].createdAt, initial.version.createdAt);
    assert.equal(history.json().versions[0].uploadedBy, initial.version.uploadedBy);
    const replaced = await server.inject({ method: 'PUT', url: endpoint, payload: { projectIds: [next.id] } });
    assert.equal(replaced.json().material.relationships.projects.length, 1);
    assert.deepEqual((await server.inject(initial.version.downloadHref)).rawPayload, bytes);
    const legacy = store.archiveMaterial({
        name: '旧资料.txt', type: '其他资料', uploader: '测试', time: '2026-10-29', source: '旧入口', status: '待复核', quotes: '0', project: '测试'
    }).material;
    assert.equal((await server.inject({ method: 'PUT', url: '/api/materials/' + legacy.id + '/projects', payload: { projectIds: [next.id] } })).statusCode, 200);
});
test('authentication, permission, actor-scoped idempotency and symlink protection', async (t) => {
    const { server, root, input } = await fixture(t, true);
    const cookie = (id: string, role: 'viewer' | 'post_investment') => registeredCookie(server,{
        id, name: id, email: id + '@example.local', role
    }, 'upload-secret');
    const upload = (headers: Record<string, string>) => server.inject({
        method: 'POST', url: url(input), headers: { 'content-type': 'application/octet-stream', ...headers }, payload: bytes
    });
    assert.equal((await upload({})).statusCode, 401);
    assert.equal((await upload({ cookie: await cookie('viewer', 'viewer') })).statusCode, 403);
    const first = await upload({ cookie: await cookie('manager-a', 'post_investment') });
    assert.equal(first.statusCode, 201, first.body);
    assert.equal(first.json().version.uploadedBy, 'manager-a');
    assert.equal((await upload({ cookie: await cookie('manager-b', 'post_investment') })).statusCode, 409);
    const file = join(root, first.json().version.id);
    const { unlink } = await import('node:fs/promises');
    await unlink(file);
    await symlink('/etc/hosts', file);
    assert.equal((await server.inject({ url: first.json().version.downloadHref, headers: { cookie: await cookie('manager-a', 'post_investment') } })).statusCode, 404);
});

test('protected material reads sanitize persistence failures and enforce role/object access', async t => {
    const { server, store, root, input } = await fixture(t, true);
    const secret = 'upload-secret';
    const cookie = (role: 'post_investment' | 'legal' | 'viewer') => registeredCookie(server,{ id: role, name: role, email: role + '@example.local', role }, secret);
    const created = await server.inject({ method: 'POST', url: url(input), headers: { 'content-type': 'application/octet-stream', cookie: await cookie('post_investment') }, payload: bytes });
    assert.equal(created.statusCode, 201, created.body);
    const versionUrl = `/api/materials/${created.json().material.id}/versions`;
    assert.equal((await server.inject(versionUrl)).statusCode, 401);
    assert.equal((await server.inject(created.json().version.downloadHref)).statusCode, 401);
    assert.equal((await server.inject({ url: versionUrl, headers: { cookie: await cookie('legal') } })).statusCode, 403);
    assert.equal((await server.inject({ url: created.json().version.downloadHref, headers: { cookie: await cookie('legal') } })).statusCode, 403);
    assert.equal((await server.inject({ url: created.json().version.downloadHref, headers: { cookie: await cookie('viewer') } })).statusCode, 200);
    assert.equal((await server.inject({ method: 'PUT', url: `/api/materials/${created.json().material.id}/projects`, headers: { cookie: await cookie('viewer') }, payload: { projectIds: [input.projectId] } })).statusCode, 403);
    const failing = createServer({ ledgerStore: { ...store, listMaterialVersions: () => { throw new Error('secret SQL path'); } }, materialStorageRoot: root, auth: { mode: 'local-bypass' } });
    t.after(() => failing.close());
    const failed = await failing.inject(versionUrl);
    assert.equal(failed.statusCode, 500);
    assert.deepEqual(failed.json(), { error: 'material_operation_failed' });
});

test('explicit material identity can version same-name originals shared across projects', async t => {
    const { server, store, input } = await fixture(t);
    const otherProject = (await store.createProject({ requestId: randomUUID(), name: '同名资料项目B', shortName: '项目B', industry: '科技', fundId: store.listFunds()[0].id, manager: '', collaborators: '', sourceChannel: '', description: '' }, { id: 'user-admin', name: '管理员' })).project;
    const upload = (query: Record<string, unknown>, data = bytes) => server.inject({ method: 'POST', url: url(query), headers: { 'content-type': 'application/octet-stream' }, payload: data });
    const first = await upload(input);
    const second = await upload({ ...input, requestId: randomUUID(), projectId: otherProject.id });
    assert.equal(first.statusCode, 201, first.body);
    assert.equal(second.statusCode, 201, second.body);
    const firstMaterial = first.json().material;
    const secondMaterial = second.json().material;
    const linked = await server.inject({ method: 'PUT', url: `/api/materials/${secondMaterial.id}/projects`, payload: { projectIds: [input.projectId, otherProject.id] } });
    assert.equal(linked.statusCode, 200, linked.body);
    const collision = await upload({ ...input, requestId: randomUUID() });
    assert.equal(collision.statusCode, 409, collision.body);
    assert.equal(collision.json().error, 'material_name_conflict');
    for (const material of [firstMaterial, secondMaterial]) {
        const next = await upload({ ...input, requestId: randomUUID(), materialId: material.id, expectedVersion: 1 }, Buffer.from('%PDF-1.7\nnext immutable version'));
        assert.equal(next.statusCode, 201, next.body);
        assert.equal(next.json().material.id, material.id);
        assert.equal(next.json().material.currentVersion, 2);
    }
    for (const original of [first.json(), second.json()]) {
        assert.deepEqual((await server.inject(original.version.downloadHref)).rawPayload, bytes);
        assert.equal((await server.inject(`/api/materials/${original.material.id}/versions`)).json().versions.length, 2);
    }
});

test('project material detail uses stable ids when project display names are identical', async t => {
    const { server, store, input } = await fixture(t);
    const firstProject = store.listProjects().find(p => p.id === input.projectId)!;
    const secondProject = (await store.createProject({ requestId: randomUUID(), name: firstProject.name, shortName: firstProject.shortName, industry: '科技', fundId: firstProject.fundId, manager: '', collaborators: '', sourceChannel: '', description: '' }, { id: 'user-admin', name: '管理员' })).project;
    const created = await server.inject({ method: 'POST', url: url(input), headers: { 'content-type': 'application/octet-stream' }, payload: bytes });
    assert.equal(created.statusCode, 201, created.body);
    const materialId = created.json().material.id;
    const materialsFor = async (projectId: string) => (await server.inject(`/api/projects/${projectId}`)).json().materials as { id: string }[];
    assert.equal((await materialsFor(firstProject.id)).some(m => m.id === materialId), true);
    assert.equal((await materialsFor(secondProject.id)).some(m => m.id === materialId), false);
    const linked = await server.inject({ method: 'PUT', url: `/api/materials/${materialId}/projects`, payload: { projectIds: [firstProject.id, secondProject.id] } });
    assert.equal(linked.statusCode, 200, linked.body);
    assert.equal((await materialsFor(secondProject.id)).some(m => m.id === materialId), true);
    const unlinked = await server.inject({ method: 'PUT', url: `/api/materials/${materialId}/projects`, payload: { projectIds: [firstProject.id] } });
    assert.equal(unlinked.statusCode, 200, unlinked.body);
    assert.equal((await materialsFor(secondProject.id)).some(m => m.id === materialId), false);
});


test('name-only historical material stays globally unchanged and is never claimed by a project detail', async t => {
    const state = createSeedLedgerState();
    const project = state.projects[0];
    const other = { ...project, id: 'same-name-project-b' };
    state.projects.push(other);
    const legacy: Material = { id: 'unbound-legacy', fundId: null, projectId: null, name: 'legacy.txt', type: '其他资料', uploader: '旧记录', time: '2026-10-29', source: '旧入口', status: '待复核', quotes: '0', project: project.name, path: '旧资料' };
    state.materials = [
        legacy,
        { ...legacy, id: 'bound-id', projectId: project.id },
        { ...legacy, id: 'bound-project-relation', relationships: { projects: [{ id: project.id, name: project.name }], funds: [], companies: [], investors: [] } },
        { ...legacy, id: 'bound-fund-relation', relationships: { projects: [], funds: [{ id: project.fundId, name: project.fund }], companies: [], investors: [] } },
        { ...legacy, id: 'uploaded-version', currentVersion: 1 },
        { ...legacy, id: 'uploaded-version-id', currentVersionId: randomUUID() },
    ];
    const store=createMemoryLedgerStore(state);
    const before=JSON.stringify(store.listMaterials());
    const server = createServer({ ledgerStore: store, auth: { mode: 'local-bypass' } });
    t.after(() => server.close());
    const detail = await server.inject(`/api/projects/${other.id}`);
    assert.equal(detail.statusCode, 200, detail.body);
    assert.deepEqual(detail.json().materials.map((material: { id: string }) => material.id), []);
    const original = await server.inject(`/api/projects/${project.id}`);
    assert.deepEqual(original.json().materials.map((material: { id: string }) => material.id).sort(), ['bound-id', 'bound-project-relation'].sort());
    assert.equal(JSON.stringify(store.listMaterials()),before);
    assert.ok(store.listMaterials().some(m=>m.id==='unbound-legacy'&&m.project===project.name&&m.projectId===null));
});

test('fund originals upload without a project, persist the fund relationship and retain version checks',async t=>{
 const {server,store}=await fixture(t);const fund=store.listFunds()[0],input={requestId:randomUUID(),name:'基金合同测试.txt',type:'基金合同',fundId:fund.id};
 const upload=(query:Record<string,unknown>,payload=Buffer.from('基金合同 第六条 年度披露'))=>server.inject({method:'POST',url:url(query),headers:{'content-type':'application/octet-stream'},payload});
 const first=await upload(input);assert.equal(first.statusCode,201,first.body);const m=first.json().material;assert.equal(m.projectId,null);assert.equal(m.primaryScope,'fund');assert.equal(m.fundId,fund.id);assert.equal(m.relationships.funds[0].id,fund.id);
 const retry=await upload(input);assert.equal(retry.statusCode,200,retry.body);assert.equal(retry.json().material.id,m.id);assert.equal(retry.json().created,false);
 const duplicate=await upload({...input,requestId:randomUUID()});assert.equal(duplicate.statusCode,409);
 const version=await upload({...input,requestId:randomUUID(),materialId:m.id,expectedVersion:1},Buffer.from('基金合同 第二版'));assert.equal(version.statusCode,201,version.body);assert.equal(version.json().material.currentVersion,2);
 const stale=await upload({...input,requestId:randomUUID(),materialId:m.id,expectedVersion:1});assert.equal(stale.statusCode,409);
 const ambiguous=await upload({...input,requestId:randomUUID(),projectId:store.listProjects()[0].id});assert.equal(ambiguous.statusCode,400);
 const missing=await upload({...input,requestId:randomUUID(),fundId:'missing-fund'});assert.equal(missing.statusCode,404);
});
