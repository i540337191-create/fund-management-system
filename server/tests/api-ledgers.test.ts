import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../src/index.ts";

test("ledger read endpoints expose seeded business records", async () => {
  const server = createServer({ auth: { mode: "local-bypass" } });

  const funds = await server.inject({ method: "GET", url: "/api/funds" });
  const fund = await server.inject({ method: "GET", url: "/api/funds/fundapp-growth-i" });
  const projects = await server.inject({ method: "GET", url: "/api/projects" });
  const project = await server.inject({ method: "GET", url: "/api/projects/demo-robotics" });
  const tasks = await server.inject({ method: "GET", url: "/api/tasks" });
  const materials = await server.inject({ method: "GET", url: "/api/materials" });
  const aiIntake = await server.inject({ method: "GET", url: "/api/ai-intake-items" });
  const meetings = await server.inject({ method: "GET", url: "/api/meetings" });
  const reports = await server.inject({ method: "GET", url: "/api/reports" });
  const capital = await server.inject({ method: "GET", url: "/api/capital-records" });
  const audit = await server.inject({ method: "GET", url: "/api/audit-events" });

  assert.equal(funds.statusCode, 200);
  assert.equal(fund.statusCode, 200);
  assert.equal(projects.statusCode, 200);
  assert.equal(project.statusCode, 200);
  assert.equal(tasks.statusCode, 200);
  assert.equal(materials.statusCode, 200);
  assert.equal(aiIntake.statusCode, 200);
  assert.equal(meetings.statusCode, 200);
  assert.equal(reports.statusCode, 200);
  assert.equal(capital.statusCode, 200);
  assert.equal(audit.statusCode, 200);

  assert.equal(funds.json().funds[0].id, "fundapp-growth-i");
  assert.equal(fund.json().fund.id, "fundapp-growth-i");
  assert.equal(fund.json().investors[0].id, "investor-fundapp-growth-i-beijing-fundapp");
  assert.equal(fund.json().documents[0].fundId, "fundapp-growth-i");
  assert.equal(fund.json().clauses[0].fundId, "fundapp-growth-i");
  assert.equal(projects.json().projects[0].id, "demo-robotics");
  assert.equal(project.json().project.id, "demo-robotics");
  assert.equal(Array.isArray(project.json().meetings), true);
  assert.equal(tasks.json().tasks[0].projectId, "demo-robotics");
  assert.deepEqual(materials.json(), { materials: [] });
  assert.ok(aiIntake.json().items.some((item:{id:string})=>item.id==="meeting-20260608"));
  assert.equal(meetings.json().meetings[0].id, "meeting-demo-robotics-20260608");
  assert.equal(reports.json().reports[0].id, "report-fundapp-growth-i-q1-2026");
  assert.deepEqual(reports.json().exportRecords, []);
  assert.equal(capital.json().capitalRecords[0].id, "capital-demo-robotics-20260427");
  assert.equal(audit.json().auditEvents[0].id, "audit-fundapp-growth-i-init");
});

test("task writes bind identity, revision and audit; raw stage changes are blocked", async (t) => {
 const server=createServer({auth:{mode:'local-bypass'}});t.after(()=>server.close());
 const created=await server.inject({method:'POST',url:'/api/tasks',payload:{requestId:'ce350888-7421-4aa5-802c-8955f5ce7a96',projectId:'demo-robotics',name:'材料核验',type:'资料补充',stage:'投后管理',ownerId:'user-admin',dueDate:'2026-10-30',status:'未开始',priority:'高',relation:'验收',note:''}});
 assert.equal(created.statusCode,201,created.body);const task=created.json().task;
 assert.equal(task.ownerId,'user-admin'); assert.equal(created.json().auditEvent.actor,'管理员');
 const patched=await server.inject({method:'PATCH',url:`/api/tasks/${task.id}`,payload:{requestId:'ce350888-7421-4aa5-802c-8955f5ce7a97',expectedRevision:1,status:'进行中'}});
 assert.equal(patched.statusCode,200,patched.body);assert.equal(patched.json().task.revision,2);
 const stage=await server.inject({method:'PATCH',url:'/api/projects/demo-robotics/stage',payload:{stage:'投后管理',actor:'spoof'}});
 assert.equal(stage.statusCode,409);assert.equal(stage.json().error,'project_stage_managed_by_workflow');
});

