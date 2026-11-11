import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readdir, readFile, unlink, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {createTestServer as createServer,registeredCookie} from './auth-fixture.ts';
import { createMemoryLedgerStore, createSeedLedgerState, type LedgerStore } from '../src/ledger/store.ts';
const collection = 'docs/source-materials/2026-06-10-fund-ops-templates';
const bytes = Buffer.from('%PDF-1.7\nfrozen legacy original\n%%EOF');
async function fixture(t: import('node:test').TestContext, mode: 'normal' | 'rollback' | 'unknown-commit' = 'normal') {
    const root = await mkdtemp(join(tmpdir(), 'workflow-legacy-'));
    const storage = join(root, 'private');
    const path = `${collection}/originals/legacy.pdf`;
    await mkdir(join(root, collection, 'originals'), { recursive: true });
    await mkdir(storage);
    await writeFile(join(root, path), bytes);
    const hash = createHash('sha256').update(bytes).digest('hex');
    await writeFile(join(root, collection, 'source-index.json'), JSON.stringify({ materials: [{ id: 'source-legacy', relative_path: 'originals/legacy.pdf', sha256: hash, size_bytes: bytes.length, archived_at: '2026-06-10' }] }));
    const state = createSeedLedgerState();
    const project = state.projects[0];
    project.ownerId = 'user-admin';
    state.materials = [{ id: 'material-legacy', sourceMaterialId: 'source-legacy', fundId: project.fundId, projectId: project.id, name: 'legacy.pdf', type: '法务资料', uploader: '历史运营', time: '2026-06-10', source: '真实原件', status: '待复核', quotes: '0', project: project.name, path: '历史资料', originalFilePath: path, recognizedTextPath: 'legacy-ocr.txt', sha256: hash, sizeBytes: bytes.length, dataOrigin: 'source_file' }];
    const base = createMemoryLedgerStore(state);
    const store: LedgerStore = { ...base, workflowTransaction: async (id, action) => {
            if (mode === 'rollback')
                return base.workflowTransaction(id, async (state) => {
                    await action(state);
                    throw new Error('injected rollback');
                });
            const result = await base.workflowTransaction(id, action);
            if (mode === 'unknown-commit')
                throw new Error('unknown COMMIT response');
            return result;
        } };
    const secret = 'legacy-packet-secret';
    const admin = { id: 'user-admin', name: '管理员', email: 'admin@example.local', role: 'admin' as const };
    const server = createServer({ ledgerStore: store, materialPreviewProjectRoot: root, materialStorageRoot: storage, auth: { mode: 'password', sessionSecret: secret } });
    const cookie = await registeredCookie(server,admin,secret);
    t.after(() => server.close());
    const input = { requestId: randomUUID(), meetingType: '立项会', reviewerIds: ['user-admin'], materialIds: ['material-legacy'], dueDate: '2026-11-01', note: '' };
    const url = `/api/projects/${project.id}/approvals`;
    const submit = (payload = input) => server.inject({ method: 'POST', url, payload, headers: { cookie } });
    return { root, storage, path, hash, base, store, server, project, cookie, secret, submit, input };
}
test('legacy approval packet freezes bytes without changing material version or OCR, and exact retry creates no copy', async (t) => {
    const f = await fixture(t);
    const before = structuredClone(f.base.listMaterials()[0]);
    const created = await f.submit();
    assert.equal(created.statusCode, 201, created.body);
    const snapshot = created.json().round.materials[0];
    assert.equal(snapshot.versionId, null);
    assert.equal(snapshot.packetBlobId, undefined);
    assert.ok(!created.body.includes('packetBlobId'));
    assert.equal((await readdir(f.storage)).length, 1);
    assert.deepEqual(f.base.listMaterials()[0], before);
    assert.equal((await f.submit()).json().created, false);
    assert.equal((await readdir(f.storage)).length, 1);
    await writeFile(join(f.root, f.path), 'replaced original bytes');
    const file = await f.server.inject({ url: snapshot.downloadHref, headers: { cookie: f.cookie } });
    assert.equal(file.statusCode, 200, file.body);
    assert.deepEqual(file.rawPayload, bytes);
    assert.equal(createHash('sha256').update(file.rawPayload).digest('hex'), snapshot.sha256);
    assert.equal(file.headers['cache-control'], 'private, no-store');
    assert.match(String(file.headers['content-disposition']), /^attachment/);
    assert.equal((await f.server.inject(snapshot.downloadHref)).statusCode, 401);
    const legal = await registeredCookie(f.server,{ id: 'legal', name: '法务', email: 'legal@example.local', role: 'legal' }, f.secret);
    assert.equal((await f.server.inject({ url: snapshot.downloadHref, headers: { cookie: legal } })).statusCode, 403);
    assert.equal((await f.server.inject({ url: snapshot.downloadHref.replace('/material-legacy/file', '/%2E%2E/file'), headers: { cookie: f.cookie } })).statusCode, 404);
    const [blob] = await readdir(f.storage);
    await writeFile(join(f.storage, blob), 'tampered');
    assert.equal((await f.server.inject({ url: snapshot.downloadHref, headers: { cookie: f.cookie } })).statusCode, 409);
    await unlink(join(f.storage, blob));
    await symlink('/etc/hosts', join(f.storage, blob));
    assert.equal((await f.server.inject({ url: snapshot.downloadHref, headers: { cookie: f.cookie } })).statusCode, 404);
});
test('known rollback removes staged packet copies and unknown commit retains referenced bytes', async (t) => {
    const rolled = await fixture(t, 'rollback');
    const failed = await rolled.submit();
    assert.equal(failed.statusCode, 500);
    assert.equal((await rolled.base.readApprovals(rolled.project.id)).length, 0);
    assert.deepEqual(await readdir(rolled.storage), []);
    const unknown = await fixture(t, 'unknown-commit');
    assert.equal((await unknown.submit()).statusCode, 500);
    const rounds = await unknown.base.readApprovals(unknown.project.id);
    assert.equal(rounds.length, 1);
    const [blob] = await readdir(unknown.storage);
    assert.deepEqual(await readFile(join(unknown.storage, blob)), bytes);
});
test('later package validation failure removes earlier copied originals without committing a round', async (t) => {
    const f = await fixture(t);
    const failed = await f.submit({ ...f.input, materialIds: ['material-legacy', 'missing-material'] });
    assert.equal(failed.statusCode, 400, failed.body);
    assert.deepEqual(await readdir(f.storage), []);
    assert.equal((await f.base.readApprovals(f.project.id)).length, 0);
});
