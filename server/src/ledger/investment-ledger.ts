import { hiddenSource, sourceOf, confirmedSource, type SourceRecord } from './source-policy.ts';
import type { Company } from './company-project-master.ts';
import type { Fund, Project } from './store.ts';
import type { DealBatch } from './deal.ts';
import type { PostInvestmentState } from './post-investment.ts';
import { fixed, units } from './exit-settlement.ts';
import { sourceAssetProjection } from './asset-history.ts';
export type InvestmentLedgerSnapshot={capturedAt:string;funds:Fund[];companies:Company[];states:{project:Project;deals:DealBatch[];postInvestment?:PostInvestmentState}[]};
export type LedgerScope={type:'all'|'fund'|'project'|'company';id?:string};
const moneyKeys=['plannedContribution','closedContribution','investmentPrincipal','investmentFees','investmentTaxes','exitConsideration','exitReceipts','returnedPrincipal','registeredIncome'] as const;
type MoneyKey=typeof moneyKeys[number];
export type LedgerIssue={code:string;projectId?:string;dealId?:string;fundId?:string;recordId?:string};
export type InvestmentLedgerRow=Record<MoneyKey,string|null>&{projectId:string;projectName:string;companyId:string|null;companyName:string|null;primaryFundId:string;dealId:string;dealTitle:string;dealStatus:string;fundId:string;fundName:string|null;termsId:string;termsVersion:number;termsStatus:string;basis:'current_plan'|'approved_closing';assetStatus:string|null;source:'deal_batches';sourceOrigins:{project:ReturnType<typeof sourceOf>;batch:ReturnType<typeof sourceOf>;terms:ReturnType<typeof sourceOf>};cashStatus:'not_recorded'|'posted'|'reversed_only'|'needs_review';investmentCashflows:(ReturnType<typeof sourceOf>&{id:string;kind:string;currency:string|null;amount:string;date:string;status:string})[];exitExecutions:(ReturnType<typeof sourceOf>&{id:string;date:string;status:string;portion:string;consideration:string})[];exitPayments:(ReturnType<typeof sourceOf>&{id:string;executionId:string;date:string;status:string;currency:string|null;amount:string;principal:string;income:string})[]};
export type InvestmentLedger={capturedAt:string;scope:LedgerScope;sourcePolicy:{countUnit:'records';includeDemo:boolean;unknownAmounts:'included'|'excluded'};sourceCounts:{excludedDemo:number;excludedEngineering:number;unknown:number};counts:{companies:number;projects:number;batches:number;allocations:number;closedBatches:number;unboundProjects:number;primaryFundProjects:number};totals:Record<MoneyKey,string>&{currency:'CNY'};rows:InvestmentLedgerRow[];issues:LedgerIssue[]};
const array=<T>(v:T[]|undefined):T[]=>Array.isArray(v)?v.filter(x=>x!==null&&typeof x==='object'):[];
export function projectInvestmentLedger(snapshot:InvestmentLedgerSnapshot,scope:LedgerScope={type:'all'},policy:{includeDemo:boolean}={includeDemo:true}):InvestmentLedger{
 const rows:InvestmentLedgerRow[]=[],issues:LedgerIssue[]=[];
 const sourceCounts={excludedDemo:0,excludedEngineering:0,unknown:0}, counted=new Set<object>();
 const inspect=(v:SourceRecord)=>{if(!counted.has(v)){counted.add(v);if(sourceOf(v).dataOrigin==='unknown')sourceCounts.unknown++;if(!policy.includeDemo&&sourceOf(v).dataOrigin==='seed_demo')sourceCounts.excludedDemo++;else if(!policy.includeDemo&&hiddenSource(v))sourceCounts.excludedEngineering++;}return v;};
 const visible=<T extends SourceRecord>(v:T)=>{inspect(v);return policy.includeDemo||!hiddenSource(v);};
 const effective=(v:SourceRecord)=>{inspect(v);const code=policy.includeDemo?'unverified_source_amounts_included':'unverified_source_amounts_excluded';if(!confirmedSource(v)&&!hiddenSource(v)&&!issues.some(i=>i.code===code))issues.push({code});return policy.includeDemo||confirmedSource(v);};
 for(const s of snapshot.states){const p=s.project;if(scope.type==='project'&&p.id!==scope.id||scope.type==='company'&&p.companyId!==scope.id)continue;
 for(const payment of array(s.postInvestment?.exitPayments)){if(!policy.includeDemo&&hiddenSource(payment))continue;if(scope.type==='fund'&&payment.fundId!==scope.id)continue;const e=array(s.postInvestment?.exitExecutions).find(e=>e.id===payment.executionId);if(!e||!array(s.deals).some(d=>d.id===e.dealId))issues.push({code:'unmapped_exit_payment',projectId:p.id,fundId:payment.fundId,recordId:payment.id});}
 for(const payment of array(s.postInvestment?.investmentCashflows)){if(!policy.includeDemo&&hiddenSource(payment))continue;if(scope.type==='fund'&&payment.fundId!==scope.id)continue;if(!array(s.deals).some(d=>d.id===payment.dealId))issues.push({code:'unmapped_investment_cashflow',projectId:p.id,fundId:payment.fundId,recordId:payment.id});}
 const scopedProject=scope.type!=='fund'||array(s.postInvestment?.investmentCashflows).some(v=>v.fundId===scope.id)||array(s.postInvestment?.exitPayments).some(v=>v.fundId===scope.id)||array(s.deals).some(d=>array(d.terms).some(t=>array(t.allocations).some(a=>a.fundId===scope.id)));
 const company=snapshot.companies.find(c=>c.id===p.companyId);let assetStatus:string|null=null;try{const view=sourceAssetProjection(s,policy.includeDemo);if(view.sourceIssue){if(scopedProject)issues.push({code:'asset_status_source_unverified',projectId:p.id});}else assetStatus=view.projection.status;}catch{if(scopedProject)issues.push({code:'asset_status_unavailable',projectId:p.id});}
 for(const d of array(s.deals)){
 if(!d||d.projectId!==p.id){if(scope.type!=='fund')issues.push({code:'deal_project_mismatch',projectId:p.id,dealId:d?.id});continue;}
 const terms=array(d?.terms),closed=d.status==='closed',t=closed?terms.find(t=>typeof d.closing?.termsId==='string'&&t.id===d.closing.termsId&&t.status==='approved'&&Number.isInteger(t.version)&&t.version>0):terms.at(-1);
 if(!t){if(scope.type==='fund'&&!array(s.postInvestment?.investmentCashflows).some(v=>v.dealId===d.id&&v.fundId===scope.id)&&!array(s.postInvestment?.exitExecutions).some(e=>e.dealId===d.id&&array(e.allocations).some(a=>a.fundId===scope.id))&&!terms.some(t=>array(t.allocations).some(a=>a.fundId===scope.id)))continue;issues.push({code:closed?'invalid_approved_closing_terms':'missing_current_terms',projectId:p.id,dealId:d.id});continue;}
 const seen=new Set<string>();for(const a of array(t.allocations)){
 if(typeof a.fundId!=='string'||!a.fundId){if(scope.type!=='fund')issues.push({code:'invalid_allocation_fund',projectId:p.id,dealId:d.id});continue;}
 if(scope.type==='fund'&&a.fundId!==scope.id)continue;
 inspect(p);inspect(d);inspect(t);
 if(!policy.includeDemo && hiddenSource(t) && hiddenSource(d)){
 const linkedExecutions=array(s.postInvestment?.exitExecutions).filter(e=>e.dealId===d.id&&array(e.allocations).some(x=>x.fundId===a.fundId));
 const independent=[...array(s.postInvestment?.investmentCashflows).filter(v=>v.dealId===d.id&&v.fundId===a.fundId),...linkedExecutions,...array(s.postInvestment?.exitPayments).filter(v=>v.fundId===a.fundId&&linkedExecutions.some(e=>e.id===v.executionId))];
 independent.forEach(inspect);if(!independent.some(v=>!hiddenSource(v)))continue;
 }

 const context={projectId:p.id,dealId:d.id,fundId:a.fundId};const issue=(code:string,recordId?:string)=>issues.push({...context,code,...(recordId?{recordId}:{})});
 if(seen.has(a.fundId)){issue('duplicate_fund_allocation');continue;}seen.add(a.fundId);
 const fund=snapshot.funds.find(f=>f.id===a.fundId);if(!fund)issue('unknown_fund');if(!company)issue(p.companyId?'unknown_company':'unbound_company');
 const sums=Object.fromEntries(moneyKeys.map(k=>[k,0n])) as Record<MoneyKey,bigint>;
 const add=(key:MoneyKey,value:unknown,id?:string)=>{try{sums[key]+=units(value);return true;}catch{issue('invalid_money',id);return false;}};
 const contribution=effective(t)&&add(closed?'closedContribution':'plannedContribution',a.amount)?fixed(sums[closed?'closedContribution':'plannedContribution']):null;
 const cash=array(s.postInvestment?.investmentCashflows).filter(v=>v.dealId===d.id&&v.fundId===a.fundId).filter(visible);
 let validPostedCash=false;
 for(const v of cash){if(v.projectId!==p.id){issue('cashflow_project_mismatch',v.id);continue;}if(v.status!=='posted'||!effective(v))continue;if(v.currency!=='CNY'){issue('unknown_investment_currency',v.id);continue;}const key=v.kind==='investment_payment'?'investmentPrincipal':v.kind==='project_fee'?'investmentFees':v.kind==='project_tax'?'investmentTaxes':null;if(key){if(add(key,v.amount,v.id))validPostedCash=true;}else issue('unknown_cashflow_kind',v.id);}
 const allExecutions=array(s.postInvestment?.exitExecutions).filter(e=>e.dealId===d.id&&array(e.allocations).some(x=>x.fundId===a.fundId));const executions=allExecutions.filter(visible);
 for(const e of executions)if(e.status==='recorded'&&e.projectId===p.id&&effective(e))for(const x of array(e.allocations).filter(x=>x.fundId===a.fundId))add('exitConsideration',x.consideration,e.id);
 const payments=array(s.postInvestment?.exitPayments).filter(v=>v.fundId===a.fundId&&allExecutions.some(e=>e.id===v.executionId)).filter(visible);
 for(const v of payments){if(v.status!=='posted'||!effective(v))continue;const execution=allExecutions.find(e=>e.id===v.executionId);if(v.projectId!==p.id||execution?.projectId!==p.id||execution.status!=='recorded'){issue('inactive_or_mismatched_exit_execution',v.id);continue;}
 const currency=(v as typeof v&{currency?:string}).currency;if(currency!=='CNY'){issue('unknown_exit_currency',v.id);continue;}add('exitReceipts',v.amount,v.id);add('returnedPrincipal',v.principal,v.id);add('registeredIncome',v.income,v.id);}
 rows.push({...Object.fromEntries(moneyKeys.map(k=>[k,fixed(sums[k])])) as Record<MoneyKey,string>,plannedContribution:closed?null:contribution,closedContribution:closed?contribution:null,...context,projectName:p.name,companyId:p.companyId??null,companyName:company?.name??null,primaryFundId:p.fundId,dealTitle:d.title,dealStatus:d.status,fundName:fund?.name??null,termsId:t.id,termsVersion:t.version,termsStatus:t.status,basis:closed?'approved_closing':'current_plan',assetStatus,source:'deal_batches',sourceOrigins:{project:sourceOf(p),batch:sourceOf(d),terms:sourceOf(t)},cashStatus:validPostedCash?'posted':cash.length?(cash.every(v=>v.status==='reversed')?'reversed_only':'needs_review'):'not_recorded',investmentCashflows:cash.map(v=>({...sourceOf(v),id:v.id,kind:v.kind,currency:v.currency??null,amount:v.amount,date:v.date,status:v.status})),exitExecutions:executions.flatMap(e=>array(e.allocations).filter(x=>x.fundId===a.fundId).map(x=>({...sourceOf(e),id:e.id,date:e.date,status:e.status,portion:x.portion,consideration:x.consideration}))),exitPayments:payments.map(v=>({...sourceOf(v),id:v.id,executionId:v.executionId,date:v.date,status:v.status,currency:(v as typeof v&{currency?:string}).currency??null,amount:v.amount,principal:v.principal,income:v.income}))});
 }
 }
 }
 for(const s of snapshot.states){
 if(scope.type==='project'&&s.project.id!==scope.id||scope.type==='company'&&s.project.companyId!==scope.id)continue;
 const mapped=(dealId:string,fundId:string)=>rows.some(r=>r.projectId===s.project.id&&r.dealId===dealId&&r.fundId===fundId);
 for(const v of array(s.postInvestment?.investmentCashflows))if((policy.includeDemo||!hiddenSource(v))&&(scope.type!=='fund'||v.fundId===scope.id)&&!mapped(v.dealId,v.fundId)&&!issues.some(i=>i.code==='unmapped_investment_cashflow'&&i.projectId===s.project.id&&i.recordId===v.id))issues.push({code:'unmapped_investment_cashflow',projectId:s.project.id,dealId:v.dealId,fundId:v.fundId,recordId:v.id});
 for(const v of array(s.postInvestment?.exitPayments)){if(!policy.includeDemo&&hiddenSource(v))continue;if(scope.type==='fund'&&v.fundId!==scope.id)continue;const e=array(s.postInvestment?.exitExecutions).find(e=>e.id===v.executionId);if(e&&!mapped(e.dealId,v.fundId)&&!issues.some(i=>i.code==='unmapped_exit_payment'&&i.projectId===s.project.id&&i.recordId===v.id))issues.push({code:'unmapped_exit_payment',projectId:s.project.id,dealId:e.dealId,fundId:v.fundId,recordId:v.id});}
 }
 const distinct=(values:(string|null)[])=>new Set(values.filter(v=>v!==null)).size;
 const totals=Object.fromEntries(moneyKeys.map(k=>[k,fixed(rows.reduce((n,r)=>n+(r[k]===null?0n:BigInt(r[k]!.replace('.',''))),0n))])) as Record<MoneyKey,string>;
 if(sourceCounts.unknown)issues.push({code:policy.includeDemo?'unknown_source_amounts_included':'unknown_source_amounts_excluded'});
 return {capturedAt:snapshot.capturedAt,scope,sourcePolicy:{countUnit:'records',includeDemo:policy.includeDemo,unknownAmounts:policy.includeDemo?'included':'excluded'},sourceCounts,counts:{companies:distinct(rows.map(r=>r.companyId)),projects:distinct(rows.map(r=>r.projectId)),batches:distinct(rows.map(r=>JSON.stringify([r.projectId,r.dealId]))),allocations:rows.length,closedBatches:distinct(rows.filter(r=>r.basis==='approved_closing').map(r=>JSON.stringify([r.projectId,r.dealId]))),unboundProjects:distinct(rows.filter(r=>!r.companyId).map(r=>r.projectId)),primaryFundProjects:snapshot.states.filter(s=>(policy.includeDemo||!hiddenSource(s.project))&&(scope.type==='fund'?s.project.fundId===scope.id:scope.type==='project'?s.project.id===scope.id:scope.type==='company'?s.project.companyId===scope.id:true)).length},totals:{currency:'CNY',...totals},rows,issues};
}
