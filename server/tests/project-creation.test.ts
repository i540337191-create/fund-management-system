import assert from "node:assert/strict";
import test from "node:test";
import {createTestServer as createServer,registeredCookie} from './auth-fixture.ts';
import { createMemoryLedgerStore } from "../src/ledger/store.ts";

const payload = {
  requestId: "ce350888-7421-4aa5-802c-8955f5ce7a96", name: "新增真实项目", shortName: "新增项目", industry: "制造业",
  fundId: "fundapp-growth-i", manager: "外部负责人", collaborators: "张三、李四", sourceChannel: "主动拓展", description: "项目描述",
};

test("project creation persists defaults, optional labels, list/detail and one audit", async (t) => {
  const store = createMemoryLedgerStore();
  const server = createServer({ ledgerStore: store, auth: { mode: "local-bypass" } });
  t.after(() => server.close());
  const response = await server.inject({ method: "POST", url: "/api/projects", payload });
  assert.equal(response.statusCode, 201, response.body);
  const result = response.json();
  assert.equal(result.created, true);
  assert.equal(result.project.id, `project-${payload.requestId}`);
  for (const field of ["name", "shortName", "industry", "fundId", "manager", "collaborators", "sourceChannel", "description"]) {
    assert.equal(result.project[field], payload[field as keyof typeof payload]);
  }
  assert.equal(result.project.status, "拟投");
  assert.equal(result.project.stage, "初筛");
  assert.equal(result.project.risk, "低");
  assert.equal(result.project.amount, "未录入");
  assert.equal(result.project.dataOrigin, "user_input");
  assert.equal(result.auditEvent.actor, "管理员");
  assert.equal(result.auditEvent.dataOrigin, "user_input");
  const list = await server.inject({ method: "GET", url: "/api/projects" });
  assert.deepEqual(list.json().projects.find((p: { id: string }) => p.id === result.project.id), {...result.project,customFieldSchema:{schemaRevision:0,fields:[]},missingCustomFields:[]});
  const detail = await server.inject({ method: "GET", url: `/api/projects/${result.project.id}` });
  assert.deepEqual(detail.json().project, {...result.project,customFieldSchema:{schemaRevision:0,fields:[]},missingCustomFields:[]});
  assert.equal(detail.json().auditEvents.filter((a: { action: string }) => a.action === "新增项目").length, 1);
  const retries = await Promise.all(Array.from({ length: 5 }, () => server.inject({ method: "POST", url: "/api/projects", payload })));
  for (const retry of retries) {
    assert.equal(retry.statusCode, 200, retry.body);
    assert.deepEqual(retry.json(), { ...result, created: false });
  }
  const conflict = await server.inject({ method: "POST", url: "/api/projects", payload: { ...payload, name: "different" } });
  assert.equal(conflict.statusCode, 409);
  assert.equal(store.listProjects().length, 2);
  assert.equal(store.listAuditEvents().filter(a => a.targetId === result.project.id).length, 1);
});

test("invalid project payload and missing fund have no side effects", async (t) => {
  const store = createMemoryLedgerStore();
  const server = createServer({ ledgerStore: store, auth: { mode: "local-bypass" } });
  t.after(() => server.close());
  const before = JSON.stringify([store.listProjects(), store.listAuditEvents()]);
  const invalid = [null, {}, { ...payload, name: " " }, { ...payload, shortName: "" }, { ...payload, industry: "" },
    { ...payload, fundId: "" }, { ...payload, requestId: "bad-id" }, { ...payload, manager: null },
    { ...payload, collaborators: [] }, { ...payload, sourceChannel: 1 }, { ...payload, description: false },
    { ...payload, stage: "投后管理" }, { ...payload, actor: "冒充者" }];
  for (const body of invalid) {
    const response = await server.inject({ method: "POST", url: "/api/projects", payload: body });
    assert.equal(response.statusCode, 400, response.body);
  }
  const badFund = await server.inject({ method: "POST", url: "/api/projects", payload: { ...payload, fundId: "missing" } });
  assert.equal(badFund.statusCode, 404, badFund.body);
  assert.equal(badFund.json().error, "fund_not_found");
  assert.equal(JSON.stringify([store.listProjects(), store.listAuditEvents()]), before);
  const empty = await server.inject({ method: "POST", url: "/api/projects", payload: { ...payload, manager: "", collaborators: "", sourceChannel: "", description: "" } });
  assert.equal(empty.statusCode, 201, empty.body);
  assert.equal(empty.json().project.manager, "管理员");
});

