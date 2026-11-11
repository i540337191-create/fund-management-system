import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import {createTestServer as createServer,registeredCookie} from './auth-fixture.ts';
import { createMemoryLedgerStore, createSeedLedgerState } from "../src/ledger/store.ts";
import { createApiClient } from "../../src/lib/apiClient.ts";
import { saveReportTaskWorkflow } from "../../src/lib/reportTaskSave.ts";

async function fixture() {
  const state = createSeedLedgerState(), base = state.projects[0];
  state.projects = ["b", "a"].map(id => ({ ...base, id, name: "同名主体", shortName: "同名", ownerId: "user-admin" }));
  const store = createMemoryLedgerStore(state);
  const secret = "report-identity-isolated-test-secret";
  const actor = { id: "user-admin", name: "管理员", email: "identity@example.test", role: "admin" as const };
  const server = createServer({ ledgerStore: store, auth: { mode: "password", adminEmail: actor.email, sessionSecret: secret } });
  const cookie = await registeredCookie(server,actor,secret);
  const api = createApiClient({ fetchImpl: async (url, init = {}) => {
    const result = await server.inject({ method: (init.method ?? "GET") as "GET" | "POST", url: String(url), headers: { cookie }, ...(init.body ? { payload: JSON.parse(String(init.body)) } : {}) });
    return { ok: result.statusCode >= 200 && result.statusCode < 300, status: result.statusCode, json: async () => result.json() } as Response;
  } });
  return { state, store, server, cookie, api };
}

test("production report helper keeps duplicate-named project and missing task on the selected ID", async t => {
  const f = await fixture(); t.after(() => f.server.close());
  const report = await saveReportTaskWorkflow(f.api, {
    name: "同名隔离", target: "陈旧显示名称", targetType: "project", targetId: "a", type: "项目初筛报告", owner: "旧负责人",
    missingItems: [{ label: "核查资料", projectId: "a", ownerId: "user-admin", owner: "旧负责人" }],
  }, f.state.projects, { reportId: `report-${randomUUID()}`, taskRequestIds: [randomUUID()], completedTaskIndexes: [], updatedAt: new Date().toISOString() });
  assert.equal(report.projectId, "a"); assert.equal(report.target, "同名主体");
  assert.equal(f.store.listTasks().find(task => task.relation === "报告缺失项 / 同名隔离")?.projectId, "a");
  assert.ok(f.store.getProjectDetail("a")!.reports.some(row => row.id === report.id));
  assert.ok(!f.store.getProjectDetail("b")!.reports.some(row => row.id === report.id));
  const other = await f.api.createReport({ name: "另一对象", target: "同名主体", projectId: "b", type: "项目初筛报告", owner: "管理员", status: "草稿", updatedAt: "2026-10-29" });
  assert.ok(!f.store.getProjectDetail("a")!.reports.some(row => row.id === other.report.id));
});

test("ambiguous legacy names and invalid explicit IDs fail before report or audit writes", async t => {
  const f = await fixture(); t.after(() => f.server.close());
  const reportsBefore = f.store.listReports().length, auditBefore = f.store.listAuditEvents().length;
  const body = { name: "拒绝串档", target: "同名主体", type: "项目初筛报告", owner: "管理员", status: "草稿", updatedAt: "2026-10-29" };
  for (const [extra, code, error] of [
    [{}, 409, "report_target_ambiguous"],
    [{ projectId: "unknown" }, 404, "project_not_found"],
    [{ fundId: "unknown" }, 404, "fund_not_found"],
    [{ targetType: "project", targetId: "unknown" }, 404, "project_not_found"],
    [{ targetType: "fund", targetId: f.state.funds[0].id, projectId: "a" }, 400, "report_target_conflict"],
    [{ targetType: "project", targetId: "a", projectId: "b" }, 400, "report_target_conflict"],
    [{ projectId: 1 }, 400, "invalid_report_target"],
  ] as const) {
    const result = await f.server.inject({ method: "POST", url: "/api/reports", headers: { cookie: f.cookie }, payload: { ...body, ...extra } });
    assert.equal(result.statusCode, code, result.body); assert.equal(result.json().error, error);
  }
  assert.equal(f.store.listReports().length, reportsBefore); assert.equal(f.store.listAuditEvents().length, auditBefore);
});

test("legacy exact unique names remain supported; unbound historical rows remain in the global list", async t => {
  const f = await fixture(); t.after(() => f.server.close());
  f.store.listProjects()[0].name = "唯一主体"; f.store.listProjects()[0].shortName = "唯一";
  const report = (await f.api.createReport({ name: "兼容入口", target: "唯一", type: "项目初筛报告", owner: "管理员", status: "草稿", updatedAt: "2026-10-29" })).report;
  assert.equal(report.projectId, f.store.listProjects().find(p=>p.name==="唯一主体")!.id); assert.equal(report.target, "唯一主体");
  const fund = (await f.api.createReport({ name: "基金对象", target: "过时基金名", targetType: "fund", targetId: f.state.funds[0].id, type: "基金季度报告", owner: "管理员", status: "草稿", updatedAt: "2026-10-29" })).report;
  assert.equal(fund.projectId, null); assert.equal(fund.target, f.state.funds[0].name);
  const legacy = { ...report, id: "legacy-unbound", projectId: null, fundId: null, target: "同名主体" };
  const legacyStore=createMemoryLedgerStore({...f.state,reports:[legacy]});
  const legacyServer=createServer({ledgerStore:legacyStore,auth:{mode:'local-bypass'}});t.after(()=>legacyServer.close());
  assert.ok((await legacyServer.inject('/api/reports')).json().reports.some((row:{id:string}) => row.id === legacy.id));
  assert.ok(!legacyStore.getProjectDetail("a")!.reports.some(row => row.id === legacy.id));
});
