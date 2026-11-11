import assert from "node:assert/strict";
import test from "node:test";
import {
  createAuditEvent,
  createAuditJsonExportPackage,
  filterAuditEvents,
  formatAuditEvent,
  prependUniqueAuditEvent,
  type AuditEvent,
} from "../src/lib/auditTrail.ts";

test("creates stable audit events and avoids duplicate prepend", () => {
  const event = createAuditEvent({
    module: "资金事项",
    action: "确认到账记录",
    targetType: "资金",
    targetId: "capital-demo-20260427",
    targetName: "演示智能设备 3000 万到账",
    actor: "演示投资经理",
    time: "2026-06-10 19:20",
    detail: "AI 数字员工识别到账信息，人工确认后写入资金事项。",
    source: "AI 数字员工",
  });

  assert.equal(event.id, "audit-capital-demo-20260427-que-ren-dao-zhang-ji-lu-2026-06-10-19-20");
  assert.equal(formatAuditEvent(event), "2026-06-10 19:20 演示投资经理在资金事项确认到账记录：演示智能设备 3000 万到账");

  const once = prependUniqueAuditEvent([], event);
  const twice = prependUniqueAuditEvent(once, event);

  assert.equal(twice.length, 1);
});

test("filters audit events by module or target", () => {
  const events: AuditEvent[] = [
    createAuditEvent({
      module: "报告中心",
      action: "保存报告草稿",
      targetType: "报告",
      targetId: "report-q2",
      targetName: "二季度运营报告",
      actor: "演示财务经理",
      time: "2026-06-10 18:30",
      detail: "保存报告并生成缺失项任务。",
    }),
    createAuditEvent({
      module: "会议纪要",
      action: "确认会议纪要",
      targetType: "项目",
      targetId: "demo-robotics",
      targetName: "演示智能设备投后月度沟通会",
      actor: "演示投资经理",
      time: "2026-06-10 19:00",
      detail: "会议纪要归档并生成待办。",
    }),
  ];

  assert.deepEqual(filterAuditEvents(events, { module: "报告中心" }).map((event) => event.targetId), ["report-q2"]);
  assert.deepEqual(filterAuditEvents(events, { targetId: "demo-robotics" }).map((event) => event.module), ["会议纪要"]);
});

test("keeps different Chinese audit actions unique even when dictionary is incomplete", () => {
  const base = {
    module: "报告中心" as const,
    targetType: "报告" as const,
    targetId: "示例成长一期基金 2026 年一季度运营报告",
    targetName: "示例成长一期基金 2026 年一季度运营报告",
    actor: "演示财务经理",
    time: "2026-06-10 18:30",
    detail: "报告动作。",
  };

  const approval = createAuditEvent({
    ...base,
    action: "审核通过报告",
  });
  const exportPackage = createAuditEvent({
    ...base,
    action: "生成报告导出包",
  });

  assert.notEqual(approval.id, exportPackage.id);
  assert.equal(prependUniqueAuditEvent([approval], exportPackage).length, 2);
});

test("creates a downloadable JSON audit package", () => {
  const events: AuditEvent[] = [
    createAuditEvent({
      module: "报告中心",
      action: "生成报告导出包",
      targetType: "报告",
      targetId: "report-q1",
      targetName: "一季度运营报告",
      actor: "演示财务经理",
      time: "2026-06-10 19:55",
      detail: "生成 HTML 导出包。",
      source: "报告中心",
    }),
    createAuditEvent({
      module: "任务中心",
      action: "完成项目任务",
      targetType: "项目",
      targetId: "demo-robotics",
      targetName: "补充经营数据",
      actor: "演示投资经理",
      time: "2026-06-10 19:40",
      detail: "任务已完成。",
    }),
  ];

  const exportPackage = createAuditJsonExportPackage(events, {
    actor: "管理员",
    exportedAt: "2026-06-10 20:00",
  });
  const parsed = JSON.parse(exportPackage.content);

  assert.equal(exportPackage.mimeType, "application/json;charset=utf-8");
  assert.equal(exportPackage.fileName, "fund-management-audit-2026-06-10-20-00.json");
  assert.equal(parsed.actor, "管理员");
  assert.equal(parsed.total, 2);
  assert.equal(parsed.events[0].module, "报告中心");
  assert.match(exportPackage.summary, /2 条审计事件/);
});
