import {CustomFieldError} from '../ledger/custom-fields.ts';
import { MasterWriteError, writeCompany, writeProjectMaster } from '../ledger/company-project-master.ts';
import type { FastifyInstance } from "fastify";
import { requirePermission, resolveRequestUser } from "../auth/authorize.ts";
import { resolveAuthConfig, type AuthConfigInput } from "../auth/session.ts";
import { normalizeProjectInput, ProjectCreationError, type LedgerStore } from "../ledger/store.ts";

type RouteOptions = {
  auth?: AuthConfigInput;
};

export function registerProjectRoutes(server: FastifyInstance, store: LedgerStore, options: RouteOptions = {}) {
  const auth = resolveAuthConfig(options.auth);

  server.post("/api/projects", async (request, reply) => {
    const authError = requirePermission(request, reply, auth, "project:write");
    if (authError) return authError;
    const actor = resolveRequestUser(request, auth)!;
    try {
      const input = normalizeProjectInput(request.body);
      const result = await store.createProject(input, actor);
      return reply.code(result.created ? 201 : 200).send(result);
    } catch (error) {
      if(error instanceof MasterWriteError||error instanceof CustomFieldError)return reply.code(error.status).send({error:error.code,...(error.fields.length?{fields:error.fields}:{}),...(error.latest?{latest:error.latest}:{})});
      if(error&&typeof error==='object'&&'code' in error&&error.code==='23505'&&'constraint' in error&&error.constraint==='portfolio_companies_name_key')return reply.code(409).send({error:'company_name_conflict',fields:['name']});
      if (error instanceof ProjectCreationError) {
        const status = error.code === "fund_not_found" ? 404 : error.code === "project_request_conflict" ? 409 : 400;
        return reply.code(status).send({ error: error.code, ...(error.fields.length ? { fields: error.fields } : {}) });
      }
      request.log.error({ err: error }, "project creation failed");
      return reply.code(500).send({ error: "project_creation_failed" });
    }
  });

  const masterError = (error:unknown,reply:import('fastify').FastifyReply) => {
    if(error instanceof MasterWriteError||error instanceof CustomFieldError)return reply.code(error.status).send({error:error.code,...(error.fields.length?{fields:error.fields}:{}),...(error.latest?{latest:error.latest}:{})});
    if(error&&typeof error==='object'&&'code' in error&&error.code==='23505'&&'constraint' in error&&error.constraint==='portfolio_companies_name_key')return reply.code(409).send({error:'company_name_conflict',fields:['name']});
    return reply.code(500).send({error:'master_write_failed'});
  };
  server.get('/api/companies',async()=>({companies:await store.listCompanies()}));
  server.get('/api/companies/:id',async(request,reply)=>{
    const {id}=request.params as {id:string};const company=(await store.listCompanies()).find(c=>c.id===id);
    if(!company)return reply.code(404).send({error:'company_not_found'});
    return {company,projects:(await store.listProjects()).filter(p=>p.companyId===id)};
  });
  server.post('/api/companies',async(request,reply)=>{
    const denied=requirePermission(request,reply,auth,'project:write');if(denied)return denied;
    try{const result=await writeCompany(store,request.body,resolveRequestUser(request,auth)!);return reply.code(result.created?201:200).send(result);}
    catch(error){request.log.error({err:error},'company write failed');return masterError(error,reply);}
  });
  server.patch('/api/companies/:id',async(request,reply)=>{
    const denied=requirePermission(request,reply,auth,'project:write');if(denied)return denied;
    try{return await writeCompany(store,request.body,resolveRequestUser(request,auth)!,(request.params as {id:string}).id);}
    catch(error){request.log.error({err:error},'company write failed');return masterError(error,reply);}
  });
  server.patch('/api/projects/:id',async(request,reply)=>{
    const denied=requirePermission(request,reply,auth,'project:write');if(denied)return denied;
    try{return await writeProjectMaster(store,(request.params as {id:string}).id,request.body,resolveRequestUser(request,auth)!);}
    catch(error){request.log.error({err:error},'project metadata write failed');return masterError(error,reply);}
  });

  server.get("/api/projects", async () => ({ projects: await store.listProjects() }));

  server.get("/api/projects/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const detail = await store.getProjectDetail(id);
    if (!detail) {
      return reply.code(404).send({ error: "project_not_found" });
    }
    return detail;
  });

  server.patch("/api/projects/:id/stage", async (request, reply) => {
    const authError = requirePermission(request, reply, auth, "project:write");
    if (authError) return authError;

    const { id } = request.params as { id: string };
    const body = request.body as { stage?: unknown; actor?: unknown };
    if (typeof body.stage !== "string" || !body.stage.trim()) {
      return reply.code(400).send({ error: "invalid_project_stage_payload" });
    }

    const detail = await store.getProjectDetail(id);
    if (!detail) return reply.code(404).send({error:'project_not_found'});
    return reply.code(409).send({error:'project_stage_managed_by_workflow'});
  });
}
