import type {DealTerms} from './deal.ts';
import type {PostBase} from './post-investment.ts';
import type {MaterialSnapshot} from './workflow.ts';
import type {SessionUser} from '../auth/session.ts';
export type ExitDocumentKind='plan'|'negotiation'|'agreement';
export const exitDocumentLabels:Record<ExitDocumentKind,string>={plan:'退出方案',negotiation:'谈判函件',agreement:'协议材料'};
export type ExitPreparation=PostBase & {
 title:string;exitType:'equity_transfer'|'repurchase'|'ipo'|'liquidation';scope:'partial'|'full';portion:string;expectedDate:string;
 consideration:string|null;priceReason:string;pricingBasis:string;currency:'CNY';counterparty:string;strategy:string;
 reviewer:SessionUser;status:'draft'|'pending'|'approved'|'returned'|'rejected'|'archived';
 documents:{kind:ExitDocumentKind;location:string;material:MaterialSnapshot}[];
 investment:{termsId:string;terms?:DealTerms;allocations:{fundId:string;amount:string}[]};
 decisions:{actor:SessionUser;decision:'approve'|'return'|'reject';opinion:string;time:string}[];
 reviewerTaskId?:string;archived?:{actor:SessionUser;time:string};readIssue?:string;
};
export function exitPreparationEvidence(v:ExitPreparation){return v.documents.map(d=>d.material);}
export function exitPreparationMissing(v:Pick<ExitPreparation,'documents'|'consideration'>){
 return [...Object.entries(exitDocumentLabels).filter(([kind])=>!v.documents.some(d=>d.kind===kind)).map(([,label])=>label),...(v.consideration===null?['已明确的退出对价']:[])];
}
