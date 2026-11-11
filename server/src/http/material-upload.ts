import type { FastifyInstance, FastifyReply } from 'fastify';
import { constants } from 'node:fs';
import { mkdir, lstat, realpath, open, unlink } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { requirePermission, resolveRequestUser } from '../auth/authorize.ts';
import { resolveAuthConfig, type AuthConfigInput } from '../auth/session.ts';
import type { LedgerStore, Material } from '../ledger/store.ts';
import { MaterialWriteError, type UploadMaterialInput } from '../ledger/material-upload.ts';
import { canReadMaterial, readMaterialSourceIndex, resolveMaterialAccess } from './material-files.ts';
import { assertSafeMaterialPath } from '../material-preview/safe-path.ts';
import { requestMaterialExtraction, readMaterialExtraction } from '../material-preview/extraction.ts';
const maxBytes = 25 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const mime: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain',
    md: 'text/markdown',
    csv: 'text/csv',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    wav:'audio/wav',mp3:'audio/mpeg',m4a:'audio/mp4',ogg:'audio/ogg',webm:'audio/webm',flac:'audio/flac'
};
export function checkBytes(bytes: Buffer, extension: string) {
    if(!Object.hasOwn(mime,extension))throw new MaterialWriteError('unsupported_material_type',415);
    if (!bytes.length)
        throw new MaterialWriteError('empty_material_file');
    const starts = (hex: string) => bytes.subarray(0, hex.length / 2).equals(Buffer.from(hex, 'hex'));
    const audioValid:Record<string,boolean>={wav:bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WAVE',mp3:bytes.subarray(0,3).toString()==='ID3'||(bytes[0]===255&&(bytes[1]&224)===224),m4a:bytes.subarray(4,8).toString()==='ftyp',ogg:starts('4f676753'),webm:starts('1a45dfa3'),flac:starts('664c6143')};
    const valid = Object.hasOwn(audioValid,extension) ? audioValid[extension] : extension === 'pdf' ? bytes.subarray(0, 5).toString() === '%PDF-' : extension === 'png' ? starts('89504e470d0a1a0a') : ['jpg', 'jpeg'].includes(extension) ? starts('ffd8ff') : ['doc', 'xls', 'ppt'].includes(extension) ? starts('d0cf11e0a1b11ae1') : ['docx', 'xlsx', 'pptx'].includes(extension) ? starts('504b0304') : !bytes.includes(0) && !bytes.toString('utf8').includes('\ufffd');
    if (!valid)
        throw new MaterialWriteError('material_signature_mismatch', 415);
}
export async function storageDirectory(root: string) {
    await mkdir(root, { recursive: true, mode: 0o700 });
    if ((await lstat(root)).isSymbolicLink())
        throw new Error('unsafe_material_storage');
    return realpath(root);
}
export async function writeBlob(root: string, id: string, bytes: Buffer) {
    const dir = await storageDirectory(root);
    const path = resolve(dir, id);
    const file = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    try {
        await file.writeFile(bytes);
        await file.sync();
    }
    catch (error) {
        await unlink(path).catch(() => { });
        throw error;
    }
    finally {
        await file.close();
    }
    return path;
}
function sendError(reply: FastifyReply, error: unknown) {
    if (error instanceof MaterialWriteError)
        return reply.code(error.status).send({ error: error.code, ...(error.existingMaterialId ? { existingMaterialId: error.existingMaterialId } : {}) });
    return reply.code(500).send({ error: 'material_operation_failed' });
}
export function registerMaterialUploadRoutes(server: FastifyInstance, store: LedgerStore, options: {
    auth?: AuthConfigInput;
    projectRoot: string;
    storageRoot?: string;
}) {
    const auth = resolveAuthConfig(options.auth);
    const root = resolve(options.storageRoot ?? process.env.MATERIAL_STORAGE_ROOT ?? resolve(options.projectRoot, 'private-material-storage'));
    server.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: maxBytes }, (_request, body, done) => done(null, body));
    server.post('/api/materials/upload', { bodyLimit: maxBytes }, async (request, reply) => {
        const denied = requirePermission(request, reply, auth, 'material:write');
        if (denied)
            return denied;
        const stagedPaths: string[] = [];
        let persisted = false;
        let storeAttempted = false;
        try {
            const query = request.query as Record<string, unknown>;
            const allowed = ['requestId', 'name', 'type', 'projectId', 'fundId', 'materialId', 'expectedVersion'];
            if (Object.keys(query).some(k => !allowed.includes(k)) ||
                !uuid.test(String(query.requestId)) ||
                typeof query.name !== 'string' ||
                !query.name.trim() ||
                query.name !== query.name.trim() ||
                query.name.length > 240 ||
                /[\x00-\x1f\x7f/\\]/.test(query.name) ||
                typeof query.type !== 'string' ||
                !query.type.trim() ||
                query.type.length > 80 ||
                /[\x00-\x1f\x7f]/.test(query.type) ||
                Boolean(query.projectId) === Boolean(query.fundId) ||
                ![query.projectId ?? query.fundId].every(id=>typeof id==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/.test(id)) ||
                (query.materialId !== undefined && (typeof query.materialId !== 'string' ||
                    !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/.test(query.materialId))) ||
                (query.materialId !== undefined ? !/^(0|[1-9]\d*)$/.test(String(query.expectedVersion)) ||
                    !Number.isSafeInteger(Number(query.expectedVersion)) : query.expectedVersion !== undefined))
                throw new MaterialWriteError('invalid_material_upload');
            if (!Buffer.isBuffer(request.body))
                throw new MaterialWriteError('octet_stream_required', 415);
            if (request.body.length > maxBytes)
                throw new MaterialWriteError('material_too_large', 413);
            const extension = extname(query.name).slice(1).toLowerCase();
            if (!Object.hasOwn(mime,extension))
                throw new MaterialWriteError('unsupported_material_type', 415);
            checkBytes(request.body, extension);
            const actor = resolveRequestUser(request, options.auth)!;
            const versionId = randomUUID();
            let legacyVersion: UploadMaterialInput['legacyVersion'];
            if (query.materialId && Number(query.expectedVersion) === 0) {
                const material = (await store.listMaterials()).find(item => item.id === query.materialId);
                if (!material)
                    throw new MaterialWriteError('material_not_found', 404);
                if (!material.currentVersionId) {
                    if (query.projectId ? material.projectId !== query.projectId : material.projectId || material.fundId !== query.fundId)
                        throw new MaterialWriteError('material_project_association_required', 409);
                    const original = await readLegacyOriginal(material, options.projectRoot, store, actor);
                    const legacyId = randomUUID();
                    stagedPaths.push(await writeBlob(root, legacyId, original.bytes));
                    legacyVersion = {
                        id: legacyId,
                        blobId: legacyId,
                        name: material.name,
                        sizeBytes: original.bytes.length,
                        sha256: original.sha256,
                        mimeType: original.mimeType,
                        uploadedBy: original.uploader,
                        uploadedById: '',
                        createdAt: original.createdAt,
                        requestId: randomUUID(),
                        fingerprint: `legacy:${original.sha256}`
                    };
                }
            }
            stagedPaths.push(await writeBlob(root, versionId, request.body));
            storeAttempted = true;
            const result = await store.uploadMaterial({
                requestId: String(query.requestId).toLowerCase(),
                name: query.name,
                type: query.type.trim(),
                projectId: query.projectId as string | undefined,
                fundId: query.fundId as string | undefined,
                materialId: query.materialId as string | undefined,
                expectedVersion: query.expectedVersion === undefined ? undefined : Number(query.expectedVersion),
                versionId,
                legacyVersion,
                sizeBytes: request.body.length,
                sha256: createHash('sha256').update(request.body).digest('hex'),
                mimeType: mime[extension],
                actor
            });
            persisted = true;
            if (!result.created)
                await Promise.all(stagedPaths.map(path => unlink(path).catch(() => { })));
            let extraction;
            try { extraction = await requestMaterialExtraction(root, result.version); }
            catch { extraction = { status: 'failed', error: 'document_extraction_failed', versionId: result.version.id }; }
            return reply.code(result.created ? 201 : 200).send({ ...result, version: publicVersion(result.version), extraction: {status:extraction.status,versionId:extraction.versionId,error:extraction.error} });
        }
        catch (error) {
            // A failed COMMIT response can still mean committed; keep that blob for recovery.
            if (!persisted && (!storeAttempted || error instanceof MaterialWriteError || (error as {
                safeToDeleteBlob?: boolean;
            })?.safeToDeleteBlob))
                await Promise.all(stagedPaths.map(path => unlink(path).catch(() => { })));
            request.log.warn({ err: error }, 'material upload failed');
            return sendError(reply, error);
        }
    });
    for (const method of ['GET', 'POST'] as const) server.route({method, url: '/api/materials/:id/extraction', handler: async (request, reply) => {
        const material = (await store.listMaterials()).find(m => m.id === (request.params as {id:string}).id);
        if (!material) return reply.code(404).send({error:'material_not_found'});
        if (!canReadMaterial(resolveRequestUser(request, options.auth), material)) return reply.code(403).send({error:'forbidden'});
        if (method === 'POST') { const denied=requirePermission(request,reply,auth,'material:write'); if(denied)return denied; }
        const version=(await store.listMaterialVersions(material.id)).find(v=>v.id===material.currentVersionId);
        if(!version)return reply.code(409).send({error:'current_version_unavailable'});
        try {
            const value=method==='POST'?await requestMaterialExtraction(root,version,true):await readMaterialExtraction(root,version);
            const current=(await store.listMaterials()).find(m=>m.id===material.id);
            if(current?.currentVersionId!==version.id)return reply.code(409).send({error:'material_version_changed'});
            reply.header('Cache-Control','private, no-store');
            return {versionId:version.id,status:value?.status??'pending',error:value?.error,pages:value?.pages.length??0,characters:value?.pages.reduce((n,p)=>n+p.text.length,0)??0,methods:[...new Set(value?.pages.map(p=>p.method)??[])]};
        } catch {return reply.code(500).send({error:'document_extraction_failed'});}
    }});
    server.get('/api/materials/:id/extraction/text',async(request,reply)=>{
        const material=(await store.listMaterials()).find(m=>m.id===(request.params as {id:string}).id);
        if(!material)return reply.code(404).send({error:'material_not_found'});
        if(!canReadMaterial(resolveRequestUser(request,options.auth),material))return reply.code(403).send({error:'forbidden'});
        const page=String((request.query as {page?:unknown}).page??'1');if(!/^[1-9]\d*$/.test(page)||!Number.isSafeInteger(Number(page)))return reply.code(400).send({error:'invalid_extraction_page'});
        const version=(await store.listMaterialVersions(material.id)).find(v=>v.id===material.currentVersionId);if(!version)return reply.code(409).send({error:'current_version_unavailable'});
        const value=await readMaterialExtraction(root,version);if(value?.status!=='ready')return reply.code(409).send({error:'extraction_not_ready'});
        const selected=value.pages.find(p=>p.page===Number(page));if(!selected)return reply.code(404).send({error:'extraction_page_not_found'});
        if((await store.listMaterials()).find(m=>m.id===material.id)?.currentVersionId!==version.id)return reply.code(409).send({error:'material_version_changed'});
        reply.header('Cache-Control','private, no-store');return {versionId:version.id,page:selected.page,pageCount:value.pages.length,text:selected.text,method:selected.method};
    });
    server.put('/api/materials/:id/projects', async (request, reply) => {
        const denied = requirePermission(request, reply, auth, 'material:write');
        if (denied)
            return denied;
        try {
            const body = request.body as {
                projectIds?: unknown;
            };
            const ids = body?.projectIds;
            if (!body || Object.keys(body).some(k => k !== 'projectIds') || !Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/.test(id)) || new Set(ids).size !== ids.length)
                throw new MaterialWriteError('invalid_project_relations');
            return await store.setMaterialProjects((request.params as {
                id: string;
            }).id, ids, resolveRequestUser(request, options.auth)!);
        }
        catch (error) {
            request.log.warn({ err: error }, 'material relation update failed');
            return sendError(reply, error);
        }
    });
    const readErrorHandler = (error: Error, request: import('fastify').FastifyRequest, reply: FastifyReply) => {
        request.log.error({ err: error }, 'material read failed');
        return reply.code(500).send({ error: 'material_operation_failed' });
    };
    server.get('/api/materials/:id/versions', { errorHandler: readErrorHandler }, async (request, reply) => {
        const id = (request.params as {
            id: string;
        }).id;
        const material = (await store.listMaterials()).find(m => m.id === id);
        if (!material)
            return reply.code(404).send({ error: 'material_not_found' });
        if (!canReadMaterial(resolveRequestUser(request, options.auth), material))
            return reply.code(403).send({ error: 'forbidden' });
        return { versions: (await store.listMaterialVersions(id)).map(publicVersion) };
    });
    server.get('/api/materials/:id/versions/:versionId/file', { errorHandler: readErrorHandler }, async (request, reply) => {
        const { id, versionId } = request.params as {
            id: string;
            versionId: string;
        };
        const material = (await store.listMaterials()).find(m => m.id === id);
        if (!material)
            return reply.code(404).send({ error: 'material_not_found' });
        if (!canReadMaterial(resolveRequestUser(request, options.auth), material))
            return reply.code(403).send({ error: 'forbidden' });
        const version = (await store.listMaterialVersions(id)).find(v => v.id === versionId);
        if (!version || !uuid.test(version.blobId))
            return reply.code(404).send({ error: 'material_file_not_found' });
        try {
            const dir = await storageDirectory(root);
            const file = await open(resolve(dir, version.blobId), constants.O_RDONLY | constants.O_NOFOLLOW);
            let bytes: Buffer;
            try {
                if (!(await file.stat()).isFile())
                    throw new Error('not_file');
                bytes = await file.readFile();
            }
            finally {
                await file.close();
            }
            if (bytes.length !== version.sizeBytes || createHash('sha256').update(bytes).digest('hex') !== version.sha256)
                throw new Error('material_integrity_failure');
            reply.header('Cache-Control', 'private, no-store').header('X-Content-Type-Options', 'nosniff').header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(version.name).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16))}`).type(version.mimeType).header('Content-Length', bytes.length);
            return reply.send(bytes);
        }
        catch (error) {
            request.log.warn({ err: error }, 'material download failed');
            return reply.code(404).send({ error: 'material_file_not_found' });
        }
    });
}
function publicVersion(v: import('../ledger/material-upload.ts').MaterialVersion) {
    const { blobId, requestId, fingerprint, auditEventId, ...version } = v;
    return { ...version, historical: v.fingerprint.startsWith('legacy:'), downloadHref: `/api/materials/${v.materialId}/versions/${v.id}/file` };
}
export async function readLegacyOriginal(material: Material, projectRoot: string, store: LedgerStore, actor: import('../auth/session.ts').SessionUser) {
    try {
        const path = material.originalFilePath?.replace(/^\//, '');
        if (!path || !canReadMaterial(actor, material))
            throw new MaterialWriteError('legacy_original_unavailable', 409);
        const access = await resolveMaterialAccess(path, projectRoot, store, actor);
        const index = await readMaterialSourceIndex(projectRoot);
        const entry = index.materials.find(item => item.id === (material.sourceMaterialId ?? material.id) && path === `docs/source-materials/2026-06-10-fund-ops-templates/${item.relative_path}`) as (typeof index.materials[number] & {
            size_bytes?: number;
            sha256?: string;
            uploader?: string;
            archived_at?: string;
        }) | undefined;
        if (!access?.allowed || !entry)
            throw new MaterialWriteError('legacy_original_unavailable', 409);
        const source = resolve(projectRoot, access.path);
        await assertSafeMaterialPath(projectRoot, source);
        const file = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW);
        let bytes: Buffer;
        try {
            if (!(await file.stat()).isFile())
                throw new Error('not_file');
            bytes = await file.readFile();
        }
        finally {
            await file.close();
        }
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        if (!bytes.length || [entry.size_bytes, material.sizeBytes].some(size => size != null && size !== bytes.length) || [entry.sha256, material.sha256].some(hash => hash && hash.toLowerCase() !== sha256))
            throw new MaterialWriteError('legacy_original_integrity_mismatch', 409);
        const extension = extname(material.name).slice(1).toLowerCase();
        const timestamp = entry.archived_at ?? material.time;
        if (!Object.hasOwn(mime,extension) || !timestamp || !Number.isFinite(Date.parse(timestamp)))
            throw new MaterialWriteError('legacy_original_metadata_invalid', 409);
        return {
            bytes,
            sha256,
            mimeType: mime[extension],
            uploader: entry.uploader ?? material.uploader,
            createdAt: new Date(timestamp).toISOString()
        };
    }
    catch (error) {
        if (error instanceof MaterialWriteError)
            throw error;
        throw new MaterialWriteError('legacy_original_unavailable', 409);
    }
}
