import {resolve} from 'node:path';
import {createFinancialEvidence} from './financial-evidence.ts';
import {readFundLifecycleView} from './fund-lifecycle-read.ts';
import type {FastifyInstance} from 'fastify';
import type {LedgerStore} from '../ledger/store.ts';
import {currentAccountActor} from '../auth/registered-session.ts';
import {resolveAuthConfig,type AuthConfigInput} from '../auth/session.ts';
import {canReadLp} from '../ledger/lp-privacy.ts';
import {lifecycleView,type LifecycleState} from '../ledger/fund-lifecycle.ts';
import {hiddenSource,parseIncludeDemo} from '../ledger/source-policy.ts';
import {units,fixed} from '../ledger/exit-settlement.ts';
import {date,WorkflowError} from '../ledger/workflow.ts';
export function fundOperationsProjection(s:LifecycleState,privateDetailsVisible:boolean,today?:string,period:{from?:string;to?:string}={},checkedView?:Awaited<ReturnType<typeof readFundLifecycleView>>){
 const v=checkedView??lifecycleView(s,today),href=`/funds/${encodeURIComponent(s.fund.id)}?tab=${encodeURIComponent('基金运营')}`;
 const feeRows=v.charges.filter(c=>(!period.from||c.dueDate>=period.from)&&(!period.to||c.dueDate<=period.to)).map(c=>({id:c.id,ruleId:c.ruleId,title:c.title,verification:'verification' in c?c.verification:undefined,from:c.from,to:c.to,dueDate:c.dueDate,amount:c.amount,received:c.received,remaining:c.cancelled?'0.00':c.remaining,status:c.cancelled?'cancelled' as const:c.remaining==='0.00'?'settled' as const:c.received!=='0.00'?'partial' as const:'unpaid' as const,overdue:c.overdue,allocations:v.allocations.filter(a=>a.chargeId===c.id).map(a=>({receiptId:a.receiptId,amount:a.amount}))}));
 const active=feeRows.filter(c=>c.status!=='cancelled');
 const feeLedger=privateDetailsVisible?{currency:'CNY' as const,periodBasis:'dueDate' as const,rows:feeRows,totals:{receivable:fixed(active.reduce((n,c)=>n+units(c.amount),0n)),allocated:fixed(active.reduce((n,c)=>n+units(c.received),0n)),remaining:fixed(active.reduce((n,c)=>n+units(c.remaining),0n)),overdue:fixed(active.filter(c=>c.overdue).reduce((n,c)=>n+units(c.remaining),0n))},registered:feeRows.length>0}:null;
 return {feeLedger,fundId:s.fund.id,fundName:s.fund.name,href,privateDetailsVisible,tasks:v.tasks.map(t=>({...t,name:privateDetailsVisible?t.name:'基金运营待办'})),charges:privateDetailsVisible?v.charges.filter(c=>!c.cancelled&&c.remaining!=='0.00').map(c=>({id:c.id,title:c.title,amount:c.amount,received:c.received,remaining:c.remaining,dueDate:c.dueDate,overdue:c.overdue,ownerId:c.ownerId})):[],capital:privateDetailsVisible&&v.capital?{balance:v.capital.balance,committed:v.capital.committed,reserve:v.capital.reserve,available:v.capital.available,threshold:v.capital.threshold,warning:v.capital.warning,date:v.capital.date}:null};
}
export function registerFundOperationsRoutes(server:FastifyInstance,store:LedgerStore,options:{auth?:AuthConfigInput;storageRoot?:string;projectRoot?:string}={}){
 const auth=resolveAuthConfig(options.auth),evidence=createFinancialEvidence(store,options.storageRoot??process.env.MATERIAL_STORAGE_ROOT??resolve(options.projectRoot??process.cwd(),'private-material-storage'),()=>'');
 server.get('/api/fund-operations',async(request,reply)=>{try{const q=request.query as {includeDemo?:unknown;from?:unknown;to?:unknown;fundId?:unknown},includeDemo=parseIncludeDemo(q.includeDemo),period={from:q.from===undefined?undefined:date(q.from),to:q.to===undefined?undefined:date(q.to)};if(period.from&&period.to&&period.from>period.to)throw new WorkflowError('invalid_fee_period',400);if(q.fundId!==undefined&&(typeof q.fundId!=='string'||!q.fundId.trim()))throw new WorkflowError('invalid_fund_id',400);const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}),funds=(await store.listFunds()).filter(f=>(includeDemo||!hiddenSource(f))&&(!q.fundId||f.id===q.fundId));const rows=await Promise.all(funds.map(f=>store.lifecycleTransaction(f.id,async s=>{const actor=currentAccountActor(s,request,auth);return fundOperationsProjection(s,canReadLp(actor),today,period,await readFundLifecycleView(s,actor,evidence.readBytes,today));})));reply.header('Cache-Control','private, no-store');return {funds:rows,period:{...period,basis:'dueDate'},asOfDate:today,basis:'基金运营账仅用于本账待办、费用与人工额度核对；不得与项目投资现金流重复相加，不代表银行实时余额或外部推送。'};}catch(error){if(error instanceof WorkflowError)return reply.code(error.status).send({error:error.code});if(error&&typeof error==='object'&&'statusCode'in error)throw error;request.log.error({err:error},'fund operations read model failed');return reply.code(500).send({error:'fund_operations_unavailable'});}});
}
