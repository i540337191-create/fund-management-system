import { hiddenSource, sourceOf,confirmedSource,readSourceRows } from './source-policy.ts';
import type { SourceRecord } from './source-policy.ts';
import { createHash } from 'node:crypto';
import type { WorkflowState, MaterialSnapshot } from './workflow.ts';
import type { SessionUser } from '../auth/session.ts';
import { settlementPositions, units } from './exit-settlement.ts';
export type AssetState = Pick<WorkflowState, 'project'|'deals'|'postInvestment'>;
export type ExitArchive = SourceRecord & { id:string; version:number; actor:SessionUser; time:string; reason:string; completionReview:string; evidence:MaterialSnapshot[]; fingerprint:string; positions:ReturnType<typeof settlementPositions>; executionIds:string[]; paymentIds:string[]; dealIds:string[] };
export type ExitClaim = SourceRecord & { id:string; version:number; status:'open'|'resolved'|'cancelled'; title:string; description:string; reason:string; evidence:MaterialSnapshot[]; actor:SessionUser; time:string };
export function assetFingerprint(s:AssetState) {
 const p=s.postInvestment;
 return createHash('sha256').update(JSON.stringify({deals:(s.deals??[]).map(d=>[d.id,d.status,d.closing?.termsId]).sort(),executions:(p?.exitExecutions??[]).map(e=>[e.id,e.status]).sort(),payments:(p?.exitPayments??[]).map(p=>[p.id,p.status]).sort(),positions:settlementPositions(s).sort((a,b)=>`${a.dealId}:${a.fundId}`.localeCompare(`${b.dealId}:${b.fundId}`))})).digest('hex');
}
export function assetProjection(s:AssetState) {
 const positions=settlementPositions(s),p=s.postInvestment,archives=p?.exitArchives??[],claims=p?.exitClaims??[], blockers:string[]=[];
 const closed=(s.deals??[]).filter(d=>d.status==='closed');
 if(!positions.length)blockers.push('no_closed_positions');
 if(closed.some(d=>!d.closing||!d.terms.find(t=>t.id===d.closing!.termsId)?.allocations.length))blockers.push('missing_closed_terms');
 if(positions.some(p=>units(p.remainingPortion,4)!==0n))blockers.push('remaining_positions');
 if(positions.some(p=>units(p.outstanding)!==0n))blockers.push('outstanding_receipts');
 if((s.deals??[]).some(d=>d.status==='active'))blockers.push('active_deals');
 const fingerprint=assetFingerprint(s), current=archives.at(-1), valid=!!current&&!blockers.length&&current.fingerprint===fingerprint;
 const exiting=(p?.exitExecutions??[]).some(e=>e.status==='recorded')||(p?.exitPreparations??[]).some(e=>e.status==='archived')||s.project.status==='退出'||archives.length>0;
 const legacyUnverified=!archives.length&&s.project.status==='已退出';
 const hasCurrentExposure=blockers.some(b=>['active_deals','remaining_positions','outstanding_receipts','missing_closed_terms'].includes(b));
 const status=valid?'exited':legacyUnverified?(hasCurrentExposure?'exiting':'legacy_exited'):exiting?'exiting':'managed';
 const latestClaims=claims.filter(c=>!claims.some(n=>n.id===c.id&&n.version>c.version));
 return {projectId:s.project.id,name:s.project.name,legacyStatus:s.project.status,fundIds:[...new Set([s.project.fundId,...positions.map(p=>p.fundId)].filter(Boolean))],status,statusLabel:{managed:'在管',exiting:'退出中',exited:'已退出',legacy_exited:'已退出（历史标注未核验）'}[status],inManagedMetrics:status!=='exited'&&status!=='legacy_exited',legacyUnverified,blockers,positions,archiveCurrent:valid,currentArchiveId:valid?current!.id:null,openClaimCount:latestClaims.filter(c=>c.status==='open').length,archives:archives.map(a=>({...a,current:valid&&a.id===current!.id})),claims,latestClaims};
}
export function assetHistoryEvidence(p:{exitArchives?:ExitArchive[];exitClaims?:ExitClaim[]}) {return [...(p.exitArchives??[]).flatMap(a=>a.evidence),...(p.exitClaims??[]).flatMap(c=>c.evidence)];}

// Display policy uses a detached state; workflow validation and fingerprints keep the original state.
export function sourceAssetProjection(s:AssetState,includeDemo:boolean) {
 if(includeDemo)return {projection:assetProjection(s),sourceIssue:false};
 const original=s.postInvestment,post=original?{...original,exitExecutions:readSourceRows(original.exitExecutions,false),exitPayments:readSourceRows(original.exitPayments,false),exitArchives:readSourceRows(original.exitArchives,false),exitPreparations:readSourceRows(original.exitPreparations,false),exitClaims:readSourceRows(original.exitClaims,false)}:undefined;
 const deals=(s.deals??[]).filter(d=>!hiddenSource(d)||d.terms.some(t=>!hiddenSource(t))||post?.exitExecutions.some(e=>e.dealId===d.id)||post?.exitPayments.some(v=>original?.exitExecutions?.some(e=>e.id===v.executionId&&e.dealId===d.id)));
 const linkedExecutions=(original?.exitExecutions??[]).filter(e=>post?.exitPayments.some(v=>v.executionId===e.id));
 const sourceIssue=[s.project,...deals,...linkedExecutions,...deals.flatMap(d=>{const t=d.terms.find(t=>t.id===d.closing?.termsId)??d.terms.at(-1);return t?[t]:[];}),...(post?.exitExecutions??[]),...(post?.exitPayments??[]),...(post?.exitArchives??[]),...(post?.exitPreparations??[])].some(v=>!confirmedSource(v));
 const projectionState={...s,deals,postInvestment:post?{...post,exitPreparations:post.exitPreparations.filter(confirmedSource),...(sourceIssue?{exitExecutions:[],exitPayments:[],exitArchives:[]}: {})}:undefined};
 return {projection:assetProjection(projectionState),sourceIssue};
}
