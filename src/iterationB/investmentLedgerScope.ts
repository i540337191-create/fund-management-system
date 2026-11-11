import type {InvestmentLedger,InvestmentLedgerRow,LedgerAmounts} from '../lib/investmentLedgerTypes';
const fields: (keyof LedgerAmounts)[]=['plannedContribution','closedContribution','investmentPrincipal','investmentFees','investmentTaxes','exitConsideration','exitReceipts','returnedPrincipal','registeredIncome'];
const fixed=(n:bigint)=>(n/100n).toString()+'.'+String(n%100n).padStart(2,'0');
export function scopeInvestmentLedger(ledger:InvestmentLedger,filter:{fundId?:string;projectId?:string},primaryProjectCount?:number):InvestmentLedger{
 if(!filter.fundId&&!filter.projectId)return ledger;
 const rows=ledger.rows.filter(r=>(!filter.fundId||r.fundId===filter.fundId)&&(!filter.projectId||r.projectId===filter.projectId));
 const distinct=(values:(string|null)[])=>new Set(values.filter((v):v is string=>v!==null)).size;
 const totals={currency:'CNY'} as InvestmentLedger['totals'];
 for(const field of fields){const selected=rows.filter(r=>field==='plannedContribution'?r.basis==='current_plan':field==='closedContribution'?r.basis==='approved_closing':true);const invalid=selected.some(r=>r[field]===null||!/^\d+\.\d{2}$/.test(r[field]!));const value=invalid?null:fixed(selected.reduce((n,r)=>n+BigInt(r[field]!.replace('.','')),0n));if(field==='plannedContribution'||field==='closedContribution')totals[field]=value;else totals[field]=value??'待核对';}
 const batch=(r:InvestmentLedgerRow)=>JSON.stringify([r.projectId,r.dealId]);
 return {...ledger,rows,totals,sourceCounts:undefined,counts:{companies:distinct(rows.map(r=>r.companyId)),projects:distinct(rows.map(r=>r.projectId)),batches:distinct(rows.map(batch)),allocations:rows.length,closedBatches:distinct(rows.filter(r=>r.basis==='approved_closing').map(batch)),unboundProjects:distinct(rows.filter(r=>!r.companyId).map(r=>r.projectId)),primaryFundProjects:primaryProjectCount??distinct(rows.filter(r=>!filter.fundId||r.primaryFundId===filter.fundId).map(r=>r.projectId))},issues:ledger.issues.filter(i=>(!filter.fundId||!i.fundId||i.fundId===filter.fundId)&&(!filter.projectId||!i.projectId||i.projectId===filter.projectId))};
}
