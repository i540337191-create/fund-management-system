import {materialCitationLocation,materialLocationInstruction} from '../material-preview/location.ts';
import {businessConversationAllowed,generalConversationAllowed,businessScopeMessage} from '../ai/business-scope.ts';
import {registerMaterialCompleteness} from './material-completeness.ts';
import type {AgentRepository} from '../agent/repository.ts';
import {registerAiIntakeMaterial} from './ai-intake-material.ts';
import {registerMeetingPreparation} from './meeting-preparation.ts';
import {registerAssistantActionRoutes} from './assistant-actions.ts';
import {resolve} from 'node:path';
import {searchCurrentMaterialTextChunks} from '../material-preview/extraction.ts';
import {registerFundCompleteness} from './fund-completeness.ts';
import {registerAssistantRoutes} from './assistant.ts';
import {readFileSync,statSync} from 'node:fs';
import { canReadLp, lpProjection } from "../ledger/lp-privacy.ts";
import type { LedgerStore, MaterialTextSearchRelationType } from '../ledger/store.ts';
import { resolveAuthConfig, type AuthConfigInput } from '../auth/session.ts';
import { resolveRequestUser } from '../auth/authorize.ts';
import { canReadMaterial } from './material-files.ts';
import { confirmedSource, sourceOf, engineeringSource } from '../ledger/source-policy.ts';
import type { FastifyInstance } from "fastify";
import {
  buildQwenChatPayload,
  createAiServiceStatus,
  createRuleBasedAction,
  extractQwenContent,
  type AiChatRequest,
} from "../ai/qwen.ts";

type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  body?: ReadableStream<Uint8Array>|null;
  headers?: {get:(name:string)=>string|null};
}>;

export type AiRouteOptions = {
  agentRepository?:AgentRepository;
  env?: Partial<Pick<NodeJS.ProcessEnv, "QWEN_API_KEY" | "QWEN_BASE_URL" | "QWEN_MODEL" | "QWEN_VISION_MODEL">>;
  fetchImpl?: FetchLike;
  store?: LedgerStore;
  auth?: AuthConfigInput;
  projectRoot?:string;
  storageRoot?:string;
};

