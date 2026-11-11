import type {ApiSessionUser,ApprovalMaterial} from './apiClient';
import type {ExitPreparation} from './exitPreparation';
import type {DealMaterialRef} from './dealTypes';
export type ExitProof=ApprovalMaterial & {readIssue?:string};
type Correction={actor:ApiSessionUser;time:string;reason:string;evidence:ExitProof[]};
export type ExitExecution={dataOrigin?:string;dataPurpose?:string;sourceBasis?:{id:string;dataOrigin:string}[];id:string;projectId:string;dealId:string;planId:string;planVersion:number;title:string;date:string;actor:ApiSessionUser;time:string;note:string;allocations:{fundId:string;portion:string;consideration:string}[];signedAgreement:ExitProof;evidence:ExitProof[];status:'recorded'|'cancelled';cancellation?:Correction;readIssue?:string};
export type ExitPayment={currency?:'CNY';dataOrigin?:string;dataPurpose?:string;sourceBasis?:{id:string;dataOrigin:string}[];id:string;projectId:string;executionId:string;fundId:string;date:string;amount:string;principal:string;income:string;bankAccount:string;bankReference:string;actor:ApiSessionUser;time:string;note:string;evidence:ExitProof[];status:'posted'|'reversed';reversal?:Correction;readIssue?:string};
export type ExitPosition={projectId:string;dealId:string;fundId:string;disposedPortion:string;remainingPortion:string|null;contracted:string|null;received:string|null;outstanding:string|null;sourceIssue?:string};
export type ExitSettlementLedger={executions:ExitExecution[];payments:ExitPayment[];positions:ExitPosition[];currentUser:ApiSessionUser};
export type ExitSettlementView=ExitSettlementLedger & {project:{id:string;name:string;ownerId?:string|null};revision:number;mayExecute:boolean;mayReceive:boolean;plans:ExitPreparation[];deals:{id:string;title:string;fundIds:string[];closingDate:string}[]};
type Base={requestId:string;expectedRevision:number};
export type ExitSettlementAction=Base & (
 {action:'execute';planId:string;planVersion:number;date:string;note:string;allocations:{fundId:string;portion:string;consideration:string}[];signedAgreement:DealMaterialRef;evidence:DealMaterialRef[]}|
 {action:'cancel_execution';executionId:string;reason:string;evidence:DealMaterialRef[]}|
 {action:'receive';currency?:'CNY';executionId:string;fundId:string;date:string;amount:string;principal:string;income:string;bankAccount:string;bankReference:string;note:string;evidence:DealMaterialRef[]}|
 {action:'reverse_payment';paymentId:string;reason:string;evidence:DealMaterialRef[]}
);
export function exitSettlementError(error:unknown){
 const {status,code}=(error??{}) as {status?:number;code?:string};
 const messages:Record<string,string>={invalid_decimal:'金额须大于零，且至多两位小数；比例至多四位小数。',exit_consideration_mismatch:'基金合同对价合计须等于批准方案对价。',post_revision_conflict:'账本已更新，输入已保留。请核对最新修订后再提交。',duplicate_bank_receipt:'该基金已登记此账户与银行流水，请核对原记录。',payment_exceeds_outstanding:'到账金额超过该基金合同未收额。',payment_amount_mismatch:'本金回收与收益分类的合计须等于净实收。'};
 if(code&&/[\u4e00-\u9fff]/.test(code))return code;
 return (code&&messages[code])||(status===401?'登录已失效，请重新登录。':status===403?'当前账号没有本笔办理权限。':status===409?'记录状态或原件已变化；输入保留，请核对后重试。':status===400?'请核对日期、金额、基金分配及原件。':'暂未确认结果，请保留输入原样重试。');
}
