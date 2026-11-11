import type {ApiSessionUser} from './apiClient';
import type {DealMaterialRef} from './dealTypes';
import type {ExitProof} from './exitSettlementTypes';

export const investmentCashflowKinds = {investment_payment:'投资付款',project_fee:'项目费用付款',project_tax:'项目税款付款'} as const;
export type InvestmentCashflow = {
 dataOrigin?:string;dataPurpose?:string;sourceBasis?:{id:string;dataOrigin:string}[];
 id:string;projectId:string;dealId:string;fundId:string;kind:keyof typeof investmentCashflowKinds;currency:'CNY';
 amount:string;date:string;bankAccount:string;bankReference:string;note:string;actor:ApiSessionUser;time:string;
 evidence:ExitProof[];status:'posted'|'reversed';readIssue?:string;
 reversal?:{type:'correction_of_registration';actor:ApiSessionUser;time:string;reason:string;evidence:ExitProof[]};
};
export type InvestmentCashflowProject = {id:string;name:string;deals:{id:string;title:string;fundIds:string[]}[]};
export type InvestmentCashflowLedger = {rows:InvestmentCashflow[];currentUser:ApiSessionUser;projects:InvestmentCashflowProject[]};
export type InvestmentCashflowView = Omit<InvestmentCashflowLedger,'projects'> & {
 project:{id:string;name:string};revision:number;mayWrite:boolean;
 deals:{id:string;title:string;fundIds:string[]}[];
};
type Base={requestId:string;expectedRevision:number;evidence:DealMaterialRef[]};
export type InvestmentCashflowAction = Base & (
 {action:'post';dealId:string;fundId:string;kind:InvestmentCashflow['kind'];currency:'CNY';amount:string;date:string;bankAccount:string;bankReference:string;note:string}|
 {action:'reverse';cashflowId:string;reason:string}
);
