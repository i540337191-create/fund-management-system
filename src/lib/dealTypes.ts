// Public transaction DTOs; storage identifiers stay on the server.
import type { ApiSessionUser as SessionUser, ApprovalMaterial as MaterialSnapshot } from './apiClient';
export type DealDecision = { actor: SessionUser; decision: 'approve'|'return'|'reject'; opinion: string; time: string };
export type DealTermsInput = { amount: string; valuation: string; share: string; date: string; allocations: { fundId: string; amount: string }[]; requiredAgreements: string[]; conditions: { id: string; title: string }[] };
export type DealTerms = DealTermsInput & { id: string; version: number; reason: string; status: 'draft'|'pending'|'approved'|'returned'|'rejected'; savedBy: SessionUser; time: string; decisions: DealDecision[] };
export type DealAgreement = {reviewerId?:string; id: string; title: string; version: number; termsId: string; template: string; content: string; generatedBy: SessionUser; time: string; review?: { actor: SessionUser; opinion: string; time: string }; signed?: { material: MaterialSnapshot; evidence: MaterialSnapshot[]; actor: SessionUser; note: string; time: string } };
export type DealBatch = {dataOrigin?:string;dataPurpose?:string;sourceBasis?:{id:string;dataOrigin:string}[]; id: string; projectId: string; ownerId: string; title: string; revision: number; status: 'active'|'closed'; reviewers: SessionUser[]; createdBy: SessionUser; createdAt: string; terms: DealTerms[]; agreements: DealAgreement[]; confirmations: { termsId: string; conditionId: string; evidence: MaterialSnapshot[]; actor: SessionUser; note: string; time: string }[]; closing?: { actor: SessionUser; time: string; evidence: MaterialSnapshot[]; note: string; termsId: string; responsibility: { owner: SessionUser; duties: string; schedules: { id: string; title: string; firstDueDate: string; frequency: 'monthly'|'quarterly'|'yearly'; taskId: string; taskIds: string[] }[] } } };
export type DealMaterialRef = { materialId: string; versionId: string };
export type DealAction = { requestId: string; expectedRevision: number } & (
 | { action: 'save_terms'; terms: DealTermsInput; reason: string }
 | { action: 'submit_terms'; termsId: string }
 | { action: 'review_terms'; termsId: string; decision: 'approve'|'return'|'reject'; opinion: string }
 | { action: 'generate_agreement'; reviewerId?:string; title: string; template: string }
 | { action: 'review_agreement'; agreementId: string; opinion: string }
 | { action: 'archive_signed'; agreementId: string; original: DealMaterialRef; evidence: DealMaterialRef[]; note: string }
 | { action: 'confirm_condition'; conditionId: string; evidence: DealMaterialRef[]; note: string }
 | { action: 'close'; evidence: DealMaterialRef[]; note: string; responsibility: { ownerId: string; duties: string; schedules: { title: string; firstDueDate: string; frequency: 'monthly'|'quarterly'|'yearly' }[] } }
);

export type DealFundAllocation = { projectId: string; projectName: string; dealId: string; title: string; status: "active"|"closed"; termsId: string; termsStatus: DealTerms["status"]; amount: string; valuation: string; share: string; date: string; fundId: string; allocationAmount: string|null; cashStatus: "not_recorded"|"posted"|"reversed_only"|"needs_review" };
export function displayedDealTerms(deal:DealBatch|undefined){return deal?.status==='closed'?deal.terms.find(t=>t.id===deal.closing?.termsId&&t.status==='approved'):deal?.terms[deal.terms.length-1];}

export function dealTermsHistoryMissing(terms: DealTerms) {
  return (['decisions', 'requiredAgreements', 'conditions'] as const).filter(key => !Array.isArray(terms[key]));
}
