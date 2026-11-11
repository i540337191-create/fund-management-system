import assert from "node:assert/strict";
import test from "node:test";
import { projects } from "../src/data/projects.ts";
import {
  createTaskCenterRows,
  filterTaskCenterRows,
  summarizeTaskCenter,
} from "../src/lib/taskCenter.ts";
import type { ProjectTask } from "../src/lib/workbenchLogic.ts";

const tasksByProject: Record<string, ProjectTask[]> = {
  "demo-robotics": [
    {
      id: "risk-ip",
      name: "核查知识产权变更",
      type: "风险核查",
      stage: "投后管理",
      owner: "演示投资经理",
      dueDate: "2026-06-12",
      status: "未开始",
      priority: "高",
      relation: "风险 / 知识产权",
      note: "确认专利权属变更影响。",
    },
  ],
  "beijing-fundapp-new-energy": [
    {
      id: "legal-review",
      name: "补充法务尽调材料",
      type: "资料补充",
      stage: "尽调",
      owner: "演示研究员",
      dueDate: "2026-06-11",
      status: "已逾期",
      priority: "高",
      relation: "资料库 / 法务资料",
      note: "上传律师意见。",
    },
  ],
};

test("creates cross-project task center rows with project context", () => {
  const rows = createTaskCenterRows(tasksByProject, projects);

  assert.deepEqual(rows.map((row) => row.id), ["legal-review", "risk-ip"]);
  assert.equal(rows[0].projectName, "演示清洁能源有限公司");
  assert.equal(rows[0].fundName, "示例创新基金");
  assert.equal(rows[0].urgencyLabel, "已逾期 / 高优先级");
  assert.equal(rows[0].projectPath, "/projects/beijing-fundapp-new-energy");
});

test("filters task center rows by owner, status, priority, and query", () => {
  const rows = createTaskCenterRows(tasksByProject, projects);
  const result = filterTaskCenterRows(rows, {
    owner: "演示投资经理",
    status: "未开始",
    priority: "高",
    query: "知识产权",
  });

  assert.deepEqual(result.map((row) => row.id), ["risk-ip"]);
});

test("summarizes task center rows for operational scan", () => {
  const summary = summarizeTaskCenter(createTaskCenterRows(tasksByProject, projects));

  assert.deepEqual(summary, {
    total: 2,
    overdue: 1,
    highPriority: 2,
    open: 2,
  });
});