export function registerAiRoutes(server: FastifyInstance, options: AiRouteOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  if(options.store)registerAiIntakeMaterial(server,{...options,store:options.store,fetchImpl,readEnv:()=>readAiEnv(options.env)});
  if(options.store)registerMaterialCompleteness(server,{...options,store:options.store,fetchImpl,readEnv:()=>readAiEnv(options.env)});
  if(options.store)registerFundCompleteness(server,{...options,store:options.store,fetchImpl,readEnv:()=>readAiEnv(options.env)});
  if(options.store)registerMeetingPreparation(server,{...options,store:options.store,fetchImpl,readEnv:()=>readAiEnv(options.env)});
  if(options.store)registerAssistantRoutes(server,{...options,store:options.store,fetchImpl,readEnv:()=>readAiEnv(options.env)});

  if(options.store)registerAssistantActionRoutes(server,{...options,store:options.store,fetchImpl,readEnv:()=>readAiEnv(options.env)});

  server.get("/api/ai/settings", async () => readAiServiceStatus(options.env));

  server.post("/api/ai/chat", async (request, reply) => {
    let body = (request.body ?? {}) as Partial<AiChatRequest>;
    if (typeof body.prompt !== "string" || !body.prompt.trim()) {
      return reply.code(400).send({ error: "prompt is required" });
    }

    if (body.includeDemo !== undefined && typeof body.includeDemo !== 'boolean') return reply.code(400).send({error:'invalid_include_demo'});
    if (body.history !== undefined && (!Array.isArray(body.history) || body.history.some(m=>!m || !['user','assistant'].includes(m.role) || typeof m.content!=='string'))) return reply.code(400).send({error:'invalid_history'});
    const actor=resolveRequestUser(request,resolveAuthConfig(options.auth));
    if(options.store && !canReadLp(actor)) {
      const privacy=await lpProjection(options.store), history=body.history;
      body=privacy.freeText(body) as Partial<AiChatRequest>;
      if(history) body.history=history.map(message=>({role:message.role,content:privacy.text(message.content)}));
    }
    const scopeEnv=readAiEnv(options.env),scopeSettings=createAiServiceStatus(scopeEnv);
    if(scopeEnv.apiKey&&!await generalConversationAllowed(options.agentRepository,actor)){let allowed:boolean;try{allowed=await businessConversationAllowed({fetchImpl,baseUrl:scopeSettings.baseUrl,model:scopeSettings.model,apiKey:scopeEnv.apiKey,prompt:body.prompt!,history:body.history});}catch{return reply.code(503).send({error:'business_scope_unavailable'});}if(!allowed)return {role:'assistant',content:businessScopeMessage,sources:[],scopeRestricted:true};}
    const readable=options.store ? (await options.store.listMaterials()).filter(m=>!engineeringSource(m)&&canReadMaterial(actor,m)&& (body.includeDemo!==false||confirmedSource(m))) : [];
    const allowed=new Map(readable.map(m=>[m.id,m]));
    const chunks=options.store ? await searchCurrentMaterialTextChunks(options.store,options.storageRoot??process.env.MATERIAL_STORAGE_ROOT??resolve(options.projectRoot??process.cwd(),'private-material-storage'),{query:body.prompt!,includeDemo:body.includeDemo!==false,limit:6,allowedMaterialIds:readable.map(m=>m.id),...(body.includeDemo===false?{allowedDataOrigins:['source_pdf_ocr','source_file','user_input']}:{})}) : [];
    const rawEvidence=chunks.filter(c=>allowed.has(c.materialId)&&!engineeringSource(c)&&(body.includeDemo!==false||confirmedSource(c))).map(c=>({materialId:c.materialId,page:c.page,location:materialCitationLocation({title:c.fileName,page:c.page,excerpt:c.text,location:c.location}),text:c.text,...sourceOf(c)}));
    const evidence = options.store && !canReadLp(actor) ? (await lpProjection(options.store)).project(rawEvidence) as typeof rawEvidence : rawEvidence;
    if (body.includeDemo === false && !evidence.length) return {role:'assistant',content:'当前请求未检索到有权限且来源可核验的业务资料，请补充来源后再生成业务结论。',sources:[],sourcePolicy:{includeDemo:false,history:'excluded'},needsSourceEvidence:true,action:createRuleBasedAction(body.prompt!)};
    const env = readAiEnv(options.env);
    const serviceStatus = createAiServiceStatus(env);
    if (!env.apiKey) {
      return reply.code(503).send({
        error: "QWEN_API_KEY is not configured",
        status: serviceStatus,
      });
    }

    // Dynamic text was projected before composition; serialized evidence contains protocol IDs and keys.
    const modelPayload = buildQwenChatPayload({...body,evidence} as AiChatRequest, serviceStatus);
    const qwenResponse = await fetchImpl(`${serviceStatus.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(modelPayload),
    });
    const responseText = await qwenResponse.text();

    if (!qwenResponse.ok) {
      return reply.code(qwenResponse.status).send({
        error: "Qwen request failed",
        detail: responseText.slice(0, 800),
        status: serviceStatus,
      });
    }

    return {
      role: "assistant",
      content: extractQwenContent(responseText),
      sources: evidence.map(v=>`资料 ${v.materialId} ${v.location}`),
      sourcePolicy:{includeDemo:body.includeDemo!==false,history:body.includeDemo===false?"excluded":"unverified"},
      action: createRuleBasedAction(body.prompt!),
    };
  });
}

function readAiServiceStatus(env: AiRouteOptions["env"]) {
  return createAiServiceStatus(readAiEnv(env));
}

export function readAiEnv(env: AiRouteOptions["env"] = {}) {
  let file:{apiKey?:string;baseUrl?:string;model?:string;visionModel?:string}={};
  if(process.env.QWEN_CONFIG_FILE){try{const path=process.env.QWEN_CONFIG_FILE;const stat=statSync(path);if(!stat.isFile()||(stat.mode&0o077)!==0)throw Error();file=JSON.parse(readFileSync(path,'utf8'));}catch{throw Error('Invalid private AI provider configuration');}}
  return {
    apiKey: env.QWEN_API_KEY ?? (process.env.QWEN_API_KEY?.trim()||file.apiKey),
    baseUrl: env.QWEN_BASE_URL ?? (process.env.QWEN_BASE_URL?.trim()||file.baseUrl),
    model: env.QWEN_MODEL ?? (process.env.QWEN_MODEL?.trim()||file.model),
    visionModel:env.QWEN_VISION_MODEL??(process.env.QWEN_VISION_MODEL?.trim()||file.visionModel),
  };
}
