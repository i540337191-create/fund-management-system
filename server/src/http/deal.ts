import { materialVersionSourceBasis, sourceBasisOf, inputSource, parseIncludeDemo } from '../ledger/source-policy.ts';
import { projectInvestmentLedger } from '../ledger/investment-ledger.ts';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { resolveRequestUser } from '../auth/authorize.ts';
import { canRole } from '../auth/rbac.ts';
import { resolveAuthConfig, type AuthConfigInput, type SessionUser } from '../auth/session.ts';
import type { LedgerStore } from '../ledger/store.ts';
import type { DealBatch, DealTermsInput } from '../ledger/deal.ts';
import { WorkflowError, fail, object, string, date, revision, requestId, audit, idempotent, newTask, approvalEligible, meetings, type MaterialSnapshot, type WorkflowState } from '../ledger/workflow.ts';
import { MaterialWriteError } from '../ledger/material-upload.ts';
import { publicDiligence } from './diligence.ts';
import { storageDirectory, writeBlob } from './material-upload.ts';
import { canReadMaterial } from './material-files.ts';
import { workflowDirectory } from './workflow.ts';
const now = () => new Date().toISOString();
// CNY is stored as canonical decimal strings and summed as integer cents.
export function decimal(value: unknown, scale = 2): {
    text: string;
    units: bigint;
} {
    const s = string(value, true, 30);
    if (!new RegExp(`^(0|[1-9]\\d{0,17})(\\.\\d{1,${scale}})?$`).test(s))
        fail('invalid_decimal');
    const [whole, fraction = ''] = s.split('.'), units = BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, '0'));
    if (units <= 0n)
        fail('invalid_decimal');
    return { text: `${whole}.${fraction.padEnd(scale, '0')}`, units };
}
function list(value: unknown, empty = false): unknown[] {
    if (!Array.isArray(value) || value.length > 100 || (!empty && !value.length))
        fail('invalid_list');
    return value;
}
function unique(values: string[]) { if (new Set(values).size !== values.length)
    fail('duplicate_value'); return values; }
