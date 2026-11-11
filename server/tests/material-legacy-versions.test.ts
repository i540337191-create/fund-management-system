import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import crypto, { randomUUID, createHash } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { createServer } from '../src/index.ts';
import { createMemoryLedgerStore, createSeedLedgerState, type Material, type LedgerStore } from '../src/ledger/store.ts';
import { MaterialWriteError } from '../src/ledger/material-upload.ts';
const collection = 'docs/source-materials/2026-06-10-fund-ops-templates';
const historicalBytes = Buffer.from('%PDF-1.7\nhistorical ORIGINAL unchanged\n%%EOF');
const newBytes = Buffer.from('%PDF-1.7\nnew upload replacing historical current\n%%EOF');
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
async function assertBothOriginalBlobs(storage: string) {
    const entries = await readdir(storage, { withFileTypes: true });
    const blobs = entries.filter(entry => entry.isFile());
    assert.equal(blobs.length, 2);
    assert.ok(entries.filter(entry => !entry.isFile()).every(entry => entry.isDirectory() && ['extracted-text', 'extraction-work'].includes(entry.name)));
    assert.deepEqual((await Promise.all(blobs.map(entry => readFile(join(storage, entry.name))))).map(hash).sort(), [hash(historicalBytes), hash(newBytes)].sort());
}
async function fixture(t: import('node:test').TestContext, override?: (store: ReturnType<typeof createMemoryLedgerStore>) => LedgerStore) {
    const root = await mkdtemp(join(tmpdir(), 'legacy-versions-'));
    const storage = join(root, 'private');
    const originalPath = `${collection}/originals/historical.pdf`;
    await mkdir(join(root, collection, 'originals'), { recursive: true });
    await mkdir(storage);
    await writeFile(join(root, originalPath), historicalBytes);
    await writeFile(join(root, collection, 'source-index.json'), JSON.stringify({ materials: [{
                id: 'source-legacy',
                relative_path: 'originals/historical.pdf',
                size_bytes: historicalBytes.length,
                sha256: hash(historicalBytes),
                uploader: '历史运营人员',
                archived_at: '2026-06-10'
            }] }));
    const state = createSeedLedgerState();
    const originalFund = state.funds[0];
    state.funds.push({ ...originalFund, id: 'selected-project-fund', name: '新项目基金' });
    state.projects[0].fundId = 'selected-project-fund';
    const legacy: Material = {
        id: 'material-legacy',
        sourceMaterialId: 'source-legacy',
        fundId: originalFund.id,
        projectId: null,
        primaryScope: 'fund',
        name: 'historical.pdf',
        type: '法务资料',
        uploader: '历史运营人员',
        time: '2026-06-10',
        source: '真实物料 / 原始文件',
        status: '待复核',
        quotes: '3',
        project: originalFund.name,
        path: '历史基金档案',
        originalFilePath: originalPath,
        sha256: hash(historicalBytes),
        sizeBytes: historicalBytes.length,
        dataOrigin: 'source_file',
        recognizedHtmlPath: `${collection}/old.html`,
        recognizedTextPath: `${collection}/old.txt`,
        previewFilePath: `${collection}/old.pdf`,
        pageImageDir: `${collection}/old-pages`,
        pageImageManifestPath: `${collection}/old-manifest.json`,
        relationships: {
            funds: [{
                    id: originalFund.id,
                    name: originalFund.name,
                    relationType: 'primary',
                    isPrimary: true
                }],
            projects: [],
            companies: [{ id: 'company-original', name: '原公司' }],
            investors: [{ id: 'lp-original', name: '原LP' }]
        }
    };
    state.materials = [legacy];
    const store = createMemoryLedgerStore(state);
    const server = createServer({
        ledgerStore: override ? override(store) : store,
        materialPreviewProjectRoot: root,
        materialStorageRoot: storage,
        auth: { mode: 'local-bypass' }
    });
    t.after(() => server.close());
    const input = {
        requestId: randomUUID(),
        name: legacy.name,
        type: legacy.type,
        projectId: state.projects[0].id,
        materialId: legacy.id,
        expectedVersion: 0
    };
    const upload = () => server.inject({
        method: 'POST',
        url: '/api/materials/upload?' + new URLSearchParams(Object.entries(input).map(([key, value]) => [key, String(value)])),
        headers: { 'content-type': 'application/octet-stream' },
        payload: newBytes
    });
    const associate = () => server.inject({ method: 'PUT', url: `/api/materials/${legacy.id}/projects`, payload: { projectIds: [input.projectId] } });
    return {
        root,
        storage,
        originalPath,
        legacy,
        store,
        server,
        input,
        upload,
        associate
    };
}
test('legacy project links preserve fund/LP/company provenance and adoption retains both originals', async (t) => {
    const f = await fixture(t);
    assert.equal((await f.upload()).statusCode, 409);
    const associated = await f.associate();
    assert.equal(associated.statusCode, 200, associated.body);
    const linked = associated.json().material;
    assert.equal(linked.fundId, f.legacy.fundId);
    assert.equal(linked.primaryScope, 'fund');
    assert.equal(linked.dataOrigin, 'source_file');
    assert.equal(linked.originalFilePath, f.originalPath);
    assert.deepEqual(linked.relationships.investors, f.legacy.relationships!.investors);
    assert.deepEqual(linked.relationships.companies, f.legacy.relationships!.companies);
    assert.equal(linked.relationships.funds.length, 2);
    assert.equal(linked.relationships.funds[0].id, f.legacy.fundId);
    const beforeIndex = await f.server.inject('/api/materials/source-index');
    assert.equal(beforeIndex.json().materials.length, 1);
    const created = await f.upload();
    assert.equal(created.statusCode, 201, created.body);
    const result = created.json();
    assert.equal(result.material.id, f.legacy.id);
    assert.equal(result.material.currentVersion, 2);
    assert.match(result.auditEvent.detail, /保留历史原件/);
    for (const field of ['recognizedHtmlPath', 'recognizedTextPath', 'previewFilePath', 'pageImageDir', 'pageImageManifestPath'])
        assert.equal(result.material[field], null);
    const versions = (await f.server.inject(`/api/materials/${f.legacy.id}/versions`)).json().versions;
    assert.equal(versions.length, 2);
    assert.equal(versions.find((version: { version: number }) => version.version === 1).historical, true);
    assert.equal(versions.find((version: { version: number }) => version.version === 2).historical, false);
    const first = versions.find((v: {
        version: number;
    }) => v.version === 1);
    assert.equal(first.uploadedBy, '历史运营人员');
    assert.equal(first.createdAt, '2026-06-10T00:00:00.000Z');
    assert.equal(first.sha256, hash(historicalBytes));
    assert.deepEqual((await f.server.inject(first.downloadHref)).rawPayload, historicalBytes);
    assert.deepEqual((await f.server.inject(result.version.downloadHref)).rawPayload, newBytes);
    assert.deepEqual((await f.server.inject('/' + f.originalPath)).rawPayload, historicalBytes);
    assert.deepEqual(await readFile(join(f.root, f.originalPath)), historicalBytes);
    assert.equal((await f.server.inject('/api/materials/source-index')).json().materials.length, 0);
    assert.deepEqual((await f.server.inject('/api/materials/text-search?q=historical')).json().chunks, []);
    const retry = await f.upload();
    assert.equal(retry.statusCode, 200, retry.body);
    assert.equal(retry.json().version.id, result.version.id);
    assert.equal(retry.json().created, false);
    await assertBothOriginalBlobs(f.storage);
    assert.equal((await f.associate()).statusCode, 200);
    assert.equal(f.store.listMaterials()[0].fundId, f.legacy.fundId);
    assert.deepEqual(f.store.listMaterials()[0].relationships!.investors, f.legacy.relationships!.investors);
});
test('unregistered or altered legacy originals never create fabricated versions', async (t) => {
    const f = await fixture(t);
    await f.associate();
    await writeFile(join(f.root, f.originalPath), Buffer.from('altered'));
    const altered = await f.upload();
    assert.equal(altered.statusCode, 409, altered.body);
    assert.equal(altered.json().error, 'legacy_original_integrity_mismatch');
    await writeFile(join(f.root, collection, 'source-index.json'), JSON.stringify({ materials: [] }));
    const absent = await f.upload();
    assert.equal(absent.statusCode, 409, absent.body);
    assert.equal(absent.json().error, 'legacy_original_unavailable');
    assert.equal(f.store.listMaterialVersions(f.legacy.id).length, 0);
    assert.deepEqual(await readdir(f.storage), []);
});
test('legacy adoption ordinary DB failure disposes both staged blobs', async (t) => {
    const f = await fixture(t, store => ({ ...store, uploadMaterial: () => { throw new MaterialWriteError('simulated_rollback', 409); } }));
    await f.associate();
    const result = await f.upload();
    assert.equal(result.statusCode, 409);
    assert.deepEqual(await readdir(f.storage), []);
    assert.deepEqual(await readFile(join(f.root, f.originalPath)), historicalBytes);
});
test('legacy adoption ambiguous commit keeps both blobs and replay0 recovers them', async (t) => {
    let first = true;
    const f = await fixture(t, store => ({ ...store, uploadMaterial: input => { const result = store.uploadMaterial(input); if (first) {
            first = false;
            throw Object.assign(new Error('lost commit response'), { safeToDeleteBlob: false });
        } return result; } }));
    await f.associate();
    assert.equal((await f.upload()).statusCode, 500);
    await assertBothOriginalBlobs(f.storage);
    const retry = await f.upload();
    assert.equal(retry.statusCode, 200, retry.body);
    assert.equal(retry.json().material.currentVersion, 2);
    await assertBothOriginalBlobs(f.storage);
    assert.deepEqual(await readFile(join(f.root, f.originalPath)), historicalBytes);
});
test('second staging write failure cleans preserved legacy copy before any DB attempt', async (t) => {
    const f = await fixture(t);
    await f.associate();
    const newId = '12345678-1234-4234-8234-123456789001';
    const legacyId = '12345678-1234-4234-8234-123456789002';
    const internalRequest = '12345678-1234-4234-8234-123456789003';
    await mkdir(join(f.storage, newId));
    let n = 0;
    const mocked = t.mock.method(crypto, 'randomUUID', () => [newId, legacyId, internalRequest][n++] ?? randomUUID());
    syncBuiltinESMExports();
    try {
        assert.equal((await f.upload()).statusCode, 500);
        assert.deepEqual(await readdir(f.storage), [newId]);
        assert.equal(f.store.listMaterialVersions(f.legacy.id).length, 0);
    }
    finally {
        mocked.mock.restore();
        syncBuiltinESMExports();
    }
});
