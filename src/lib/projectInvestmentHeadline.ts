import type {InvestmentLedger} from './investmentLedgerTypes';
import {cents} from '../iterationB/capitalPortfolioModel.ts';
export function projectInvestmentHeadline(ledger:InvestmentLedger){
 const values=ledger.rows.map(row=>cents(row.basis==='approved_closing'?row.closedContribution:row.plannedContribution));
 const total=values.length&&values.every(value=>value!==null)?values.reduce<bigint>((sum,value)=>sum+value!,0n):null;
 const hasPayment=ledger.rows.some(row=>['posted','reversed_only'].includes(row.cashStatus));
 const paid=hasPayment&&!ledger.issues.length?cents(ledger.totals.investmentPrincipal):null;
 const remaining=total!==null&&paid!==null&&paid<=total&&!ledger.issues.length?total-paid:null;
 return {total,paid,remaining,closed:ledger.rows.length?cents(ledger.totals.closedContribution):null};
}
