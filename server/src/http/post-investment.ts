import {generateDocument,documentMime} from '../ledger/document-output.ts';
import {postDocument} from '../ledger/document-content.ts';
import {lpProjection,canReadLp} from '../ledger/lp-privacy.ts';
import { materialVersionSourceBasis, retainEvidenceSource, sourceBasisOf, inputSource, parseIncludeDemo, readSourceRows, readSourcePolicy, type SourceRecord } from '../ledger/source-policy.ts';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type {MaintenanceStatus} from './health.ts';
import { resolveRequestUser } from '../auth/authorize.ts';
import { canRole } from '../auth/rbac.ts';
import { resolveAuthConfig, type AuthConfigInput, type SessionUser } from '../auth/session.ts';
import type { LedgerStore } from '../ledger/store.ts';
import { WorkflowError, fail, object, string, date, revision, requestId, audit, idempotent, newTask, type MaterialSnapshot, type WorkflowState } from '../ledger/workflow.ts';
import { MaterialWriteError } from '../ledger/material-upload.ts';
import { emptyPostInvestment, canonicalPeriod, periodContains, latestVersions, reconcilePostClauses, shanghaiDay, type PostFinancial, type PostVisit, type PostClause } from '../ledger/post-investment.ts';
import { storageDirectory, writeBlob } from './material-upload.ts';
import { canReadMaterial } from './material-files.ts';
import { publicDiligence } from './diligence.ts';
import { workflowDirectory } from './workflow.ts';
import {capturePostReport, reportEvidence, reportSourceHash, renderPostReport, type PostReport} from '../ledger/post-report.ts';
import {decimal} from './deal.ts';
import {exitPreparationEvidence,exitPreparationMissing,exitDocumentLabels,type ExitPreparation,type ExitDocumentKind} from '../ledger/exit-preparation.ts';
const now = () => new Date().toISOString();
const writeRoles = ['admin', 'investment_manager', 'post_investment'];
function list(v: unknown, empty = false): unknown[] { if (!Array.isArray(v) || v.length > 100 || (!empty && !v.length))
    fail('invalid_list'); return v; }
function money(v: unknown, signed = false): string { const text = string(v, true, 30); if (!new RegExp(`^${signed ? '-?' : ''}(0|[1-9]\\d{0,17})(\\.\\d{1,2})?$`).test(text))
    fail('invalid_decimal'); const [w, f = ''] = text.split('.'); return `${w === '-0' && !/[1-9]/.test(f) ? '0' : w}.${f.padEnd(2, '0')}`; }
