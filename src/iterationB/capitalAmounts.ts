import {hasConfirmedSource} from '../lib/dataOrigin.ts';
import {summarizeInvestmentCashflows} from '../lib/investmentCashflowView.ts';
import type {InvestmentCashflow} from '../lib/investmentCashflowTypes.ts';
import type {ExitPayment} from '../lib/exitSettlementTypes.ts';

export function registeredPayments(rows:InvestmentCashflow[],onlyConfirmed:boolean){
 const totals=summarizeInvestmentCashflows(rows,onlyConfirmed);
 if(totals.invalidRecords)return {amount:null,reason:'存在金额或币种待核对记录'};
 if(!totals.postedCount||totals.unverifiedRecords)return {amount:null,reason:totals.unverifiedRecords?'存在来源待核对记录':'暂无有效付款登记'};
 const cents=[totals.investment_payment!,totals.project_fee!,totals.project_tax!].reduce((n,value)=>n+BigInt(value.replace('.','')),0n);
 return {amount:decimal(cents),reason:'有效投资、项目费用及税款付款登记'};
}
export function registeredReceipts(rows:ExitPayment[],onlyConfirmed:boolean){
 let cents=0n,count=0;
 for(const row of rows){
  if(row.status==='reversed')continue;
  if(row.status!=='posted'||row.currency!=='CNY'||!/^(0|[1-9]\d*)\.\d{2}$/.test(row.amount))return {amount:null,reason:'存在金额或币种待核对记录'};
  if(onlyConfirmed&&!hasConfirmedSource(row))return {amount:null,reason:'存在来源待核对记录'};
  cents+=BigInt(row.amount.replace('.',''));count++;
 }
 return {amount:count?decimal(cents):null,reason:count?'有效退出银行回款登记':'暂无有效退出回款登记'};
}
function decimal(cents:bigint){return `${cents/100n}.${String(cents%100n).padStart(2,'0')}`;}
