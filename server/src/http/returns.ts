import { retainEvidenceSource, inputSource } from '../ledger/source-policy.ts';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { resolveRequestUser } from '../auth/authorize.ts';
import { canRole } from '../auth/rbac.ts';
import { resolveAuthConfig, type AuthConfigInput, type SessionUser } from '../auth/session.ts';
import type { LedgerStore } from '../ledger/store.ts';
import { WorkflowError, fail, object, string, date, revision, requestId, audit, idempotent, newTask, type WorkflowState, type MaterialSnapshot } from '../ledger/workflow.ts';
import { MaterialWriteError } from '../ledger/material-upload.ts';
import { emptyPostInvestment } from '../ledger/post-investment.ts';
import { units, fixed } from '../ledger/exit-settlement.ts';
import { termChoices, parseTerms, termsMissing, sampleMissing, coverageMissing, coverageKeys, recordHash, decimal, isoTime, allowsNoTerminalValue, terminalValueMissing, type ReturnRecord, type ReturnScope, type BasisVersion, type IndependentSample, type CashflowReview, type CoverageItem, type CurrencyConfirmation, type ReturnTerminalValue } from '../ledger/return-basis.ts';
import { returnInputs } from '../ledger/return-inputs.ts';
import { calculateReturns, sampleCalculationMissing } from '../ledger/return-engine.ts';
import { createFinancialEvidence } from './financial-evidence.ts';
import { workflowDirectory } from './workflow.ts';
import { publicDiligence } from './diligence.ts';
const latest = <T extends ReturnRecord>(rows: T[], v: T) => !rows.some(x => x.groupId === v.groupId && x.version > v.version);
const list = (v: unknown) => {
    if (!Array.isArray(v) || v.length > 100)
        fail('invalid_list');
    return v;
};
const allProofs = (v: ReturnRecord): MaterialSnapshot[] => [...v.evidence, ...v.decisions.flatMap(d => d.authorizationEvidence), ...('terminalValue' in v ? (v as IndependentSample).terminalValue?.evidence ?? [] : []), ...('coverage' in v ? [...Object.values((v as CashflowReview).coverage).flatMap(c => c?.evidence ?? []), ...((v as CashflowReview).currencyConfirmations ?? []).flatMap(c => c.evidence)] : [])];
type State = Pick<WorkflowState, 'project' | 'deals' | 'postInvestment' | 'tasks'>;
export function registerReturnRoutes(server: FastifyInstance, store: LedgerStore, options: {
    auth?: AuthConfigInput;
    projectRoot: string;
    storageRoot?: string;
    clock?: () => Date;
}) {
    const auth = resolveAuthConfig(options.auth), root = resolve(options.storageRoot ?? process.env.MATERIAL_STORAGE_ROOT ?? resolve(options.projectRoot, 'private-material-storage'));
    const actorOf = (r: any) => resolveRequestUser(r, auth)!;
    const permission = (a: SessionUser) => {
        if (!canRole(a.role, 'project:read') && !canRole(a.role, 'fund:read') && a.role !== 'post_investment' && !canRole(a.role, 'capital:write'))
            fail('forbidden', 403);
    };
    const wrap = (fn: any) => async (r: any, reply: any) => {
        try {
            return await fn(r, reply);
        }
        catch (e) {
            if (e instanceof WorkflowError || e instanceof MaterialWriteError)
                return reply.code(e.status).send({ error: e.code });
            r.log.error({ code: 'returns_failed' });
            return reply.code(500).send({ error: 'returns_failed' });
        }
    };
    const ev = createFinancialEvidence(store, root, id => `/api/projects/${id}/returns/files/${randomUUID()}`);
    async function eligible(id: unknown) {
        const u = (await workflowDirectory(store, auth)).find(u => u.id === string(id) && u.canLogin && ['finance', 'admin'].includes(u.role));
        if (!u)
            fail('ineligible_return_reviewer', 409);
        return { id: u.id, name: u.name, email: u.email, role: u.role } as SessionUser;
    }
    async function scopes(s: State): Promise<ReturnScope[]> { const known = new Set((await store.listFunds()).map(f => f.id)); return (s.deals ?? []).flatMap(d => { const t = d.status === 'closed' && d.closing ? d.terms.find(t => t.id === d.closing!.termsId && t.status === 'approved') : undefined; return t?.allocations.length && t.allocations.every(a => known.has(a.fundId)) ? t.allocations.map(a => ({ type: 'project_fund_deal' as const, projectId: s.project.id, dealId: d.id, fundId: a.fundId })) : []; }); }
    async function scopeOf(s: State, b: Record<string, unknown>) {
        const v = (await scopes(s)).find(v => v.dealId === b.dealId && v.fundId === b.fundId);
        if (!v)
            fail('invalid_return_scope');
        return v;
    }
    function records(s: State) { const p = s.postInvestment; return [...(p?.returnBases ?? []), ...(p?.returnSamples ?? []), ...(p?.cashflowReviews ?? [])]; }
    function currentBasis(s: State, scope: ReturnScope) { return (s.postInvestment?.returnBases ?? []).filter(v => v.scope.dealId === scope.dealId && v.scope.fundId === scope.fundId).sort((a, b) => b.version - a.version)[0]; }
    function selectedBasis(s: State, v: IndependentSample) { return s.postInvestment?.returnBases?.find(b => b.id === v.basisId && b.version === v.basisVersion && b.contentHash === v.basisContentHash); }
    const sourceProofs = (s: State, v: ReturnRecord) => {
        if (!('coverage' in v))
            return [];
        const c = v as CashflowReview;
        return returnInputs(s, c.scope, c.asOfDate, c.knownAt).rows.flatMap(v => [...v.evidence, ...v.reversal?.evidence ?? []]);
    };
    const sameScope = (a: ReturnScope, b: ReturnScope) => a.projectId === b.projectId && a.dealId === b.dealId && a.fundId === b.fundId;
    const sameReviewResource = (a: CashflowReview, b: Pick<CashflowReview, 'scope' | 'asOfDate' | 'knownAt'>) => sameScope(a.scope, b.scope) && a.asOfDate === b.asOfDate && a.knownAt === b.knownAt;
    const latestReview = (rows: CashflowReview[], v: CashflowReview) => rows.filter(x => sameReviewResource(x, v)).at(-1)?.id === v.id;
    function reviewFactsMissing(s: State, c: CashflowReview) {
        const input = returnInputs(s, c.scope, c.asOfDate, c.knownAt), missing: string[] = [], included = input.rows.filter(v => v.included), confirmations = c.currencyConfirmations ?? [];
        for (const row of included.filter(v => v.currency === 'unknown'))
            if (!confirmations.some(v => v.sourceId === row.sourceId && v.currency === 'CNY' && v.evidence.length))
                missing.push('currency_confirmation.' + row.sourceId);
        for (const v of confirmations)
            if (!included.some(row => row.sourceId === v.sourceId && row.sourceType === 'exit_payment' && row.currency === 'unknown') || !v.evidence.length)
                missing.push('invalid_currency_confirmation');
        const b = currentBasis(s, c.scope);
        missing.push(...terminalValueMissing(b, c.terminalValue, c.asOfDate));
        if (c.terminalValue && c.coverage.terminalValue?.status !== 'confirmed_complete')
            missing.push('terminal_value_coverage_conflict');
        if (!c.terminalValue && c.coverage.terminalValue?.status !== 'confirmed_not_applicable')
            missing.push('missing_valuation');
        for (const [key, has] of [['outflows', included.some(v => v.direction === 'outflow')], ['inflows', included.some(v => v.direction === 'inflow')], ['fees', included.some(v => v.kind === 'project_fee')], ['taxes', included.some(v => v.kind === 'project_tax')], ['currency', included.length > 0]] as const)
            if (has && c.coverage[key]?.status === 'confirmed_not_applicable')
                missing.push('coverage_conflicts_with_source.' + key);
        return [...new Set(missing)];
    }
    async function view(s: State, a: SessionUser, q: Record<string, unknown> = {}) {
        const catalog = await scopes(s), p = s.postInvestment, materials = new Map((await store.listMaterials()).map(m => [m.id, m])), rows = records(s);
        const scope = q.dealId === undefined && q.fundId === undefined ? undefined : await scopeOf(s, q);
        const asOf = q.asOfDate === undefined ? undefined : date(q.asOfDate), known = q.knownAt === undefined ? undefined : isoTime(q.knownAt);
        const raw = scope && asOf && known ? returnInputs(s, scope, asOf, known) : null;
        const refs = [...rows.flatMap(allProofs), ...(raw?.rows.flatMap(v => [...v.evidence, ...v.reversal?.evidence ?? []]) ?? [])];
        // Finish authorization for the entire read before opening any private bytes.
        for (const ref of refs) {
            try {
                await ev.authorize(s, a, ref.materialId, materials);
            }
            catch (e) {
                if (!(e instanceof WorkflowError))
                    throw e;
            }
        }
        const visibleMap = new Map<string, any>();
        for (const ref of refs)
            visibleMap.set(ref.downloadHref, await ev.visible(s, a, ref, materials));
        const projectProofs = (x: any): any => Array.isArray(x) ? x.map(projectProofs) : x && typeof x === 'object' ? 'packetBlobId' in x && 'materialId' in x ? visibleMap.get(x.downloadHref) : Object.fromEntries(Object.entries(x).map(([k, v]) => [k, projectProofs(v)])) : x;
        const badProof = (v: ReturnRecord) => allProofs(v).some(ref => visibleMap.get(ref.downloadHref)?.readIssue);
        const integrityMissing = (v: ReturnRecord) => recordHash(v) === v.contentHash ? [] : ['content_hash_mismatch'];
        const bases = (p?.returnBases ?? []).map(v => ({ ...projectProofs(v), latest: latest(p!.returnBases!, v), missingReasons: [...integrityMissing(v), ...termsMissing(v.terms), ...(!v.evidence.length ? ['evidence'] : []), ...(badProof(v) ? ['evidence_unavailable'] : [])] }));
        const samples = (p?.returnSamples ?? []).map(v => ({ ...projectProofs(v), latest: latest(p!.returnSamples!, v), isApplicable: currentBasis(s, v.scope)?.id === v.basisId && currentBasis(s, v.scope)?.contentHash === v.basisContentHash, missingReasons: [...integrityMissing(v), ...sampleMissing(v, selectedBasis(s, v)), ...(selectedBasis(s, v) ? sampleCalculationMissing(v, selectedBasis(s, v)!.terms) : []), ...(badProof(v) ? ['evidence_unavailable'] : [])] }));
        const reviews = (p?.cashflowReviews ?? []).map(v => ({ ...projectProofs(v), latest: latestReview(p!.cashflowReviews!, v), isApplicable: latestReview(p!.cashflowReviews!, v) && !!raw && sameReviewResource(v, raw) && v.sourceHash === raw.sourceHash, missingReasons: [...integrityMissing(v), ...coverageMissing(v), ...reviewFactsMissing(s, v), ...(badProof(v) ? ['evidence_unavailable'] : [])] }));
        const missing = raw ? [...raw.missingReasons] : ['scope_and_cutoffs_required'];
        const sourceUnavailable = !!raw?.rows.filter(v => !v.reasonCodes.includes('not_known_at')).some(v => [...v.evidence, ...v.reversal?.evidence ?? []].some(ref => visibleMap.get(ref.downloadHref)?.readIssue));
        if (sourceUnavailable)
            for (const review of reviews)
                if (review.isApplicable) {
                    review.isApplicable = false;
                    review.missingReasons.push('source_evidence_unavailable');
                }
        const selectedReview = raw ? reviews.filter(v => sameReviewResource(v, raw)).at(-1) : undefined;
        if (selectedReview?.isApplicable)
            missing.push(...selectedReview.missingReasons.filter((reason: string) => reason.startsWith('terminal_')));
        const applicable = selectedReview?.status === 'approved' && selectedReview.isApplicable && !selectedReview.missingReasons.length ? selectedReview : undefined;
        const approvedReview = applicable && !sourceUnavailable ? applicable : undefined;
        const effectiveInput = raw ? { rows: raw.rows.filter(v => v.included).map(row => { const confirmation = approvedReview?.currencyConfirmations?.find((c: CurrencyConfirmation) => c.sourceId === row.sourceId); return { ...row, sourceCurrency: row.currency, currency: confirmation?.currency ?? row.currency, ...(confirmation ? { currencyConfirmation: confirmation } : {}) }; }), terminalValue: approvedReview?.terminalValue ?? null, reviewId: approvedReview?.id ?? null, reviewVersion: approvedReview?.version ?? null, reviewContentHash: approvedReview?.contentHash ?? null } : null;
        if (raw && approvedReview) {
            for (const k of coverageKeys) {
                const i = missing.indexOf('unreviewed_' + k);
                if (i >= 0)
                    missing.splice(i, 1);
            }
            raw.coverageStatus = 'approved';
            if (!effectiveInput!.rows.some(v => v.currency === 'unknown')) {
                const i = missing.indexOf('unknown_currency');
                if (i >= 0)
                    missing.splice(i, 1);
            }
        }
        if (sourceUnavailable)
            missing.push('source_evidence_unavailable');
        const b = scope ? currentBasis(s, scope) : undefined;
        if (b?.terms.measure === 'total' && approvedReview?.coverage.inflows?.status === 'confirmed_not_applicable' && approvedReview.terminalValue) {
            const index = missing.indexOf('missing_actual_receipts');
            if (index >= 0) missing.splice(index, 1);
        }
        if (!b || b.status !== 'approved')
            missing.push('pending_basis');
        else if (badProof(b))
            missing.push('basis_evidence_unavailable');
        else if (recordHash(b) !== b.contentHash)
            missing.push('content_hash_mismatch');
        if (raw && (!approvedReview?.terminalValue && !(allowsNoTerminalValue(b) && approvedReview?.coverage.terminalValue?.status === 'confirmed_not_applicable')))
            missing.push('missing_valuation');
        const independentSample = b ? samples.find(v => sameScope(v.scope, b.scope) && v.basisId === b.id && v.basisContentHash === b.contentHash && v.status === 'approved' && v.latest && v.isApplicable && v.origin === 'finance_independent' && !v.missingReasons.length) : undefined;
        if (b && !independentSample)
            missing.push('pending_independent_sample');
        if (b) missing.push(...termsMissing(b.terms));
        if (raw && !approvedReview) missing.push('pending_cashflow_review');
        const calculation = !missing.length && b && raw && effectiveInput ? calculateReturns(b.terms, effectiveInput.rows, approvedReview!.terminalValue, raw.asOfDate) : null;
        const reasonCodes = [...new Set([...missing, ...(calculation?.reasonCodes ?? [])])];
        const metric = (value: string | null) => ({ value, status: calculation?.status ?? 'pending_evidence', reasonCodes });
        return publicDiligence({ project: { id: s.project.id, name: s.project.name, ownerId: s.project.ownerId ?? null }, revision: p?.revision ?? emptyPostInvestment().revision, currentUser: a, mayDraft: canRole(a.role, 'capital:write'), mayReview: canRole(a.role, 'capital:write'), scopes: catalog, reviewers: (await workflowDirectory(store, auth)).filter(v => v.canLogin && ['finance', 'admin'].includes(v.role)), termChoices, bases, samples, reviews, inputs: raw ? { ...projectProofs(raw), missingReasons: missing, effectiveInput: projectProofs(effectiveInput) } : null, metrics: { irr: metric(calculation?.irr ?? null), moic: metric(calculation?.moic ?? null) }, publicationStatus: { status: calculation?.status === 'ok' ? 'published' : 'not_published', reasonCodes, technicalApprovalOnly: calculation?.status !== 'ok', ...(calculation ? { basisId: b!.id, basisVersion: b!.version, basisContentHash: b!.contentHash, sampleId: independentSample!.id, sampleVersion: independentSample!.version, sampleContentHash: independentSample!.contentHash, amounts: calculation.amounts, reviewId: approvedReview!.id, sourceHash: raw!.sourceHash, asOfDate: raw!.asOfDate, knownAt: raw!.knownAt } : {}) }, taskLinks: rows.flatMap(v => v.taskIds.map(taskId => ({ taskId, dealId: v.scope.dealId, fundId: v.scope.fundId, sourceType: 'terms' in v ? 'return_basis' : 'basisId' in v ? 'return_sample' : 'cashflow_review', sourceId: v.id, sourceVersion: v.version, contentHash: v.contentHash, section: 'returns' }))) }, []);
    }
    const base = '/api/projects/:id/returns';
    server.get(base, wrap(async (r: any) => { const a = actorOf(r); permission(a); const q = object(r.query, ['dealId', 'fundId', 'asOfDate', 'knownAt']); return store.workflowTransaction(r.params.id, s => view(s, a, q)); }));
    server.get(base + '/files/:fileId', wrap(async (r: any, reply: any) => {
        const a = actorOf(r);
        permission(a);
        const ref = await store.workflowTransaction(r.params.id, async (s) => {
            const ref = records(s).flatMap(allProofs).find(v => v.downloadHref === `/api/projects/${s.project.id}/returns/files/${r.params.fileId}`);
            if (!ref)
                fail('return_file_not_found', 404);
            await ev.verify(s, a, [ref]);
            return ref;
        });
        reply.header('Cache-Control', 'private, no-store').header('X-Content-Type-Options', 'nosniff').header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(ref.name)}`);
        return reply.type('application/octet-stream').send(await ev.readBytes(ref.packetBlobId!, ref.sha256, ref.sizeBytes));
    }));
    async function proof(input: unknown, s: WorkflowState, a: SessionUser, paths: string[]) { return input === undefined ? [] : list(input).length ? ev.snapshots(input, s, a, paths) : []; }
    async function parseSample(input: unknown, s: WorkflowState, a: SessionUser, paths: string[]) {
        const b = object(input, ['basisId', 'basisVersion', 'basisContentHash', 'origin', 'cashflows', 'asOfDate', 'terminalValue', 'expected', 'derivationText']);
        const basisId = string(b.basisId), basisVersion = revision(b.basisVersion), basisContentHash = string(b.basisContentHash), basis = s.postInvestment?.returnBases?.find(v => v.id === basisId && v.version === basisVersion && v.contentHash === basisContentHash);
        if (!basis)
            fail('basis_version_mismatch', 409);
        if (!['finance_independent', 'engineering_fixture'].includes(String(b.origin)))
            fail('invalid_sample_origin');
        const cashflows = list(b.cashflows ?? []).map(v => {
            const c = object(v, ['date', 'amount', 'direction', 'kind', 'currency']);
            if (!['outflow', 'inflow'].includes(String(c.direction)) || c.currency !== 'CNY' || !['investment_payment', 'project_fee', 'project_tax', 'exit_receipt'].includes(String(c.kind)))
                fail('invalid_sample_cashflow');
            return { date: date(c.date), amount: fixed(units(c.amount)), direction: c.direction as 'outflow' | 'inflow', kind: string(c.kind), currency: 'CNY' as const };
        });
        let terminalValue: IndependentSample['terminalValue'] = null;
        if (b.terminalValue !== null && b.terminalValue !== undefined) {
            const v = object(b.terminalValue, ['amount', 'date', 'currency', 'scope', 'evidence']);
            if (v.currency !== 'CNY')
                fail('invalid_currency');
            terminalValue = { amount: fixed(units(v.amount)), date: date(v.date), currency: 'CNY', scope: string(v.scope), evidence: await proof(v.evidence, s, a, paths) };
        }
        const e = object(b.expected ?? {}, ['irr', 'irrUnit', 'moic', 'resultStatus', 'tolerance']);
        if (e.irrUnit !== undefined && e.irrUnit !== 'annual_fraction')
            fail('invalid_irr_unit');
        return { basisId, basisVersion, basisContentHash, origin: b.origin as IndependentSample['origin'], cashflows, ...(b.asOfDate === undefined ? {} : { asOfDate: date(b.asOfDate) }), terminalValue, expected: { irr: e.irr === undefined || e.irr === null ? null : decimal(e.irr), irrUnit: 'annual_fraction' as const, moic: e.moic === undefined || e.moic === null ? null : decimal(e.moic, true), resultStatus: e.resultStatus === undefined ? '' : string(e.resultStatus, false), tolerance: e.tolerance === undefined ? '' : decimal(e.tolerance, true) }, derivationText: b.derivationText === undefined ? '' : string(b.derivationText, false) };
    }
    async function parseReview(input: unknown, s: WorkflowState, scope: ReturnScope, a: SessionUser, paths: string[]) {
        const b = object(input, ['asOfDate', 'knownAt', 'sourceHash', 'coverage', 'currencyConfirmations', 'terminalValue']), asOfDate = date(b.asOfDate), knownAt = isoTime(b.knownAt), sourceHash = string(b.sourceHash), raw = returnInputs(s, scope, asOfDate, knownAt);
        if (sourceHash !== raw.sourceHash)
            fail('return_source_conflict', 409);
        const coverage: CashflowReview['coverage'] = {}, items = object(b.coverage ?? {}, [...coverageKeys]);
        for (const k of coverageKeys) {
            if (items[k] === undefined)
                continue;
            const c = object(items[k], ['status', 'explanation', 'evidence']);
            if (!['confirmed_complete', 'confirmed_not_applicable', 'unknown'].includes(String(c.status)))
                fail('invalid_coverage_status');
            coverage[k] = { status: c.status as CoverageItem['status'], explanation: c.explanation === undefined ? '' : string(c.explanation, false), evidence: await proof(c.evidence, s, a, paths) };
        }
        const currencyConfirmations: CurrencyConfirmation[] = [];
        for (const item of list(b.currencyConfirmations ?? [])) {
            const c = object(item, ['sourceId', 'currency', 'evidence']);
            if (c.currency !== 'CNY')
                fail('invalid_currency');
            const sourceId = string(c.sourceId);
            if (currencyConfirmations.some(v => v.sourceId === sourceId))
                fail('duplicate_value');
            if (!raw.rows.some(v => v.included && v.sourceType === 'exit_payment' && v.currency === 'unknown' && v.sourceId === sourceId))
                fail('invalid_currency_confirmation');
            currencyConfirmations.push({ sourceId, currency: 'CNY', evidence: await proof(c.evidence, s, a, paths) });
        }
        let terminalValue: ReturnTerminalValue | null = null;
        if (b.terminalValue !== null && b.terminalValue !== undefined) {
            const v = object(b.terminalValue, ['amount', 'date', 'currency', 'scope', 'evidence']);
            if (v.currency !== 'CNY')
                fail('invalid_currency');
            terminalValue = { amount: fixed(units(v.amount)), date: date(v.date), currency: 'CNY', scope: string(v.scope), evidence: await proof(v.evidence, s, a, paths) };
        }
        return { asOfDate, knownAt, sourceHash, coverage, currencyConfirmations, terminalValue };
    }
    server.post(base + '/actions', wrap(async (r: any) => {
        const a = actorOf(r);
        permission(a);
        if (!canRole(a.role, 'capital:write'))
            fail('forbidden', 403);
        const b = object(r.body, ['requestId', 'expectedRevision', 'action', 'dealId', 'fundId', 'recordId', 'version', 'contentHash', 'terms', 'sample', 'review', 'evidence', 'reviewerId', 'dueDate', 'decision', 'opinion', 'authorizationEvidence', 'revisionReason']), rid = requestId(b.requestId), rev = revision(b.expectedRevision), action = string(b.action), paths: string[] = [];
        const match = /^(create|revise|submit|decide)_(basis|sample|review)$/.exec(action === 'review_inputs' ? 'create_review' : action);
        if (!match)
            fail('invalid_return_action');
        const verb = match[1], kind = match[2];
        object(b, ['requestId', 'expectedRevision', 'action', ...(verb === 'create' || verb === 'revise' ? ['dealId', 'fundId', 'evidence', kind === 'basis' ? 'terms' : kind === 'sample' ? 'sample' : 'review', ...(verb === 'revise' ? ['recordId', 'version', 'contentHash', 'revisionReason'] : [])] : ['recordId', 'version', 'contentHash', ...(verb === 'submit' ? ['reviewerId', 'dueDate'] : ['decision', 'opinion', 'authorizationEvidence'])])]);
        try {
            return await store.workflowTransaction(r.params.id, async (s) => {
                const result = await idempotent(s, rid, a, { resource: 'returns', ...b }, async () => {
                    const incomingRefs: {
                        materialId: string;
                    }[] = [];
                    const gather = (v: any) => {
                        if (Array.isArray(v))
                            v.forEach(gather);
                        else if (v && typeof v === 'object') {
                            if ('materialId' in v)
                                incomingRefs.push({ materialId: string(v.materialId) });
                            else
                                Object.values(v).forEach(gather);
                        }
                    };
                    gather(b);
                    for (const ref of incomingRefs)
                        await ev.authorize(s, a, ref.materialId);
                    const p = s.postInvestment ??= emptyPostInvestment();
                    if (p.revision !== rev)
                        fail('post_revision_conflict', 409);
                    const rows: ReturnRecord[] = kind === 'basis' ? (p.returnBases ??= []) : kind === 'sample' ? (p.returnSamples ??= []) : (p.cashflowReviews ??= []), time = (options.clock?.() ?? new Date()).toISOString();
                    let prior: ReturnRecord | undefined;
                    if (verb !== 'create') {
                        prior = rows.find(v => v.id === string(b.recordId) && v.version === revision(b.version) && v.contentHash === string(b.contentHash));
                        if (!prior || !latest(rows, prior) || kind === 'review' && !latestReview(rows as CashflowReview[], prior as CashflowReview) || recordHash(prior) !== prior.contentHash)
                            fail('return_version_conflict', 409);
                        if (!(await scopes(s)).some(v => sameScope(v, prior!.scope)))
                            fail('invalid_return_scope');
                    }
                    if (verb === 'create' || verb === 'revise') {
                        const scope = verb === 'revise' ? prior!.scope : await scopeOf(s, b);
                        if (verb === 'revise' && b.dealId !== undefined && (b.dealId !== scope.dealId || b.fundId !== scope.fundId))
                            fail('return_scope_immutable');
                        if (kind === 'basis' && verb === 'create' && currentBasis(s, scope))
                            fail('return_basis_already_exists', 409);
                        if (verb === 'revise' && prior!.author.id !== a.id && a.id !== s.project.ownerId)
                            fail('not_return_author', 403);
                        if (verb === 'revise' && prior!.status === 'rejected')
                            string(b.revisionReason);
                        if (kind === 'review') {
                            const input = object(b.review, ['asOfDate', 'knownAt', 'sourceHash', 'coverage', 'currencyConfirmations', 'terminalValue']);
                            const resource = { scope, asOfDate: date(input.asOfDate), knownAt: isoTime(input.knownAt) };
                            if (prior && !sameReviewResource(prior as CashflowReview, resource))
                                fail('return_review_cutoffs_immutable');
                            if (verb === 'create' && (p.cashflowReviews ?? []).some(v => sameReviewResource(v, resource)))
                                fail('return_review_already_exists', 409);
                        }
                        const evidence = await proof(b.evidence, s, a, paths), common: ReturnRecord = { ...inputSource(prior,kind==='basis'?'return_basis':kind==='sample'?'return_sample':'cashflow_review',s.project.id), id: randomUUID(), groupId: prior?.groupId ?? randomUUID(), version: (prior?.version ?? 0) + 1, scope, status: 'draft', author: a, createdAt: time, ...(verb === 'revise' && b.revisionReason !== undefined ? { revisionReason: string(b.revisionReason) } : {}), evidence, decisions: [], contentHash: '', taskIds: [] };
                        let v: ReturnRecord;
                        if (kind === 'basis')
                            v = { ...common, terms: parseTerms(b.terms ?? {}) } as BasisVersion;
                        else if (kind === 'sample') {
                            const fields = await parseSample(b.sample, s, a, paths);
                            const basis = p.returnBases!.find(v => v.id === fields.basisId)!;
                            if (!sameScope(scope, basis.scope))
                                fail('basis_scope_mismatch');
                            v = { ...common, ...fields } as IndependentSample;
                        }
                        else
                            v = { ...common, ...await parseReview(b.review, s, scope, a, paths) } as CashflowReview;
                        if (kind === 'review' && prior && !sameReviewResource(v as CashflowReview, prior as CashflowReview))
                            fail('return_review_cutoffs_immutable');
                        retainEvidenceSource(v,allProofs(v));v.contentHash = recordHash(v);
                        rows.push(v);
                        if (prior?.status === 'pending')
                            for (const id of prior.taskIds) {
                                const t = s.tasks.find(t => t.id === id);
                                if (t && t.status !== '已完成') {
                                    t.status = '已取消';
                                    t.revision = (t.revision ?? 1) + 1;
                                    t.updatedAt = time;
                                }
                            }
                    }
                    else {
                        const v = prior!;
                        const ensureComplete = () => {
                            const missing = kind === 'basis' ? termsMissing((v as BasisVersion).terms) : kind === 'sample' ? sampleMissing(v as IndependentSample, selectedBasis(s, v as IndependentSample)) : [...coverageMissing(v as CashflowReview), ...reviewFactsMissing(s, v as CashflowReview)];
                            if (!v.evidence.length)
                                missing.push('evidence');
                            if (missing.length)
                                fail('incomplete_return_record');
                            if (kind === 'sample') {
                                const sample = v as IndependentSample;
                                if (sample.origin === 'finance_independent' && sampleCalculationMissing(sample, selectedBasis(s, sample)!.terms).length)
                                    fail('return_sample_calculation_mismatch');
                                if (currentBasis(s, v.scope)?.id !== sample.basisId || currentBasis(s, v.scope)?.contentHash !== sample.basisContentHash)
                                    fail('basis_version_mismatch', 409);
                            }
                            if (kind === 'review') {
                                const c = v as CashflowReview, raw = returnInputs(s, c.scope, c.asOfDate, c.knownAt);
                                if (raw.sourceHash !== c.sourceHash)
                                    fail('return_source_conflict', 409);
                                if (raw.missingReasons.some(v => ['history_incomplete', 'invalid_source_amount', 'missing_source_evidence'].includes(v)))
                                    fail('return_history_incomplete', 409);
                            }
                        };
                        if (verb === 'submit') {
                            if (v.status !== 'draft')
                                fail('invalid_return_transition', 409);
                            if (v.author.id !== a.id && a.id !== s.project.ownerId)
                                fail('not_return_author', 403);
                            ensureComplete();
                            const reviewer = await eligible(b.reviewerId);
                            if (reviewer.id === v.author.id && reviewer.id !== s.project.ownerId)
                                fail('return_self_review_forbidden', 403);
                            const dueDate = date(b.dueDate);
                            await ev.verify(s, a, [...allProofs(v), ...sourceProofs(s, v)]);
                            v.status = 'pending';
                            v.submittedAt = time;
                            v.reviewer = reviewer;
                            const sourceType = kind === 'basis' ? 'return_basis' : kind === 'sample' ? 'return_sample' : 'cashflow_review';
                            const task = newTask(s, reviewer, { name: kind === 'basis' ? '收益口径审核' : kind === 'sample' ? '独立收益算例审核' : '现金流完整性审核', dueDate, kind: 'review', type: '收益依据审核', relation: 'returns', note: JSON.stringify({ sourceType, sourceId: v.id, sourceVersion: v.version, contentHash: v.contentHash, section: 'returns', dealId: v.scope.dealId, fundId: v.scope.fundId }) });
                            v.taskIds.push(task.id);
                        }
                        else {
                            if (v.status !== 'pending')
                                fail('invalid_return_transition', 409);
                            const enabled = await eligible(v.reviewer?.id);
                            if (enabled.role !== v.reviewer?.role)
                                fail('return_reviewer_changed', 409);
                            const ownerOverride = a.id === s.project.ownerId && canRole(a.role, 'capital:write');
                            if (a.id !== v.reviewer?.id && !ownerOverride)
                                fail('not_return_reviewer', 403);
                            const current = await eligible(a.id);
                            if (current.role !== a.role)
                                fail('return_reviewer_changed', 409);
                            if (a.id === v.author.id && !ownerOverride)
                                fail('return_self_review_forbidden', 403);
                            const tasks = v.taskIds.map(id => s.tasks.find(t => t.id === id));
                            if (!tasks.length || tasks.some(t => !t || !['未开始', '进行中', '已逾期'].includes(t.status) || t.ownerId !== v.reviewer?.id || t.note !== JSON.stringify({ sourceType: kind === 'basis' ? 'return_basis' : kind === 'sample' ? 'return_sample' : 'cashflow_review', sourceId: v.id, sourceVersion: v.version, contentHash: v.contentHash, section: 'returns', dealId: v.scope.dealId, fundId: v.scope.fundId })))
                                fail('return_task_conflict', 409);
                            if (!['approve', 'return', 'reject'].includes(String(b.decision)))
                                fail('invalid_return_decision');
                            const opinion = string(b.opinion);
                            if (b.decision === 'approve') {
                                ensureComplete();
                                await ev.verify(s, a, [...allProofs(v), ...sourceProofs(s, v)]);
                            }
                            const authorizationEvidence = await proof(b.authorizationEvidence, s, a, paths);
                            if (b.decision === 'approve' && !authorizationEvidence.length)
                                fail('return_authorization_evidence_required');
                            v.decisions.push({ actor: current, time, decision: b.decision as any, opinion, authorizationEvidence });
                            v.status = b.decision === 'approve' ? 'approved' : b.decision === 'return' ? 'returned' : 'rejected';
                            for (const t of tasks) {
                                t!.status = '已完成';
                                t!.completedAt = time;
                                t!.updatedAt = time;
                                t!.revision = (t!.revision ?? 1) + 1;
                            }
                        }
                    }
                    p.revision++;
                    audit(s, a, '收益依据流程记录', { action, revision: p.revision, recordId: prior?.id ?? rows.at(-1)!.id });
                    return {};
                });
                return { created: result.created, ledger: await view(s, a) };
            });
        }
        catch (e) {
            if ((e as any)?.safeToDeleteBlob)
                await Promise.all(paths.map(p => unlink(p).catch(() => { })));
            throw e;
        }
    }));
}
