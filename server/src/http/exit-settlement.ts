import { retainEvidenceSource, sourceBasisOf, hiddenSource, inputSource, sourceOf, parseIncludeDemo, readSourceRows, readSourcePolicy, confirmedSource } from '../ledger/source-policy.ts';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { resolveRequestUser } from '../auth/authorize.ts';
import { canRole } from '../auth/rbac.ts';
import { resolveAuthConfig, type AuthConfigInput, type SessionUser } from '../auth/session.ts';
import type { LedgerStore, Material } from '../ledger/store.ts';
import { WorkflowError, fail, object, string, date, revision, requestId, audit, idempotent, type WorkflowState, type MaterialSnapshot } from '../ledger/workflow.ts';
import { MaterialWriteError } from '../ledger/material-upload.ts';
import { emptyPostInvestment, latestVersions, shanghaiDay } from '../ledger/post-investment.ts';
import { exitPreparationEvidence, exitPreparationMissing } from '../ledger/exit-preparation.ts';
import { units, fixed, bankIdentity, closingDay, settlementPositions, sourceSettlementPositions, settlementEvidence, type ExitExecution, type ExitPayment } from '../ledger/exit-settlement.ts';
import { assetProjection, sourceAssetProjection, assetFingerprint, assetHistoryEvidence, type ExitArchive, type ExitClaim, type AssetState } from '../ledger/asset-history.ts';
import { createFinancialEvidence } from './financial-evidence.ts';
import { publicDiligence } from './diligence.ts';
function list(v: unknown) { if (!Array.isArray(v) || !v.length || v.length > 100)
    fail('invalid_list'); return v; }
