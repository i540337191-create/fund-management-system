import type {InvestmentLedger,InvestmentLedgerRow} from '../lib/investmentLedgerTypes';
import type {Project} from '../data/projects';
import type {Fund} from '../data/funds';
import type {FundOperations} from '../lib/fundOperationsTypes';
export function cents(value:string|null|undefined):bigint|null{return value!=null&&/^(0|[1-9]\d*)\.\d{2}$/.test(value)?BigInt(value.replace('.','')):null;}
export function money(value:bigint|null){if(value===null)return '—';const sign=value<0n?'-':'';const n=value<0n?-value:value;return sign+(n/100n).toLocaleString('zh-CN')+'.'+String(n%100n).padStart(2,'0');}
function sum(values:(bigint|null)[]){return values.length&&values.every(v=>v!==null)?values.reduce<bigint>((n,v)=>n+v!,0n):null;}
export function registeredContribution(rows:InvestmentLedgerRow[],basis:InvestmentLedgerRow['basis']){const selected=rows.filter(r=>r.basis===basis);return sum(selected.map(r=>cents(basis==='approved_closing'?r.closedContribution:r.plannedContribution)));}
export function portfolioFunds(ledger:InvestmentLedger,funds:(Pick<Fund,'id'|'name'>&Partial<Fund>)[],projects:Project[]=[]){return funds.map(f=>{
 const rows=ledger.rows.filter(r=>r.fundId===f.id),primary=projects.filter(p=>p.fundId===f.id);
 const ids=[...new Set([...primary.map(p=>p.id),...rows.map(r=>r.projectId)])];
 return {...f,rows,primaryCount:primary.length,investmentCount:new Set(rows.map(r=>r.projectId)).size,projects:ids.map(id=>{const master=projects.find(p=>p.id===id),allocations=rows.filter(r=>r.projectId===id);return {id,name:master?.name??allocations[0]?.projectName??'关联项目待核对',master,primary:master?.fundId===f.id,rows:allocations};})};
});}

export function portfolioFees(funds:FundOperations['funds'],month:string){
 const all=funds.flatMap(f=>(f.feeLedger?.rows??[]).map(r=>({...r,fundId:f.fundId,fundName:f.fundName})));
 const rows=all.filter(r=>r.dueDate.startsWith(month)),active=rows.filter(r=>r.status!=='cancelled');
 const registered=funds.some(f=>f.feeLedger?.registered);
 const ready=funds.length>0&&funds.every(f=>f.privateDetailsVisible&&f.feeLedger!==null);
 const total=(field:'amount'|'received'|'remaining')=>ready?sum(active.map(r=>cents(r[field]))):null;
 const overdue=all.filter(r=>r.status!=='cancelled'&&r.overdue&&cents(r.remaining)!==null&&cents(r.remaining)!>0n);
 return {all,rows,active,ready,registered,receivable:total('amount'),received:total('received'),remaining:total('remaining'),pending:ready&&active.length?active.filter(r=>cents(r.remaining)!>0n).length:null,overdue,overdueTotal:ready&&registered?(overdue.length?sum(overdue.map(r=>cents(r.remaining))):0n):null};
}

export function readPortfolioFilters(search:string,currentMonth:string){
 const q=new URLSearchParams(search),month=q.get('month')??'',period=q.get('feePeriod')??'',state=q.get('feeState')??'';
 const date=(key:string)=>{const value=q.get(key)??'';return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value?value:'';};
 return {month:/^\d{4}-(0[1-9]|1[0-2])$/.test(month)?month:currentMonth,period:(['month','all','range'].includes(period)?period:'month') as 'month'|'all'|'range',state:(['all','pending','overdue'].includes(state)?state:'all') as 'all'|'pending'|'overdue',from:date('feeFrom'),to:date('feeTo')};
}

// Only effective, explicitly denominated records contribute; reversed records contribute zero.
export function recordedCashTotal(rows:{status:string;currency?:string|null;amount:string;eligible:boolean}[]){
 if(!rows.length||rows.some(r=>r.status!=='posted'&&r.status!=='reversed'))return null;
 const posted=rows.filter(r=>r.status==='posted');
 if(posted.some(r=>r.currency!=='CNY'||!r.eligible||cents(r.amount)===null))return null;
 return posted.reduce((total,r)=>total+cents(r.amount)!,0n);
}
export function overviewMoney(value:bigint|null){
 if(value!==null&&value>=10000000000n&&value%100000000n===0n)return {value:money(value/100000000n),unit:'亿元'};
 return {value:money(value),unit:value===null?'':'元'};
}
