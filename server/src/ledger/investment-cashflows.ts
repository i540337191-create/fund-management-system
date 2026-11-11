import type { SourceRecord } from './source-policy.ts';
import type { SessionUser } from '../auth/session.ts';
import type { MaterialSnapshot } from './workflow.ts';
export type InvestmentCashflow = SourceRecord & {
 id:string;projectId:string;dealId:string;fundId:string;
 kind:'investment_payment'|'project_fee'|'project_tax';currency:'CNY';
 amount:string;date:string;bankAccount:string;bankReference:string;note:string;
 actor:SessionUser;time:string;evidence:MaterialSnapshot[];status:'posted'|'reversed';
 reversal?:{type:'correction_of_registration';actor:SessionUser;time:string;reason:string;evidence:MaterialSnapshot[]};
};
