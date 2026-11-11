import {materialVersionSourceBasis} from '../ledger/source-policy.ts';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { SessionUser } from '../auth/session.ts';
import type { LedgerStore, Material } from '../ledger/store.ts';
import { WorkflowError, fail, object, string, type WorkflowState, type MaterialSnapshot } from '../ledger/workflow.ts';
import { storageDirectory, writeBlob } from './material-upload.ts';
import { canReadMaterial } from './material-files.ts';

function list(v: unknown) { if (!Array.isArray(v) || !v.length || v.length > 100)
    fail('invalid_list'); return v; }

export function createFinancialEvidence(store: LedgerStore, root: string, downloadHref: (projectId: string) => string) {
    async function readBytes(id: string, sha: string, size: number) { if (!/^[0-9a-f-]{36}$/i.test(id))
        fail('material_blob_unavailable', 409); let b: Buffer; try {
        const f = await open(resolve(await storageDirectory(root), id), constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
            if (!(await f.stat()).isFile())
                fail('material_blob_unavailable', 409);
            b = await f.readFile();
        }
        finally {
            await f.close();
        }
    }
    catch (e) {
        if (e instanceof WorkflowError)
            throw e;
        fail('material_blob_unavailable', 409);
    } if (b.length !== size || createHash('sha256').update(b).digest('hex') !== sha)
        fail('material_integrity_mismatch', 409); return b; }
    async function authorize(s: Pick<WorkflowState, 'project'>, a: SessionUser, id: string, materials?: Map<string, Material>) { const m = materials ? materials.get(id) : (await store.listMaterials()).find(m => m.id === id); if (!m || !(m.projectId === s.project.id || m.relationships?.projects.some(p => p.id === s.project.id)))
        fail('material_not_linked'); if (!canReadMaterial(a, m))
        fail('forbidden', 403); return m; }
    async function verify(s: Pick<WorkflowState, 'project'>, a: SessionUser, refs: MaterialSnapshot[], materials?: Map<string, Material>) { for (const m of refs)
        await authorize(s, a, m.materialId, materials); for (const m of refs)
        await readBytes(m.packetBlobId!, m.sha256, m.sizeBytes); }
    async function snapshots(input: unknown, s: WorkflowState, a: SessionUser, paths: string[]) { const refs = list(input).map(v => { const b = object(v, ['materialId', 'versionId']); return { materialId: string(b.materialId), versionId: string(b.versionId) }; }); if (new Set(refs.map(v => `${v.materialId}:${v.versionId}`)).size !== refs.length)
        fail('duplicate_value'); const authorized=new Map<string,Material>();for (const ref of refs)
        authorized.set(ref.materialId,await authorize(s, a, ref.materialId)); const out: MaterialSnapshot[] = []; for (const ref of refs) {
        const v = (await store.listMaterialVersions(ref.materialId)).find(v => v.id === ref.versionId);
        if (!v)
            fail('material_version_unavailable', 409);
        const b = await readBytes(v.blobId, v.sha256, v.sizeBytes), id = randomUUID();
        paths.push(await writeBlob(root, id, b));
        out.push({ ...ref, sourceBasis:materialVersionSourceBasis(authorized.get(ref.materialId)!,v), name: v.name, sha256: v.sha256, sizeBytes: v.sizeBytes, packetBlobId: id, downloadHref: downloadHref(s.project.id) });
    } return out; }
    async function visible(s: Pick<WorkflowState, 'project'>, a: SessionUser, ref: MaterialSnapshot, materials: Map<string, Material>) { try {
        await verify(s, a, [ref], materials);
        return ref;
    }
    catch (e) {
        if (!(e instanceof WorkflowError))
            throw e;
        return ['forbidden', 'material_not_linked'].includes(e.code) ? { materialId: ref.materialId, versionId: ref.versionId, name: '无权查看凭证', readIssue: e.code } : { ...ref, downloadHref: undefined, readIssue: e.code };
    } }
    return { readBytes, authorize, verify, snapshots, visible };
}
