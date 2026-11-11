import type { FastifyInstance } from "fastify";
import { requirePermission } from "../auth/authorize.ts";
import { resolveAuthConfig, type AuthConfigInput } from "../auth/session.ts";
import type { LedgerStore } from "../ledger/store.ts";

type RouteOptions = {
  auth?: AuthConfigInput;
};

export function registerAuditRoutes(server: FastifyInstance, store: LedgerStore, options: RouteOptions = {}) {
  const auth = resolveAuthConfig(options.auth);

  server.get("/api/audit-events", async (request, reply) => {
    const authError = requirePermission(request, reply, auth, "audit:read");
    if (authError) return authError;

    const { projectId } = request.query as { projectId?: string };
    return { auditEvents: await store.listAuditEvents(projectId) };
  });
}
