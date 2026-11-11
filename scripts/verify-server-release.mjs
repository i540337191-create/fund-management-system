#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

if (hasFlag("--help") || hasFlag("-h")) {
  printHelp();
  process.exit(0);
}

const envFile = readOption("--release-env-file") ?? readOption("--env-file") ?? ".env";
const fileEnv = envFile && existsSync(resolveFromRoot(envFile)) ? readEnvFile(resolveFromRoot(envFile)) : {};
const releaseEnv = { ...fileEnv, ...process.env };
const baseUrl = normalizeBaseUrl(readOption("--base-url") ?? releaseEnv.RELEASE_BASE_URL ?? "http://127.0.0.1");
const writeChecks = hasFlag("--write");
const email = readOption("--email") ?? releaseEnv.ADMIN_EMAIL;
const password = readOption("--password") ?? releaseEnv.ADMIN_PASSWORD;
const writeMarker = readOption("--write-marker") ?? releaseEnv.RELEASE_WRITE_MARKER ?? new Date().toISOString();
const expectedTaskName = readOption("--expect-task-name") ?? releaseEnv.RELEASE_EXPECT_TASK_NAME;
const expectedWriteMarker =
  readOption("--expect-write-marker") ?? releaseEnv.RELEASE_EXPECT_WRITE_MARKER ?? releaseEnv.RELEASE_WRITE_MARKER;
let cookie = "";

const checks = [];

