import type {FundOperations} from './fundOperationsTypes';
export function summarizeFundFees(funds:FundOperations['funds'],filter:{fundId?:string;from?:string;to?:string}={}){
 const selected=funds.filter(f=>!filter.fundId||f.fundId===filter.fundId);
 const rows=selected.flatMap(f=>(f.feeLedger?.rows??[]).filter(r=>(!filter.from||r.dueDate>=filter.from)&&(!filter.to||r.dueDate<=filter.to)).map(r=>({...r,fundId:f.fundId,fundName:f.fundName,currency:f.feeLedger!.currency})));
 const totals=[...new Set(rows.map(r=>r.currency))].map(currency=>{
  const active=rows.filter(r=>r.currency===currency&&r.status!=='cancelled');
  const sum=(key:'amount'|'received'|'remaining',overdue=false)=>{const cents=active.filter(r=>!overdue||r.overdue).reduce((n,r)=>n+BigInt(r[key].replace('.','')),0n);return `${cents/100n}.${String(cents%100n).padStart(2,'0')}`;};
  return {currency,receivable:sum('amount'),allocated:sum('received'),remaining:sum('remaining'),overdue:sum('remaining',true)};
 });
 return {rows,totals,fundCount:selected.length,privateFundCount:selected.filter(f=>f.privateDetailsVisible).length,registeredFundCount:new Set(rows.map(r=>r.fundId)).size};
}
