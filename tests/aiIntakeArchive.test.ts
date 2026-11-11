import assert from "node:assert/strict";
import test from "node:test";
import { aiIntakeItems, funds } from "../src/data/funds.ts";
import { projects } from "../src/data/projects.ts";
import {
  createAiIntakeArchiveResult,
  createSimulatedAiIntakeItem,
  rejectAiIntakeItem,
  updateAiIntakeSuggestion,
} from "../src/lib/aiIntakeArchive.ts";

test("creates ledger, material, task, and audit records from an AI intake confirmation", () => {
  const item = aiIntakeItems.find((entry) => entry.id === "agreement-demo-robotics");
  assert.ok(item);

  const result = createAiIntakeArchiveResult(item, { funds, projects });

  assert.ok(result);
  assert.equal(result.archivedItem.status, "已归档");
  assert.deepEqual(result.fundDocument, {
    fundId: "fundapp-growth-i",
    name: "演示智能设备投资协议条款识别.pdf",
    category: "投资协议",
    owner: "演示投后经理",
    archivedAt: "2026-06-07",
    path: "项目档案 / 协议条款 / 投资协议",
  });
  assert.deepEqual(result.materialRecord, [
    "演示智能设备投资协议条款识别.pdf",
    "法务资料",
    "演示投后经理",
    "2026-06-07",
    "AI 收件箱 / PDF 上传",
    "已摘要",
    "3",
    "演示智能设备有限公司",
  ]);
  assert.deepEqual(
    result.projectTasks.map((task) => ({
      id: task.id,
      name: task.name,
      type: task.type,
      owner: task.owner,
      dueDate: task.dueDate,
      priority: task.priority,
      relation: task.relation,
    })),
    [
      {
        id: "ai-agreement-demo-robotics-1",
        name: "创建业绩承诺监控项",
        type: "条款监控",
        owner: "演示投资经理",
        dueDate: "2026-06-10",
        priority: "高",
        relation: "投资协议 / 项目档案 / 协议条款 / 投资协议",
      },
      {
        id: "ai-agreement-demo-robotics-2",
        name: "生成季度经营数据收集任务",
        type: "报告收集",
        owner: "演示投资经理",
        dueDate: "2026-06-10",
        priority: "中",
        relation: "投资协议 / 项目档案 / 协议条款 / 投资协议",
      },
    ],
  );
  assert.equal(result.fundAuditLog, "AI 收件箱确认归档：演示智能设备投资协议条款识别 -> 项目档案 / 协议条款 / 投资协议");
  assert.equal(result.projectId, "demo-robotics");
});

test("does not create archive records when the suggested fund is unknown", () => {
  const item = { ...aiIntakeItems[0], suggestedFund: "不存在的基金" };

  const result = createAiIntakeArchiveResult(item, { funds, projects });

  assert.equal(result, null);
});

test("updates an AI intake suggestion before archive confirmation", () => {
  const item = aiIntakeItems.find((entry) => entry.id === "meeting-20260608");
  assert.ok(item);

  const updated = updateAiIntakeSuggestion(item, {
    suggestedFund: "示例制造基金",
    suggestedProject: "演示医疗科技有限公司",
    suggestedPath: "项目档案 / 会议纪要 / 尽调访谈",
  });

  assert.equal(updated.status, "待确认");
  assert.equal(updated.suggestedFund, "示例制造基金");
  assert.equal(updated.suggestedProject, "演示医疗科技有限公司");
  assert.equal(updated.suggestedPath, "项目档案 / 会议纪要 / 尽调访谈");
});

test("rejects an AI intake suggestion with a visible review note", () => {
  const item = aiIntakeItems.find((entry) => entry.id === "agreement-demo-robotics");
  assert.ok(item);

  const rejected = rejectAiIntakeItem(item, "项目归属需要法务重新确认");

  assert.equal(rejected.status, "已退回");
  assert.equal(rejected.reviewNote, "项目归属需要法务重新确认");
});

test("creates simulated upload items for the three supported input types", () => {
  const simulated = ["会议纪要", "投资协议", "财务报表"].map((inputType, index) =>
    createSimulatedAiIntakeItem(inputType as "会议纪要" | "投资协议" | "财务报表", {
      submittedAt: "2026-06-10 20:10",
      sequence: index + 1,
    }),
  );

  assert.deepEqual(simulated.map((item) => item.inputType), ["会议纪要", "投资协议", "财务报表"]);
  assert.deepEqual(simulated.map((item) => item.status), ["待确认", "待确认", "待确认"]);
  assert.match(simulated[1].suggestedPath, /协议条款/);
});
