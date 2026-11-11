import { seedDemoWorkspace } from './ledger/demo-workspace.ts';
import { createDemoLedgerStore } from './ledger/demo-data.ts';
import {getAdminUser} from './auth/session.ts';
import {canRole} from './auth/rbac.ts';
import {notifyingLedgerStore} from './notifications/transitions.ts';
import {registerBusinessNotifications} from './notifications/service.ts';
import {sameTemplateStage} from './ledger/template-stage.ts';
import {AgentRepository} from './agent/repository.ts';
import {registerAgentWorkspaceRoutes} from './http/agent-workspace.ts';
import {registerReportTemplateImportRoutes} from './http/report-template-import.ts';
import {registerBusinessIntakeRoutes} from './http/business-intake.ts';
import {readAiEnv} from './http/ai.ts';
import {managedLedgerStore,recordReferenceIds} from './ledger/record-management.ts';
import {registerRecordManagementRoutes} from './http/record-management.ts';
import {resumeMaterialExtractions} from './material-preview/extraction.ts';
import {registerFundOperationsRoutes} from './http/fund-operations-readmodel.ts';
import {registerDocumentTemplateManagerRoutes} from './http/document-template-manager.ts';
import {registerMaterialScopeRoutes} from './http/material-scope.ts';
import {registerFundLifecycleRoutes} from './http/fund-lifecycle.ts';
import {registerDocumentTemplateRoutes} from './http/document-templates.ts';
import {accessContext,objectPolicy,scopedLedgerStore,ObjectAccessError} from './auth/object-access.ts';
import {registerObjectAccessRoutes} from './http/object-access.ts';
import {registerLpRoutes} from './http/lp-ledger.ts';
import { canReadLp, lpProjection } from "./ledger/lp-privacy.ts";
import {registerCustomFieldRoutes} from './http/custom-fields.ts';
import { registerInvestmentLedgerRoutes } from './http/investment-ledger.ts';
import {registeredSession,cacheRequestSession} from './auth/registered-session.ts';
import {registerAccountRoutes} from './http/accounts.ts';
import { registerReturnRoutes } from './http/returns.ts';
import { registerInvestmentCashflowRoutes } from './http/investment-cashflows.ts';
import { registerExitSettlementRoutes } from './http/exit-settlement.ts';
import { registerPostInvestmentRoutes } from './http/post-investment.ts';
import { registerDealRoutes } from './http/deal.ts';
import { registerDiligenceRoutes } from './http/diligence.ts';
import Fastify from "fastify";
import { resolve } from "node:path";
import { registerWorkflowRoutes } from "./http/workflow.ts";
import { resolveRequestUser } from "./auth/authorize.ts";
import { resolveAuthConfig, type AuthConfigInput } from "./auth/session.ts";
import { readServerConfig } from "./config.ts";
import { createMemoryLedgerStore, type LedgerStore } from "./ledger/store.ts";
import { createPostgresLedgerStore } from "./ledger/postgres-store.ts";
import { registerAiRoutes, type AiRouteOptions } from "./http/ai.ts";
import { registerAiIntakeRoutes } from "./http/ai-intake.ts";
import { registerAuditRoutes } from "./http/audit.ts";
import { registerCapitalRoutes } from "./http/capital.ts";
import { registerFundRoutes } from "./http/funds.ts";
import { registerHealthRoutes } from "./http/health.ts";
import { registerMaterialRoutes } from "./http/materials.ts";
import { registerMeetingRoutes } from "./http/meetings.ts";
import { registerProjectRoutes } from "./http/projects.ts";
import { registerReportRoutes } from "./http/reports.ts";
import { registerRiskRoutes } from "./http/risks.ts";
import { registerSessionRoutes } from "./http/session.ts";
import { registerTaskRoutes } from "./http/tasks.ts";

type ServerOptions = {
  auth?: AuthConfigInput;
  ai?: AiRouteOptions;
  ledgerStore?: LedgerStore;
  materialPreviewProjectRoot?: string;
  materialStorageRoot?: string;
  useDatabaseStore?: boolean;
  databaseUrl?: string;
};

