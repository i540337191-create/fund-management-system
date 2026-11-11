import {readSourceRows,parseIncludeDemo} from '../ledger/source-policy.ts';
import {manualRiskInput,manualRiskWrite} from '../ledger/manual-risks.ts';
import {WorkflowError} from '../ledger/workflow.ts';
import type { FastifyInstance } from "fastify";
import { requirePermission,resolveRequestUser } from "../auth/authorize.ts";
import { resolveAuthConfig, type AuthConfigInput } from "../auth/session.ts";
import type { LedgerStore } from "../ledger/store.ts";

type RouteOptions = {
  auth?: AuthConfigInput;
};

export function registerRiskRoutes(server: FastifyInstance, store: LedgerStore, options: RouteOptions = {}) {
  const auth = resolveAuthConfig(options.auth);

  server.get('/api/risks/records',async(request,reply)=>{try{const q=request.query as {projectId?:unknown;includeDemo?:unknown};if(q.projectId!==undefined&&(typeof q.projectId!=='string'||!q.projectId.trim()))return reply.code(400).send({error:'invalid_project_id'});const includeDemo=parseIncludeDemo(q.includeDemo);const [legacy,states]=await Promise.all([store.listRisks(),store.readExitStates()]);const manual=states.filter(s=>s.project).flatMap(s=>s.postInvestment?.manualRisks??[]),ids=new Set(manual.map(r=>r.id));return {risks:readSourceRows([...manual,...legacy.filter(r=>!ids.has(r.id)).map(r=>({...r,version:0}))],includeDemo).filter(r=>!q.projectId||r.projectId===q.projectId)};}catch(e){if(e instanceof WorkflowError)return reply.code(e.status).send({error:e.code});throw e;}});
  server.get('/api/projects/:id/manual-risks',async(request,reply)=>{try{return await store.workflowTransaction((request.params as {id:string}).id,async s=>({risks:s.postInvestment?.manualRisks??[]}));}catch(e){if(e instanceof WorkflowError)return reply.code(e.status).send({error:e.code});throw e;}});
  server.post('/api/projects/:id/manual-risks/actions',async(request,reply)=>{const denied=requirePermission(request,reply,auth,'risk:write');if(denied)return denied;try{const body=manualRiskInput(request.body);return await store.workflowTransaction((request.params as {id:string}).id,async s=>manualRiskWrite(s,body,resolveRequestUser(request,auth)!));}catch(e){if(e instanceof WorkflowError)return reply.code(e.status).send({error:e.code});throw e;}});
  server.post("/api/risks/handle", async (request, reply) => {
    const authError = requirePermission(request, reply, auth, "risk:write");
    if (authError) return authError;

    const body = request.body as {
      title?: unknown;
      target?: unknown;
      type?: unknown;
      level?: unknown;
      source?: unknown;
      time?: unknown;
      summary?: unknown;
      projectId?: unknown;
      actor?: unknown;
      result?: unknown;
    };

    if (typeof body.title !== "string" || !body.title.trim() || typeof body.result !== "string" || !body.result.trim()) {
      return reply.code(400).send({ error: "invalid_risk_handle_payload" });
    }

    const result = await store.handleRisk({
      title: body.title,
      target: typeof body.target === "string" ? body.target : undefined,
      type: typeof body.type === "string" ? body.type : undefined,
      level: typeof body.level === "string" ? body.level : undefined,
      source: typeof body.source === "string" ? body.source : undefined,
      time: typeof body.time === "string" ? body.time : undefined,
      summary: typeof body.summary === "string" ? body.summary : undefined,
      projectId: typeof body.projectId === "string" ? body.projectId : null,
      actor: typeof body.actor === "string" ? body.actor : undefined,
      result: body.result,
    });

    if (!result) {
      return reply.code(404).send({ error: "risk_not_found" });
    }

    return result;
  });
}