export function registerPostInvestmentRoutes(server: FastifyInstance, store: LedgerStore, options: {
    auth?: AuthConfigInput;
    projectRoot: string;
    storageRoot?: string;
    clock?: () => Date;
    reconcileIntervalMs?: number;
    onProjectedDocument?: (request: object) => void;
}) {
    const auth = resolveAuthConfig(options.auth), root = resolve(options.storageRoot ?? process.env.MATERIAL_STORAGE_ROOT ?? resolve(options.projectRoot, 'private-material-storage'));
    const actorOf = (r: any) => resolveRequestUser(r, auth)!;
    const permission = (a: SessionUser, write = false) => { if (write ? !writeRoles.includes(a.role) : !canRole(a.role, 'project:read') && !['legal', 'post_investment'].includes(a.role))
        fail('forbidden', 403); };
    const eligible = async (id: unknown) => { const u = (await workflowDirectory(store, auth)).find(v => v.id === string(id) && v.canLogin && writeRoles.includes(v.role)); if (!u)
        fail('ineligible_user'); return { id: u.id, name: u.name, email: u.email, role: u.role }; };
    const wrap = (fn: any) => async (r: any, reply: any) => { try {
        return await fn(r, reply);
    }
    catch (e) {
        if (e instanceof WorkflowError || e instanceof MaterialWriteError)
            return reply.code(e.status).send({ error: e.code });
        r.log.error(e);
        return reply.code(500).send({ error: 'post_investment_failed' });
    } };
    async function bytes(blobId: string, sha: string, size: number) { if (!/^[0-9a-f-]{36}$/i.test(blobId))
        fail('material_blob_unavailable', 409); let b: Buffer; try {
        const dir = await storageDirectory(root), f = await open(resolve(dir, blobId), constants.O_RDONLY | constants.O_NOFOLLOW);
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
    async function materialAllowed(s: WorkflowState, a: SessionUser, id: string) { const m = (await store.listMaterials()).find(m => m.id === id); if (!m || !(m.projectId === s.project.id || m.relationships?.projects.some(p => p.id === s.project.id)))
        fail('material_not_linked'); if (!canReadMaterial(a, m))
        fail('forbidden', 403); return m; }
    async function snapshots(input: unknown, s: WorkflowState, a: SessionUser, paths: string[]): Promise<MaterialSnapshot[]> { const refs = list(input), keys = new Set<string>(), out: MaterialSnapshot[] = []; for (const ref of refs) {
        const b = object(ref, ['materialId', 'versionId']), materialId = string(b.materialId), versionId = string(b.versionId), key = `${materialId}:${versionId}`;
        if (keys.has(key))
            fail('duplicate_value');
        keys.add(key);
        const material=await materialAllowed(s, a, materialId);
        const v = (await store.listMaterialVersions(materialId)).find(v => v.id === versionId);
        if (!v)
            fail('material_version_unavailable', 409);
        const data = await bytes(v.blobId, v.sha256, v.sizeBytes), packetBlobId = randomUUID();
        paths.push(await writeBlob(root, packetBlobId, data));
        out.push({ materialId, versionId, sourceBasis:materialVersionSourceBasis(material,v), name: v.name, sha256: v.sha256, sizeBytes: v.sizeBytes, packetBlobId, downloadHref: `/api/projects/${s.project.id}/post-investment/files/${randomUUID()}` });
    } return out; }
    async function verify(s: WorkflowState, a: SessionUser, refs: MaterialSnapshot[]) {
        // Check every authorization before an unavailable file can short-circuit verification.
        for(const m of refs) await materialAllowed(s,a,m.materialId);
        for(const m of refs) await bytes(m.packetBlobId!,m.sha256,m.sizeBytes);
    }
    const today = () => shanghaiDay(options.clock?.() ?? new Date());
    async function reconcileChecked(s: WorkflowState) {
        if (!s.postInvestment) return false;
        const before = new Set(latestVersions(s.postInvestment.clauses).filter(c=>c.warningIssue).map(c=>`${c.id}:${c.version}`));
        const directory = await workflowDirectory(store,auth);
        const eligibleOwners = new Set(directory.filter(u=>u.canLogin&&writeRoles.includes(u.role)).map(u=>u.id));
        const changed = reconcilePostClauses(s,today(),eligibleOwners);
        for (const c of latestVersions(s.postInvestment.clauses)) {
            if(c.warningIssue&&!before.has(`${c.id}:${c.version}`)) server.log.warn({projectId:s.project.id,clauseId:c.id,version:c.version,ownerId:c.owner.id,issue:c.warningIssue},'post clause warning deferred; will retry');
        }
        return changed;
    }
    const post = (s: WorkflowState) => s.postInvestment ??= emptyPostInvestment();
    function finishTasks(s: WorkflowState, ids: string[], status: '已完成' | '已取消', reason: string) { for (const t of s.tasks.filter(t => ids.includes(t.id) && !['已完成', '已取消'].includes(t.status))) {
        t.status = status;
        t.note += `\n${reason}`;
        t.revision = (t.revision ?? 1) + 1;
        t.updatedAt = now();
        t.completedAt = status === '已完成' ? now() : null;
    } }

 server.get('/api/funds/:fundId/project-clauses',async(request,reply)=>{try{const {fundId}=request.params as {fundId:string};if(!(await store.listFunds()).some(f=>f.id===fundId))return reply.code(404).send({error:'fund_not_found'});const includeDemo=parseIncludeDemo((request.query as {includeDemo?:unknown}).includeDemo);const states=await store.readExitStates();return {clauses:states.filter(s=>s.project&&(s.project.fundId===fundId||s.deals.some(d=>d.terms.some(t=>t.allocations.some(a=>a.fundId===fundId))))).flatMap(s=>latestVersions(readSourceRows(s.postInvestment?.clauses??[],includeDemo)).map(c=>({id:c.id,title:c.title,status:c.status,trigger:c.triggerDate,project:{id:s.project.id,name:s.project.name}})))};}catch(e){if(e instanceof WorkflowError)return reply.code(e.status).send({error:e.code});throw e;}});
    server.get('/api/projects/:id/post-investment', wrap(async (r:any)=>{
        const actor=actorOf(r);permission(actor);const includeDemo=parseIncludeDemo(r.query.includeDemo);
        return store.workflowTransaction(r.params.id,async s=>{
            await reconcileChecked(s);
            const raw=s.postInvestment??emptyPostInvestment();
            const post={...raw,financials:readSourceRows(raw.financials,includeDemo),visits:readSourceRows(raw.visits,includeDemo),archives:readSourceRows(raw.archives,includeDemo),clauses:readSourceRows(raw.clauses,includeDemo),reports:readSourceRows(raw.reports,includeDemo),exitPreparations:readSourceRows(raw.exitPreparations,includeDemo),returnBases:readSourceRows(raw.returnBases,includeDemo),returnSamples:readSourceRows(raw.returnSamples,includeDemo),cashflowReviews:readSourceRows(raw.cashflowReviews,includeDemo),investmentCashflows:readSourceRows(raw.investmentCashflows,includeDemo),exitExecutions:readSourceRows(raw.exitExecutions,includeDemo),exitPayments:readSourceRows(raw.exitPayments,includeDemo),exitArchives:readSourceRows(raw.exitArchives,includeDemo),exitClaims:readSourceRows(raw.exitClaims,includeDemo)},reports=[],exitPreparations=[];
            for(const report of post.reports??[]){
                if(!['admin','investment_manager','post_investment','viewer'].includes(actor.role))continue;
                try{await verify(s,actor,reportEvidence(report));reports.push(report);}
                catch(error){
                    if(!(error instanceof WorkflowError))throw error;
                    if(['forbidden','material_not_linked'].includes(error.code))continue;
                    reports.push({...report,readIssue:error.code});
                }
            }
            for(const plan of post.exitPreparations??[]){
                if(!['admin','investment_manager','post_investment','viewer'].includes(actor.role))continue;
                try{await verify(s,actor,exitPreparationEvidence(plan));exitPreparations.push(plan);}
                catch(error){if(!(error instanceof WorkflowError))throw error;if(['forbidden','material_not_linked'].includes(error.code))continue;exitPreparations.push({...plan,readIssue:error.code});}
            }
            return publicDiligence({sourcePolicy:readSourcePolicy(includeDemo),postInvestment:{...post,...(post.reports?{reports}:{}),...(post.exitPreparations?{exitPreparations}:{})},closedDeals:(s.deals??[]).filter(d=>d.status==='closed'&&d.closing).map(d=>({id:d.id,title:d.title,owner:d.closing!.responsibility.owner,agreements:d.agreements.filter(a=>a.signed&&a.termsId===d.closing!.termsId).map(a=>({id:a.id,title:a.title,signedMaterial:a.signed!.material}))})),currentUser:actor});
        });
    }));
    server.get('/api/projects/:id/post-investment/files/:fileId', wrap(async (r: any, reply: any) => { const actor = actorOf(r); permission(actor); const m = await store.workflowTransaction(r.params.id, async (s) => { const p = s.postInvestment; const refs = p ? [...p.financials.flatMap(v => v.evidence), ...p.visits.flatMap(v => v.evidence), ...p.archives.flatMap(v => v.materials), ...p.clauses.flatMap(v => [v.signedMaterial, ...v.resolution?.evidence ?? []]),...(p.reports??[]).flatMap(reportEvidence),...(p.exitPreparations??[]).flatMap(exitPreparationEvidence)] : []; const m = refs.find(m => m.downloadHref === `/api/projects/${s.project.id}/post-investment/files/${r.params.fileId}`); if (!m)
        fail('post_file_not_found', 404); await verify(s, actor, [m]); return m; }); reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(m.name)}`); return reply.type('application/octet-stream').send(await bytes(m.packetBlobId!, m.sha256, m.sizeBytes)); }));
    server.get('/api/projects/:id/post-investment/reports/:reportId/versions/:version/:format', wrap(async (r:any,reply:any)=>{
        const actor=actorOf(r);permission(actor);
        const raw=await store.readPostInvestmentArchive(r.params.id,'report',r.params.reportId,r.params.version) as PostReport|null;
        if(!raw)fail('post_report_not_found',404);
        if(raw.status!=='archived')fail('report_not_archived',409);
        if(reportSourceHash(raw)!==raw.sourceHash)fail('report_integrity_mismatch',409);
        await store.workflowTransaction(r.params.id,async s=>{await verify(s,actor,reportEvidence(raw));});
        const report=publicDiligence(raw);
        if(!['html','json','docx','pdf'].includes(r.params.format))fail('invalid_report_format');
        reply.header('Cache-Control','private, no-store').header('X-Content-Type-Options','nosniff');
        reply.header('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(report.title+'-V'+report.version+'.'+r.params.format)}`);
        if(['docx','pdf'].includes(r.params.format)){const document=postDocument(report),visible=canReadLp(actor)?document:(await lpProjection(store)).project(document) as typeof document;const bytes=await generateDocument(visible,r.params.format);options.onProjectedDocument?.(r);return reply.type(documentMime[r.params.format as keyof typeof documentMime]).send(bytes);}
        const visible=canReadLp(actor)?report:(await lpProjection(store)).project(report) as typeof report;
        const notice=JSON.stringify(visible)!==JSON.stringify(report)?'已脱敏视图，sourceHash属于原归档快照，不用于验证脱敏正文。':undefined;
        reply.header('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(visible.title+'-V'+visible.version+'.'+r.params.format)}`);
        const output=r.params.format==='html'?renderPostReport(visible,notice):JSON.stringify(notice?{...visible,projectionNotice:notice}:visible,null,2);
        options.onProjectedDocument?.(r);
        return reply.type(r.params.format==='html'?'text/html;charset=utf-8':'application/json;charset=utf-8').send(output);
    }));
    server.get('/api/projects/:id/post-investment/exit-preparations/:planId/versions/:version/json',wrap(async(r:any,reply:any)=>{
        const actor=actorOf(r);permission(actor);
        const raw=await store.readPostInvestmentArchive(r.params.id,'exit_preparation',r.params.planId,r.params.version) as ExitPreparation|null;
        if(!raw)fail('exit_preparation_not_found',404);
        if(raw.status!=='archived')fail('exit_preparation_not_archived',409);
        await store.workflowTransaction(r.params.id,async s=>{await verify(s,actor,exitPreparationEvidence(raw));});
        const plan=publicDiligence(raw);
        reply.header('Content-Disposition',`attachment; filename="exit-preparation-${plan.id}-v${plan.version}.json"`);
        reply.header('X-Content-Type-Options','nosniff');return reply.type('application/json;charset=utf-8').send(JSON.stringify(plan,null,2));
    }));
    server.post('/api/projects/:id/post-investment/actions', wrap(async (r: any) => {
        const actor = actorOf(r);
        permission(actor, true);
        const raw = object(r.body, ['requestId', 'expectedRevision', 'dealId', 'action', 'recordId', 'reason', 'financial', 'decision', 'opinion', 'visit', 'period', 'category', 'note', 'materials', 'clause', 'status', 'evidence', 'report', 'acceptMissing', 'exit']);
        const action = string(raw.action), rid = requestId(raw.requestId), rev = revision(raw.expectedRevision), dealId = string(raw.dealId), paths: string[] = [];
        const fields: Record<string, string[]> = { save_financial: ['recordId', 'reason', 'financial'], submit_financial: ['recordId'], review_financial: ['recordId', 'decision', 'opinion'], save_visit: ['recordId', 'reason', 'visit'], archive: ['period', 'category', 'note', 'materials'], save_clause: ['recordId', 'reason', 'clause'], resolve_clause: ['recordId', 'status', 'reason', 'evidence'], reconcile: [], save_report:['recordId','reason','report'], submit_report:['recordId'], review_report:['recordId','decision','opinion','acceptMissing'], archive_report:['recordId'], save_exit:['recordId','reason','exit'], submit_exit:['recordId'], review_exit:['recordId','decision','opinion'], archive_exit:['recordId'] };
        if (!fields[action])
            fail('invalid_post_action');
        object(raw, ['requestId', 'expectedRevision', 'dealId', 'action', ...fields[action]]);
        try {
            return publicDiligence(await store.workflowTransaction(r.params.id, async (s) => idempotent(s, rid, actor, { resource: 'post-investment', ...raw }, async () => {
                const d = s.deals?.find(d => d.id === dealId && d.status === 'closed' && d.closing);
                if (!d?.closing)
                    fail('closed_deal_required', 409);
                const p = post(s);
                if (p.revision !== rev)
                    fail('post_revision_conflict', 409);
                const assignedClauseOwner = action === 'resolve_clause' && latestVersions(p.clauses).some(c => c.id === raw.recordId && c.dealId === dealId && c.owner.id === actor.id);
                if (!['review_financial','review_report','review_exit'].includes(action) && !assignedClauseOwner && actor.role !== 'admin' && actor.id !== d.closing.responsibility.owner.id)
                    fail('not_post_owner', 403);
                const owner = await eligible(d.closing.responsibility.owner.id);
                const purposeType=({save_financial:'financial',save_visit:'visit',save_clause:'post_clause',save_report:'post_report',save_exit:'exit_preparation'} as Record<string,string>)[action];
                const base = (old?: SourceRecord & {
                    id: string;
                    version: number;
                }) => ({ ...inputSource(old,purposeType,s.project.id), id: old?.id ?? randomUUID(), version: (old?.version ?? 0) + 1, dealId, owner, time: now(), reason: string(raw.reason) });
                const find = <T extends {
                    id: string;
                    dealId: string;
                }>(values: T[]) => { const v = [...values].reverse().find(v => v.id === raw.recordId); if (!v || v.dealId !== dealId)
                    fail('post_record_not_found', 404); return v; };
                if(action==='save_exit'){
                    p.exitPreparations??=[];
                    const old=raw.recordId?find(p.exitPreparations):undefined;
                    if(old&&['pending','rejected'].includes(old.status))fail('exit_preparation_frozen',409);
                    if(p.exitPreparations.some(v=>v.dealId===dealId&&v.id!==old?.id))fail('exit_preparation_exists',409);
                    const b=object(raw.exit,['title','exitType','scope','portion','expectedDate','consideration','priceReason','pricingBasis','currency','counterparty','strategy','documents']);
                    const exitType=string(b.exitType),scope=string(b.scope),portion=decimal(b.portion,4),expectedDate=date(b.expectedDate);
                    if(!['equity_transfer','repurchase','ipo','liquidation'].includes(exitType)||!['partial','full'].includes(scope))fail('invalid_exit_type');
                    if(portion.units>1000000n||(scope==='full'?portion.units!==1000000n:portion.units===1000000n))fail('invalid_exit_portion');
                    const closedTime=d.closing.time;
                    const closedDay=/^\d{4}-\d{2}-\d{2}$/.test(closedTime)?date(closedTime):Number.isFinite(Date.parse(closedTime))?shanghaiDay(new Date(closedTime)):fail('closed_date_invalid',409);
                    if(expectedDate<closedDay)fail('exit_date_before_investment');
                    if(b.currency!=='CNY')fail('currency_required');
                    const consideration=b.consideration===null?null:money(b.consideration),priceReason=string(b.priceReason,consideration===null);
                    const reviewer=await eligible(s.project.ownerId);if(!['admin','investment_manager'].includes(reviewer.role))fail('ineligible_exit_owner');
                    const documents:ExitPreparation['documents']=[],kinds=new Set<string>();
                    for(const item of list(b.documents,true)){
                        const doc=object(item,['kind','location','material']),kind=string(doc.kind);
                        if(!Object.hasOwn(exitDocumentLabels,kind)||kinds.has(kind))fail('invalid_exit_documents');kinds.add(kind);
                        documents.push({kind:kind as ExitDocumentKind,location:string(doc.location,true,2000),material:(await snapshots([doc.material],s,actor,paths))[0]});
                    }
                    const terms=d.terms.find(t=>t.id===d.closing!.termsId);if(!terms)fail('closed_terms_missing',409);
                    const plan:ExitPreparation={...base(old),sourceBasis:[...(inputSource(old,purposeType,s.project.id).sourceBasis??[]),...sourceBasisOf(terms,'deal_terms',s.project.id)],title:string(b.title,true,300),exitType:exitType as ExitPreparation['exitType'],scope:scope as ExitPreparation['scope'],portion:portion.text,expectedDate,consideration,priceReason,pricingBasis:string(b.pricingBasis),currency:'CNY',counterparty:string(b.counterparty),strategy:string(b.strategy),documents,reviewer,status:'draft',decisions:[],investment:structuredClone({termsId:terms.id,allocations:terms.allocations,terms})};
                    retainEvidenceSource(plan,documents.map(v=>v.material));p.exitPreparations.push(plan);
                }else if(['submit_exit','review_exit','archive_exit'].includes(action)){
                    const plan=find(p.exitPreparations??[]);await verify(s,actor,exitPreparationEvidence(plan));
                    if(action==='submit_exit'){
                        if(plan.status!=='draft')fail('invalid_exit_transition',409);
                        if(exitPreparationMissing(plan).length)fail('exit_preparation_incomplete',409);
                        if(!plan.investment.terms)fail('exit_investment_snapshot_incomplete',409);
                        const reviewer=await eligible(s.project.ownerId);if(!['admin','investment_manager'].includes(reviewer.role)||reviewer.id!==plan.reviewer.id)fail('exit_owner_changed',409);
                        plan.status='pending';plan.reviewerTaskId=newTask(s,reviewer,{name:`审核退出方案：${plan.title}`,dueDate:today(),kind:'post_clause',type:'退出方案审核',relation:`退出方案 ${plan.id} v${plan.version}`}).id;
                    }else if(action==='review_exit'){
                        if(plan.status!=='pending')fail('invalid_exit_transition',409);
                        const reviewer=await eligible(actor.id);if(actor.id!==s.project.ownerId||!['admin','investment_manager'].includes(reviewer.role))fail('not_exit_reviewer',403);
                        const decision=string(raw.decision),opinion=string(raw.opinion);if(!['approve','return','reject'].includes(decision))fail('invalid_decision');
                        plan.decisions.push({actor,decision:decision as 'approve'|'return'|'reject',opinion,time:now()});plan.status=decision==='approve'?'approved':decision==='return'?'returned':'rejected';
                        if(plan.reviewerTaskId)finishTasks(s,[plan.reviewerTaskId],'已完成',opinion);
                    }else{
                        if(plan.status!=='approved')fail('invalid_exit_transition',409);
                        if(exitPreparationMissing(plan).length)fail('exit_preparation_incomplete',409);
                        if(!plan.investment.terms)fail('exit_investment_snapshot_incomplete',409);
                        plan.status='archived';plan.archived={actor,time:now()};
                    }
                }
                else if(action==='save_report'){
                    p.reports??=[];
                    const old=raw.recordId?find(p.reports):undefined;
                    if(old&&['pending','rejected'].includes(old.status))fail('report_frozen',409);
                    const b=object(raw.report,['title','period','analysis','evidence']),period=canonicalPeriod(b.period);
                    if(old&&JSON.stringify(old.period)!==JSON.stringify(period))fail('record_period_immutable',409);
                    if(p.reports.some(v=>v.id!==old?.id&&v.dealId===dealId&&v.period.kind===period.kind&&v.period.value===period.value))fail('report_period_exists',409);
                    const reviewer=await eligible(s.project.ownerId);
                    if(!['admin','investment_manager'].includes(reviewer.role))fail('ineligible_report_owner');
                    const captured=capturePostReport(s,dealId,period,now());
                    const report:PostReport={...base(old),...captured,dataOrigin:'system_generated',sourceBasis:[...sourceBasisOf(s.project,'project',''),...(s.deals??[]).filter(d=>d.id===dealId).flatMap(v=>sourceBasisOf(v,'deal_batch',s.project.id)),...(captured.snapshot.financial?sourceBasisOf(captured.snapshot.financial,'financial',s.project.id):[]),...captured.snapshot.visits.flatMap(v=>sourceBasisOf(v,'visit',s.project.id)),...captured.snapshot.archives.flatMap(v=>sourceBasisOf(v,'post_archive',s.project.id)),...captured.snapshot.clauses.flatMap(v=>sourceBasisOf(v,'post_clause',s.project.id)),...captured.snapshot.risks.flatMap(v=>sourceBasisOf(v,'risk','')),...captured.snapshot.capitalRecords.flatMap(v=>sourceBasisOf(v,'capital',''))],title:string(b.title,true,300),analysis:string(b.analysis),status:'draft',reviewer,evidence:await snapshots(b.evidence,s,actor,paths),taskIds:[],decisions:[],sourceHash:''};
                    retainEvidenceSource(report,reportEvidence(report));await verify(s,actor,reportEvidence(report));report.sourceHash=reportSourceHash(report);p.reports.push(report);
                }else if(['submit_report','review_report','archive_report'].includes(action)){
                    const report=find(p.reports??[]);
                    if(report.sourceHash!==reportSourceHash(report))fail('report_integrity_mismatch',409);
                    await verify(s,actor,reportEvidence(report));
                    if(action==='submit_report'){
                        if(report.status!=='draft')fail('invalid_report_transition',409);
                        const reviewer=await eligible(s.project.ownerId);
                        if(!['admin','investment_manager'].includes(reviewer.role)||reviewer.id!==report.reviewer.id)fail('report_owner_changed',409);
                        report.status='pending';
                        report.taskIds.push(newTask(s,reviewer,{name:`审核周期投后报告：${report.period.value}`,dueDate:today(),kind:'post_clause',type:'投后报告审核',relation:`投后报告 ${report.id} v${report.version}`}).id);
                        for(const missing of report.missing)report.taskIds.push(newTask(s,owner,{name:`报告缺件：${missing.label}`,dueDate:today(),kind:'post_clause',type:'投后报告补件',relation:`投后报告 ${report.id} v${report.version}`,note:missing.reason}).id);
                    }else if(action==='review_report'){
                        if(report.status!=='pending')fail('invalid_report_transition',409);
                        const reviewer=await eligible(actor.id);
                        if(actor.id!==s.project.ownerId||!['admin','investment_manager'].includes(reviewer.role))fail('not_report_reviewer',403);
                        const decision=string(raw.decision),opinion=string(raw.opinion);
                        if(!['approve','return','reject'].includes(decision)||typeof raw.acceptMissing!=='boolean')fail('invalid_decision');
                        if(decision==='approve'&&report.missing.length&&!raw.acceptMissing)fail('report_missing_acknowledgement_required',409);
                        report.decisions.push({actor,decision:decision as 'approve'|'return'|'reject',opinion,acceptMissing:raw.acceptMissing,time:now()});
                        report.status=decision==='approve'?'approved':decision==='return'?'returned':'rejected';
                        finishTasks(s,report.taskIds.slice(0,1),'已完成',opinion);
                        finishTasks(s,report.taskIds.slice(1),'已取消',`${opinion}；资料缺口${decision==='approve'?'由负责人明确接受限制':'随审核结论关闭，退回后须新版本处理'}，不视为已补齐。`);
                    }else{
                        if(report.status!=='approved')fail('invalid_report_transition',409);
                        report.status='archived';report.archived={actor,time:now()};
                    }
                }
                else if (action === 'save_financial') {
                    const old = raw.recordId ? find(p.financials) : undefined;
                    if (old && ['pending', 'rejected'].includes(old.status))
                        fail('financial_frozen', 409);
                    const b = object(raw.financial, ['period', 'asOfDate', 'currency', 'basis', 'revenue', 'netProfit', 'netAssets', 'valuation', 'employees', 'missingReasons', 'source', 'evidence', 'reviewerId']), period = canonicalPeriod(b.period), asOfDate = date(b.asOfDate);
                    if (!periodContains(period, asOfDate) || asOfDate > today())
                        fail('financial_date_out_of_period');
                    if (b.currency !== 'CNY')
                        fail('currency_required');
                    if (old && JSON.stringify(old.period) !== JSON.stringify(period))
                        fail('record_period_immutable', 409);
                    if (latestVersions(p.financials).some(v => v.id !== old?.id && v.dealId === dealId && v.period.kind === period.kind && v.period.value === period.value))
                        fail('financial_period_exists', 409);
                    const reasons = object(b.missingReasons, ['revenue', 'netProfit', 'netAssets', 'valuation', 'employees']), values: any = {}, missingReasons: any = {};
                    for (const key of ['revenue', 'netProfit', 'netAssets', 'valuation', 'employees'] as const) {
                        if (b[key] === null) {
                            values[key] = null;
                            missingReasons[key] = string(reasons[key]);
                        }
                        else {
                            if (reasons[key] !== undefined)
                                fail('unexpected_missing_reason');
                            if (key === 'employees') {
                                if (!Number.isSafeInteger(b[key]) || Number(b[key]) < 0)
                                    fail('invalid_employees');
                                values[key] = b[key];
                            }
                            else
                                values[key] = money(b[key], key === 'netProfit' || key === 'netAssets');
                        }
                    }
                    const reviewer = await eligible(b.reviewerId);
                    if (!['admin', 'investment_manager'].includes(reviewer.role))
                        fail('ineligible_reviewer');
                    const record: PostFinancial = { ...base(old), period, asOfDate, currency: 'CNY', basis: string(b.basis), ...values, missingReasons, source: string(b.source), reviewer, evidence: await snapshots(b.evidence, s, actor, paths), status: 'draft', decisions: [] };
                    retainEvidenceSource(record,record.evidence);p.financials.push(record);
                }
                else if (action === 'submit_financial') {
                    const v = find(p.financials);
                    if (v.status !== 'draft')
                        fail('invalid_financial_transition', 409);
                    const enabledReviewer = await eligible(v.reviewer.id);
                    if (!['admin','investment_manager'].includes(enabledReviewer.role)) fail('ineligible_reviewer');
                    await verify(s, actor, v.evidence);
                    v.status = 'pending';
                    v.reviewerTaskId = newTask(s, v.reviewer, { name: `审核投后财务：${v.period.value}`, dueDate: today(), kind: 'post_clause', type: '投后审核', relation: `投后财务 ${v.id} v${v.version}` }).id;
                }
                else if (action === 'review_financial') {
                    const v = find(p.financials);
                    if (v.status !== 'pending')
                        fail('invalid_financial_transition', 409);
                    if (actor.id !== v.reviewer.id && !(actor.id === s.project.ownerId && ['admin', 'investment_manager'].includes(actor.role)))
                        fail('not_financial_reviewer', 403);
                    const enabledReviewer = await eligible(actor.id);
                    if (!['admin','investment_manager'].includes(enabledReviewer.role)) fail('ineligible_reviewer');
                    await verify(s, actor, v.evidence);
                    const decision = string(raw.decision);
                    if (!['approve', 'return', 'reject'].includes(decision))
                        fail('invalid_decision');
                    v.decisions.push({ actor, decision: decision as any, opinion: string(raw.opinion), time: now() });
                    v.status = decision === 'approve' ? 'approved' : decision === 'return' ? 'returned' : 'rejected';
                    finishTasks(s, s.tasks.filter(t => t.relation === `投后财务 ${v.id} v${v.version}`).map(t => t.id), '已完成', string(raw.opinion));
                }
                else if (action === 'save_visit') {
                    const old = raw.recordId ? find(p.visits) : undefined, b = object(raw.visit, ['date', 'ownerId', 'analysis', 'evidence', 'followUps']), visitDate = date(b.date);
                    if (visitDate > today())
                        fail('visit_date_future');
                    const visitOwner = await eligible(b.ownerId);
                    const followUps = [];
                    for (const item of list(b.followUps, true)) {
                        const f = object(item, ['title', 'ownerId', 'dueDate']), title = string(f.title), assignee = await eligible(f.ownerId), dueDate = date(f.dueDate);
                        if (dueDate < visitDate)
                            fail('followup_before_visit');
                        followUps.push({ title, owner: assignee, dueDate });
                    }
                    const record: PostVisit = { ...base(old), owner: visitOwner, date: visitDate, analysis: string(b.analysis), evidence: await snapshots(b.evidence, s, actor, paths), followUps: [] };
                    if (old)
                        finishTasks(s, old.followUps.map(f => f.taskId), '已取消', `走访更新 v${record.version}：${record.reason}`);
                    for (const f of followUps) {
                        const t = newTask(s, f.owner, { name: f.title, dueDate: f.dueDate, kind: 'manual', type: '投后跟进', relation: `走访 ${record.id} v${record.version}` });
                        record.followUps.push({ ...f, taskId: t.id });
                    }
                    retainEvidenceSource(record,record.evidence);p.visits.push(record);
                }
                else if (action === 'archive') {
                    const period = canonicalPeriod(raw.period), category = string(raw.category), note = string(raw.note), materials = await snapshots(raw.materials, s, actor, paths);
                    if (p.archives.some(v => v.dealId === dealId && v.period.kind === period.kind && v.period.value === period.value && v.category === category && materials.some(m => v.materials.some(n => n.materialId === m.materialId && n.versionId === m.versionId))))
                        fail('archive_material_exists', 409);
                    const allocations = (s.deals ?? []).filter(v => v.status === 'closed' && v.closing).flatMap(v => { const t = v.terms.find(t => t.id === v.closing!.termsId); return t ? t.allocations.map(a => ({ dealId: v.id, termsId: t.id, fundId: a.fundId, amount: a.amount })) : []; });
                    p.archives.push({ ...inputSource(), sourceBasis:(s.deals??[]).filter(v=>v.status==='closed'&&v.closing).flatMap(v=>{const t=v.terms.find(t=>t.id===v.closing!.termsId);return t?sourceBasisOf(t,'deal_terms',s.project.id):[];}), id: randomUUID(), version: 1, dealId, owner, time: now(), reason: note, period, category, note, materials, allocations });retainEvidenceSource(p.archives.at(-1)!,materials);
                }
                else if (action === 'save_clause') {
                    const old = raw.recordId ? find(p.clauses) : undefined;
                    if (old && old.status !== 'active')
                        fail('clause_finished', 409);
                    const b = object(raw.clause, ['agreementId', 'title', 'quote', 'sourceLocation', 'obligation', 'threshold', 'triggerDate', 'ownerId']), agreementId = string(b.agreementId), agreement = d.agreements.find(a => a.id === agreementId && a.termsId === d.closing!.termsId && a.signed);
                    if (!agreement?.signed)
                        fail('signed_agreement_required', 409);
                    if (old && old.agreementId !== agreementId)
                        fail('clause_source_immutable', 409);
                    await verify(s, actor, [agreement.signed.material]);
                    const assignee = await eligible(b.ownerId);
                    const record: PostClause = { ...base(old), owner: assignee, agreementId, title: string(b.title), quote: string(b.quote), sourceLocation: string(b.sourceLocation), obligation: string(b.obligation), threshold: string(b.threshold, false), triggerDate: date(b.triggerDate), signedMaterial: structuredClone(agreement.signed.material), status: 'active' };
                    if (old?.warningTaskId)
                        finishTasks(s, [old.warningTaskId], '已取消', `条款更新 v${record.version}：${record.reason}`);
                    const clauseMaterial=await materialAllowed(s,actor,record.signedMaterial.materialId);const clauseVersion=record.signedMaterial.versionId?(await store.listMaterialVersions(clauseMaterial.id)).find(v=>v.id===record.signedMaterial.versionId):undefined;record.signedMaterial.sourceBasis=materialVersionSourceBasis(clauseMaterial,clauseVersion??(record.signedMaterial.versionId?{id:record.signedMaterial.versionId}:undefined));retainEvidenceSource(record,[record.signedMaterial]);p.clauses.push(record);
                }
                else if (action === 'resolve_clause') {
                    const v = find(p.clauses);
                    if (v.status !== 'active')
                        fail('clause_finished', 409);
                    if (!['fulfilled', 'cancelled'].includes(String(raw.status)))
                        fail('invalid_clause_status');
                    const reason = string(raw.reason), evidence = await snapshots(raw.evidence, s, actor, paths);
                    v.status = raw.status as any;
                    v.resolution = { reason, evidence, actor, time: now() };
                    delete v.warningIssue;
                    if (v.warningTaskId)
                        finishTasks(s, [v.warningTaskId], v.status === 'fulfilled' ? '已完成' : '已取消', reason);
                }
                if(action!=='reconcile') p.revision++;
                await reconcileChecked(s);
                return { postInvestment: p, tasks: s.tasks, auditEvent: audit(s, actor, '投后管理操作', { dealId, action, recordId: raw.recordId, revision: p.revision }) };
            }), {reportSources:action==='save_report'}));
        }
        catch (e) {
            if (e instanceof WorkflowError || (e as any)?.safeToDeleteBlob)
                await Promise.all(paths.map(p => unlink(p).catch(() => { })));
            throw e;
        }
    }));
    const maintenance:MaintenanceStatus={state:'initial',lastCompletedAt:null};
    server.decorate('postInvestmentMaintenance',maintenance);
    let closing = false, pending: Promise<void> | undefined, interval: ReturnType<typeof setInterval> | undefined;
    async function reconcile() {
        let successful=true;
        for (const projectId of await store.listPostInvestmentProjectIds()) {
            if (closing) return false;
            try { await store.workflowTransaction(projectId, async s => { await reconcileChecked(s); }); }
            catch (e) { successful=false;server.log.error(e, 'post clause reconciliation will retry'); }
        }
        return successful;
    }
    function scan() {
        if (pending || closing) return pending ?? Promise.resolve();
        maintenance.state='running';
        pending = reconcile().then(successful=>{
            maintenance.state=successful?'idle':'failed';
            if(successful)maintenance.lastCompletedAt=now();
        }).catch(e => {
            maintenance.state='failed';server.log.error(e, 'post clause reconciliation will retry');
        }).finally(() => { pending = undefined; });
        return pending;
    }
    server.addHook('onReady', async () => {
        // Full scans grow with the ledger; each business read still checks its own project.
        void scan();
        interval = setInterval(() => { void scan(); }, options.reconcileIntervalMs ?? 60_000);
        interval.unref();
    });
    server.addHook('onClose', async () => {
        closing = true;
        if (interval) clearInterval(interval);
        await pending;
    });
}
