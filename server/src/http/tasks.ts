import type { FastifyInstance } from "fastify";
import type { LedgerStore } from "../ledger/store.ts";

export function registerTaskRoutes(server: FastifyInstance, store: LedgerStore) {
  server.get("/api/tasks", async (request) => {
    const query = request.query as { projectId?: string };
    return { tasks: await store.listTasks(query.projectId) };
  });
}
