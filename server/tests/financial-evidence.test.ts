import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readdir, realpath, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SessionUser } from '../src/auth/session.ts';
import {materialVersionSourceBasis} from '../src/ledger/source-policy.ts';
import { createFinancialEvidence } from '../src/http/financial-evidence.ts';
import { createMemoryLedgerStore, createSeedLedgerState } from '../src/ledger/store.ts';
import { MaterialWriteError } from '../src/ledger/material-upload.ts';
import { WorkflowError, type MaterialSnapshot, type WorkflowState } from '../src/ledger/workflow.ts';

const admin: SessionUser = { id: 'admin', name: '管理员', email: 'admin@example.local', role: 'admin' };
const legal: SessionUser = { ...admin, id: 'legal', role: 'legal' };
const rejectsCode = (code: string) => (error: unknown) => error instanceof WorkflowError && error.code === code;

async function fixture(t: any) {
    const root = await mkdtemp(join(tmpdir(), 'financial-evidence-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const state = createSeedLedgerState(), project = state.projects[0];
    state.projects.push({ ...structuredClone(project), id: 'other-financial-project' });
    const store = createMemoryLedgerStore(state), data = Buffer.from('actual financial proof');
    const sha256 = createHash('sha256').update(data).digest('hex');
    const upload = async (projectId = project.id) => {
        const blobId = randomUUID();
        await writeFile(join(root, blobId), data);
        const { material, version } = await store.uploadMaterial({
            projectId, requestId: randomUUID(), versionId: blobId, name: 'evidence.txt', type: '凭证',
            sizeBytes: data.length, sha256, mimeType: 'text/plain', actor: admin
        });
        const input = { materialId: material.id, versionId: version.id };
        const ref: MaterialSnapshot = { ...input, name: version.name, sha256, sizeBytes: data.length, packetBlobId: blobId, downloadHref: '/original' };
        return { material, version, input, ref };
    };
    const first = await upload(), other = await upload('other-financial-project');
    const s = { project } as WorkflowState;
    const helper = createFinancialEvidence(store, root, id => `/proof/${id}/${randomUUID()}`);
    return { root, data, sha256, store, s, helper, first, other };
}

test('financial evidence authorizes every reference before reading versions or private bytes', async t => {
    const f = await fixture(t), paths: string[] = [];
    // A read of the first reference would fail; the later authorization must win.
    await unlink(join(f.root, f.first.version.blobId));
    let versionsRead = 0;
    const original = f.store.listMaterialVersions.bind(f.store);
    f.store.listMaterialVersions = id => { versionsRead++; return original(id); };
    await assert.rejects(f.helper.snapshots([f.first.input, f.other.input], f.s, admin, paths), rejectsCode('material_not_linked'));
    assert.equal(versionsRead, 0);
    assert.deepEqual(paths, []);
    await assert.rejects(f.helper.verify(f.s, admin, [f.first.ref, f.other.ref]), rejectsCode('material_not_linked'));
    await assert.rejects(f.helper.snapshots([f.first.input], f.s, legal, paths), rejectsCode('forbidden'));
    await assert.rejects(f.helper.verify(f.s, legal, [f.first.ref]), rejectsCode('forbidden'));
    assert.equal(versionsRead, 0);
});

test('financial evidence reads only regular nonsymlink blobs with matching size and hash', async t => {
    const f = await fixture(t), id = f.first.version.blobId;
    assert.deepEqual(await f.helper.readBytes(id, f.sha256, f.data.length), f.data);
    await assert.rejects(f.helper.readBytes(id, f.sha256, f.data.length + 1), rejectsCode('material_integrity_mismatch'));
    await writeFile(join(f.root, id), Buffer.alloc(f.data.length, 65));
    await assert.rejects(f.helper.readBytes(id, f.sha256, f.data.length), rejectsCode('material_integrity_mismatch'));
    await assert.rejects(f.helper.snapshots([f.first.input], f.s, admin, []), rejectsCode('material_integrity_mismatch'));
    await unlink(join(f.root, id));
    await symlink(join(f.root, f.other.version.blobId), join(f.root, id));
    await assert.rejects(f.helper.readBytes(id, f.sha256, f.data.length), rejectsCode('material_blob_unavailable'));
    await assert.rejects(f.helper.snapshots([f.first.input], f.s, admin, []), rejectsCode('material_blob_unavailable'));
    await unlink(join(f.root, id));
    await mkdir(join(f.root, id));
    await assert.rejects(f.helper.readBytes(id, f.sha256, f.data.length), rejectsCode('material_blob_unavailable'));
    await assert.rejects(f.helper.readBytes('../outside', f.sha256, f.data.length), rejectsCode('material_blob_unavailable'));
});

test('financial snapshots keep fixed bytes, metadata and injected links after source changes', async t => {
    const f = await fixture(t), paths: string[] = [], projects: string[] = [];
    const helper = createFinancialEvidence(f.store, f.root, id => {
        assert.equal(paths.length, projects.length + 1);
        projects.push(id);
        return `/custom/${id}/file-${projects.length}`;
    });
    const [snapshot] = await helper.snapshots([f.first.input], f.s, admin, paths);
    assert.deepEqual(projects, [f.s.project.id]);
    assert.equal(snapshot.downloadHref, `/custom/${f.s.project.id}/file-1`);
    assert.notEqual(snapshot.packetBlobId, f.first.version.blobId);
    assert.equal(paths[0], join(await realpath(f.root), snapshot.packetBlobId!));
    assert.deepEqual(snapshot, { ...f.first.ref, packetBlobId: snapshot.packetBlobId, downloadHref: snapshot.downloadHref,sourceBasis:materialVersionSourceBasis(f.first.material,f.first.version) });
    await writeFile(join(f.root, f.first.version.blobId), 'replacement source');
    f.first.version.name = 'replacement name';
    assert.equal(snapshot.name, 'evidence.txt');
    await helper.verify(f.s, admin, [snapshot]);
    assert.deepEqual(await helper.readBytes(snapshot.packetBlobId!, snapshot.sha256, snapshot.sizeBytes), f.data);
});

test('financial evidence masks unauthorized metadata and hides links for corrupted snapshots', async t => {
    const f = await fixture(t), materials = new Map(f.store.listMaterials().map(m => [m.id, m]));
    assert.equal(await f.helper.visible(f.s, admin, f.first.ref, materials), f.first.ref);
    const masked = { materialId: f.first.ref.materialId, versionId: f.first.ref.versionId, name: '无权查看凭证', readIssue: 'forbidden' };
    assert.deepEqual(await f.helper.visible(f.s, legal, f.first.ref, materials), masked);
    await writeFile(join(f.root, f.first.version.blobId), 'damaged');
    const damaged = await f.helper.visible(f.s, admin, f.first.ref, materials);
    assert.deepEqual(damaged, { ...f.first.ref, downloadHref: undefined, readIssue: 'material_integrity_mismatch' });
    materials.delete(f.first.ref.materialId);
    assert.deepEqual(await f.helper.visible(f.s, admin, f.first.ref, materials), { ...masked, readIssue: 'material_not_linked' });
    const error = new MaterialWriteError('original_material_failure', 409);
    f.store.listMaterials = () => { throw error; };
    await assert.rejects(f.helper.authorize(f.s, admin, f.first.ref.materialId), e => e === error);
    const failingMaterials = new Map(materials);
    failingMaterials.get = () => { throw error; };
    await assert.rejects(f.helper.visible(f.s, admin, f.first.ref, failingMaterials), e => e === error);
});

test('financial snapshots preserve validation errors and leave staged paths to the controller on partial failure', async t => {
    const f = await fixture(t), paths: string[] = [], before = await readdir(f.root);
    for (const input of [[], [f.first.input, f.first.input], [{ ...f.first.input, unexpected: true }]]) {
        await assert.rejects(f.helper.snapshots(input, f.s, admin, paths), e => e instanceof WorkflowError);
    }
    assert.deepEqual(paths, []);
    assert.deepEqual(await readdir(f.root), before);
    await assert.rejects(f.helper.snapshots([f.first.input, { ...f.first.input, versionId: 'missing' }], f.s, admin, paths), rejectsCode('material_version_unavailable'));
    assert.equal(paths.length, 1);
    assert.equal((await readdir(f.root)).length, before.length + 1);
    const error = new MaterialWriteError('original_version_failure', 409);
    f.store.listMaterialVersions = () => { throw error; };
    await assert.rejects(f.helper.snapshots([f.first.input], f.s, admin, []), e => e === error);
});

test('selecting an original version records only that version, independent of an engineering current version',async t=>{
 const f=await fixture(t),materials=f.store.listMaterials;f.store.listMaterials=()=>materials().map(m=>m.id===f.first.material.id?{...m,currentVersionId:'different-engineering-current',currentVersionPurpose:'engineering_fixture'}:m);
 const [snapshot]=await f.helper.snapshots([f.first.input],f.s,admin,[]);const {confirmedSource,retainEvidenceSource}=await import('../src/ledger/source-policy.ts');
 assert.ok(snapshot.sourceBasis!.some(v=>v.recordType==='material_version'&&v.projectId===''&&v.id===f.first.version.id));assert.equal(snapshot.sourceBasis!.some(v=>v.id==='different-engineering-current'),false);assert.equal(confirmedSource(retainEvidenceSource({dataOrigin:'user_input'},[snapshot])),true);
});
