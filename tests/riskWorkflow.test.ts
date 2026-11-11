import assert from "node:assert/strict";
import test from "node:test";
import { projects } from "../src/data/projects.ts";
import { risks } from "../src/data/risks.ts";
import { createRiskAuditEvent, createRiskDecisionDetail } from "../src/lib/riskWorkflow.ts";

test("creates a risk detail with source, impact, owner, due date, and action", () => {
  const risk = risks.find((item) => item.title.includes("新增开庭公告"));
  assert.ok(risk);

  const detail = createRiskDecisionDetail(risk, projects, "2026-06-10");

  assert.equal(detail.projectId, "beijing-fundapp-new-energy");
  assert.equal(detail.owner, "演示研究员");
  assert.equal(detail.dueDate, "2026-06-11");
  assert.equal(detail.impact, "投决前必须完成法务核查，必要时调整投资委员会材料。");
  assert.equal(detail.suggestedAction, "立即创建风险核查任务，并要求法务补充来源材料。");
  assert.deepEqual(detail.sources, ["人民法院公告网", "风险监控 / 诉讼信息"]);
});

test("creates an audit event when a risk is marked handled", () => {
  const risk = risks.find((item) => item.title.includes("知识产权变更"));
  assert.ok(risk);

  const event = createRiskAuditEvent(risk, projects, {
    actor: "演示投资经理",
    handledAt: "2026-06-10 19:30",
    result: "已要求法务复核专利权利人变更文件。",
  });

  assert.equal(event.module, "风险监控");
  assert.equal(event.action, "确认风险处理");
  assert.equal(event.targetId, "demo-robotics");
  assert.match(event.detail, /法务复核/);
});
