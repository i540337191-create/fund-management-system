import type {InvestmentCashflow} from './investmentCashflowTypes.ts';
import {summarizeInvestmentCashflows} from './investmentCashflowView.ts';
import {hasConfirmedSource} from './dataOrigin.ts';
export function cashflowTrend(rows:InvestmentCashflow[],onlyConfirmed=false){
 const active=rows.filter(r=>r.status==='posted'&&(!onlyConfirmed||hasConfirmedSource(r)));
 // A trend needs multiple observed dates; absent records are not proof of zero spend.
 if(active.length<3||new Set(active.map(r=>r.date.slice(0,7))).size<2)return [];
 if(active.some(r=>!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(r.date)||!Number.isFinite(Date.parse(r.date))||new Date(r.date).toISOString().slice(0,10)!==r.date))return [];
 const months=[...new Set(active.map(r=>r.date.slice(0,7)))].sort();
 const amounts=months.map(month=>{const totals=summarizeInvestmentCashflows(active.filter(r=>r.date.startsWith(month)),onlyConfirmed);const values=[totals.investment_payment,totals.project_fee,totals.project_tax];return {month,cents:values.some(v=>v===null)?null:values.reduce<bigint>((n,v)=>n+BigInt(v!.replace('.','')),0n)};});
 if(amounts.some(d=>d.cents===null)||amounts.every(d=>d.cents===0n))return [];
 const max=amounts.reduce((n,d)=>d.cents!>n?d.cents!:n,1n);
 return amounts.map(d=>({month:d.month,amount:`${d.cents!/100n}.${String(d.cents!%100n).padStart(2,'0')}`,height:Number(d.cents!*10000n/max)/10000}));
}