export function registerDealRoutes(server: FastifyInstance, store: LedgerStore, options: {
    auth?: AuthConfigInput;
    projectRoot: string;
    storageRoot?: string;
}) {
    const auth = resolveAuthConfig(options.auth), root = resolve(options.storageRoot ?? process.env.MATERIAL_STORAGE_ROOT ?? resolve(options.projectRoot, 'private-material-storage'));
    const actorOf = (r: any) => resolveRequestUser(r, auth)!;
    const permission = (actor: SessionUser, write = true) => { if (write ? !approvalEligible(actor.role) : !canRole(actor.role, 'project:read') && actor.role !== 'legal' && actor.role !== 'post_investment')
        fail('forbidden', 403); };
    const eligible = async (id: string, review = true): Promise<SessionUser> => {
        const u = (await workflowDirectory(store, auth)).find(u => u.id === id && u.canLogin);
        if (!u || (review ? !approvalEligible(u.role) : !canRole(u.role, 'task:write')))
            fail('ineligible_user');
        return { id: u.id, name: u.name, email: u.email, role: u.role };
    };
    const wrap = (fn: any) => async (r: any, reply: any) => { try {
        return await fn(r, reply);
    }
    catch (e) {
        if (e instanceof WorkflowError || e instanceof MaterialWriteError)
            return reply.code(e.status).send({ error: e.code });
        r.log.error(e);
        return reply.code(500).send({ error: 'deal_failed' });
    } };
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
    async function snapshot(input: unknown, s: WorkflowState, d: DealBatch, actor: SessionUser, paths: string[]): Promise<MaterialSnapshot> {
        const b = object(input, ['materialId', 'versionId']), materialId = string(b.materialId), versionId = string(b.versionId);
        const m = (await store.listMaterials()).find(m => m.id === materialId);
        if (!m || !(m.projectId === s.project.id || m.relationships?.projects.some(p => p.id === s.project.id)))
            fail('material_not_linked');
        if (!canReadMaterial(actor, m))
            fail('forbidden', 403);
        const v = (await store.listMaterialVersions(materialId)).find(v => v.id === versionId);
        if (!v)
            fail('material_version_unavailable', 409);
        const bytes = await readBytes(v.blobId, v.sha256, v.sizeBytes), packetBlobId = randomUUID();
        paths.push(await writeBlob(root, packetBlobId, bytes));
        return { materialId, versionId, sourceBasis:materialVersionSourceBasis(m,v), name: v.name, sha256: v.sha256, sizeBytes: v.sizeBytes, packetBlobId, downloadHref: `/api/projects/${s.project.id}/deals/${d.id}/files/${versionId}` };
    }
    async function evidence(input: unknown, s: WorkflowState, d: DealBatch, a: SessionUser, paths: string[]) { const refs = list(input); const keys = refs.map(v => { const b = object(v, ['materialId', 'versionId']); return `${string(b.materialId)}:${string(b.versionId)}`; }); unique(keys); const result = []; for (const ref of refs)
        result.push(await snapshot(ref, s, d, a, paths)); return result; }
    async function verify(snaps: MaterialSnapshot[], actor: SessionUser) { for (const snap of snaps) {
        const m = (await store.listMaterials()).find(m => m.id === snap.materialId);
        if (!m || (!canReadMaterial(actor, m)))
            fail('forbidden', 403);
        await readBytes(snap.packetBlobId!, snap.sha256, snap.sizeBytes);
    } }
    async function terms(input: unknown): Promise<DealTermsInput> {
        const b = object(input, ['amount', 'valuation', 'share', 'date', 'allocations', 'requiredAgreements', 'conditions']);
        const amount = decimal(b.amount), valuation = decimal(b.valuation), share = decimal(b.share, 6);
        if (share.units > 100000000n)
            fail('invalid_share');
        const funds = await store.listFunds(), allocations = list(b.allocations).map(v => { const q = object(v, ['fundId', 'amount']), fundId = string(q.fundId); if (!funds.some(f => f.id === fundId))
            fail('fund_not_found', 404); return { fundId, amount: decimal(q.amount).text }; });
        unique(allocations.map(v => v.fundId));
        if (allocations.reduce((n, v) => n + decimal(v.amount).units, 0n) !== amount.units)
            fail('allocation_sum_mismatch');
        const requiredAgreements = unique(list(b.requiredAgreements).map(v => string(v, true, 500)));
        const conditions = list(b.conditions).map(v => { const q = object(v, ['id', 'title']); return { id: string(q.id, true, 100), title: string(q.title, true, 500) }; });
        unique(conditions.map(v => v.id));
        return { amount: amount.text, valuation: valuation.text, share: share.text, date: date(b.date), allocations, requiredAgreements, conditions };
    }
    function gate(s: WorkflowState) {
        if (meetings.some(type => { const r = s.rounds.filter(r => r.meetingType === type).sort((a, b) => a.attempt - b.attempt).at(-1); return !r || r.status !== 'approved' || r.ownerId !== s.project.ownerId || r.decisions.some(q => q.decision === 'reject'); }))
            fail('deal_approvals_required', 409);
    }
    server.get('/api/projects/:id/deals', wrap(async (r: any) => { permission(actorOf(r), false); return store.workflowTransaction(r.params.id, async (s) => ({ deals: publicDiligence(s.deals ?? []), currentUser: actorOf(r) })); }));
    server.get('/api/funds/:id/deals', wrap(async (r: any) => {
        if (!canRole(actorOf(r).role, 'fund:read'))
            fail('forbidden', 403);
        const snapshot=await store.readInvestmentLedgerSnapshot();
        if(!snapshot.funds.some(f=>f.id===r.params.id))fail('fund_not_found',404);
        const ledger=projectInvestmentLedger(snapshot,{type:'fund',id:r.params.id},{includeDemo:parseIncludeDemo(r.query.includeDemo)});
        const allocations=ledger.rows.map(row=>{
            const d=snapshot.states.find(s=>s.project.id===row.projectId)!.deals.find(d=>d.id===row.dealId)!;
            const t=d.terms.find(t=>t.id===row.termsId)!;
            return {projectId:row.projectId,projectName:row.projectName,dealId:row.dealId,title:row.dealTitle,status:row.dealStatus,termsId:row.termsId,termsStatus:row.termsStatus,amount:t.amount,valuation:t.valuation,share:t.share,date:t.date,fundId:row.fundId,allocationAmount:row.closedContribution??row.plannedContribution,cashStatus:row.cashStatus,sourceOrigins:row.sourceOrigins};
        });
        return {allocations,issues:ledger.issues,sourcePolicy:ledger.sourcePolicy,sourceCounts:ledger.sourceCounts};
    }));
    server.get('/api/projects/:id/deals/:dealId/files/:fileId', wrap(async (r: any, reply: any) => {
        permission(actorOf(r), false);
        const snap = await store.workflowTransaction(r.params.id, async (s) => { const d = s.deals?.find(d => d.id === r.params.dealId); const snaps = d ? [...d.agreements.flatMap(a => a.signed ? [a.signed.material, ...a.signed.evidence] : []), ...d.confirmations.flatMap(c => c.evidence), ...d.closing?.evidence ?? []] : []; return snaps.find(m => m.versionId === r.params.fileId); });
        if (!snap)
            fail('deal_file_not_found', 404);
        await verify([snap], actorOf(r));
        return reply.type('application/octet-stream').header('X-Content-Type-Options', 'nosniff').header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(snap.name).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16))}`).send(await readBytes(snap.packetBlobId!, snap.sha256, snap.sizeBytes));
    }));
    server.post('/api/projects/:id/deals', wrap(async (r: any, reply: any) => {
        const actor = actorOf(r);
        permission(actor);
        const b = object(r.body, ['requestId', 'title', 'reviewerIds']), rid = requestId(b.requestId), title = string(b.title, true, 500), reviewers = await Promise.all(unique(list(b.reviewerIds).map(v => string(v))).map(id => eligible(id)));
        const result = await store.workflowTransaction(r.params.id, async (s) => idempotent(s, rid, actor, b, async () => { if (!s.project.ownerId)
            fail('project_owner_required', 409); await eligible(s.project.ownerId); const d: DealBatch = { ...inputSource(), id: randomUUID(), projectId: s.project.id, ownerId: s.project.ownerId, title, revision: 1, status: 'active', reviewers, createdBy: actor, createdAt: now(), terms: [], agreements: [], confirmations: [] }; (s.deals ??= []).push(d); return { deal: d, auditEvent: audit(s, actor, '建立交易批次', { dealId: d.id }) }; }));
        return reply.code(result.created ? 201 : 200).send(publicDiligence(result));
    }));
    const keys: Record<string, string[]> = { save_terms: ['terms', 'reason'], submit_terms: ['termsId'], review_terms: ['termsId', 'decision', 'opinion'], generate_agreement: ['title', 'template','reviewerId'], review_agreement: ['agreementId', 'opinion'], archive_signed: ['agreementId', 'original', 'evidence', 'note'], confirm_condition: ['conditionId', 'evidence', 'note'], close: ['evidence', 'note', 'responsibility'] };
    server.post('/api/projects/:id/deals/:dealId/actions', wrap(async (r: any) => {
        const actor = actorOf(r);
        const action = string(object(r.body, ['requestId', 'expectedRevision', 'action', ...Object.values(keys).flat()]).action);
        if (!Object.hasOwn(keys, action))
            fail('invalid_deal_action');
        if (!(actor.role === 'legal' && ['generate_agreement', 'review_agreement', 'archive_signed'].includes(action)))
            permission(actor);
        const b = object(r.body, ['requestId', 'expectedRevision', 'action', ...keys[action]]), rid = requestId(b.requestId), rev = revision(b.expectedRevision), paths: string[] = [];
        try {
            return publicDiligence(await store.workflowTransaction(r.params.id, async (s) => idempotent(s, rid, actor, { dealId:r.params.dealId, ...b }, async () => {
                const d = s.deals?.find(d => d.id === r.params.dealId);
                if (!d)
                    fail('deal_not_found', 404);
                if (d.revision !== rev)
                    fail('deal_revision_conflict', 409);
                if (d.ownerId !== s.project.ownerId)
                    fail('deal_owner_conflict', 409);
                if (d.status === 'closed')
                    fail('deal_frozen', 409);
                const current = () => { const t = d.terms.at(-1); if (!t)
                    fail('deal_terms_required', 409); return t; };
                const approved = () => { const t = current(); if (t.status !== 'approved')
                    fail('deal_terms_not_approved', 409); return t; };
                const agreement = () => { const a = d.agreements.find(a => a.id === string(b.agreementId)); if (!a)
                    fail('deal_agreement_not_found', 404); if (a.termsId !== approved().id || d.agreements.filter(v => v.termsId === a.termsId && v.title === a.title).at(-1) !== a)
                    fail('deal_agreement_stale', 409); return a; };
                if (action === 'save_terms') {
                    const prior = d.terms.at(-1);
                    if (prior?.status === 'pending' || prior?.status === 'rejected')
                        fail('deal_terms_frozen', 409);
                    const input = await terms(b.terms);
                    d.terms.push({ ...input, ...inputSource(prior,'deal_terms',s.project.id), id: randomUUID(), version: d.terms.length + 1, reason: string(b.reason), status: 'draft', savedBy: actor, time: now(), decisions: [] });
                }
                else if (action === 'submit_terms') {
                    const t = current();
                    if (t.id !== string(b.termsId) || t.status !== 'draft')
                        fail('invalid_deal_transition', 409);
                    gate(s);
                    t.status = 'pending';
                    t.decisions = [];
                }
                else if (action === 'review_terms') {
                    const t = current();
                    if (t.id !== string(b.termsId) || t.status !== 'pending')
                        fail('deal_terms_frozen', 409);
                    if (actor.id !== d.ownerId && !d.reviewers.some(u => u.id === actor.id))
                        fail('not_deal_reviewer', 403);
                    if (!['approve', 'return', 'reject'].includes(String(b.decision)))
                        fail('invalid_decision');
                    if (t.decisions.some(q => q.actor.id === actor.id))
                        fail('decision_already_recorded', 409);
                    const decision = b.decision as 'approve' | 'return' | 'reject';
                    t.decisions.push({ actor, decision, opinion: string(b.opinion), time: now() });
                    if (decision !== 'approve')
                        t.status = decision === 'return' ? 'returned' : 'rejected';
                    else if (actor.id === d.ownerId || d.reviewers.every(u => t.decisions.some(q => q.actor.id === u.id && q.decision === 'approve')))
                        t.status = 'approved';
                }
                else if (action === 'generate_agreement') {
                    const t = approved(), title = string(b.title, true, 500), template = string(b.template, true, 100000);
                    if (!t.requiredAgreements.includes(title))
                        fail('agreement_not_required');
                    if (d.agreements.some(a => a.termsId === t.id && a.title === title && a.signed))
                        fail('signed_agreement_frozen', 409);
                    const funds = await store.listFunds(), vars: Record<string, string> = { project: s.project.name, fund: t.allocations.map(a => funds.find(f => f.id === a.fundId)!.name).join('、'), amount: t.amount, valuation: t.valuation, share: t.share, date: t.date };
                    if(b.reviewerId!==undefined){const reviewer=(await workflowDirectory(store,auth)).find(u=>u.id===b.reviewerId&&u.canLogin&&['admin','investment_manager','legal'].includes(u.role));if(!reviewer)fail('invalid_reviewer');}
                    const content = template.replace(/\{\{\s*([a-z]+)\s*\}\}/g, (match, key) => Object.hasOwn(vars, key) ? vars[key] : match);
                    if (/\{\{|\}\}/.test(content))
                        fail('unresolved_template_variable');
                    d.agreements.push({ reviewerId:typeof b.reviewerId==='string'?b.reviewerId:undefined,dataOrigin:'system_generated', sourceBasis:sourceBasisOf(t,'deal_terms',s.project.id), id: randomUUID(), title, version: d.agreements.filter(a => a.title === title).length + 1, termsId: t.id, template, content, generatedBy: actor, time: now() });
                }
                else if (action === 'review_agreement') {
                    const a = agreement();
                    if(a.reviewerId&&a.reviewerId!==actor.id&&actor.role!=='admin')fail('not_agreement_reviewer',403);
                    if (a.review || a.signed)
                        fail('agreement_review_frozen', 409);
                    a.review = { actor, opinion: string(b.opinion), time: now() };
                }
                else if (action === 'archive_signed') {
                    const a = agreement();
                    if (!a.review)
                        fail('agreement_human_review_required', 409);
                    if (a.signed)
                        fail('signed_agreement_frozen', 409);
                    a.signed = { material: await snapshot(b.original, s, d, actor, paths), evidence: await evidence(b.evidence, s, d, actor, paths), actor, note: string(b.note), time: now() };
                }
                else if (action === 'confirm_condition') {
                    const t = approved(), conditionId = string(b.conditionId);
                    if (!t.conditions.some(c => c.id === conditionId))
                        fail('condition_not_found');
                    if (d.confirmations.some(c => c.termsId === t.id && c.conditionId === conditionId))
                        fail('condition_already_confirmed', 409);
                    d.confirmations.push({ termsId: t.id, conditionId, evidence: await evidence(b.evidence, s, d, actor, paths), actor, note: string(b.note), time: now() });
                }
                else if (action === 'close') {
                    const t = approved();
                    gate(s);
                    if (s.diligence?.status !== 'approved' || s.diligence.ownerId !== s.project.ownerId || s.diligence.reports.at(-1)?.status !== 'approved')
                        fail('deal_diligence_required', 409);
                    const signed = t.requiredAgreements.map(title => d.agreements.filter(a => a.title === title && a.termsId === t.id).at(-1));
                    if (signed.some(a => !a?.review || !a.signed))
                        fail('deal_signed_agreements_required', 409);
                    const confirmations = t.conditions.map(c => d.confirmations.find(v => v.termsId === t.id && v.conditionId === c.id));
                    if (confirmations.some(c => !c))
                        fail('deal_conditions_incomplete', 409);
                    await verify([...signed.flatMap(a => [a!.signed!.material, ...a!.signed!.evidence]), ...confirmations.flatMap(c => c!.evidence)], actor);
                    const q = object(b.responsibility, ['ownerId', 'duties', 'schedules']), owner = await eligible(string(q.ownerId), false), duties = string(q.duties);
                    const schedules = list(q.schedules).map(v => { const z = object(v, ['title', 'firstDueDate', 'frequency']), title = string(z.title, true, 500), firstDueDate = date(z.firstDueDate); if (!['monthly', 'quarterly', 'yearly'].includes(String(z.frequency)))
                        fail('invalid_frequency'); if (firstDueDate < t.date || firstDueDate < now().slice(0,10))
                        fail('invalid_schedule_date'); return { id: randomUUID(), title, firstDueDate, frequency: z.frequency as 'monthly' | 'quarterly' | 'yearly' }; });
                    unique(schedules.map(v => v.title));
                    const closingEvidence = await evidence(b.evidence, s, d, actor, paths);
                    d.closing = { actor, time: now(), termsId: t.id, evidence: closingEvidence, note: string(b.note), responsibility: { owner, duties, schedules: schedules.map(v => { const task = newTask(s, owner, { kind:'manual', name: v.title, dueDate: v.firstDueDate, stage: '投后', type: '投后任务', relation: '交易交割', note: `${duties}；周期：${v.frequency}；批次：${d.title}` }); return { ...v, taskId:task.id, taskIds:[task.id] }; }) } };
                    d.status = 'closed';
                    s.project.stage = '投后';
                    s.project.status = '已投';
                    s.project.latest = `${d.title}已交割`;
                    s.project.nextAction = '按投后责任及周期计划执行';
                }
                d.revision++;
                return { deal: d, tasks: s.tasks, auditEvent: audit(s, actor, '交易操作', { dealId: d.id, action, revision: d.revision }) };
            })));
        }
        catch (e) {
            if (e instanceof WorkflowError || (e as any)?.safeToDeleteBlob)
                await Promise.all(paths.map(p => unlink(p).catch(() => { })));
            throw e;
        }
    }));
}
