import {WorkflowError,date} from './workflow.ts';
export function parseCapitalMoney(value:string){
 const match=typeof value==='string'?/^(?:[¥￥]\s*)?((?:\d{1,3}(?:,\d{3})+|\d+))(?:\.(\d{1,6}))?\s*(元|万元|万)?$/.exec(value.trim()):null;
 if(!match)throw new WorkflowError('invalid_capital_amount',400);
 const scale=match[3]==='万元'||match[3]==='万'?6:2;if((match[2]?.length??0)>scale)throw new WorkflowError('invalid_capital_amount',400);
 return BigInt(match[1].replaceAll(',',''))*10n**BigInt(scale)+BigInt((match[2]??'').padEnd(scale,'0'));
}
export function zeroCapitalReceipt(value:string){return parseCapitalMoney(value)===0n;}
export function validateCapitalReceipt(input:{received:string;date:string;status:string;receivable?:string;dueDate?:string}){
 if(!['未收','逾期','已收','部分收'].includes(input.status))throw new WorkflowError('invalid_capital_status',400);
 const received=parseCapitalMoney(input.received);if(['已收','部分收'].includes(input.status)&&received<=0n)throw new WorkflowError('positive_capital_receipt_required',400);if(input.receivable!==undefined)parseCapitalMoney(input.receivable);if(input.dueDate!==undefined)date(input.dueDate);
 if(!input.date){if(!['未收','逾期'].includes(input.status)||received!==0n)throw new WorkflowError('capital_receipt_date_required',400);return;}
 date(input.date);
}
export function requireCapitalReceipt(input:{received:string;date:string}){if(!input.date||parseCapitalMoney(input.received)<=0n)throw new WorkflowError('capital_receipt_required',409);date(input.date);}
export function sameCapitalCreate(stored:Record<string,unknown>,input:Record<string,unknown>){return ['fundId','projectId','company','received','date','rule','receivable','dueDate','status','source','confirmationStatus'].every(key=>(stored[key]??null)===(input[key]??null));}