try {
  await check("health endpoint", async () => {
    const body = await request("/api/health");
    assert(body.ok === true, "health.ok is not true");
  });

  if (email && password) {
    await check("password login", async () => {
      const response = await rawRequest("/api/session/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      assert(response.ok, `login returned ${response.status}`);
      const setCookie = response.headers.get("set-cookie");
      assert(setCookie, "login did not return set-cookie");
      cookie = setCookie.split(";")[0];
    });
  }

  const sessionUser = await check("session endpoint", async () => {
    const body = await request("/api/session/me");
    assert(body.user?.id && body.user?.role, "session user identity is missing");
    return body.user;
  });

  const funds = await check("fund ledger read", async () => {
    const body = await request("/api/funds");
    assert(Array.isArray(body.funds), "funds is not an array");

    return body.funds;
  });

  const projects = await check("project ledger read", async () => {
    const body = await request("/api/projects");
    assert(Array.isArray(body.projects), "projects is not an array");

    return body.projects;
  });

  await check("task ledger read", async () => {
    const body = await request("/api/tasks");
    assert(Array.isArray(body.tasks), "tasks is not an array");
  });

  await check("material ledger read", async () => {
    const body = await request("/api/materials");
    assert(Array.isArray(body.materials), "materials is not an array");
  });

  await check("AI intake ledger read", async () => {
    const body = await request("/api/ai-intake-items");
    assert(Array.isArray(body.items), "AI intake items is not an array");
  });

  await check("meeting ledger read", async () => {
    const body = await request("/api/meetings");
    assert(Array.isArray(body.meetings), "meetings is not an array");
  });

  await check("report ledger read", async () => {
    const body = await request("/api/reports");
    assert(Array.isArray(body.reports), "reports is not an array");
    assert(Array.isArray(body.exportRecords), "report exportRecords is not an array");
  });

  await check("capital ledger read", async () => {
    const body = await request("/api/capital-records");
    assert(Array.isArray(body.capitalRecords), "capitalRecords is not an array");
  });

  await check("audit ledger read", async () => {
    const body = await request("/api/audit-events");
    assert(Array.isArray(body.auditEvents), "auditEvents is not an array");
  });

  await check("AI settings are masked", async () => {
    const body = await request("/api/ai/settings");
    const text = JSON.stringify(body);
    if (releaseEnv.QWEN_API_KEY) {
      assert(!text.includes(releaseEnv.QWEN_API_KEY), "AI settings expose the raw Qwen API key");
    }
  });

  if (writeChecks) {
    await runWriteChecks(projects, writeMarker, sessionUser);
  }

  if (expectedTaskName) {
    await check("expected task persists", async () => {
      const body = await request("/api/tasks");
      assert(
        body.tasks.some((task) => task.name === expectedTaskName),
        `expected task cannot be read back: ${expectedTaskName}`,
      );
    });
  }

  if (expectedWriteMarker) {
    await runExpectedWriteMarkerChecks(expectedWriteMarker, sessionUser);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        writeChecks,
        writeMarker: writeChecks ? writeMarker : undefined,
        checks,
        fundCount: funds.length,
        projectCount: projects.length,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(JSON.stringify({ ok: false, baseUrl, writeChecks, checks, error: error.message }, null, 2));
  process.exit(1);
}

async function runWriteChecks(projects, marker, sessionUser) {
  const project = projects.find((item) => item.id === "demo-robotics");
  assert(project, "demo-robotics project is missing for write checks");
  const markerId = safeId(marker);

  await check("task write persists", async () => {
    const created = await request("/api/tasks", {
      method: "POST",
      body: JSON.stringify({
        requestId: randomUUID(),
        projectId: project.id,
        name: `服务端发布验收任务 ${marker}`,
        type: "发布验收",
        stage: project.stage,
        ownerId: sessionUser.id,
        dueDate: new Date().toISOString().slice(0, 10),
        status: "未开始",
        priority: "高",
        relation: "服务端发布验收",
        note: "由 verify:release --write 创建，用于验证服务端持久化。",
      }),
    });
    assert(created.task?.id, "created task id is missing");
    assert(created.task.ownerId === sessionUser.id, "created task owner differs from session identity");
    assert(Number.isInteger(created.task.revision), "created task revision is missing");
    const updated = await request(`/api/tasks/${encodeURIComponent(created.task.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        requestId: randomUUID(),
        expectedRevision: created.task.revision,
        status: "进行中",
        note: `服务端发布验收任务已更新 ${marker}`,
      }),
    });
    assert(updated.task?.status === "进行中", "updated task status is incorrect");
    const tasks = await request("/api/tasks");
    assert(
      tasks.tasks.some((task) => task.id === created.task.id && task.status === "进行中" && task.note === `服务端发布验收任务已更新 ${marker}`),
      "updated task cannot be read back",
    );
    const audit = await request("/api/audit-events");
    assert(
      audit.auditEvents.some((event) => taskAuditBySession(event, created.task.id, sessionUser.id)),
      "task update audit cannot be read back",
    );
  });

  await check("project stage bypass is blocked", async () => {
    const response = await rawRequest(`/api/projects/${encodeURIComponent(project.id)}/stage`, {
      method: "PATCH",
      body: JSON.stringify({ stage: project.stage === "投后管理" ? "立项" : "投后管理" }),
    });
    assert(response.status === 409, `project stage bypass returned ${response.status}`);
    const body = await response.json();
    assert(body.error === "project_stage_managed_by_workflow", "stage bypass error is incorrect");
    const detail = await request(`/api/projects/${encodeURIComponent(project.id)}`);
    assert(detail.project?.stage === project.stage, "blocked stage request changed the project");
  });

  await check("risk handling audit persists", async () => {
    const title = `发布验收风险处理 ${marker}`;
    const result = await request("/api/risks/handle", {
      method: "POST",
      body: JSON.stringify({
        title,
        target: project.shortName ?? project.name,
        type: "发布验收",
        level: "中",
        source: "verify:release",
        summary: "验证风险处理写接口和审计事件。",
        projectId: project.id,
        result: "服务端发布验收已确认。",
      }),
    });
    assert(result.auditEvent?.action === "确认风险处理", "risk audit action is incorrect");
    const audit = await request("/api/audit-events");
    assert(audit.auditEvents.some((event) => event.action === "确认风险处理" && event.targetName === title), "risk audit cannot be read back");
  });

  await check("material archive persists", async () => {
    const materialName = `服务端发布验收资料 ${marker}.xlsx`;
    const source = `verify:release:${marker}`;
    const created = await request("/api/materials/archive", {
      method: "POST",
      body: JSON.stringify({
        name: materialName,
        type: "财务资料",
        uploader: project.manager ?? "演示投资经理",
        time: "2026-06-11",
        source,
        status: "已摘要",
        quotes: "2",
        project: project.name,
      }),
    });
    assert(created.material?.id, "created material id is missing");

    const materials = await request("/api/materials");
    assert(
      materials.materials.some((material) => material.name === materialName && material.source === source),
      "archived material cannot be read back",
    );
  });

  await check("AI intake archive persists", async () => {
    const name=`服务端发布验收 AI 收件箱 ${marker}.txt`;
    const materials=await request('/api/materials');
    let original=materials.materials.find(m=>m.name===name);
    if(!original){const uploaded=await request('/api/materials/upload?'+new URLSearchParams({requestId:randomUUID(),projectId:project.id,type:'财务资料',name}),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:Buffer.from('隔离发布验收原件。请经办人补齐本季度财务资料，负责人和期限待人工确认。')});original=uploaded.material;}
    const created=await request('/api/ai-intake-items/from-material',{method:'POST',body:JSON.stringify({materialId:original.id,inputType:'财务报表'})});
    assert(created.item?.sourceMaterialId===original.id,'AI intake original is missing');
    const archived=await request(`/api/ai-intake-items/${encodeURIComponent(created.item.id)}/archive`,{method:'POST'});
    assert(archived.item?.status==='已归档','AI intake item was not archived');
    assert(archived.material?.id===original.id,'AI intake must reuse original');
    assert(Array.isArray(archived.tasks)&&archived.tasks.length===0,'AI suggestions must not invent confirmed tasks');
    const items=await request('/api/ai-intake-items');assert(items.items.some(item=>item.id===created.item.id&&item.status==='已归档'),'archived AI intake cannot be read back');
  });

  await check("meeting confirmation persists", async () => {
    const confirmed = await request("/api/meetings/meeting-demo-robotics-20260608/confirm", { method: "POST" });
    assert(confirmed.meeting?.status === "已归档", "meeting status is not confirmed");
    assert(confirmed.material?.id === "material-meeting-meeting-demo-robotics-20260608", "meeting material is missing");
    assert(Array.isArray(confirmed.tasks) && confirmed.tasks.length > 0, "meeting tasks are missing");

    const meetings = await request("/api/meetings");
    assert(
      meetings.meetings.some((meeting) => meeting.id === "meeting-demo-robotics-20260608" && meeting.status === "已归档"),
      "confirmed meeting cannot be read back",
    );
  });

  await check("report export persists", async () => {
    const reportName = `服务端发布验收报告 ${marker}`;
    const created = await request("/api/reports", {
      method: "POST",
      body: JSON.stringify({
        name: reportName,
        sections:[{title:'验收说明',text:'本报告仅用于隔离发布验证，未包含实际投资结论。'}],
        target: project.name,
        type: "企业监控报告",
        status: "草稿",
        owner: project.manager ?? "演示投资经理",
        updatedAt: "2026-06-11 10:00",
      }),
    });
    assert(created.report?.id, "created report id is missing");

    const approved = await request(`/api/reports/${encodeURIComponent(created.report.id)}/approve`, { method: "POST", body: JSON.stringify({expectedUpdatedAt:created.report.updatedAt}) });
    assert(approved.report?.status === "已完成", "approved report status is incorrect");

    const exported = await request(`/api/reports/${encodeURIComponent(created.report.id)}/export`, {
      method: "POST",
      body: JSON.stringify({ format: "PDF" }),
    });
    assert(exported.exportRecord?.reportId === created.report.id, "report export record is missing");

    const reports = await request("/api/reports");
    assert(reports.reports.some((report) => report.name === reportName && report.status === "已完成"), "completed report cannot be read back");
    assert(reports.exportRecords.some((record) => record.reportName === reportName), "report export record cannot be read back");
  });

  await check("capital fee confirmation persists", async () => {
    const source = `verify:release:${marker}`;
    const created = await request("/api/capital-records", {
      method: "POST",
      body: JSON.stringify({
        company: project.name,
        fund: project.fund,
        received: "3000 万元",
        date: "2026-06-11",
        rule: "年化 2%，按日计费",
        receivable: "164,384 元",
        dueDate: "2026-06-20",
        status: "未收",
        source,
      }),
    });
    assert(created.capitalRecord?.id, "created capital record id is missing");

    const confirmed = await request(`/api/capital-records/${encodeURIComponent(created.capitalRecord.id)}/confirm`, { method: "POST" });
    assert(confirmed.capitalRecord?.status === "已收", "confirmed capital record status is incorrect");

    const capital = await request("/api/capital-records");
    assert(
      capital.capitalRecords.some((record) => record.id === created.capitalRecord.id && record.status === "已收" && record.source === source),
      "confirmed capital record cannot be read back",
    );
  });

  await check("investor signature persists", async () => {
    const investorId = "investor-fundapp-growth-i-beijing-fundapp";
    const current = await request(`/api/funds/fundapp-growth-i/investors/${encodeURIComponent(investorId)}`);
    const confirmed = await request(`/api/fund-investors/${encodeURIComponent(investorId)}/confirm-signature`, { method: "POST", body: JSON.stringify({requestId: randomUUID(), expectedRevision: current.investor.revision}) });
    assert(confirmed.investor?.signStatus === "已签署", "confirmed investor signature status is incorrect");

    const fund = await request("/api/funds/fundapp-growth-i");
    assert(
      fund.investors.some((investor) => investor.id === investorId && investor.signStatus === "已签署"),
      "confirmed investor signature cannot be read back",
    );
  });
}

async function runExpectedWriteMarkerChecks(marker, sessionUser) {
  const markerId = safeId(marker);
  await check("expected write marker task persists", async () => {
    const body = await request("/api/tasks");
    assert(
      body.tasks.some((task) => task.name === `服务端发布验收任务 ${marker}` && task.status === "进行中" && task.note === `服务端发布验收任务已更新 ${marker}`),
      `expected release task cannot be read back for marker: ${marker}`,
    );
  });

  await check("expected write marker task actor persists", async () => {
    const tasks = await request("/api/tasks");
    const task = tasks.tasks.find(item => item.name === `服务端发布验收任务 ${marker}`);
    assert(task?.id && task.ownerId === sessionUser.id, "release task owner differs from session identity");
    const audit = await request("/api/audit-events");
    assert(audit.auditEvents.some(event => taskAuditBySession(event, task.id, sessionUser.id)), "release task audit does not record the session actor ID");
  });

  await check("expected write marker risk handling persists", async () => {
    const title = `发布验收风险处理 ${marker}`;
    const audit = await request("/api/audit-events");
    assert(
      audit.auditEvents.some(
        (event) => event.action === "确认风险处理" && event.targetName === title && event.detail.includes("服务端发布验收已确认"),
      ),
      `expected risk handling audit cannot be read back: ${title}`,
    );
  });

  await check("expected write marker report export persists", async () => {
    const reportName = `服务端发布验收报告 ${marker}`;
    const body = await request("/api/reports");
    assert(body.reports.some((report) => report.name === reportName && report.status === "已完成"), `expected report cannot be read back: ${reportName}`);
    assert(body.exportRecords.some((record) => record.reportName === reportName), `expected report export cannot be read back: ${reportName}`);
  });

  await check("expected write marker material archive persists", async () => {
    const materialName = `服务端发布验收资料 ${marker}.xlsx`;
    const source = `verify:release:${marker}`;
    const body = await request("/api/materials");
    assert(
      body.materials.some((material) => material.name === materialName && material.source === source),
      `expected archived material cannot be read back: ${materialName}`,
    );
  });

  await check("expected write marker AI intake archive persists", async () => {
    const items=await request('/api/ai-intake-items'),materials=await request('/api/materials');
    const item=items.items.find(item=>(item.title===`服务端发布验收 AI 收件箱 ${marker}.txt`||item.id===`verify-ai-intake-${markerId}`)&&item.status==='已归档');
    assert(item,'expected AI intake cannot be read back');
    const materialId=item.sourceMaterialId??`material-ai-${item.id}`;
    assert(materials.materials.some(material=>material.id===materialId),'expected AI original missing');
  });

  await check("expected meeting confirmation persists", async () => {
    const meetings = await request("/api/meetings");
    assert(
      meetings.meetings.some((meeting) => meeting.id === "meeting-demo-robotics-20260608" && meeting.status === "已归档"),
      "expected confirmed meeting cannot be read back",
    );
  });

  await check("expected write marker capital confirmation persists", async () => {
    const source = `verify:release:${marker}`;
    const body = await request("/api/capital-records");
    assert(
      body.capitalRecords.some((record) => record.source === source && record.status === "已收"),
      `expected confirmed capital record cannot be read back for marker: ${marker}`,
    );
  });

  await check("expected investor signature persists", async () => {
    const investorId = "investor-fundapp-growth-i-beijing-fundapp";
    const fund = await request("/api/funds/fundapp-growth-i");
    assert(
      fund.investors.some((investor) => investor.id === investorId && investor.signStatus === "已签署"),
      "expected investor signature cannot be read back",
    );
  });

  await check("expected write marker audit events persist", async () => {
    const tasks = await request("/api/tasks");
    const audit = await request("/api/audit-events");
    const reportName = `服务端发布验收报告 ${marker}`;
    const task = tasks.tasks.find((item) => item.name === `服务端发布验收任务 ${marker}`);
    assert(task?.id, `expected release task id cannot be read back for marker: ${marker}`);
    assert(
      audit.auditEvents.some((event) => event.action === "更新任务" && event.detail.includes(task.id)),
      "expected task update audit cannot be read back",
    );
    assert(
      audit.auditEvents.some((event) => event.action === "生成报告导出包" && event.targetName === reportName),
      `expected report export audit cannot be read back: ${reportName}`,
    );
    assert(
      audit.auditEvents.some((event) => event.action === "确认资料归档" && event.targetName === `服务端发布验收资料 ${marker}.xlsx`),
      "expected material archive audit cannot be read back",
    );
    assert(
      audit.auditEvents.some((event) => event.action === "确认 AI 收件箱归档" && [ `服务端发布验收 AI 收件箱 ${marker}.txt`, `服务端发布验收 AI 收件箱 ${marker}` ].includes(event.targetName)),
      "expected AI intake archive audit cannot be read back",
    );
    assert(
      audit.auditEvents.some((event) => event.action === "确认会议纪要" && event.targetName === "演示智能设备投后月度沟通会"),
      "expected meeting confirmation audit cannot be read back",
    );
    const capital = await request('/api/capital-records');
    const capitalRecord = capital.capitalRecords.find(record => record.source === `verify:release:${marker}`);
    assert(capitalRecord?.id, 'expected capital record id cannot be read back');
    assert(
      audit.auditEvents.some((event) => event.action === "确认管理费到账" && event.targetType === '资金' && event.targetId === capitalRecord.id),
      "expected exact capital confirmation audit cannot be read back",
    );
    assert(
      audit.auditEvents.some((event) => event.action === "确认募集签署" && event.targetType === "LP" && event.targetId === "investor-fundapp-growth-i-beijing-fundapp"),
      "expected investor signature audit cannot be read back",
    );
  });
}

async function check(name, fn) {
  const startedAt = Date.now();
  try {
    const result = await fn();
    checks.push({ name, ok: true, ms: Date.now() - startedAt });
    return result;
  } catch (error) {
    checks.push({ name, ok: false, ms: Date.now() - startedAt, error: error.message });
    throw error;
  }
}

function taskAuditBySession(event, taskId, actorId) {
  if (event.action !== "更新任务" || !event.detail?.includes(taskId)) return false;
  try { return JSON.parse(event.detail).actorId === actorId; } catch { return false; }
}

async function request(path, init = {}) {
  const response = await rawRequest(path, init);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${path} returned non-JSON response: ${text.slice(0, 160)}`);
  }
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

function rawRequest(path, init = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...init.headers,
    },
  });
}

function hasFlag(flag) {
  return args.includes(flag);
}

function readOption(name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function normalizeBaseUrl(value) {
  return value.replace(/\/$/, "");
}

function resolveFromRoot(value) {
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

function readEnvFile(filePath) {
  const env = {};
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();
    env[key] = stripQuotes(value);
  }
  return env;
}

function stripQuotes(value) {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function safeId(value) {
  return value.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "marker";
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function printHelp() {
  console.log(`
Usage:
  npm run verify:release
  npm run verify:release -- --release-env-file .env --base-url https://fund.example.com --write

Options:
  --base-url   Server origin. Defaults to RELEASE_BASE_URL or http://127.0.0.1.
  --release-env-file Release env file to read for RELEASE_BASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD, QWEN_API_KEY and release markers. Defaults to .env.
  --env-file   Backward-compatible alias; avoid on Node 25 because it conflicts with Node runtime flags.
  --write      Also run write persistence checks. This creates and updates a task, verifies project stage bypass is blocked, writes risk handling, archives a material, exports a report, confirms a capital fee, and confirms one investor signature.
  --write-marker       Stable suffix used for write-check task and risk names. Defaults to RELEASE_WRITE_MARKER or the current timestamp.
  --expect-task-name   Assert that a task with this exact name can be read. Defaults to RELEASE_EXPECT_TASK_NAME.
  --expect-write-marker Assert that all write-check records for this marker can be read. Defaults to RELEASE_EXPECT_WRITE_MARKER or RELEASE_WRITE_MARKER.
  --email      Admin email override for APP_AUTH_MODE=password.
  --password   Admin password override for APP_AUTH_MODE=password.
`);
}
