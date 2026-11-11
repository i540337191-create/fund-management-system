import assert from "node:assert/strict";
import test from "node:test";
import { fundClauseMonitors, funds } from "../src/data/funds.ts";
import { projects } from "../src/data/projects.ts";
import { createClauseReminderAuditEvent, createClauseReminderTask } from "../src/lib/clauseWorkflow.ts";

test("creates a clause reminder task bound to the related project", () => {
  const fund = funds.find((item) => item.id === "fundapp-growth-i");
  const clause = fundClauseMonitors.find((item) => item.title === "演示智能设备业绩承诺监控");
  assert.ok(fund);
  assert.ok(clause);

  const result = createClauseReminderTask({ clause, fund, projects, createdAt: "2026-06-10" });

  assert.equal(result.projectId, "demo-robotics");
  assert.equal(result.task.id, "clause-demo-robotics-u6f14-u793a-u667a-u80fd-u8bbe-u5907-ye-ji-cheng-nuo-jian-kong");
  assert.equal(result.task.name, "核查演示智能设备业绩承诺监控");
  assert.equal(result.task.type, "条款监控");
  assert.equal(result.task.owner, "演示投资经理");
  assert.equal(result.task.dueDate, "2026-06-17");
  assert.match(result.task.note, /投资协议第 6.2 条/);
});

test("creates an audit event for a clause reminder", () => {
  const fund = funds.find((item) => item.id === "fundapp-growth-i");
  const clause = fundClauseMonitors.find((item) => item.title === "基金季度报告提交");
  assert.ok(fund);
  assert.ok(clause);

  const event = createClauseReminderAuditEvent({
    clause,
    fund,
    actor: "演示投资经理",
    createdAt: "2026-06-10 19:40",
  });

  assert.equal(event.module, "基金账本");
  assert.equal(event.action, "生成条款提醒");
  assert.equal(event.targetId, "fundapp-growth-i");
  assert.match(event.detail, /每季度结束后 15 个工作日/);
});