test("project creation requires write permission and binds idempotency to authenticated identity", async (t) => {
  const store = createMemoryLedgerStore();
  const server = createServer({ ledgerStore: store, auth: { mode: "password", sessionSecret: "project-test-secret" } });
  t.after(() => server.close());
  const cookie = (id: string, role: "viewer" | "investment_manager") => registeredCookie(server,{ id, name: id, email: `${id}@example.local`, role }, "project-test-secret");
  const unauthenticated = await server.inject({ method: "POST", url: "/api/projects", payload });
  assert.equal(unauthenticated.statusCode, 401);
  const viewer = await server.inject({ method: "POST", url: "/api/projects", headers: { cookie: await cookie("viewer", "viewer") }, payload });
  assert.equal(viewer.statusCode, 403);
  const first = await server.inject({ method: "POST", url: "/api/projects", headers: { cookie: await cookie("manager-a", "investment_manager") }, payload });
  assert.equal(first.statusCode, 201, first.body);
  assert.equal(first.json().auditEvent.actor, "manager-a");
  const otherActor = await server.inject({ method: "POST", url: "/api/projects", headers: { cookie: await cookie("manager-b", "investment_manager") }, payload });
  assert.equal(otherActor.statusCode, 409);
});

test("project creation does not expose persistence errors or report success", async (t) => {
  const server = createServer({ ledgerStore: { ...createMemoryLedgerStore(), createProject: () => { throw new Error("secret sql/database failure"); } }, auth: { mode: "local-bypass" } });
  t.after(() => server.close());
  const result = await server.inject({ method: "POST", url: "/api/projects", payload });
  assert.equal(result.statusCode, 500);
  assert.deepEqual(result.json(), { error: "project_creation_failed" });
});

test("retry after project progression still identifies the initial request", async (t) => {
  const store = createMemoryLedgerStore();
  const server = createServer({ ledgerStore: store, auth: { mode: "local-bypass" } });
  t.after(() => server.close());
  const created = await server.inject({ method: "POST", url: "/api/projects", payload });
  store.updateProjectStage(created.json().project.id, { stage: "尽调" });
  const retry = await server.inject({ method: "POST", url: "/api/projects", payload });
  assert.equal(retry.statusCode, 200, retry.body);
  assert.equal(retry.json().project.stage, "尽调");
  assert.equal(retry.json().created, false);
  assert.deepEqual(retry.json().auditEvent, created.json().auditEvent);
});

test("simultaneous initial requests create one project and one audit", async (t) => {
  const store = createMemoryLedgerStore();
  const server = createServer({ ledgerStore: store, auth: { mode: "local-bypass" } });
  t.after(() => server.close());
  const responses = await Promise.all(Array.from({ length: 8 }, () => server.inject({ method: "POST", url: "/api/projects", payload })));
  assert.equal(responses.filter(response => response.statusCode === 201).length, 1);
  assert.equal(responses.filter(response => response.statusCode === 200).length, 7);
  assert.equal(store.listProjects().filter(project => project.id === `project-${payload.requestId}`).length, 1);
  assert.equal(store.listAuditEvents().filter(event => event.targetId === `project-${payload.requestId}`).length, 1);
});

test('any canonical initial lifecycle stage is recorded without approvals, deals or financial facts',async t=>{
 const {projectInitialStages}=await import('../src/ledger/store.ts');const {randomUUID}=await import('node:crypto');const store=createMemoryLedgerStore(),server=createServer({ledgerStore:store,auth:{mode:'local-bypass'}});t.after(()=>server.close());
 for(const stage of projectInitialStages){const body={...payload,requestId:randomUUID(),stage};const created=await server.inject({method:'POST',url:'/api/projects',payload:body});assert.equal(created.statusCode,201,created.body);const project=created.json().project;assert.equal(project.stage,stage);assert.equal(project.status,'拟投');assert.equal(project.amount,'未录入');assert.deepEqual(await store.readApprovals(project.id),[]);const snap=await store.readInvestmentLedgerSnapshot(),state=snap.states.find(s=>s.project.id===project.id)!;assert.deepEqual(state.deals,[]);assert.equal(state.postInvestment,undefined);const retry=await server.inject({method:'POST',url:'/api/projects',payload:body});assert.equal(retry.statusCode,200);const conflict=await server.inject({method:'POST',url:'/api/projects',payload:{...body,stage:stage==='初筛'?'退出':'初筛'}});assert.equal(conflict.statusCode,409);if(stage!=='初筛')assert.match(project.nextAction,/补录实际业务记录/);}
 for(const stage of ['',null,123,'已退出','投后管理',' 初筛 ']){const bad=await server.inject({method:'POST',url:'/api/projects',payload:{...payload,requestId:randomUUID(),stage}});assert.equal(bad.statusCode,400,bad.body);}
});
