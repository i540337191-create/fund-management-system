import assert from "node:assert/strict";
import test from "node:test";
import {
  createReportMissingDataTasks,
  createSavedReportRecord,
  type ReportWorkflowDraft,
} from "../src/lib/reportWorkflow.ts";

const draft: ReportWorkflowDraft = {
  name: "示例成长一期基金 2026 年二季度运营报告",
  target: "示例成长一期基金",
  type: "基金季度报告",
  owner: "基金运营 / 演示财务经理",
  missingItems: [
    { label: "2026 Q2 经营数据", owner: "演示投资经理", projectId: "demo-robotics" },
    { label: "最新审计报告", owner: "演示财务经理", projectId: "demo-robotics" },
  ],
};

test("creates a saved report record from a completed workflow draft", () => {
  const report = createSavedReportRecord(draft, "2026-06-10 18:30");

  assert.deepEqual(report, {
    name: "示例成长一期基金 2026 年二季度运营报告",
    target: "示例成长一期基金",
    type: "基金季度报告",
    status: "待审核",
    owner: "基金运营 / 演示财务经理",
    updatedAt: "2026-06-10 18:30",
  });
});

test("creates project tasks for report missing data owners", () => {
  const tasks = createReportMissingDataTasks(draft, "2026-06-10");

  assert.deepEqual(
    tasks.map((task) => ({
      id: task.id,
      name: task.name,
      owner: task.owner,
      dueDate: task.dueDate,
      relation: task.relation,
    })),
    [
      {
        id: "report-missing-demo-robotics-2026-q2-jing-ying-shu-ju",
        name: "补充2026 Q2 经营数据",
        owner: "演示投资经理",
        dueDate: "2026-06-13",
        relation: "报告缺失项 / 示例成长一期基金 2026 年二季度运营报告",
      },
      {
        id: "report-missing-demo-robotics-zui-xin-shen-ji-bao-gao",
        name: "补充最新审计报告",
        owner: "演示财务经理",
        dueDate: "2026-06-13",
        relation: "报告缺失项 / 示例成长一期基金 2026 年二季度运营报告",
      },
    ],
  );
});
