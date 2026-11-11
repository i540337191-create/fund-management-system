import {WorkflowError} from '../ledger/workflow.ts';
import type { FastifyInstance } from "fastify";
import { requirePermission, resolveRequestUser } from "../auth/authorize.ts";
import { resolveAuthConfig, type AuthConfigInput } from "../auth/session.ts";
import type { AiIntakeItem, LedgerStore } from "../ledger/store.ts";

type RouteOptions = {
  auth?: AuthConfigInput;
};

type AiIntakeBody = Partial<AiIntakeItem> & {isDemo?:boolean};
type AiIntakeSuggestionBody = Pick<AiIntakeItem, "suggestedFund" | "suggestedFundId" | "suggestedProject" | "suggestedPath">;

export function registerAiIntakeRoutes(server: FastifyInstance, store: LedgerStore, options: RouteOptions = {}) {
  const auth = resolveAuthConfig(options.auth);

  server.get("/api/ai-intake-items", async () => ({ items: await store.listAiIntakeItems() }));

  server.post("/api/ai-intake-items", async (request, reply) => {
    const authError = requirePermission(request, reply, auth, "material:write");
    if (authError) return authError;

    return reply.code(410).send({error:"ai_intake_original_required"});
  });

  server.patch("/api/ai-intake-items/:id/suggestion", async (request, reply) => {
    const authError = requirePermission(request, reply, auth, "material:write");
    if (authError) return authError;

    const { id } = request.params as { id: string };
    const body = request.body as AiIntakeSuggestionBody;
    if(body && (Object.hasOwn(body,"dataPurpose") || Object.hasOwn(body,"dataOrigin")||Object.hasOwn(body,"sourceBasis")))return reply.code(400).send({error:"invalid_ai_intake_suggestion"});
    const error = validateSuggestionBody(body);
    if (error) return reply.code(400).send({ error });

    try {
    const result = await store.updateAiIntakeSuggestion(id, body);
    if (!result) return reply.code(404).send({ error: "ai_intake_item_not_found" });
    return result;
    }catch(error){if(error instanceof WorkflowError)return reply.code(error.status).send({error:error.code});throw error;}
  });

  server.post("/api/ai-intake-items/:id/reject", async (request, reply) => {
    const authError = requirePermission(request, reply, auth, "material:write");
    if (authError) return authError;

    const { id } = request.params as { id: string };
    const body = request.body as { reviewNote?: string };
    if (!body.reviewNote?.trim()) return reply.code(400).send({ error: "invalid_review_note" });

    let result;try{result = await store.rejectAiIntakeItem(id, body.reviewNote);}catch(error){if(error instanceof WorkflowError)return reply.code(error.status).send({error:error.code});throw error;}
    if (!result) return reply.code(404).send({ error: "ai_intake_item_not_found" });
    return result;
  });

  server.post("/api/ai-intake-items/:id/archive", async (request, reply) => {
    const authError = requirePermission(request, reply, auth, "material:write");
    if (authError) return authError;

    const { id } = request.params as { id: string };
    try {
    const result = await store.archiveAiIntakeItem(id, resolveRequestUser(request,auth)!);
    if (!result) return reply.code(404).send({ error: "ai_intake_item_not_found" });
    return reply.code(201).send(result);
    }catch(error){if(error instanceof WorkflowError)return reply.code(error.status).send({error:error.code});throw error;}
  });
}

function validateAiIntakeBody(body: AiIntakeBody) {
  if(body?.suggestedFundId!=null&&(typeof body.suggestedFundId!=="string"||!body.suggestedFundId.trim()))return "invalid_ai_intake_payload";
  const requiredStringFields: (keyof AiIntakeItem)[] = [
    "id",
    "title",
    "inputType",
    "source",
    "submittedBy",
    "submittedAt",
    "summary",
    "confidence",
    "suggestedFund",
    "suggestedProject",
    "suggestedPath",
  ];
  if (requiredStringFields.some((field) => typeof body?.[field] !== "string")) return "invalid_ai_intake_payload";
  if (!Array.isArray(body.extracted) || !Array.isArray(body.generatedTasks)) return "invalid_ai_intake_payload";
  return null;
}

function validateSuggestionBody(body: AiIntakeSuggestionBody) {
  if(body?.suggestedFundId!=null&&(typeof body.suggestedFundId!=="string"||!body.suggestedFundId.trim()))return "invalid_ai_intake_suggestion";
  return ["suggestedFund", "suggestedProject", "suggestedPath"].some((field) => typeof body?.[field as keyof AiIntakeSuggestionBody] !== "string")
    ? "invalid_ai_intake_suggestion"
    : null;
}
