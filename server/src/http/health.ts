import type { FastifyInstance } from "fastify";

export type MaintenanceStatus = {state:'initial'|'running'|'idle'|'failed';lastCompletedAt:string|null};
declare module 'fastify' { interface FastifyInstance { postInvestmentMaintenance?:MaintenanceStatus; } }

export function registerHealthRoutes(server: FastifyInstance,store?:Pick<import('../ledger/store.ts').LedgerStore,'healthCheck'>) {
  server.get("/api/health", async (_request,reply) => {try{await store?.healthCheck();}catch{return reply.code(503).send({ok:false,service:'fund-management-fund-api',database:'unavailable'});}return ({ ok: true, database:'ready', service: "fund-management-fund-api", maintenance:{postInvestment:{...(server.postInvestmentMaintenance??{state:'initial',lastCompletedAt:null})}} });});
}
