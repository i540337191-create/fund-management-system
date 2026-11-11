import {currentAccountActor} from '../auth/registered-session.ts';
import {canRole} from '../auth/rbac.ts';
import {parseIncludeDemo} from '../ledger/source-policy.ts';
import {lpInput,lpWrite,lpTotals,lpReadView} from '../ledger/lp-ledger.ts';
import {WorkflowError,fail} from '../ledger/workflow.ts';
import {CustomFieldError} from '../ledger/custom-fields.ts';
import { writeFund, FundWriteError } from '../ledger/fund-master.ts';
import {FundAccessAssignmentError} from '../auth/object-access.ts';
import type { FastifyInstance } from "fastify";
import { requirePermission, resolveRequestUser } from "../auth/authorize.ts";
import { resolveAuthConfig, type AuthConfigInput } from "../auth/session.ts";
import type { LedgerStore } from "../ledger/store.ts";

type RouteOptions = {
  auth?: AuthConfigInput;
};

export function registerFundRoutes(server: FastifyInstance, store: LedgerStore, options: RouteOptions = {}) {
  const auth = resolveAuthConfig(options.auth);

  server.get('/api/funds/managers', async(request,reply)=>{
    const error=requirePermission(request,reply,auth,'fund:write');if(error)return error;
    return {users:(await store.listUsers()).filter(u=>u.enabled!==false).map(u=>({id:u.id,name:u.name,email:u.email,role:u.role,enabled:true}))};
  });
  for(const method of ['POST','PATCH'] as const)server.route({method,url:method==='POST'?'/api/funds':'/api/funds/:id',handler:async(request,reply)=>{
    const error=requirePermission(request,reply,auth,'fund:write');if(error)return error;
    try{
      const result=await writeFund(store,request.body,resolveRequestUser(request,auth)!,method==='PATCH'?(request.params as {id:string}).id:undefined);
      return reply.code(result.created?201:200).send(result);
    }catch(error){
      if(error instanceof FundAccessAssignmentError)return reply.code(error.statusCode).send({error:error.code,fields:['managerId']});
      if(error instanceof FundWriteError||error instanceof CustomFieldError)return reply.code(error.status).send({error:error.code,...(error.fields.length?{fields:error.fields}:{}),...(error.latest?{latest:error.latest}:{})});
      request.log.error({err:error},'fund write failed');return reply.code(500).send({error:'fund_write_failed'});
    }
  }});

  server.get("/api/funds", async (request,reply) => {let includeDemo:boolean;try{includeDemo=parseIncludeDemo((request.query as {includeDemo?:unknown}).includeDemo);}catch{return reply.code(400).send({error:'invalid_include_demo'});}const funds=await store.listFunds();const deleted=new Set((await store.readRecordManagement()).entries.filter(e=>e.kind==='investor'&&e.deletedAt).map(e=>e.id));const totals=await store.lpTransaction(raw=>{const s=lpReadView(raw,includeDemo);return Object.fromEntries(funds.map(f=>[f.id,lpTotals(s.investors.filter(i=>i.fundId===f.id&&!deleted.has(i.id)),s.data)]));});return {funds:funds.map(f=>({...f,registeredTotals:totals[f.id],registeredTotalsIncludeDemo:includeDemo}))};});

  server.get("/api/funds/:id", async (request, reply) => {
    let includeDemo:boolean;try{includeDemo=parseIncludeDemo((request.query as {includeDemo?:unknown}).includeDemo);}catch{return reply.code(400).send({error:'invalid_include_demo'});}
    const { id } = request.params as { id: string };
    const deleted=new Set((await store.readRecordManagement()).entries.filter(e=>e.kind==='investor'&&e.deletedAt).map(e=>e.id));
    const detail = await store.getFundDetail(id);
    if (!detail) {
      return reply.code(404).send({ error: "fund_not_found" });
    }
    return {...detail,registeredTotalsIncludeDemo:includeDemo,registeredTotals:await store.lpTransaction(raw=>{const s=lpReadView(raw,includeDemo);return lpTotals(s.investors.filter(i=>i.fundId===id&&!deleted.has(i.id)),s.data);})};
  });

  server.post("/api/fund-investors/:id/confirm-signature", async (request, reply) => {
    const authError = requirePermission(request, reply, auth, "fund:write");
    if (authError) return authError;

    const { id } = request.params as { id: string };
    try {const b=lpInput(request.body,'signature');return await store.lpTransaction(s=>{const actor=currentAccountActor(s,request,auth);if(!canRole(actor.role,'fund:write'))fail('forbidden',403);const investor=s.investors.find(i=>i.id===id);if(!investor)fail('investor_not_found',404);return lpWrite(s,investor.fundId,id,'signature',b,actor);});}catch(e){if(e instanceof WorkflowError)return reply.code(e.status).send({error:e.code});throw e;}
  });
}
