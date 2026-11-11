import { nextScheduleDate } from '../ledger/deal.ts';
import { randomUUID, createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { resolveRequestUser } from '../auth/authorize.ts';
import { canRole, isRole } from '../auth/rbac.ts';
import { getAdminUser, resolveAuthConfig, type AuthConfigInput, type SessionUser } from '../auth/session.ts';
import type { LedgerStore } from '../ledger/store.ts';
import { readLegacyOriginal, storageDirectory, writeBlob } from './material-upload.ts';
import { canReadMaterial } from './material-files.ts';
import { MaterialWriteError } from '../ledger/material-upload.ts';
import { taskCreateFields, WorkflowError, fail, object, string, date, requestId, revision, audit, idempotent, newTask, meetings, approvalEligible, type DirectoryUser, type WorkflowState, type ApprovalRound, type MaterialSnapshot, type MeetingType } from '../ledger/workflow.ts';
type WorkflowRequest = FastifyRequest<{
    Params: {
        id: string;
        roundId: string;
        materialId: string;
    };
}>;
export async function workflowDirectory(store: LedgerStore, auth: ReturnType<typeof resolveAuthConfig>): Promise<DirectoryUser[]> {
    return [getAdminUser(auth), ...(await store.listUsers()).filter(u => u.id !== 'user-admin' && u.email.toLowerCase() !== auth.adminEmail.toLowerCase())].map(u => ({
        id: u.id, name: u.name, email: u.email, role: u.role, canLogin: u.id === 'user-admin' || ((u as {enabled?:boolean}).enabled!==false && Boolean((u as {passwordHash?: string}).passwordHash))
    }));
}
export function registerWorkflowRoutes(server: FastifyInstance, store: LedgerStore, options: {
    auth?: AuthConfigInput;
    projectRoot: string;
    storageRoot?: string;
}) {
    const auth = resolveAuthConfig(options.auth);
    const storageRoot = resolve(options.storageRoot ?? process.env.MATERIAL_STORAGE_ROOT ?? resolve(options.projectRoot, 'private-material-storage'));
    const directory = () => workflowDirectory(store, auth);
    const actorOf = (request: FastifyRequest) => resolveRequestUser(request, auth)!;
    const eligible = async (id: string, permission: 'approval' | 'task') => {
        const u = (await directory()).find(u => u.id === id && u.canLogin);
        if (!u || !(permission === 'approval' ? approvalEligible(u.role) : canRole(u.role, 'task:write')))
            fail('ineligible_user');
        const { canLogin, ...actor } = u;
        return actor;
    };
    const wrap = (handler: (request: WorkflowRequest, reply: FastifyReply) => Promise<unknown>) => async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            return await handler(request as WorkflowRequest, reply);
        }
        catch (e) {
            if (e instanceof WorkflowError)
                return reply.code(e.status).send({
                    error: e.code
                });
            if (e && typeof e === 'object' && 'status' in e && 'code' in e)
                return reply.code(typeof e.status === 'number' ? e.status : 400).send({
                    error: String(e.code)
                });
            request.log.error({
                error: e instanceof Error ? e.message : 'workflow_failed'
            }, 'workflow failed');
            return reply.code(500).send({
                error: 'workflow_failed'
            });
        }
    };
    server.get('/api/users', wrap(async () => ({
        users: await directory()
    })));
    server.put('/api/projects/:id/owner', wrap(async (request: WorkflowRequest) => {
        const actor = actorOf(request);
        if (actor.role !== 'admin')
            fail('forbidden', 403);
        const b = object(request.body, ['ownerId']);
        const owner = await eligible(string(b.ownerId), 'approval');
        return store.workflowTransaction(request.params.id, async (s) => {
            if (s.deals?.length) fail('deal_owner_locked', 409);
            if (s.diligence) fail('diligence_owner_locked', 409);
            if (s.rounds.some(r => r.status === 'pending'))
                fail('approval_pending', 409);
            const before = s.project.ownerId;
            s.project.ownerId = owner.id;
            s.project.manager = owner.name;
            s.project.managerLabel = owner.name;
            const event = audit(s, actor, '分配项目负责人', {
                before, after: owner.id
            });
            return {
                project: s.project, auditEvent: event
            };
        });
    }));
    server.get('/api/projects/:id/approvals', wrap(async (request: WorkflowRequest) => {
        const detail = await store.getProjectDetail(request.params.id);
        if (!detail)
            fail('project_not_found', 404);
        const rounds = (await store.readApprovals(request.params.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.attempt - b.attempt);
        const next = nextMeeting(rounds);
        return {
            ownerId: detail.project.ownerId ?? null, rounds: rounds.map(publicRound), nextMeetingType: next, currentUser: actorOf(request)
        };
    }));
    async function snapshots(ids: string[], projectId: string, actor: SessionUser, roundId: string, stagedPaths: string[]): Promise<MaterialSnapshot[]> {
        const materials = await store.listMaterials();
        const result: MaterialSnapshot[] = [];
        for (const id of ids) {
            const m = materials.find(m => m.id === id);
            if (!m || !(m.projectId === projectId || m.relationships?.projects.some(r => r.id === projectId)))
                fail('material_not_linked');
            if (m.currentVersionId) {
                const version = (await store.listMaterialVersions(id)).find(v => v.id === m.currentVersionId);
                if (!version)
                    fail('material_version_unavailable', 409);
                if (!/^[0-9a-f-]{36}$/i.test(version.blobId))
                    fail('material_blob_unavailable', 409);
                const root = resolve(options.storageRoot ?? process.env.MATERIAL_STORAGE_ROOT ?? resolve(options.projectRoot, 'private-material-storage'));
                try {
                    const dir = await storageDirectory(root);
                    const f = await open(resolve(dir, version.blobId), constants.O_RDONLY | constants.O_NOFOLLOW);
                    let bytes: Buffer;
                    try {
                        if (!(await f.stat()).isFile())
                            fail('material_blob_unavailable', 409);
                        bytes = await f.readFile();
                    }
                    finally {
                        await f.close();
                    }
                    if (bytes.length !== version.sizeBytes || createHash('sha256').update(bytes).digest('hex') !== version.sha256)
                        fail('material_integrity_mismatch', 409);
                }
                catch (e) {
                    if (e instanceof WorkflowError)
                        throw e;
                    fail('material_blob_unavailable', 409);
                }
                result.push({
                    materialId: id, versionId: version.id, name: version.name, sha256: version.sha256, sizeBytes: version.sizeBytes, downloadHref: `/api/materials/${id}/versions/${version.id}/file`
                });
            }
            else {
                const original = await readLegacyOriginal(m, options.projectRoot, store, actor);
                const packetBlobId = randomUUID();
                stagedPaths.push(await writeBlob(storageRoot, packetBlobId, original.bytes));
                result.push({ materialId: id, versionId: null, name: m.name, sha256: original.sha256, sizeBytes: original.bytes.length, packetBlobId, downloadHref: `/api/projects/${projectId}/approvals/${roundId}/materials/${id}/file` });
            }
        }
        return result;
    }
    server.get('/api/projects/:id/approvals/:roundId/materials/:materialId/file', wrap(async (request: WorkflowRequest, reply: FastifyReply) => {
        const { id, roundId, materialId } = request.params;
        const round = (await store.readApprovals(id)).find(round => round.id === roundId);
        const snapshot = round?.materials.find(material => material.materialId === materialId);
        if (!snapshot?.packetBlobId || !/^[0-9a-f-]{36}$/i.test(snapshot.packetBlobId))
            fail('approval_packet_not_found', 404);
        const material = (await store.listMaterials()).find(material => material.id === materialId);
        if (!material || !canReadMaterial(actorOf(request), material))
            fail('forbidden', 403);
        let bytes: Buffer;
        try {
            const directory = await storageDirectory(storageRoot);
            const file = await open(resolve(directory, snapshot.packetBlobId), constants.O_RDONLY | constants.O_NOFOLLOW);
            try {
                if (!(await file.stat()).isFile())
                    fail('approval_packet_not_found', 404);
                bytes = await file.readFile();
            }
            finally {
                await file.close();
            }
        }
        catch (error) {
            if (error instanceof WorkflowError)
                throw error;
            fail('approval_packet_not_found', 404);
        }
        if (bytes.length !== snapshot.sizeBytes || createHash('sha256').update(bytes).digest('hex') !== snapshot.sha256)
            fail('approval_packet_integrity_mismatch', 409);
        reply.header('Cache-Control', 'private, no-store');
        reply.header('X-Content-Type-Options', 'nosniff');
        reply.type('application/octet-stream').header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(snapshot.name).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16))}`);
        return reply.send(bytes);
    }));
    server.post('/api/projects/:id/approvals', wrap(async (request: WorkflowRequest, reply: FastifyReply) => {
        const actor = actorOf(request);
        if (!approvalEligible(actor.role))
            fail('forbidden', 403);
        const b = object(request.body, ['requestId', 'meetingType', 'reviewerIds', 'materialIds', 'dueDate', 'note']);
        const rid = requestId(b.requestId);
        if (!meetings.includes(b.meetingType as MeetingType))
            fail('invalid_meeting_type');
        const reviewerIds = ids(b.reviewerIds), materialIds = ids(b.materialIds);
        const dueDate = date(b.dueDate), note = string(b.note, false);
        const reviewers = await Promise.all(reviewerIds.map(id => eligible(id, 'approval')));
        const stagedPaths: string[] = [];
        const result = await withPacketCleanup(stagedPaths, () => store.workflowTransaction(request.params.id, async (s) => idempotent(s, rid, actor, b, async () => {
            if (!s.project.ownerId)
                fail('project_owner_required', 409);
            await eligible(s.project.ownerId, 'approval');
            if (s.rounds.some(r => r.status === 'pending'))
                fail('approval_pending', 409);
            if (nextMeeting(s.rounds) !== b.meetingType)
                fail('meeting_sequence_conflict', 409);
            if (s.tasks.some(t => t.kind === 'supplement' && t.status !== '已完成'))
                fail('supplement_incomplete', 409);
            const roundId = randomUUID();
            const materials = await snapshots(materialIds, s.project.id, actor, roundId, stagedPaths);
            const round: ApprovalRound = {
                id: roundId, projectId: s.project.id, meetingType: b.meetingType as MeetingType, attempt: s.rounds.filter(r => r.meetingType === b.meetingType).length + 1, status: 'pending', revision: 1, ownerId: s.project.ownerId, submittedBy: actor, reviewers, materials, dueDate, note, createdAt: new Date().toISOString(), decisions: []
            };
            s.rounds.push(round);
            s.project.latest = `${round.meetingType}审批中`;
            s.project.nextAction = `等待${round.meetingType}审批意见`;
            const tasks = reviewers.map(owner => newTask(s, owner, {
                name: `${round.meetingType}审批`, dueDate, kind: 'review', approvalRoundId: round.id
            }));
            const events = [audit(s, actor, '发起审批', {
                    roundId: round.id, meetingType: round.meetingType, materials: materials.map(publicMaterial)
                })];
            return {
                round, project: s.project, tasks, auditEvents: events
            };
        })));
        return reply.code(result.created ? 201 : 200).send(publicApprovalResult(result));
    }));
    server.post('/api/projects/:id/approvals/:roundId/decisions', wrap(async (request: WorkflowRequest) => {
        const actor = actorOf(request);
        if (!approvalEligible(actor.role))
            fail('forbidden', 403);
        const b = object(request.body, ['requestId', 'expectedRevision', 'decision', 'opinion']);
        const rid = requestId(b.requestId), rev = revision(b.expectedRevision), opinion = string(b.opinion);
        if (!['approve', 'return', 'reject'].includes(String(b.decision)))
            fail('invalid_decision');
        const result = await store.workflowTransaction(request.params.id, async (s) => idempotent(s, rid, actor, {
            roundId: request.params.roundId, ...b
        }, async () => {
            const r = s.rounds.find(r => r.id === request.params.roundId);
            if (!r)
                fail('approval_not_found', 404);
            if (r.status !== 'pending' || r.revision !== rev)
                fail('approval_revision_conflict', 409);
            const owner = actor.id === r.ownerId && actor.id === s.project.ownerId;
            if (!owner && !r.reviewers.some(u => u.id === actor.id))
                fail('not_approval_reviewer', 403);
            if (r.decisions.some(d => d.actor.id === actor.id))
                fail('decision_already_recorded', 409);
            r.decisions.push({
                actor, decision: b.decision as ApprovalRound['decisions'][number]['decision'], opinion, time: new Date().toISOString()
            });
            r.revision++;
            if (b.decision === 'reject')
                r.status = 'rejected';
            else if (b.decision === 'return')
                r.status = 'returned';
            else if (owner || r.reviewers.every(u => r.decisions.some(d => d.actor.id === u.id && d.decision === 'approve')))
                r.status = 'approved';
            const events = [audit(s, actor, '签署审批意见', {
                    roundId: r.id, decision: b.decision, opinion, status: r.status
                })];
            for (const t of s.tasks.filter(t => t.approvalRoundId === r.id && t.kind === 'review')) {
                if ((r.status !== 'pending' && t.status !== '已完成') || t.ownerId === actor.id) {
                    t.status = t.ownerId === actor.id ? '已完成' : '已取消';
                    t.revision = (t.revision ?? 1) + 1;
                    t.completedAt = new Date().toISOString();
                    events.push(audit(s, actor, '更新审批任务', t, t.id));
                }
            }
            if (r.status === 'returned') {
                const task = newTask(s, await eligible(r.ownerId, 'approval'), {
                    name: `${r.meetingType}补件`, dueDate: r.dueDate, kind: 'supplement', approvalRoundId: r.id, note: opinion
                });
                events.push(audit(s, actor, '创建补件任务', task, task.id));
            }
            s.project.latest = `${r.meetingType}${r.status === 'approved' ? '已通过' : r.status === 'returned' ? '已退回' : r.status === 'rejected' ? '已否决' : '审批中'}`;
            s.project.nextAction = r.status === 'returned' ? '完成补件后重新提交审批' : r.status === 'rejected' ? '审批已冻结' : r.status === 'approved' ? (r.meetingType === '立项会' ? '发起总办会' : r.meetingType === '总办会' ? '发起投委会' : '后续尽调、交割安排待另行确定') : `等待${r.meetingType}其余审批意见`;
            if (r.status === 'approved') {
                if (r.meetingType === '立项会')
                    s.project.stage = '立项';
                if (r.meetingType === '投委会')
                    s.project.stage = '投决';
            }
            return {
                round: r, project: s.project, tasks: s.tasks.filter(t => t.approvalRoundId === r.id), auditEvents: events
            };
        }));
        return publicApprovalResult(result);
    }));
    // Task writes use this transaction path; internal meeting and intake helpers retain their existing contract.
    server.post('/api/tasks', wrap(async (request: WorkflowRequest, reply: FastifyReply) => {
        const actor = actorOf(request);
        if (!canRole(actor.role, 'task:write'))
            fail('forbidden', 403);
        const b = object(request.body, ['requestId', 'projectId', 'name', 'type', 'stage', 'ownerId', 'dueDate', 'status', 'priority', 'relation', 'note']);
        const rid = requestId(b.requestId), projectId = string(b.projectId), owner = await eligible(string(b.ownerId), 'task');
        const input = taskCreateFields(b);
        const result = await store.workflowTransaction(projectId, async (s) => idempotent(s, rid, actor, b, async () => {
            const task = newTask(s, owner, input);
            return {
                task, auditEvent: audit(s, actor, '创建任务', {
                    after: task
                }, task.id)
            };
        }));
        return reply.code(result.created ? 201 : 200).send(result);
    }));
    server.patch('/api/tasks/:id', wrap(async (request: WorkflowRequest) => {
        const actor = actorOf(request);
        if (!canRole(actor.role, 'task:write'))
            fail('forbidden', 403);
        const b = object(request.body, ['requestId', 'expectedRevision', 'name', 'type', 'ownerId', 'dueDate', 'priority', 'relation', 'note', 'status', 'completionNote']);
        const rid = requestId(b.requestId), rev = revision(b.expectedRevision);
        const found = (await store.listTasks()).find(t => t.id === request.params.id);
        if (!found)
            fail('task_not_found', 404);
        const owner = b.ownerId === undefined ? null : await eligible(string(b.ownerId), 'task');
        return store.workflowTransaction(found.projectId, async (s) => idempotent(s, rid, actor, {
            id: found.id, ...b
        }, async () => {
            const t = s.tasks.find(t => t.id === found.id)!;
            if ((t.revision ?? 1) !== rev)
                fail('task_revision_conflict', 409);
            if (t.kind === 'post_clause') fail('task_managed_by_post_clause',409);
            if (t.kind === 'diligence') fail('task_managed_by_diligence', 409);
            if (t.kind === 'review')
                fail('review_task_managed_by_approval', 409);
            if (t.kind === 'supplement') {
                if (b.status === '已取消')
                    fail('supplement_cannot_cancel', 409);
                const sourceRound = s.rounds.find(round => round.id === t.approvalRoundId);
                if (sourceRound && s.rounds.some(round => round.meetingType === sourceRound.meetingType && round.attempt > sourceRound.attempt)) {
                    fail('supplement_consumed_by_resubmission', 409);
                }
            }
            const recurring = s.deals?.flatMap(d => d.closing ? d.closing.responsibility.schedules.map(schedule => ({ schedule, responsibility: d.closing!.responsibility })) : []).find(v => (v.schedule.taskIds ?? [v.schedule.taskId]).includes(t.id));
            if (recurring && (['已完成','已取消'].includes(t.status) || Object.keys(b).some(k => !['requestId','expectedRevision','status','completionNote'].includes(k)) || b.status === '已取消')) fail('deal_schedule_task_locked',409);
            const before = structuredClone(t);
            const status = b.status === undefined ? t.status : string(b.status);
            if (!['未开始', '进行中', '已完成', '已取消', '待确认', '已逾期'].includes(status))
                fail('invalid_task_status');
            const old = ['待确认', '已逾期', '待处理'].includes(t.status) ? '未开始' : t.status;
            const note = b.completionNote === undefined ? '' : string(b.completionNote);
            if (status !== t.status) {
                if (status === '已完成' && !['未开始', '进行中'].includes(old) || status === '进行中' && !['未开始', '已完成'].includes(old) || status === '未开始' || status === '待确认' || status === '已逾期' || old === '已取消')
                    fail('invalid_task_transition', 409);
                if (['已完成', '已取消'].includes(status) || old === '已完成') {
                    if (!note)
                        fail('completion_note_required');
                }
                if (status === '已完成' && !owner && !t.ownerId)
                    fail('task_owner_required', 409);
                if (status === '已完成')
                    await eligible(owner?.id ?? t.ownerId!, 'task');
            }
            if (t.status === '已完成' && owner && status !== '进行中')
                fail('reopen_before_reassign', 409);
            for (const key of ['name', 'type', 'priority', 'relation', 'note'] as const)
                if (b[key] !== undefined)
                    t[key] = string(b[key], !['relation', 'note'].includes(key));
            if (b.priority !== undefined && !['高', '中', '低'].includes(t.priority))
                fail('invalid_task_priority');
            if (b.dueDate !== undefined)
                t.dueDate = date(b.dueDate);
            if (owner) {
                t.ownerId = owner.id;
                t.owner = owner.name;
            }
            t.status = status;
            t.revision = rev + 1;
            t.updatedAt = new Date().toISOString();
            t.completedAt = status === '已完成' || status === '已取消' ? t.updatedAt : null;
            if (recurring && status === '已完成' && before.status !== '已完成') {
                const dueDate = nextScheduleDate(recurring.schedule.firstDueDate, t.dueDate, recurring.schedule.frequency);
                recurring.schedule.taskIds ??= [recurring.schedule.taskId];
                recurring.schedule.taskId = newTask(s, await eligible(recurring.responsibility.owner.id, 'task'), { kind:'manual', name:t.name, dueDate, stage:'投后', type:t.type, relation:t.relation, note:t.note }).id;
                recurring.schedule.taskIds.push(recurring.schedule.taskId);
            }
            const event = audit(s, actor, '更新任务', {
                before, after: t, completionNote: note
            }, t.id);
            return {
                task: t, auditEvent: event
            };
        }));
    }));
}
function ids(v: unknown) {
    if (!Array.isArray(v) || v.length < 1 || v.length > 100 || v.some(x => typeof x !== 'string' || !x.trim()) || new Set(v).size !== v.length)
        fail('invalid_ids');
    return v as string[];
}
function nextMeeting(rounds: ApprovalRound[]) {
    if (rounds.some(r => r.status === 'rejected' || r.status === 'pending'))
        return null;
    return meetings.find(m => !rounds.some(r => r.meetingType === m && r.status === 'approved')) ?? null;
}
function publicMaterial(snapshot: MaterialSnapshot) {
    const { packetBlobId, ...safe } = snapshot;
    return safe;
}
function publicRound(round: ApprovalRound) {
    return { ...round, materials: round.materials.map(publicMaterial) };
}
function publicApprovalResult<T extends {
    round: ApprovalRound;
}>(result: T) {
    return { ...result, round: publicRound(result.round) };
}
async function withPacketCleanup<T>(paths: string[], action: () => Promise<T>): Promise<T> {
    try {
        return await action();
    }
    catch (error) {
        // A failed COMMIT response may have committed; retain copies unless rollback is known.
        if (error instanceof WorkflowError || error instanceof MaterialWriteError || (error as {
            safeToDeleteBlob?: boolean;
        })?.safeToDeleteBlob)
            await Promise.all(paths.map(path => unlink(path).catch(() => {
            })));
        throw error;
    }
}