test("risk handle endpoint persists the risk handling record and audit event", async () => {
  const server = createServer({ auth: { mode: "local-bypass" } });

  const response = await server.inject({
    method: "POST",
    url: "/api/risks/handle",
    payload: {
      title: "知识产权变更待复核",
      target: "演示智能设备",
      type: "知识产权",
      level: "中",
      source: "国家知识产权局",
      time: "2026-06-11",
      summary: "核心专利权利人变更，需要复核许可范围。",
      projectId: "demo-robotics",
      actor: "演示投资经理",
      result: "已确认责任人并保留来源材料。",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().risk.status, "已处理");
  assert.equal(response.json().auditEvent.action, "确认风险处理");

  const audit = await server.inject({ method: "GET", url: "/api/audit-events" });
  assert.ok(
    audit
      .json()
      .auditEvents.some(
        (event: { targetId: string; action: string; targetName: string; detail: string }) =>
          event.targetId === "demo-robotics" &&
          event.action === "确认风险处理" &&
          event.targetName === "知识产权变更待复核" &&
          event.detail.includes("已确认责任人"),
      ),
  );
});

test("material archive endpoint persists the material and audit event", async () => {
  const server = createServer({ auth: { mode: "local-bypass" } });

  const response = await server.inject({
    method: "POST",
    url: "/api/materials/archive",
    payload: {
      name: "演示智能设备 2026 Q2 经营数据.xlsx",
      type: "财务资料",
      uploader: "演示投资经理",
      time: "2026-06-11",
      source: "AI 收件箱 / Excel",
      status: "已摘要",
      quotes: "3",
      project: "演示智能设备有限公司",
    },
  });

  assert.equal(response.statusCode, 201);
  const materialId = response.json().material.id;
  const materials = await server.inject({ method: "GET", url: "/api/materials" });
  const audit = await server.inject({ method: "GET", url: "/api/audit-events" });

  assert.equal(materials.json().materials.find((item: { id: string }) => item.id === materialId).name, "演示智能设备 2026 Q2 经营数据.xlsx");
  assert.ok(audit.json().auditEvents.some((event: { targetId: string; action: string }) => event.targetId === materialId && event.action === "确认资料归档"));
});

test("AI intake endpoints retain historical archive behavior and reject client-generated intake", async () => {
  const store=createMemoryLedgerStore();
  const server = createServer({ledgerStore:store, auth: { mode: "local-bypass" } });

  const updated = await server.inject({
    method: "PATCH",
    url: "/api/ai-intake-items/agreement-demo-robotics/suggestion",
    payload: {
      suggestedFund: "示例成长一期基金",
      suggestedProject: "演示智能设备有限公司",
      suggestedPath: "项目档案 / 协议条款 / 投资协议 / 已复核",
    },
  });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.json().item.suggestedPath, "项目档案 / 协议条款 / 投资协议 / 已复核");

  const rejected = await server.inject({
    method: "POST",
    url: "/api/ai-intake-items/meeting-20260608/reject",
    payload: { reviewNote: "需求会议先退回补充项目归属。" },
  });
  assert.equal(rejected.statusCode, 200);
  assert.equal(rejected.json().item.status, "已退回");

  const simulated = await server.inject({
    method: "POST",
    url: "/api/ai-intake-items",
    payload: {
      id: "simulated-financial-server-test",
      title: "模拟上传：服务端测试财务大表",
      inputType: "财务报表",
      source: "模拟上传 / Excel",
      submittedBy: "财务",
      submittedAt: "2026-06-11 10:00",
      summary: "服务端测试 AI 收件箱创建。",
      confidence: "96%",
      suggestedFund: "示例成长一期基金",
      suggestedProject: "演示智能设备有限公司",
      suggestedPath: "基金档案 / 账户资金 / 服务端测试",
      extracted: ["到账金额", "管理费应收"],
      generatedTasks: ["财务确认管理费口径"],
      status: "待确认",
    },
  });
  assert.equal(simulated.statusCode, 410);

  await store.createAiIntakeItem({
      id: "simulated-financial-server-test",
      title: "模拟上传：服务端测试财务大表",
      inputType: "财务报表",
      source: "模拟上传 / Excel",
      submittedBy: "财务",
      submittedAt: "2026-06-11 10:00",
      summary: "服务端测试 AI 收件箱创建。",
      confidence: "96%",
      suggestedFund: "示例成长一期基金",
      suggestedProject: "演示智能设备有限公司",
      suggestedPath: "基金档案 / 账户资金 / 服务端测试",
      extracted: ["到账金额", "管理费应收"],
      generatedTasks: ["财务确认管理费口径"],
      status: "待确认",
    });

  const archived = await server.inject({
    method: "POST",
    url: "/api/ai-intake-items/simulated-financial-server-test/archive",
  });
  assert.equal(archived.statusCode, 201);
  assert.equal(archived.json().item.status, "已归档");
  assert.equal(archived.json().fundDocument.fundId, "fundapp-growth-i");
  assert.equal(archived.json().material.projectId, "demo-robotics");
  assert.equal(archived.json().tasks.length, 0);

  const items = await server.inject({ method: "GET", url: "/api/ai-intake-items" });
  const materials = await server.inject({ method: "GET", url: "/api/materials" });
  const audit = await server.inject({ method: "GET", url: "/api/audit-events" });

  assert.ok(items.json().items.some((item: { id: string; status: string }) => item.id === "simulated-financial-server-test" && item.status === "已归档"));
  assert.ok(materials.json().materials.some((material: { id: string }) => material.id === "material-ai-simulated-financial-server-test"));
  assert.ok(
    audit
      .json()
      .auditEvents.some(
        (event: { action: string; targetName: string }) =>
          event.action === "确认 AI 收件箱归档" && event.targetName === "模拟上传：服务端测试财务大表",
      ),
  );
});

test("meeting confirmation endpoint persists meeting status, material, tasks, and audit events", async () => {
  const server = createServer({ auth: { mode: "local-bypass" } });

  const confirmed = await server.inject({
    method: "POST",
    url: "/api/meetings/meeting-demo-robotics-20260608/confirm",
  });
  assert.equal(confirmed.statusCode, 200);
  assert.equal(confirmed.json().meeting.status, "已归档");
  assert.equal(confirmed.json().material.id, "material-meeting-meeting-demo-robotics-20260608");
  assert.equal(confirmed.json().tasks.length, 3);

  const meetings = await server.inject({ method: "GET", url: "/api/meetings" });
  const tasks = await server.inject({ method: "GET", url: "/api/tasks" });
  const audit = await server.inject({ method: "GET", url: "/api/audit-events" });

  assert.ok(meetings.json().meetings.some((meeting: { id: string; status: string }) => meeting.id === "meeting-demo-robotics-20260608" && meeting.status === "已归档"));
  assert.ok(tasks.json().tasks.some((task: { id: string }) => task.id === "meeting-demo-robotics-1"));
  assert.ok(
    audit
      .json()
      .auditEvents.some(
        (event: { action: string; targetName: string }) =>
          event.action === "确认会议纪要" && event.targetName === "演示智能设备投后月度沟通会",
      ),
  );
});

test("report write endpoints persist authored content, explicit approval, actual files, and audit events", async (t) => {
  const server = createServer({ auth: { mode: "local-bypass" } });

  const created = await server.inject({
    method: "POST",
    url: "/api/reports",
    payload: {
      name: "演示智能设备服务端化进展报告",
      target: "演示智能设备有限公司",
      type: "企业监控报告",
      status: "草稿",
      owner: "演示投资经理",
      updatedAt: "2026-06-11 10:00",
    },
  });
  assert.equal(created.statusCode, 201);
  const reportId = created.json().report.id;
  t.after(() => server.close());
  const emptyExport = await server.inject({ method: "POST", url: `/api/reports/${reportId}/export`, payload: { format: "PDF" } });
  assert.equal(emptyExport.statusCode, 409);
  assert.equal(emptyExport.json().error, "report_content_required");
  const sections = [{ title: "本期进展", text: "本报告为接口工程验收，内容由经办人明确填写；不代表已取得真实经营或财务结论。" }];
  const saved = await server.inject({ method: "PATCH", url: `/api/reports/${reportId}/content`, payload: { sections, expectedUpdatedAt: created.json().report.updatedAt } });
  assert.equal(saved.statusCode, 200, saved.body);
  assert.deepEqual(saved.json().report.sections, sections);
  assert.equal(saved.json().report.status, "草稿");
  const unapproved = await server.inject({ method: "POST", url: `/api/reports/${reportId}/export`, payload: { format: "PDF" } });
  assert.equal(unapproved.statusCode, 409);
  assert.equal(unapproved.json().error, "report_not_approved");

  const approved = await server.inject({ method: "POST", url: `/api/reports/${reportId}/approve`, payload: {expectedUpdatedAt:saved.json().report.updatedAt} });
  assert.equal(approved.statusCode, 200);
  assert.equal(approved.json().report.status, "已完成");

  const exported = await server.inject({
    method: "POST",
    url: `/api/reports/${reportId}/export`,
    payload: { format: "PDF" },
  });
  assert.equal(exported.statusCode, 201);
  assert.equal(exported.json().exportRecord.reportId, reportId);
  assert.deepEqual(exported.json().exportRecord.sectionsSnapshot, sections);
  assert.equal(exported.json().exportRecord.downloadMimeType, "application/pdf");
  const file = await server.inject({ method: "GET", url: `/api/reports/exports/${exported.json().exportRecord.id}/file` });
  assert.equal(file.statusCode, 200, file.body);
  assert.equal(file.rawPayload.subarray(0, 5).toString(), "%PDF-");

  const audit = await server.inject({ method: "GET", url: "/api/audit-events" });
  const reports = await server.inject({ method: "GET", url: "/api/reports" });
  const actions = audit.json().auditEvents
    .filter((event: { targetId: string }) => event.targetId === reportId)
    .map((event: { action: string }) => event.action);

  assert.ok(actions.includes("保存报告草稿"));
  assert.ok(actions.includes("保存报告正文"));
  assert.ok(actions.includes("审核通过报告"));
  assert.ok(actions.includes("生成报告导出包"));
  assert.ok(reports.json().exportRecords.some((record: { reportId: string }) => record.reportId === reportId));
});

test("capital and investor write endpoints persist row changes and audit events", async () => {
  const server = createServer({ auth: { mode: "local-bypass" } });

  const capital = await server.inject({
    method: "POST",
    url: "/api/capital-records",
    payload: {
      company: "演示先进材料有限公司",
      fund: "示例成长一期基金",
      received: "2500 万元",
      date: "2026-06-11",
      rule: "年化 1.8%，按季计费",
      receivable: "296,712 元",
      dueDate: "2026-06-20",
      status: "未收",
    },
  });
  assert.equal(capital.statusCode, 201);
  const capitalId = capital.json().capitalRecord.id;

  const confirmedCapital = await server.inject({
    method: "POST",
    url: `/api/capital-records/${capitalId}/confirm`,
  });
  assert.equal(confirmedCapital.statusCode, 200);
  assert.equal(confirmedCapital.json().capitalRecord.status, "已收");

  const confirmedInvestor = await server.inject({
    method: "POST",
    url: "/api/fund-investors/investor-fundapp-growth-i-beijing-fundapp/confirm-signature",
    payload:{requestId:"c4aa0000-0000-4000-8000-000000000001",expectedRevision:1},
  });
  assert.equal(confirmedInvestor.statusCode, 200);
  assert.equal(confirmedInvestor.json().investor.signStatus, "已签署");

  const audit = await server.inject({ method: "GET", url: "/api/audit-events" });
  const actions = audit.json().auditEvents.map((event: { action: string }) => event.action);

  assert.ok(actions.includes("创建资金事项"));
  assert.ok(actions.includes("确认管理费到账"));
  assert.ok(actions.includes("确认募集签署"));
});
