import {validateCapitalReceipt} from '../ledger/capital-receipt.ts';
import { parseIncludeDemo,readSourceRows,readSourcePolicy } from '../ledger/source-policy.ts';
import {object,string,date,WorkflowError} from '../ledger/workflow.ts';
import type { FastifyInstance } from "fastify";
import { requirePermission,resolveRequestUser } from "../auth/authorize.ts";
import { resolveAuthConfig, type AuthConfigInput } from "../auth/session.ts";
import type { CapitalRecord, LedgerStore } from "../ledger/store.ts";

type CreateCapitalRecordBody = Partial<Omit<CapitalRecord, "id" | "fundId" | "projectId" | "updatedAt">> &
  Partial<Pick<CapitalRecord, "id" | "fundId" | "projectId">>;

type RouteOptions = {
  auth?: AuthConfigInput;
};

export function registerCapitalRoutes(server: FastifyInstance, store: LedgerStore, options: RouteOptions = {}) {
  const auth = resolveAuthConfig(options.auth);

  server.get("/api/capital-records", async (request,reply) => {
    let includeDemo:boolean;try{includeDemo=parseIncludeDemo((request.query as {includeDemo?:unknown}).includeDemo);}catch{return reply.code(400).send({error:'invalid_include_demo'});}
    return {capitalRecords:readSourceRows(await store.listCapitalRecords(),includeDemo),sourcePolicy:readSourcePolicy(includeDemo)};
  });

  server.post("/api/capital-records", async (request, reply) => {
    const authError = requirePermission(request, reply, auth, "capital:write");
    if (authError) return authError;

    const body = request.body as CreateCapitalRecordBody;
    if(body && (Object.hasOwn(body,"dataPurpose") || Object.hasOwn(body,"dataOrigin") || Object.hasOwn(body,"sourceBasis"))) return reply.code(400).send({error:"invalid_capital_record_payload"});
    const error = validateCreateCapitalRecordBody(body);
    if (error) {
      return reply.code(400).send({ error });
    }

    try {
    validateCapitalReceipt(body as {received:string;date:string;status:string});
    const result = await store.createCapitalRecord(
      {...body,dataOrigin:"user_input",confirmationStatus:"待确认"} as Omit<CapitalRecord, "id" | "fundId" | "projectId" | "updatedAt"> & Partial<Pick<CapitalRecord, "id" | "fundId" | "projectId">>,resolveRequestUser(request,auth)!,
    );
    return reply.code(201).send(result);
    }catch(error){if(error instanceof WorkflowError)return reply.code(error.status).send({error:error.code});throw error;}
  });

  server.patch('/api/capital-records/:id',async(request,reply)=>{const denied=requirePermission(request,reply,auth,'capital:write');if(denied)return denied;try{const b=object(request.body,['expectedUpdatedAt','company','fund','fundId','projectId','received','date','rule','receivable','dueDate','status']);const expected=string(b.expectedUpdatedAt,true,80),status=string(b.status,true,40);if(!['已收','未收','部分收','逾期'].includes(status))throw new WorkflowError('invalid_capital_status',400);const input={company:string(b.company,true,200),fund:string(b.fund,true,200),fundId:string(b.fundId,true,200),projectId:b.projectId===null?null:string(b.projectId,true,200),received:string(b.received,true,500),date:b.date===''?'':date(b.date),rule:string(b.rule,true,2000),receivable:string(b.receivable,true,500),dueDate:date(b.dueDate),status} as CapitalRecord;validateCapitalReceipt(input);return {capitalRecord:await store.updateCapitalRecord((request.params as {id:string}).id,input,expected,resolveRequestUser(request,auth)!)};}catch(e){if(e instanceof WorkflowError)return reply.code(e.status).send({error:e.code});throw e;}});
  server.post("/api/capital-records/:id/confirm", async (request, reply) => {
    const authError = requirePermission(request, reply, auth, "capital:write");
    if (authError) return authError;

    const { id } = request.params as { id: string };
    let result;try{result=await store.confirmCapitalRecord(id,resolveRequestUser(request,auth)!);}catch(e){if(e instanceof WorkflowError)return reply.code(e.status).send({error:e.code});throw e;}
    if (!result) {
      return reply.code(404).send({ error: "capital_record_not_found" });
    }
    return result;
  });
}

function validateCreateCapitalRecordBody(body: CreateCapitalRecordBody) {
  const required: (keyof CreateCapitalRecordBody)[] = ["company", "fund", "received", "date", "rule", "receivable", "dueDate", "status"];
  if(body&&Object.hasOwn(body,'projectId')&&body.projectId!==null&&(typeof body.projectId!=='string'||!body.projectId.trim()||body.projectId.length>200||body.projectId.includes('\0')))return 'invalid_capital_record_payload';
  return required.find((key) => typeof body?.[key] !== "string") ? "invalid_capital_record_payload" : null;
}
