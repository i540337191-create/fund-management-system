import {hasConfirmedSource} from './dataOrigin.ts';
import {investmentCashflowKinds,type InvestmentCashflow} from './investmentCashflowTypes.ts';

export async function afterCashflowSave(isCurrent:()=>boolean,refresh:()=>Promise<void>,reload:()=>Promise<void>):Promise<boolean|null>{
 if(!isCurrent())return null;
 try{await refresh();if(!isCurrent())return null;await reload();return isCurrent()?true:null;}
 catch{return isCurrent()?false:null;}
}
export function summarizeInvestmentCashflows(rows:InvestmentCashflow[],onlyConfirmed=false){
 const totals={investment_payment:0n,project_fee:0n,project_tax:0n};let invalidRecords=0,unverifiedRecords=0,postedCount=0,reversedCount=0;
 for(const row of rows){
  if(row.status==='reversed'){reversedCount++;continue;}
  if(row.status!=='posted'){invalidRecords++;continue;}
  if(onlyConfirmed&&!hasConfirmedSource(row)){unverifiedRecords++;continue;}
  postedCount++;
  if(row.currency!=='CNY'||!Object.prototype.hasOwnProperty.call(investmentCashflowKinds,row.kind)||!/^(0|[1-9]\d*)\.\d{2}$/.test(row.amount)){invalidRecords++;continue;}
  totals[row.kind]+=BigInt(row.amount.replace('.',''));
 }
 const amount=(value:bigint)=>invalidRecords?null:`${value/100n}.${String(value%100n).padStart(2,'0')}`;
 return {investment_payment:amount(totals.investment_payment),project_fee:amount(totals.project_fee),project_tax:amount(totals.project_tax),invalidRecords,unverifiedRecords,postedCount,reversedCount};
}