export function registerExitSettlementRoutes(server: FastifyInstance, store: LedgerStore, options: {
    auth?: AuthConfigInput;
    projectRoot: string;
    storageRoot?: string;
    clock?: () => Date;
}) {
    const auth = resolveAuthConfig(options.auth), root = resolve(options.storageRoot ?? process.env.MATERIAL_STORAGE_ROOT ?? resolve(options.projectRoot, 'private-material-storage'));
    const actorOf = (r: any) => resolveRequestUser(r, auth)!;
    const permission = (a: SessionUser) => { if (!canRole(a.role, 'project:read') && !canRole(a.role, 'fund:read') && a.role !== 'post_investment' && !canRole(a.role, 'capital:write'))
        fail('forbidden', 403); };
    const executeAllowed = (s: WorkflowState, a: SessionUser, dealId?: string) => ['admin', 'investment_manager', 'post_investment'].includes(a.role) && (a.role === 'admin' || a.id === s.project.ownerId || (s.deals ?? []).some(d => (!dealId || d.id === dealId) && d.closing?.responsibility.owner.id === a.id));
    const wrap = (fn: any) => async (r: any, reply: any) => { try {
        return await fn(r, reply);
    }
    catch (e) {
        if (e instanceof WorkflowError || e instanceof MaterialWriteError)
            return reply.code(e.status).send({ error: e.code });
        r.log.error(e);
        return reply.code(500).send({ error: 'exit_settlement_failed' });
    } };
    const { readBytes, authorize, verify, snapshots, visible } = createFinancialEvidence(store, root, projectId => `/api/projects/${projectId}/exit-settlements/files/${randomUUID()}`);
    async function view(s: WorkflowState, a: SessionUser, materials?: Map<string, Material>, includePlans = true, includeDemo = true) {
        materials ??= new Map((await store.listMaterials()).map(m=>[m.id,m]));
        const p = s.postInvestment ?? emptyPostInvestment();
        const payments = readSourceRows(p.exitPayments,includeDemo);
        const executions = (p.exitExecutions??[]).filter(e=>includeDemo||!hiddenSource(e)||payments.some(v=>v.executionId===e.id)).map(e=>({...structuredClone(e),...sourceOf(e)}));
        const selectedPlans = includePlans ? latestVersions(readSourceRows(p.exitPreparations,includeDemo)).filter(v => v.status === 'archived' && v.investment.terms && !exitPreparationMissing(v).length) : [];
        // Preflight every authorization before any private snapshot bytes are read.
        for (const ref of [...settlementEvidence(p), ...selectedPlans.flatMap(exitPreparationEvidence)]) {
            try { await authorize(s,a,ref.materialId,materials); } catch(e) { if(!(e instanceof WorkflowError)) throw e; }
        }
        for (const e of executions) {
            e.signedAgreement = await visible(s, a, e.signedAgreement, materials) as MaterialSnapshot;
            e.evidence = await Promise.all(e.evidence.map(m => visible(s, a, m, materials!))) as MaterialSnapshot[];
            if (e.cancellation)
                e.cancellation.evidence = await Promise.all(e.cancellation.evidence.map(m => visible(s, a, m, materials!))) as MaterialSnapshot[];
        }
        for (const v of payments) {
            v.evidence = await Promise.all(v.evidence.map(m => visible(s, a, m, materials!))) as MaterialSnapshot[];
            if (v.reversal)
                v.reversal.evidence = await Promise.all(v.reversal.evidence.map(m => visible(s, a, m, materials!))) as MaterialSnapshot[];
            if (!canRole(a.role, 'capital:write')) {
                v.bankAccount = '****' + v.bankAccount.slice(-4);
                v.bankReference = '****' + v.bankReference.slice(-4);
            }
        }
        const plans = [];
        for (const plan of selectedPlans) {
            const copy = structuredClone(plan);
            for (const d of copy.documents)
                d.material = await visible(s, a, d.material, materials) as MaterialSnapshot;
            plans.push(copy);
        }
        return publicDiligence({ sourcePolicy:readSourcePolicy(includeDemo), project: { id: s.project.id, name: s.project.name, ownerId: s.project.ownerId }, revision: p.revision, currentUser: a, mayExecute: executeAllowed(s, a), mayReceive: canRole(a.role, 'capital:write'), plans, deals: (s.deals ?? []).filter(d => d.status === 'closed' && d.closing).map(d => ({ id: d.id, title: d.title, ...sourceOf(d),fundIds: d.terms.find(t => t.id === d.closing!.termsId)?.allocations.map(v => v.fundId) ?? [], closingDate: closingDay(d.closing!.time) })), executions, payments, positions: sourceSettlementPositions(s,includeDemo) }, []);
    }
    const archiveAllowed = (s:AssetState,a:SessionUser) => a.role==='admin'||(['investment_manager','post_investment'].includes(a.role)&&a.id===s.project.ownerId);
    const claimsAllowed = (s:AssetState,a:SessionUser) => executeAllowed(s as WorkflowState,a);
    async function assetView(s:AssetState,a:SessionUser,materials:Map<string,Material>,includeDemo=true) {
        const {projection:v,sourceIssue}=sourceAssetProjection(s,includeDemo);
        const archives=readSourceRows(sourceIssue?s.postInvestment?.exitArchives:v.archives,includeDemo),claims=readSourceRows(s.postInvestment?.exitClaims,includeDemo);
        const exiting=[...(s.postInvestment?.exitExecutions??[]),...(s.postInvestment?.exitPayments??[]),...(s.postInvestment?.exitArchives??[]),...(s.postInvestment?.exitPreparations??[])].some(v=>includeDemo||!hiddenSource(v));
        const sourceView=includeDemo?{}:{positions:sourceSettlementPositions(s,false),...(sourceIssue?{sourceIssue:'unverified_source_amounts_excluded',archiveCurrent:false,currentArchiveId:null,...(exiting&&v.status!=='legacy_exited'?{status:'exiting',statusLabel:'退出中（来源未核验）',inManagedMetrics:true}:{} )}:{})};
        for(const row of [...archives,...claims])row.evidence=await Promise.all(row.evidence.map(m=>visible(s,a,m,materials))) as MaterialSnapshot[];
        return publicDiligence({...v,...sourceOf(s.project),...sourceView,sourcePolicy:readSourcePolicy(includeDemo),archives:archives.map(v=>({...v,...(sourceIssue?{current:false}:{})})),claims,latestClaims:claims.filter(c=>!claims.some(n=>n.id===c.id&&n.version>c.version)),revision:s.postInvestment?.revision??1,currentUser:a,mayArchive:archiveAllowed(s,a),mayManageClaims:claimsAllowed(s,a)},[]);
    }
    server.get('/api/projects/:id/asset-history',wrap(async(r:any)=>{const a=actorOf(r);permission(a);const includeDemo=parseIncludeDemo(r.query.includeDemo);return store.workflowTransaction(r.params.id,async s=>assetView(s,a,new Map((await store.listMaterials()).map(m=>[m.id,m])),includeDemo));}));
    server.get('/api/asset-history',wrap(async(r:any)=>{
        const a=actorOf(r);permission(a);const q=object(r.query,['q','fundId','status','includeDemo']),search=q.q===undefined?'':string(q.q,false,1000).toLocaleLowerCase(),fundId=q.fundId===undefined?'':string(q.fundId),status=q.status===undefined?'':string(q.status);
        if(status&&!['managed','exiting','exited','legacy_exited'].includes(status))fail('invalid_asset_status');
        const includeDemo=parseIncludeDemo(q.includeDemo);
        const [projects,states,materials]=await Promise.all([store.listProjects(),store.readExitStates(),store.listMaterials()]);
        const index=new Map(states.map(s=>[s.project.id,s])),materialIndex=new Map(materials.map(m=>[m.id,m])),views=[];
        for(const project of projects){const state=index.get(project.id)??{project,deals:[]};
        if(!includeDemo&&hiddenSource(project)&&![...(state.deals??[]),...(state.deals??[]).flatMap(d=>d.terms),...(state.postInvestment?.exitExecutions??[]),...(state.postInvestment?.exitPayments??[]),...(state.postInvestment?.exitClaims??[])].some(v=>!hiddenSource(v)))continue;
        const v=await assetView(state,a,materialIndex,includeDemo);if(fundId&&!v.fundIds.includes(fundId)||status&&v.status!==status)continue;if(search&&!JSON.stringify(v).toLocaleLowerCase().includes(search))continue;views.push(v);}
        return {currentUser:a,sourcePolicy:readSourcePolicy(includeDemo),projects:views};
    }));
    server.post('/api/projects/:id/asset-history/actions',wrap(async(r:any)=>{
        const a=actorOf(r);permission(a);const b=object(r.body,['requestId','expectedRevision','action','reason','completionReview','evidence','title','description','claimId','status']),action=string(b.action),rid=requestId(b.requestId),rev=revision(b.expectedRevision),paths:string[]=[];
        const fields:Record<string,string[]>={archive_exit:['reason','completionReview','evidence'],create_claim:['title','description','reason','evidence'],revise_claim:['claimId','title','description','status','reason','evidence']};
        if(!fields[action])fail('invalid_asset_action');object(b,['requestId','expectedRevision','action',...fields[action]]);
        try{return await store.workflowTransaction(r.params.id,async s=>{
            const result=await idempotent(s,rid,a,{resource:'asset-history',...b},async()=>{
                const p=s.postInvestment??=emptyPostInvestment();if(p.revision!==rev)fail('post_revision_conflict',409);
                const projection=assetProjection(s),time=new Date().toISOString(),reason=string(b.reason);
                if(action==='archive_exit'){
                    if(!archiveAllowed(s,a))fail('not_exit_archiver',403);
                    if(projection.blockers.length)fail('exit_archive_incomplete',409);
                    if(projection.archiveCurrent)fail('exit_archive_exists',409);
                    const completionReview=string(b.completionReview);
                    // Existing cash and disposal proofs must remain readable when completion is attested.
                    const refs=[...(p.exitExecutions??[]).filter(e=>e.status==='recorded').flatMap(e=>[e.signedAgreement,...e.evidence]),...(p.exitPayments??[]).filter(v=>v.status==='posted').flatMap(v=>v.evidence)],inputs=list(b.evidence).map(v=>object(v,['materialId','versionId']));
                    for(const ref of [...refs,...inputs])await authorize(s,a,string(ref.materialId));
                    await verify(s,a,refs);
                    const archive:ExitArchive={dataOrigin:'system_generated',sourceBasis:[...(s.deals??[]).flatMap(v=>sourceBasisOf(v,'deal_batch',s.project.id)),...(p.exitExecutions??[]).flatMap(v=>sourceBasisOf(v,'exit_execution',s.project.id)),...(p.exitPayments??[]).flatMap(v=>sourceBasisOf(v,'exit_payment',s.project.id))],id:randomUUID(),version:(p.exitArchives?.length??0)+1,actor:a,time,reason,completionReview,evidence:await snapshots(b.evidence,s,a,paths),fingerprint:assetFingerprint(s),positions:projection.positions,executionIds:(p.exitExecutions??[]).filter(e=>e.status==='recorded').map(e=>e.id),paymentIds:(p.exitPayments??[]).filter(v=>v.status==='posted').map(v=>v.id),dealIds:(s.deals??[]).map(d=>d.id)};
                    retainEvidenceSource(archive,archive.evidence);(p.exitArchives??=[]).push(archive);
                }else{
                    if(!claimsAllowed(s,a))fail('not_exit_claim_manager',403);
                    let id:string=randomUUID(),version=1,status:ExitClaim['status']='open';
                    if(action==='create_claim'){
                        if(projection.status!=='exited'&&!projection.legacyUnverified)fail('exit_history_required',409);
                    }else{
                        const prior=p.exitClaims?.filter(c=>c.id===b.claimId).at(-1);if(!prior)fail('exit_claim_not_found',404);
                        if(!['open','resolved','cancelled'].includes(String(b.status)))fail('invalid_claim_status');
                        id=prior.id;version=prior.version+1;status=b.status as ExitClaim['status'];
                    }
                    const title=string(b.title),description=string(b.description);
                    (p.exitClaims??=[]).push({...inputSource(p.exitClaims?.filter(v=>v.id===id).at(-1),'exit_claim',s.project.id),id,version,status,title,description,reason,actor:a,time,evidence:await snapshots(b.evidence,s,a,paths)});retainEvidenceSource(p.exitClaims.at(-1)!,p.exitClaims.at(-1)!.evidence);
                }
                p.revision++;audit(s,a,'已退出历史资产管理',{action,revision:p.revision});return {};
            });return {created:result.created,asset:await assetView(s,a,new Map((await store.listMaterials()).map(m=>[m.id,m])))};
        });}catch(e){if((e as any)?.safeToDeleteBlob)await Promise.all(paths.map(p=>unlink(p).catch(()=>{})));throw e;}
    }));
    server.get('/api/projects/:id/exit-settlements', wrap(async (r: any) => { const a = actorOf(r); permission(a); const includeDemo=parseIncludeDemo(r.query.includeDemo);return store.workflowTransaction(r.params.id, s => view(s, a,undefined,true,includeDemo)); }));
    server.get('/api/exit-settlements', wrap(async (r: any) => { const a = actorOf(r); permission(a); const q = object(r.query, ['fundId', 'projectId','includeDemo']), fundId = q.fundId === undefined ? undefined : string(q.fundId), projectId = q.projectId === undefined ? undefined : string(q.projectId); const includeDemo=parseIncludeDemo(q.includeDemo);const views = [], materials = new Map((await store.listMaterials()).map(m=>[m.id,m])); for (const s of await store.readExitStates()) {
        if (projectId && s.project.id !== projectId)
            continue;
        views.push(await view({ ...s, tasks: [], rounds: [], receipts: {}, auditEvents: [] }, a, materials, false,includeDemo));
    } return { currentUser: a, sourcePolicy:readSourcePolicy(includeDemo),executions: views.flatMap(v => v.executions).filter(e => !fundId || e.allocations.some(x => x.fundId === fundId)), payments: views.flatMap(v => v.payments).filter(v => !fundId || v.fundId === fundId), positions: views.flatMap(v => v.positions).filter(v => !fundId || v.fundId === fundId) }; }));
    server.get('/api/projects/:id/exit-settlements/files/:fileId', wrap(async (r: any, reply: any) => { const a = actorOf(r); permission(a); const m = await store.workflowTransaction(r.params.id, async (s) => { const m = [...settlementEvidence(s.postInvestment ?? {}),...assetHistoryEvidence(s.postInvestment ?? {})].find(m => m.downloadHref === `/api/projects/${s.project.id}/exit-settlements/files/${r.params.fileId}`); if (!m)
        fail('exit_file_not_found', 404); await verify(s, a, [m]); return m; }); reply.header('Cache-Control', 'private, no-store').header('X-Content-Type-Options', 'nosniff').header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(m.name)}`); return reply.type('application/octet-stream').send(await readBytes(m.packetBlobId!, m.sha256, m.sizeBytes)); }));
    server.post('/api/projects/:id/exit-settlements/actions', wrap(async (r: any) => {
        const a = actorOf(r);
        permission(a);
        const b = object(r.body, ['requestId', 'expectedRevision', 'action', 'planId', 'planVersion', 'date', 'note', 'allocations', 'signedAgreement', 'evidence', 'executionId', 'reason', 'fundId', 'amount', 'principal', 'income', 'currency', 'bankAccount', 'bankReference', 'paymentId']), action = string(b.action), rid = requestId(b.requestId), rev = revision(b.expectedRevision), paths: string[] = [];
        const fields: Record<string, string[]> = { execute: ['planId', 'planVersion', 'date', 'note', 'allocations', 'signedAgreement', 'evidence'], cancel_execution: ['executionId', 'reason', 'evidence'], receive: ['executionId', 'fundId', 'date', 'amount', 'principal', 'income', 'currency', 'bankAccount', 'bankReference', 'note', 'evidence'], reverse_payment: ['paymentId', 'reason', 'evidence'] };
        if (!fields[action])
            fail('invalid_exit_action');
        object(b, ['requestId', 'expectedRevision', 'action', ...fields[action]]);
        try {
            return await store.workflowTransaction(r.params.id, async (s) => {
                const result = await idempotent(s, rid, a, { resource: 'exit-settlement', ...b }, async () => {
                    const p = s.postInvestment ??= emptyPostInvestment();
                    if (p.revision !== rev)
                        fail('post_revision_conflict', 409);
                    p.exitExecutions ??= [];
                    p.exitPayments ??= [];
                    const time = new Date().toISOString();
                    if (action === 'execute') {
                        const plan = latestVersions(p.exitPreparations ?? []).find(v => v.id === b.planId);
                        if (!plan || plan.version !== b.planVersion || plan.status !== 'archived' || !plan.investment.terms || exitPreparationMissing(plan).length)
                            fail('archived_exit_plan_required', 409);
                        const d = s.deals?.find(d => d.id === plan.dealId && d.status === 'closed' && d.closing);
                        if (!d?.closing)
                            fail('closed_deal_required', 409);
                        if (plan.investment.termsId !== d.closing.termsId || plan.investment.terms.id !== d.closing.termsId)
                            fail('exit_investment_snapshot_mismatch',409);
                        if (!executeAllowed(s, a, d.id))
                            fail('not_exit_executor', 403);
                        if (p.exitExecutions.some(e => e.planId === plan.id && e.planVersion === plan.version && e.status === 'recorded'))
                            fail('exit_execution_exists', 409);
                        const day = date(b.date);
                        if (day < closingDay(d.closing.time) || day > shanghaiDay(options.clock?.() ?? new Date()))
                            fail('invalid_exit_date');
                        const note = string(b.note);
                        const allocations = list(b.allocations).map(v => { const x = object(v, ['fundId', 'portion', 'consideration']), fundId = string(x.fundId), portion = units(x.portion, 4), consideration = units(x.consideration); if (!plan.investment.allocations.some(a => a.fundId === fundId) || !d.terms.find(t=>t.id===d.closing!.termsId)?.allocations.some(a=>a.fundId===fundId) || portion <= 0n || portion > units(plan.portion, 4))
                            fail('invalid_exit_allocation'); const prior = p.exitExecutions!.filter(e => e.status === 'recorded' && e.dealId === d.id).flatMap(e => e.allocations).filter(a => a.fundId === fundId).reduce((n, a) => n + units(a.portion, 4), 0n); if (prior + portion > 1000000n)
                            fail('exit_portion_exceeded', 409); return { fundId, portion: fixed(portion, 4), consideration: fixed(consideration) }; });
                        if (new Set(allocations.map(a => a.fundId)).size !== allocations.length)
                            fail('duplicate_value');
                        if (allocations.reduce((n, a) => n + units(a.consideration), 0n) !== units(plan.consideration))
                            fail('exit_consideration_mismatch');
                        // Authorize the whole action before reading any private source bytes.
                        for (const ref of [...exitPreparationEvidence(plan), ...[b.signedAgreement,...list(b.evidence)].map(v=>{const x=object(v,['materialId','versionId']);return {materialId:string(x.materialId)};})]) await authorize(s,a,ref.materialId);
                        await verify(s, a, exitPreparationEvidence(plan));
                        const signedAgreement = (await snapshots([b.signedAgreement], s, a, paths))[0], evidence = await snapshots(b.evidence, s, a, paths);
                        const e: ExitExecution = { ...inputSource(), id: randomUUID(), projectId: s.project.id, dealId: d.id, planId: plan.id, planVersion: plan.version, title: plan.title, date: day, note, actor: a, time, allocations, signedAgreement, evidence, status: 'recorded' };
                        retainEvidenceSource(e,[signedAgreement,...evidence]);
                        p.exitExecutions.push(e);
                    }
                    else if (action === 'cancel_execution') {
                        const e = p.exitExecutions.find(e => e.id === b.executionId);
                        if (!e)
                            fail('exit_execution_not_found', 404);
                        if (!executeAllowed(s, a, e.dealId))
                            fail('not_exit_executor', 403);
                        if (e.status !== 'recorded')
                            fail('invalid_exit_transition', 409);
                        if (p.exitPayments.some(v => v.executionId === e.id && v.status === 'posted'))
                            fail('exit_has_posted_payments', 409);
                        e.cancellation = { actor: a, time, reason: string(b.reason), evidence: await snapshots(b.evidence, s, a, paths) };
                        e.status = 'cancelled';
                    }
                    else {
                        if (!canRole(a.role, 'capital:write'))
                            fail('forbidden', 403);
                        if (action === 'receive') {
                            const e = p.exitExecutions.find(e => e.id === b.executionId && e.status === 'recorded');
                            if (!e)
                                fail('exit_execution_not_found', 404);
                            const fundId = string(b.fundId), allocation = e.allocations.find(x => x.fundId === fundId);
                            if (!allocation)
                                fail('invalid_exit_fund');
                            const day = date(b.date), d = s.deals?.find(d => d.id === e.dealId);
                            if (!d?.closing)
                                fail('closed_deal_required', 409);
                            if (day < closingDay(d.closing.time) || day > shanghaiDay(options.clock?.() ?? new Date()))
                                fail('invalid_payment_date');
                            const amount = units(b.amount), principal = units(b.principal), income = units(b.income);
                            if (amount <= 0n || principal + income !== amount)
                                fail('payment_amount_mismatch');
                            const paid = p.exitPayments.filter(v => v.executionId === e.id && v.fundId === fundId && v.status === 'posted').reduce((n, v) => n + units(v.amount), 0n);
                            if (paid + amount > units(allocation.consideration))
                                fail('payment_exceeds_outstanding', 409);
                            const bankAccount = bankIdentity(b.bankAccount), bankReference = bankIdentity(b.bankReference);
                            if ((s.bankEventIdentities ?? s.exitPaymentIdentities ?? []).some(v => v.status === 'posted' && v.fundId === fundId && bankIdentity(v.bankAccount) === bankAccount && bankIdentity(v.bankReference) === bankReference))
                                fail('duplicate_bank_receipt', 409);
                            if(b.currency!==undefined&&b.currency!=='CNY')fail('invalid_currency');
                            const v: ExitPayment = { ...inputSource(), ...(b.currency==='CNY'?{currency:'CNY' as const}:{}), id: randomUUID(), projectId: s.project.id, executionId: e.id, fundId, date: day, amount: fixed(amount), principal: fixed(principal), income: fixed(income), bankAccount, bankReference, actor: a, time, note: string(b.note), evidence: await snapshots(b.evidence, s, a, paths), status: 'posted' };
                            retainEvidenceSource(v,v.evidence);
                            p.exitPayments.push(v);
                        }
                        else {
                            const v = p.exitPayments.find(v => v.id === b.paymentId);
                            if (!v)
                                fail('exit_payment_not_found', 404);
                            if (v.status !== 'posted')
                                fail('invalid_payment_transition', 409);
                            v.reversal = { actor: a, time, reason: string(b.reason), evidence: await snapshots(b.evidence, s, a, paths) };
                            v.status = 'reversed';
                        }
                    }
                    p.revision++;
                    audit(s, a, '退出执行与回款登记', { action, revision: p.revision });
                    return {};
                });
                return { created: result.created, settlement: await view(s, a) };
            }, { exitPaymentIdentities: action === 'receive' });
        }
        catch (e) {
            if ((e as any)?.safeToDeleteBlob)
                await Promise.all(paths.map(p => unlink(p).catch(() => { })));
            throw e;
        }
    }));
}