export function createServer(options: ServerOptions = {}) {
  const server = Fastify({ logger: true });
  const auth = resolveAuthConfig(options.auth);
  const projectedResponses = new WeakSet<object>();

  const rawLedgerStore =
    options.ledgerStore ??
    (options.useDatabaseStore ? createPostgresLedgerStore({ databaseUrl: options.databaseUrl }) : createMemoryLedgerStore());

  server.addHook('onReady',async()=>{void resumeMaterialExtractions(ledgerStore,options.materialStorageRoot??process.env.MATERIAL_STORAGE_ROOT??resolve(options.materialPreviewProjectRoot??resolve(import.meta.dirname,'../..'),'private-material-storage')).catch(()=>server.log.error('Material extraction recovery failed'));});
  const ledgerStore=scopedLedgerStore(managedLedgerStore(notifyingLedgerStore(rawLedgerStore)));
  registerRecordManagementRoutes(server,scopedLedgerStore(rawLedgerStore),{auth});
  registerObjectAccessRoutes(server,rawLedgerStore,{auth});
  registerCustomFieldRoutes(server,ledgerStore,{auth});

  server.addHook('preSerialization', async(request, _reply, payload)=> {
    if(!resolveRequestUser(request,auth) || canReadLp(resolveRequestUser(request,auth)) || request.routeOptions.url==='/api/health' || request.routeOptions.url?.startsWith('/api/session/')) return payload;
    const projected=(await lpProjection(ledgerStore)).project(payload);
    projectedResponses.add(request);
    return projected;
  });


  // Require a session before parsing business payloads or calling external AI services.
  server.addHook("onRequest", async (request, reply) => {
    const route = request.routeOptions.url;
    const publicRoute =
      (route === "/api/health" && (request.method === "GET" || request.method === "HEAD")) ||
      (route === "/api/session/login" && request.method === "POST");
    if (publicRoute) return;

    reply.header("Cache-Control", "private, no-store");

    if(auth.mode==='password'){
      try{
        const valid=await registeredSession(request.headers.cookie,auth,ledgerStore);
        if(valid){
          cacheRequestSession(request,valid.user,valid.hash);reply.header('x-fundapp-session-context',valid.hash);
          const expected=request.headers['x-fundapp-session-context'];
          const checkingCurrent=route==='/api/session/me'&&(request.method==='GET'||request.method==='HEAD');
          if(!checkingCurrent&&expected!==undefined&&expected!==valid.hash)return reply.code(401).send({error:'session_context_changed'});
        }
      }
      catch{request.log.error({code:'session_validation_failed'});return reply.code(503).send({error:'session_unavailable'});}
    }
    if (!resolveRequestUser(request, auth)) {
      return reply.code(401).send({ error: "unauthenticated" });
    }
  });

  server.addHook('onRequest',(request,_reply,done)=>{
    const actor=resolveRequestUser(request,auth);if(actor){const ctx:{actor:typeof actor;policy?:ReturnType<typeof objectPolicy>;validate:()=>Promise<boolean>;refresh:()=>Promise<import('./auth/object-access.ts').ObjectPolicy>}={actor,validate:async()=>{if(auth.mode==='local-bypass')return true;const live=await registeredSession(request.headers.cookie,auth,rawLedgerStore);return !!live&&live.user.id===actor.id&&live.user.role===actor.role;},refresh:()=>ctx.policy=objectPolicy(rawLedgerStore,actor)};accessContext.run(ctx,done);}else done();
  });
  server.addHook('preValidation',async(request,reply)=>{
    const ctx=accessContext.getStore();if(!ctx||ctx.actor.role==='admin')return;
    try{const policy=await(ctx.policy??=objectPolicy(rawLedgerStore,ctx.actor));policy.assert(request.params);policy.assert(request.query);if(!Buffer.isBuffer(request.body))policy.assert(request.body);}
    catch(error){if(error instanceof ObjectAccessError)return reply.code(403).send({error:'forbidden'});throw error;}
  });
  server.addHook('preValidation',async(request,reply)=>{
    if(!['POST','PUT','PATCH','DELETE'].includes(request.method)||request.routeOptions.url?.startsWith('/api/record-management/')||!resolveRequestUser(request,auth))return;
    const removed=new Set((await rawLedgerStore.readRecordManagement()).entries.filter(e=>e.deletedAt).map(e=>e.id));if(!removed.size)return;

    if([...recordReferenceIds(request.params),...recordReferenceIds(request.query),...recordReferenceIds(request.body)].some(id=>removed.has(id)))return reply.code(409).send({error:'record_deleted'});
  });
  server.addHook('preSerialization',async(_request,reply,payload)=>{const ctx=accessContext.getStore();if(!ctx||ctx.actor.role==='admin')return payload;const policy=await ctx.refresh!(),filtered=policy.filter(payload);if(filtered===null&&payload!==null){reply.code(403);return {error:'forbidden'};}return filtered;});

  server.addHook('preValidation',async(request,reply)=>{
    if(!['POST','PUT','PATCH'].includes(request.method))return;
    const route=request.routeOptions.url;
    const masterWrite=(request.method==='POST'&&['/api/companies','/api/projects','/api/funds'].includes(route??''))||(request.method==='PATCH'&&['/api/companies/:id','/api/projects/:id','/api/funds/:id'].includes(route??''));
    const projectWrite=route==='/api/projects'||route==='/api/projects/:id';
    const scalarFields=(value:unknown)=>Boolean(value&&typeof value==='object'&&!Array.isArray(value)&&Object.values(value).every(v=>v===null||typeof v==='string'||typeof v==='boolean'||(typeof v==='number'&&Number.isFinite(v))));
    const containsPurpose=(value:unknown,path:string[]=[]):boolean=>Boolean(value&&typeof value==='object'&&Object.entries(value).some(([key,child])=>{
      // Master custom values are scalar data, even when stable IDs match metadata names.
      if(masterWrite&&key==='customFields'&&(path.length===0||(projectWrite&&path.length===1&&path[0]==='newCompany'))&&scalarFields(child))return false;
      return ['dataPurpose','currentVersionPurpose','sourcePurposes'].includes(key)||containsPurpose(child,[...path,key]);
    }));
    if(containsPurpose(request.body))return reply.code(400).send({error:'untrusted_source_purpose'});
  });

  registerInvestmentLedgerRoutes(server,ledgerStore,{auth:options.auth});
  registerFundLifecycleRoutes(server,ledgerStore,{auth:options.auth,projectRoot:options.materialPreviewProjectRoot??resolve(import.meta.dirname,'../..'),storageRoot:options.materialStorageRoot});
  registerDocumentTemplateRoutes(server,ledgerStore,{auth:options.auth,projectRoot:options.materialPreviewProjectRoot??resolve(import.meta.dirname,'../..')});
  registerDocumentTemplateManagerRoutes(server,ledgerStore,{auth:options.auth,onProjectedDocument:request=>projectedResponses.add(request)});
  registerFundOperationsRoutes(server,ledgerStore,{auth:options.auth,storageRoot:options.materialStorageRoot,projectRoot:options.materialPreviewProjectRoot});
  registerHealthRoutes(server,rawLedgerStore);
  registerSessionRoutes(server, { auth: options.auth, store: ledgerStore });
  registerAccountRoutes(server,ledgerStore,{auth:options.auth});
  const agentRepository=new AgentRepository(options.useDatabaseStore?options.databaseUrl:undefined);
  registerBusinessNotifications(server,rawLedgerStore,agentRepository,{auth:options.auth});
  registerAgentWorkspaceRoutes(server,ledgerStore,{auth:options.auth,repository:agentRepository});
  server.addHook('preValidation',async(request,reply)=>{
    const body=request.body as Record<string,unknown>|undefined;if(request.method!=='POST'||!body?.reviewerId||typeof body.reviewerId!=='string')return;
    const url=request.url.split('?')[0],fund=/^\/api\/funds\/([^/]+)\/(?:lifecycle|investors\/[^/]+\/fundraising)\/actions$/.exec(url),project=/^\/api\/projects\/([^/]+)\/deals\/[^/]+\/actions$/.exec(url);if(!fund&&!project)return;
    const user=body.reviewerId==='user-admin'?getAdminUser(auth):(await rawLedgerStore.listUsers()).find(u=>u.id===body.reviewerId&&u.enabled!==false);
    if(!user||user.id!=='user-admin'&&(!('passwordHash' in user)||!user.passwordHash)||!(project?['admin','investment_manager','legal'].includes(user.role):canRole(user.role,'fund:write')))return reply.code(400).send({error:'invalid_reviewer'});
    const policy=await objectPolicy(rawLedgerStore,user);if(fund?!policy.fund(decodeURIComponent(fund[1])):!policy.project(decodeURIComponent(project![1])))return reply.code(403).send({error:'reviewer_no_access'});
  });
  server.addHook('preValidation',async(request,reply)=>{
    if(!['POST','PATCH'].includes(request.method))return;
    const match=/^\/api\/(companies|projects|funds)(?:\/([^/]+))?$/.exec(request.url.split('?')[0]);if(!match)return;
    const kind=match[1]==='companies'?'company':match[1]==='projects'?'project':'fund',body=request.body as Record<string,unknown>;if(!body||typeof body!=='object')return;
    const records=kind==='company'?await ledgerStore.listCompanies():kind==='project'?await ledgerStore.listProjects():await ledgerStore.listFunds();const existing=match[2]?records.find(x=>x.id===match[2]):undefined;
    const stage=typeof body.stage==='string'?body.stage:(existing as any)?.stage??(kind==='project'?'初筛':'');
    const templates=await agentRepository.transaction(s=>s.templates.filter(t=>t.status==='published'&&t.enabled!==false&&t.objectType===kind&&(!t.stage||sameTemplateStage(t.stage,stage))));
    const custom=body.customFields as Record<string,unknown>|undefined,missing:string[]=[];
    for(const t of templates)for(const f of t.fields.filter(f=>f.enabled&&f.required)){
      const provided=Object.hasOwn(body,f.id)||!!custom&&Object.hasOwn(custom,f.id);if(existing&&!provided)continue;
      const value=Object.hasOwn(body,f.id)?body[f.id]:custom?.[f.id];if(value===undefined||value===null||typeof value==='string'&&!value.trim())missing.push(f.label);
    }
    if(missing.length)return reply.code(400).send({error:'required_template_field',fields:[...new Set(missing)]});
  });
  registerBusinessIntakeRoutes(server,ledgerStore,{auth:options.auth,repository:agentRepository,projectRoot:options.materialPreviewProjectRoot??resolve(import.meta.dirname,'../..'),storageRoot:options.materialStorageRoot??resolve(options.materialPreviewProjectRoot??resolve(import.meta.dirname,'../..'),'private-material-storage'),fetchImpl:options.ai?.fetchImpl,readEnv:()=>readAiEnv(options.ai?.env)});
  registerReportTemplateImportRoutes(server,ledgerStore,{auth:options.auth,repository:agentRepository,storageRoot:options.materialStorageRoot??resolve(options.materialPreviewProjectRoot??resolve(import.meta.dirname,'../..'),'private-material-storage')});
  registerAiRoutes(server, {...options.ai,agentRepository,store:ledgerStore,auth:options.auth,projectRoot:options.materialPreviewProjectRoot??resolve(import.meta.dirname,'../..'),storageRoot:options.materialStorageRoot});
  registerLpRoutes(server,ledgerStore,{auth:options.auth,agentRepository,projectRoot:options.materialPreviewProjectRoot??resolve(import.meta.dirname,'../..'),storageRoot:options.materialStorageRoot});
  registerFundRoutes(server, ledgerStore, { auth: options.auth });
  registerProjectRoutes(server, ledgerStore, { auth: options.auth });
  registerTaskRoutes(server, ledgerStore);
  registerWorkflowRoutes(server,ledgerStore,{auth:options.auth,projectRoot: options.materialPreviewProjectRoot ?? resolve(import.meta.dirname,"../.."),storageRoot:options.materialStorageRoot});
  registerReturnRoutes(server,ledgerStore,{auth:options.auth,projectRoot: options.materialPreviewProjectRoot ?? resolve(import.meta.dirname,"../.."),storageRoot:options.materialStorageRoot});
  registerInvestmentCashflowRoutes(server,ledgerStore,{auth:options.auth,projectRoot: options.materialPreviewProjectRoot ?? resolve(import.meta.dirname,"../.."),storageRoot:options.materialStorageRoot});
  registerExitSettlementRoutes(server,ledgerStore,{auth:options.auth,projectRoot: options.materialPreviewProjectRoot ?? resolve(import.meta.dirname,"../.."),storageRoot:options.materialStorageRoot});
  registerPostInvestmentRoutes(server,ledgerStore,{auth:options.auth,projectRoot: options.materialPreviewProjectRoot ?? resolve(import.meta.dirname,"../.."),storageRoot:options.materialStorageRoot,onProjectedDocument:request=>projectedResponses.add(request)});
  registerDealRoutes(server,ledgerStore,{auth:options.auth,projectRoot: options.materialPreviewProjectRoot ?? resolve(import.meta.dirname,"../.."),storageRoot:options.materialStorageRoot});
  registerDiligenceRoutes(server,ledgerStore,{auth:options.auth,projectRoot: options.materialPreviewProjectRoot ?? resolve(import.meta.dirname,"../.."),storageRoot:options.materialStorageRoot,onProjectedDocument:request=>projectedResponses.add(request)});
  registerMaterialScopeRoutes(server,ledgerStore,{auth:options.auth});
  registerMaterialRoutes(server, ledgerStore, { auth: options.auth, projectRoot: options.materialPreviewProjectRoot, storageRoot: options.materialStorageRoot });
  registerAiIntakeRoutes(server, ledgerStore, { auth: options.auth });
  registerMeetingRoutes(server, ledgerStore, { auth: options.auth, projectRoot: options.materialPreviewProjectRoot, storageRoot: options.materialStorageRoot });
  registerReportRoutes(server, ledgerStore, { auth: options.auth,agentRepository,onProjectedDocument:request=>projectedResponses.add(request) });
  registerRiskRoutes(server, ledgerStore, { auth: options.auth });
  registerCapitalRoutes(server, ledgerStore, { auth: options.auth });
  registerAuditRoutes(server, ledgerStore, { auth: options.auth });
  server.addHook('onSend', async(request,reply,payload)=> {
    if(!resolveRequestUser(request,auth) || canReadLp(resolveRequestUser(request,auth)) || request.routeOptions.url==='/api/health' || request.routeOptions.url?.startsWith('/api/session/') || payload===null) return payload;
    // Immutable exports must be withheld, never rewritten under their stored hash.
    if(typeof payload==='string' || Buffer.isBuffer(payload)) {
      const policy=await lpProjection(ledgerStore);
      let privateBody=false;
      if(!projectedResponses.has(request)) {
        const bytes=String(payload);let parsed:unknown;
        try { parsed=JSON.parse(bytes); } catch { privateBody=policy.text(bytes)!==bytes; }
        if(parsed!==undefined) privateBody=JSON.stringify(policy.project(parsed))!==JSON.stringify(parsed);
      }
      if(privateBody || Object.entries(reply.getHeaders()).some(([name,v])=>policy.privateHeader(name,String(v)))) {
        for(const [name,value] of Object.entries(reply.getHeaders())) if(['content-length','content-disposition','content-range','etag','location'].includes(name) || policy.text(String(value))!==String(value)) reply.removeHeader(name);
        reply.code(403).type('application/json'); return JSON.stringify({error:'lp_privacy_forbidden'});
      }
    }
    return payload;
  });
  return server;
}

export async function startServer() {
  const config = readServerConfig();
  const demo = process.env.DEMO_DATA === "true";
  if (demo && config.databaseUrl) throw new Error("Demo mode must not connect to a database");
  const server = createServer({ ...(demo ? { ledgerStore: createDemoLedgerStore() } : {}), useDatabaseStore: Boolean(config.databaseUrl), databaseUrl: config.databaseUrl });
  if (demo) { await server.ready(); await seedDemoWorkspace(server); }
  await server.listen({ host: process.env.API_HOST ?? "0.0.0.0", port: config.port });
}
