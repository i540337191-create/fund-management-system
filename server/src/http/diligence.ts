import {generateDocument,documentMime} from '../ledger/document-output.ts';
import {diligenceDocument} from '../ledger/document-content.ts';
import {lpProjection,canReadLp} from '../ledger/lp-privacy.ts';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { resolveRequestUser } from '../auth/authorize.ts';
import { canRole } from '../auth/rbac.ts';
import { resolveAuthConfig, type AuthConfigInput, type SessionUser } from '../auth/session.ts';
import { MaterialWriteError } from '../ledger/material-upload.ts';
import type { LedgerStore } from '../ledger/store.ts';
import { WorkflowError, fail, object, string, date, revision, requestId, audit, idempotent, newTask, approvalEligible, type MaterialSnapshot, type WorkflowState } from '../ledger/workflow.ts';
import type { DiligenceCase, DiligenceItem, DiligenceSections, DiligenceSource } from '../ledger/diligence.ts';
import { canReadMaterial } from './material-files.ts';
import { readLegacyOriginal, storageDirectory, writeBlob } from './material-upload.ts';
import { workflowDirectory } from './workflow.ts';
const now = () => new Date().toISOString();
// Remove private storage identifiers in nested historical snapshots and idempotent responses too.
export function publicDiligence<T>(value: T, excludeKeys = ['returnBases','returnSamples','cashflowReviews','investmentCashflows','exitExecutions','exitPayments','exitArchives','exitClaims']): T { return JSON.parse(JSON.stringify(value, (key, v) => key === 'packetBlobId' || excludeKeys.includes(key) ? undefined : v)); }
const fingerprint = (source: DiligenceSource) => createHash('sha256').update(JSON.stringify(source)).digest('hex');
const sourceOf = (d: DiligenceCase): DiligenceSource => structuredClone({ items: d.items, findings: d.findings });
function ids(v: unknown, empty = false): string[] {
    if (!Array.isArray(v) || v.length > 100 || (!empty && !v.length) || v.some(x => typeof x !== 'string' || !x.trim()) || new Set(v).size !== v.length)
        fail('invalid_ids');
    return v as string[];
}
function editable(d: DiligenceCase) {
    if (d.status !== 'active')
        fail('diligence_frozen', 409);
}
export function registerDiligenceRoutes(server: FastifyInstance, store: LedgerStore, options: {
    auth?: AuthConfigInput;
    projectRoot: string;
    storageRoot?: string;
    onProjectedDocument?: (request: object) => void;
}) {
    const auth = resolveAuthConfig(options.auth), root = resolve(options.storageRoot ?? process.env.MATERIAL_STORAGE_ROOT ?? resolve(options.projectRoot, 'private-material-storage'));
    const actorOf = (r: FastifyRequest) => resolveRequestUser(r, auth)!;
    const directory = () => workflowDirectory(store, auth);
    const eligible = async (id: string, review = false) => {
        const u = (await directory()).find(u => u.id === id && u.canLogin);
        if (!u || !(review ? approvalEligible(u.role) : canRole(u.role, 'task:write')))
            fail('ineligible_user');
        return { id: u.id, name: u.name, email: u.email, role: u.role };
    };
    const organize = (actor: SessionUser) => {
        if (!approvalEligible(actor.role))
            fail('forbidden', 403);
    };
    const own = (actor: SessionUser, ownerId: string) => {
        if (!canRole(actor.role, 'task:write') || (!approvalEligible(actor.role) && actor.id !== ownerId))
            fail('not_diligence_assignee', 403);
    };
    const reviewer = (actor: SessionUser, d: DiligenceCase, s: WorkflowState) => {
        organize(actor);
        if (!(d.reviewers.some(u => u.id === actor.id) || (actor.id === d.ownerId && actor.id === s.project.ownerId)))
            fail('not_diligence_reviewer', 403);
    };
    const wrap = (fn: any) => async (r: any, reply: any) => {
        try {
            return await fn(r, reply);
        }
        catch (e) {
            if (e instanceof WorkflowError || e instanceof MaterialWriteError)
                return reply.code(e.status).send({ error: e.code });
            r.log.error(e);
            return reply.code(500).send({ error: 'diligence_failed' });
        }
    };
    async function readBytes(blobId: string, sha: string, size: number) {
        if (!/^[0-9a-f-]{36}$/i.test(blobId))
            fail('material_blob_unavailable', 409);
        let bytes: Buffer;
        try {
            const dir = await storageDirectory(root), f = await open(resolve(dir, blobId), constants.O_RDONLY | constants.O_NOFOLLOW);
            try {
                if (!(await f.stat()).isFile())
                    fail('material_blob_unavailable', 409);
                bytes = await f.readFile();
            }
            finally {
                await f.close();
            }
        }
        catch (e) {
            if (e instanceof WorkflowError)
                throw e;
            fail('material_blob_unavailable', 409);
        }
        if (bytes.length !== size || createHash('sha256').update(bytes).digest('hex') !== sha)
            fail('material_integrity_mismatch', 409);
        return bytes;
    }
    async function snapshot(materialId: string, projectId: string, actor: SessionUser, submissionId: string, paths: string[]): Promise<MaterialSnapshot> {
        const m = (await store.listMaterials()).find(m => m.id === materialId);
        if (!m || !(m.projectId === projectId || m.relationships?.projects.some(p => p.id === projectId)))
            fail('material_not_linked');
        if (!canReadMaterial(actor, m))
            fail('forbidden', 403);
        let bytes: Buffer, sha: string, name = m.name, versionId: string | null = null;
        if (m.currentVersionId) {
            const v = (await store.listMaterialVersions(m.id)).find(v => v.id === m.currentVersionId);
            if (!v)
                fail('material_version_unavailable', 409);
            bytes = await readBytes(v.blobId, v.sha256, v.sizeBytes);
            sha = v.sha256;
            name = v.name;
            versionId = v.id;
        }
        else {
            const legacy = await readLegacyOriginal(m, options.projectRoot, store, actor);
            bytes = legacy.bytes;
            sha = legacy.sha256;
        }
        const packetBlobId = randomUUID();
        paths.push(await writeBlob(root, packetBlobId, bytes));
        return { materialId, versionId, name, sha256: sha, sizeBytes: bytes.length, packetBlobId, downloadHref: `/api/projects/${projectId}/diligence/submissions/${submissionId}/materials/${materialId}/file` };
    }
    server.get('/api/projects/:id/diligence', wrap(async (r: any) => store.workflowTransaction(r.params.id, async (s) => ({ diligence: publicDiligence(s.diligence ?? null), currentUser: actorOf(r) }))));
    server.get('/api/projects/:id/diligence/reports/:reportId', wrap(async (r: any) => store.workflowTransaction(r.params.id, async (s) => {
        const report = s.diligence?.reports.find(v => v.id === r.params.reportId);
        if (!report)
            fail('diligence_report_not_found', 404);
        return { report: publicDiligence(report), currentUser: actorOf(r) };
    })));
    server.get('/api/projects/:id/diligence/reports/:reportId/:format', wrap(async (r:any,reply:any)=>{
        const actor=actorOf(r); if(!actor)fail('unauthorized',401);
        const document=await store.workflowTransaction(r.params.id,async s=>{
            const report=s.diligence?.reports.find(v=>v.id===r.params.reportId);if(!report)fail('diligence_report_not_found',404);
            const refs=[...report.source.items.flatMap(i=>i.submissions.flatMap(v=>v.evidence.map(e=>e.material))),...report.source.findings.flatMap(f=>f.evidence)];
            const materials=await store.listMaterials();
            for(const ref of refs){const material=materials.find(m=>m.id===ref.materialId);if(!material||!canReadMaterial(actor,material))fail('forbidden',403);}
            for(const ref of refs)await readBytes(ref.packetBlobId!,ref.sha256,ref.sizeBytes);
            return diligenceDocument(s.project.name,report);
        });
        const visible=canReadLp(actor)?document:(await lpProjection(store)).project(document) as typeof document;
        const bytes=await generateDocument(visible,r.params.format);
        options.onProjectedDocument?.(r);
        reply.header('Cache-Control','private, no-store').header('X-Content-Type-Options','nosniff').header('Content-Disposition',`attachment; filename="diligence.${r.params.format}"`);
        return reply.type(documentMime[r.params.format as keyof typeof documentMime]).send(bytes);
    }));
    server.get('/api/projects/:id/diligence/submissions/:submissionId/materials/:materialId/file', wrap(async (r: any, reply: any) => {
        const snap = await store.workflowTransaction(r.params.id, async (s) => s.diligence?.items.flatMap(i => i.submissions).find(v => v.id === r.params.submissionId)?.evidence.find(e => e.material.materialId === r.params.materialId)?.material ?? s.diligence?.findings.find(f => f.id === r.params.submissionId)?.evidence.find(m => m.materialId === r.params.materialId));
        if (!snap?.packetBlobId)
            fail('diligence_evidence_not_found', 404);
        const m = (await store.listMaterials()).find(m => m.id === snap.materialId);
        if (!m || !canReadMaterial(actorOf(r), m))
            fail('forbidden', 403);
        const bytes = await readBytes(snap.packetBlobId, snap.sha256, snap.sizeBytes);
        reply.header('Cache-Control', 'private, no-store').header('X-Content-Type-Options', 'nosniff').type('application/octet-stream').header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(snap.name).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16))}`);
        return reply.send(bytes);
    }));
    server.post('/api/projects/:id/diligence', wrap(async (r: any, reply: any) => {
        const actor = actorOf(r);
        organize(actor);
        const b = object(r.body, ['requestId', 'reviewerIds', 'note']), rid = requestId(b.requestId), reviewers = await Promise.all(ids(b.reviewerIds).map(id => eligible(id, true))), note = string(b.note, false);
        const result = await store.workflowTransaction(r.params.id, async (s) => idempotent(s, rid, actor, b, async () => {
            if (s.diligence)
                fail('diligence_exists', 409);
            if (!s.project.ownerId)
                fail('project_owner_required', 409);
            await eligible(s.project.ownerId, true);
            s.diligence = { id: randomUUID(), projectId: s.project.id, ownerId: s.project.ownerId, reviewers, note, revision: 1, status: 'active', createdBy: actor, createdAt: now(), items: [], findings: [], reports: [], supplements: [] };
            return { diligence: s.diligence, auditEvent: audit(s, actor, '建立尽调档案', { diligenceId: s.diligence.id }) };
        }));
        return reply.code(result.created ? 201 : 200).send(publicDiligence(result));
    }));
    server.post('/api/projects/:id/diligence/actions', wrap(async (r: any) => {
        const actor = actorOf(r), payload = r.body, base = object(payload, ['requestId', 'expectedRevision', 'action', 'itemId', 'title', 'category', 'ownerId', 'dueDate', 'requirements', 'summary', 'evidence', 'decision', 'opinion', 'description', 'severity', 'itemIds', 'materialIds', 'blocksReport', 'findingId', 'note', 'sections', 'reportId', 'taskId']);
        const rid = requestId(base.requestId), rev = revision(base.expectedRevision), action = string(base.action), paths: string[] = [];
        const keys: Record<string, string[]> = { add_item: ['title', 'category', 'ownerId', 'dueDate', 'requirements'], update_item: ['itemId', 'title', 'category', 'ownerId', 'dueDate', 'requirements'], submit_item: ['itemId', 'summary', 'evidence'], reopen_item: ['itemId', 'note'], review_item: ['itemId', 'decision', 'opinion'], add_finding: ['description', 'severity', 'ownerId', 'dueDate', 'itemIds', 'materialIds', 'blocksReport'], resolve_finding: ['findingId', 'note'], reopen_finding: ['findingId', 'note'], save_report: ['sections'], submit_report: ['reportId', 'dueDate'], review_report: ['reportId', 'decision', 'opinion'], complete_supplement: ['taskId', 'note'] };
        if (!Object.hasOwn(keys, action))
            fail('invalid_diligence_action');
        const b = object(payload, ['requestId', 'expectedRevision', 'action', ...keys[action]]);
        try {
            const result = await store.workflowTransaction(r.params.id, async (s) => idempotent(s, rid, actor, b, async () => {
                const d = s.diligence;
                if (!d)
                    fail('diligence_not_found', 404);
                if (d.revision !== rev)
                    fail('diligence_revision_conflict', 409);
                if (d.ownerId !== s.project.ownerId)
                    fail('diligence_owner_conflict', 409);
                const item = () => {
                    const i = d.items.find(i => i.id === string(b.itemId));
                    if (!i)
                        fail('diligence_item_not_found', 404);
                    return i;
                };
                const report = () => {
                    const v = d.reports.find(v => v.id === string(b.reportId));
                    if (!v)
                        fail('diligence_report_not_found', 404);
                    return v;
                };
                const taskStatus = (id: string, status: string) => {
                    const t = s.tasks.find(t => t.id === id);
                    if (!t)
                        fail('diligence_task_missing', 409);
                    t.status = status;
                    t.revision = (t.revision ?? 1) + 1;
                    t.updatedAt = now();
                    t.completedAt = ['已完成', '已取消'].includes(status) ? now() : null;
                };
                const supplement = (target: {
                    itemId?: string;
                    reportId?: string;
                }, owner: SessionUser, dueDate: string, opinion: string) => { const task = newTask(s, owner, { name: '尽调补件', type: '尽调任务', kind: 'diligence', dueDate, relation: '尽调', note: opinion }); d.supplements.push({ taskId: task.id, ...target, status: 'open', opinion }); };
                if (action === 'add_item' || action === 'update_item') {
                    editable(d);
                    organize(actor);
                    let i: DiligenceItem | undefined = action === 'update_item' ? item() : undefined;
                    if (i?.submissions.length)
                        fail('diligence_item_already_submitted', 409);
                    const owner = await eligible(string(b.ownerId)), dueDate = date(b.dueDate), title = string(b.title, true, 500), category = string(b.category, true, 200);
                    if (!Array.isArray(b.requirements) || !b.requirements.length || b.requirements.length > 100)
                        fail('invalid_requirements');
                    const requirements = b.requirements.map(v => { const q = object(v, ['id', 'title']); return { id: string(q.id, true, 100), title: string(q.title, true, 500) }; });
                    if (new Set(requirements.map(q => q.id)).size !== requirements.length)
                        fail('invalid_requirements');
                    if (i) {
                        Object.assign(i, { title, category, owner, dueDate, requirements });
                        const t = s.tasks.find(t => t.id === i!.taskId);
                        if (!t)
                            fail('diligence_task_missing', 409);
                        Object.assign(t, { name: title, owner: owner.name, ownerId: owner.id, dueDate, revision: (t.revision ?? 1) + 1, updatedAt: now() });
                    }
                    else {
                        const t = newTask(s, owner, { name: title, type: '尽调任务', kind: 'diligence', dueDate, relation: '尽调' });
                        d.items.push({ id: randomUUID(), title, category, owner, dueDate, requirements, taskId: t.id, status: 'draft', submissions: [] });
                    }
                }
                else if (action === 'submit_item') {
                    editable(d);
                    const i = item();
                    own(actor, i.owner.id);
                    if (i.status === 'pending' || i.status === 'approved')
                        fail('invalid_diligence_transition', 409);
                    if (d.supplements.some(q => q.itemId === i.id && q.status === 'open'))
                        fail('supplement_incomplete', 409);
                    const summary = string(b.summary);
                    if (!Array.isArray(b.evidence) || b.evidence.length !== i.requirements.length)
                        fail('diligence_evidence_required');
                    const evidenceInput = b.evidence.map(e => { const v = object(e, ['requirementId', 'materialId']); return { requirementId: string(v.requirementId), materialId: string(v.materialId) }; });
                    if (new Set(evidenceInput.map(e => e.requirementId)).size !== i.requirements.length || i.requirements.some(q => !evidenceInput.some(e => e.requirementId === q.id)))
                        fail('diligence_evidence_required');
                    const id = randomUUID(), evidence = [];
                    for (const e of evidenceInput)
                        evidence.push({ requirementId: e.requirementId, material: await snapshot(e.materialId, s.project.id, actor, id, paths) });
                    i.submissions.push({ id, version: i.submissions.length + 1, summary, submittedBy: actor, time: now(), evidence, status: 'pending', decisions: [] });
                    i.status = 'pending';
                    taskStatus(i.taskId, '待确认');
                }
                else if (action === 'reopen_item') {
                    editable(d);
                    organize(actor);
                    const i = item();
                    if (i.status !== 'approved')
                        fail('invalid_diligence_transition', 409);
                    const note = string(b.note);
                    i.status = 'returned';
                    taskStatus(i.taskId, '进行中');
                    supplement({ itemId: i.id }, i.owner, i.dueDate, note);
                }
                else if (action === 'review_item') {
                    editable(d);
                    reviewer(actor, d, s);
                    const i = item(), v = i.submissions.at(-1);
                    if (i.status !== 'pending' || !v)
                        fail('invalid_diligence_transition', 409);
                    if (!['approve', 'return'].includes(String(b.decision)))
                        fail('invalid_decision');
                    if (v.decisions.some(q => q.actor.id === actor.id))
                        fail('decision_already_recorded', 409);
                    const opinion = string(b.opinion);
                    v.decisions.push({ actor, decision: b.decision as 'approve' | 'return', opinion, time: now() });
                    if (b.decision === 'return') {
                        i.status = v.status = 'returned';
                        taskStatus(i.taskId, '进行中');
                    }
                    else if (actor.id === d.ownerId && actor.id === s.project.ownerId || d.reviewers.every(u => v.decisions.some(q => q.actor.id === u.id && q.decision === 'approve'))) {
                        i.status = v.status = 'approved';
                        taskStatus(i.taskId, '已完成');
                    }
                    if (b.decision === 'return')
                        supplement({ itemId: i.id }, i.owner, i.dueDate, opinion);
                }
                else if (action === 'add_finding') {
                    editable(d);
                    organize(actor);
                    const itemIds = ids(b.itemIds, true), materialIds = ids(b.materialIds, true);
                    if (itemIds.some(id => !d.items.some(i => i.id === id)))
                        fail('diligence_item_not_found', 404);
                    const findingId = randomUUID(), evidence: MaterialSnapshot[] = [];
                    for (const id of materialIds)
                        evidence.push(await snapshot(id, s.project.id, actor, findingId, paths));
                    if (!['low', 'medium', 'high'].includes(String(b.severity)) || typeof b.blocksReport !== 'boolean')
                        fail('invalid_payload');
                    const description = string(b.description), owner = await eligible(string(b.ownerId)), dueDate = date(b.dueDate), task = newTask(s, owner, { name: description.slice(0, 500), type: '尽调发现处理', kind: 'diligence', dueDate, relation: '尽调' });
                    d.findings.push({ id: findingId, evidence, taskId: task.id, description, severity: b.severity as 'low' | 'medium' | 'high', owner, dueDate, itemIds, materialIds, blocksReport: b.blocksReport, status: 'open', history: [{ action: 'created', actor, note: description, time: now() }] });
                }
                else if (action === 'resolve_finding' || action === 'reopen_finding') {
                    editable(d);
                    const f = d.findings.find(f => f.id === string(b.findingId));
                    if (!f)
                        fail('diligence_finding_not_found', 404);
                    if (action === 'reopen_finding')
                        organize(actor);
                    else
                        own(actor, f.owner.id);
                    const status = action === 'resolve_finding' ? 'closed' : 'open';
                    if (f.status === status)
                        fail('invalid_diligence_transition', 409);
                    f.status = status;
                    taskStatus(f.taskId, status === 'closed' ? '已完成' : '进行中');
                    f.history.push({ action: status === 'closed' ? 'resolved' : 'reopened', actor, note: string(b.note), time: now() });
                }
                else if (action === 'complete_supplement') {
                    editable(d);
                    const q = d.supplements.find(q => q.taskId === string(b.taskId)), t = s.tasks.find(t => t.id === q?.taskId);
                    if (!q || !t)
                        fail('diligence_supplement_not_found', 404);
                    own(actor, t.ownerId!);
                    if (q.status !== 'open')
                        fail('invalid_diligence_transition', 409);
                    Object.assign(q, { status: 'completed', completedBy: actor, note: string(b.note), completedAt: now() });
                    taskStatus(t.id, '已完成');
                }
                else if (action === 'save_report') {
                    editable(d);
                    organize(actor);
                    const source = sourceOf(d);
                    let sections: DiligenceSections;
                    if (b.sections === undefined) {
                        sections = { summary: `内部尽调报告：${s.project.name}`, workPerformed: d.items.filter(i => i.status === 'approved').map(i => `${i.title}：${i.submissions.at(-1)!.summary}`).join('\n') || '尚无已通过底稿', findings: d.findings.map(f => `${f.description}（${f.status === 'closed' ? '已关闭' : '未关闭'}）`).join('\n') || '尚未登记发现项', recommendation: '请基于已核验底稿填写结论建议。' };
                    }
                    else {
                        const v = object(b.sections, ['summary', 'workPerformed', 'findings', 'recommendation']);
                        sections = { summary: string(v.summary), workPerformed: string(v.workPerformed), findings: string(v.findings), recommendation: string(v.recommendation) };
                    }
                    d.reports.push({ id: randomUUID(), origin: b.sections === undefined ? 'system_summary' : 'manual_edit', version: d.reports.length + 1, reviewTaskIds: [], sections, source, sourceFingerprint: fingerprint(source), savedBy: actor, time: now(), status: 'draft', decisions: [] });
                }
                else if (action === 'submit_report') {
                    editable(d);
                    organize(actor);
                    const v = report();
                    if (v !== d.reports.at(-1) || v.status !== 'draft')
                        fail('invalid_diligence_transition', 409);
                    if (!d.items.length || d.items.some(i => i.status !== 'approved'))
                        fail('diligence_items_incomplete', 409);
                    if (d.findings.some(f => f.blocksReport && f.status !== 'closed'))
                        fail('diligence_blocking_findings', 409);
                    if (d.supplements.some(q => q.status !== 'completed'))
                        fail('supplement_incomplete', 409);
                    if (v.sourceFingerprint !== fingerprint(sourceOf(d)))
                        fail('diligence_report_stale', 409);
                    if (v.origin !== 'manual_edit')
                        fail('diligence_report_requires_edit', 409);
                    for (const i of v.source.items)
                        for (const e of i.submissions.at(-1)!.evidence) {
                            const m = (await store.listMaterials()).find(m => m.id === e.material.materialId);
                            if (!m || !canReadMaterial(actor, m))
                                fail('forbidden', 403);
                            await readBytes(e.material.packetBlobId!, e.material.sha256, e.material.sizeBytes);
                        }
                    for (const f of v.source.findings)
                        for (const m of f.evidence) {
                            const material = (await store.listMaterials()).find(x => x.id === m.materialId);
                            if (!material || !canReadMaterial(actor, material))
                                fail('forbidden', 403);
                            await readBytes(m.packetBlobId!, m.sha256, m.sizeBytes);
                        }
                    const dueDate = date(b.dueDate);
                    v.reviewTaskIds = d.reviewers.map(owner => newTask(s, owner, { name: '尽调报告评审', type: '尽调任务', kind: 'diligence', dueDate, relation: '尽调', note: `内部尽调报告 V${v.version}` }).id);
                    v.status = 'pending';
                    v.submittedAt = now();
                    d.status = 'pending';
                }
                else if (action === 'review_report') {
                    reviewer(actor, d, s);
                    const v = report();
                    if (d.status !== 'pending' || v.status !== 'pending' || v !== d.reports.at(-1))
                        fail('diligence_frozen', 409);
                    if (!['approve', 'return', 'reject'].includes(String(b.decision)))
                        fail('invalid_decision');
                    if (v.decisions.some(q => q.actor.id === actor.id))
                        fail('decision_already_recorded', 409);
                    const decision = b.decision as 'approve' | 'return' | 'reject', opinion = string(b.opinion);
                    v.decisions.push({ actor, decision, opinion, time: now() });
                    if (decision === 'reject') {
                        v.status = 'rejected';
                        d.status = 'rejected';
                    }
                    else if (decision === 'return') {
                        v.status = 'returned';
                        d.status = 'active';
                        supplement({ reportId: v.id }, await eligible(d.ownerId, true), now().slice(0, 10), opinion);
                    }
                    else if (actor.id === d.ownerId && actor.id === s.project.ownerId || d.reviewers.every(u => v.decisions.some(q => q.actor.id === u.id && q.decision === 'approve'))) {
                        v.status = 'approved';
                        d.status = 'approved';
                    }
                    for (const id of v.reviewTaskIds) {
                        const task = s.tasks.find(t => t.id === id);
                        if (!task)
                            fail('diligence_task_missing', 409);
                        if (task.ownerId === actor.id)
                            taskStatus(id, '已完成');
                        else if (d.status !== 'pending' && task.status !== '已完成')
                            taskStatus(id, '已取消');
                    }
                }
                d.revision++;
                return { diligence: d, tasks: s.tasks.filter(t => t.kind === 'diligence'), auditEvent: audit(s, actor, '尽调操作', { action, revision: d.revision }) };
            }));
            return publicDiligence(result);
        }
        catch (e) {
            if (e instanceof WorkflowError || (e as any)?.safeToDeleteBlob)
                await Promise.all(paths.map(p => unlink(p).catch(() => { })));
            throw e;
        }
    }));
}
