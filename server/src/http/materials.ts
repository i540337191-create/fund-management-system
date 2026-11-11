import {searchCurrentMaterialTextChunks} from '../material-preview/extraction.ts';
import { hiddenSource, parseIncludeDemo } from '../ledger/source-policy.ts';
import { registerMaterialUploadRoutes } from './material-upload.ts';
import type { FastifyInstance } from "fastify";
import { resolve } from "node:path";
import { canReadMaterial, registerMaterialFileRoutes, resolveMaterialAccess } from "./material-files.ts";
import { resolveRequestUser } from "../auth/authorize.ts";
import { requirePermission } from "../auth/authorize.ts";
import { resolveAuthConfig, type AuthConfigInput } from "../auth/session.ts";
import type { LedgerStore, Material } from "../ledger/store.ts";
import {
  generateMaterialPreviewLayoutCache,
  generateMaterialPreviewLayoutCaches,
} from "../material-preview/layout-cache.ts";

type ArchiveMaterialBody = Partial<Omit<Material, "id" | "fundId" | "projectId" | "path">> &
  Partial<Pick<Material, "fundId" | "projectId" | "path">>;

type RouteOptions = {
  auth?: AuthConfigInput;
  projectRoot?: string;
  storageRoot?: string;
};

export function registerMaterialRoutes(server: FastifyInstance, store: LedgerStore, options: RouteOptions = {}) {
  const auth = resolveAuthConfig(options.auth);
  const projectRoot = options.projectRoot ?? resolve(import.meta.dirname, "../..", "..");

  registerMaterialFileRoutes(server, store, { projectRoot, auth });
  registerMaterialUploadRoutes(server,store,{projectRoot,auth,storageRoot:options.storageRoot});

  server.get('/api/materials', async request => {
    const materials=(await store.listMaterials()).filter(item=>canReadMaterial(resolveRequestUser(request,auth),item));
    const meetings=await store.listMeetings();
    return {materials:materials.map(item=>{
      const meeting=!item.currentVersionId&&!item.originalFilePath&&meetings.find(m=>m.status==='已归档'&&item.id===`material-meeting-${m.id}`);
      return meeting?{...item,generatedDocumentHref:`/api/meetings/${encodeURIComponent(meeting.id)}/document`,generatedDocumentSource:'留存会议记录生成副本（非上传原件）'}:item;
    })};
  });

  server.get("/api/materials/text-search", async (request, reply) => {
    const query = (request.query ?? {}) as {
      q?: string;
      relationType?: "fund" | "project" | "company" | "investor";
      relationId?: string;
      limit?: string;
      allowedDataOrigins?: string;
      includeDemo?:string;
    };
    if (!query.q?.trim()) return reply.code(400).send({ error: "invalid_material_search_query" });

    const includeDemo=parseIncludeDemo(query.includeDemo);
    const materials = await store.listMaterials();
    const readable = materials.filter(item=>includeDemo||!hiddenSource(item)).filter((item) => canReadMaterial(resolveRequestUser(request, auth), item));
    const allowed = new Set(readable.flatMap((item) => [item.id, item.sourceMaterialId]));
    if (query.limit && (!/^\d+$/.test(query.limit) || Number(query.limit) < 1 || Number(query.limit) > 12)) return reply.code(400).send({ error: "invalid_material_search_limit" });
    const chunks = await searchCurrentMaterialTextChunks(store,options.storageRoot??process.env.MATERIAL_STORAGE_ROOT??resolve(projectRoot,'private-material-storage'),{
      query: query.q,
      includeDemo,
      relationType: query.relationType,
      relationId: query.relationId,
      limit: query.limit ? Number(query.limit) : undefined,
      allowedDataOrigins: parseAllowedDataOrigins(query.allowedDataOrigins),
      allowedMaterialIds: readable.map((item) => item.id),
    });
    return { chunks: chunks.filter((chunk) => allowed.has(chunk.materialId)) };
  });

  server.post("/api/materials/archive", async (request, reply) => {
    const authError = requirePermission(request, reply, auth, "material:write");
    if (authError) return authError;

    const body = request.body as ArchiveMaterialBody;
    if(body && (Object.hasOwn(body,"dataPurpose") || Object.hasOwn(body,"dataOrigin") || Object.hasOwn(body,"sourceBasis"))) return reply.code(400).send({error:"invalid_material_payload"});
    // This metadata-only legacy route must never mint protected upload identities or URLs.
    if(!body || typeof body!=='object' || Array.isArray(body)) return reply.code(400).send({error:'invalid_material_payload'});
    const protectedKeys=['id','version','currentVersion','currentVersionId','createdAt'];
    if(body && (protectedKeys.some(key=>key in body) || Object.values(body).some(value=>typeof value==='string' && /(?:^|\/)api\/materials\//.test(value)) || (body.sourceMaterialId && (await store.listMaterials()).some(m=>m.currentVersionId && (m.id===body.sourceMaterialId || m.sourceMaterialId===body.sourceMaterialId))))) return reply.code(400).send({error:'protected_material_metadata'});
    const error = validateArchiveMaterialBody(body);
    if (error) {
      return reply.code(400).send({ error });
    }

    const result = await store.archiveMaterial({...body,dataOrigin:"user_input"} as Omit<Material, "id" | "fundId" | "projectId" | "path">);
    return reply.code(201).send(result);
  });

  server.post("/api/materials/preview-layout-cache", async (request, reply) => {
    const authError = requirePermission(request, reply, auth, "material:write");
    if (authError) return authError;

    const body = request.body as { recognizedHtmlHref?: string; page?: number };
    if (typeof body?.recognizedHtmlHref !== "string" || !body.recognizedHtmlHref.trim()) {
      return reply.code(400).send({ error: "invalid_recognized_html_href" });
    }

    const page = Number(body.page);
    if (!Number.isInteger(page) || page < 1) {
      return reply.code(400).send({ error: "invalid_preview_page" });
    }

    const access = await resolveMaterialAccess(body.recognizedHtmlHref, projectRoot, store, resolveRequestUser(request, auth));
    if (!access) return reply.code(404).send({ error: "material_file_not_found" });
    if (!access.allowed) return reply.code(403).send({ error: "forbidden" });
    if (page > access.pageLimit) return reply.code(400).send({ error: "invalid_preview_page" });

    try {
      const result = await generateMaterialPreviewLayoutCache({
        projectRoot,
        recognizedHtmlHref: body.recognizedHtmlHref,
        page,
      });
      return reply.code(201).send(result);
    } catch (error) {
      const statusCode = typeof (error as { statusCode?: unknown }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : 500;
      const message = error instanceof Error ? error.message : "preview_layout_cache_failed";
      request.log.warn({ err: error }, "failed to generate material preview layout cache");
      return reply.code(statusCode).send({ error: message });
    }
  });

  server.post("/api/materials/preview-layout-cache/batch", async (request, reply) => {
    const authError = requirePermission(request, reply, auth, "material:write");
    if (authError) return authError;

    const body = request.body as { recognizedHtmlHref?: string; pages?: number[]; pageCount?: number };
    if (typeof body?.recognizedHtmlHref !== "string" || !body.recognizedHtmlHref.trim()) {
      return reply.code(400).send({ error: "invalid_recognized_html_href" });
    }

    if (body.pages && (!Array.isArray(body.pages) || body.pages.some((page) => !Number.isFinite(Number(page)) || Number(page) < 1))) {
      return reply.code(400).send({ error: "invalid_preview_pages" });
    }

    if (body.pageCount !== undefined && (!Number.isFinite(Number(body.pageCount)) || Number(body.pageCount) < 1)) {
      return reply.code(400).send({ error: "invalid_preview_page_count" });
    }

    const access = await resolveMaterialAccess(body.recognizedHtmlHref, projectRoot, store, resolveRequestUser(request, auth));
    if (!access) return reply.code(404).send({ error: "material_file_not_found" });
    if (!access.allowed) return reply.code(403).send({ error: "forbidden" });
    if ((body.pages ?? []).some((page) => page > access.pageLimit) || (body.pageCount !== undefined && (!Number.isInteger(body.pageCount) || body.pageCount < 1 || body.pageCount > access.pageLimit))) return reply.code(400).send({ error: "invalid_preview_pages" });

    try {
      const result = await generateMaterialPreviewLayoutCaches({
        projectRoot,
        recognizedHtmlHref: body.recognizedHtmlHref,
        pages: body.pages,
        pageCount: body.pageCount ?? access.pageLimit,
      });
      return reply.code(201).send(result);
    } catch (error) {
      const statusCode = typeof (error as { statusCode?: unknown }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : 500;
      const message = error instanceof Error ? error.message : "preview_layout_cache_batch_failed";
      request.log.warn({ err: error }, "failed to generate material preview layout cache batch");
      return reply.code(statusCode).send({ error: message });
    }
  });
}

function validateArchiveMaterialBody(body: ArchiveMaterialBody) {
  const required: (keyof ArchiveMaterialBody)[] = ["name", "type", "uploader", "time", "source", "status", "quotes", "project"];
  return required.find((key) => typeof body?.[key] !== "string") ? "invalid_material_payload" : null;
}

function parseAllowedDataOrigins(value: string | undefined) {
  if (!value) return undefined;
  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins.length > 0 ? Array.from(new Set(origins)) : undefined;
}
