import { parseIncludeDemo } from '../ledger/source-policy.ts';
import type { FastifyInstance } from 'fastify';
import type { LedgerStore } from '../ledger/store.ts';
import { projectInvestmentLedger, type LedgerScope } from '../ledger/investment-ledger.ts';
import { resolveAuthConfig, type AuthConfigInput } from '../auth/session.ts';
import { resolveRequestUser } from '../auth/authorize.ts';
import { canRole } from '../auth/rbac.ts';
export function registerInvestmentLedgerRoutes(server:FastifyInstance,store:LedgerStore,options:{auth?:AuthConfigInput}={}){
 const auth=resolveAuthConfig(options.auth);
 for(const [path,type] of [['/api/investment-ledger','all'],['/api/funds/:id/investment-ledger','fund'],['/api/projects/:id/investment-ledger','project'],['/api/companies/:id/investment-ledger','company']] as const){server.get(path,async(request,reply)=>{
 const actor=resolveRequestUser(request,auth)!;
 if(!canRole(actor.role,'fund:read')&&!canRole(actor.role,'project:read')&&!['legal','post_investment'].includes(actor.role))return reply.code(403).send({error:'forbidden'});
 let includeDemo:boolean;try{includeDemo=parseIncludeDemo((request.query as {includeDemo?:unknown}).includeDemo);}catch{return reply.code(400).send({error:'invalid_include_demo'});}
 try{const snapshot=await store.readInvestmentLedgerSnapshot(),id=(request.params as {id?:string}).id;
 if(type!=='all'&&!(type==='fund'?snapshot.funds:type==='company'?snapshot.companies:snapshot.states.map(s=>s.project)).some(v=>v.id===id))return reply.code(404).send({error:type+'_not_found'});
 return projectInvestmentLedger(snapshot,{type,...(id?{id}:{})} as LedgerScope,{includeDemo});
 }catch(error){request.log.error({err:error},'investment ledger read failed');return reply.code(500).send({error:'investment_ledger_unavailable'});}
 });}
}
