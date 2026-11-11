import assert from "node:assert/strict";
import test from "node:test";
import { saveReportTaskWorkflow, type ReportSaveProgress } from "../src/lib/reportTaskSave.ts";
import type { ApiClient } from "../src/lib/apiClient.ts";
import { projects } from "../src/data/projects.ts";
import type { ReportWorkflowDraft } from "../src/lib/reportWorkflow.ts";
const user = { id: "actor-a", name: "实际负责人", email: "actor@example.test", role: "investment_manager", canLogin: true };
const project = { ...projects[0], ownerId: user.id };
const draft: ReportWorkflowDraft = { name: "本地报告", target: project.name, targetType: "project", targetId: project.id, type: "项目初筛报告", owner: "旧显示标签", missingItems: [{ label: "经营数据", projectId: project.id, owner: "不作为身份的旧标签", ownerId: user.id }, { label: "审计资料", projectId: project.id, owner: "旧标签", ownerId: user.id }] };
function fixture() {
  const state = { reports: [] as any[], reportCalls: 0, taskCalls: [] as any[], failed: false, loseReportResponse: false };
  const api = { getUsers: async () => ({ users: [user] }), getSessionMe: async () => ({ user }), getReports: async () => ({ reports: state.reports }), createReport: async (input: any) => { state.reportCalls++; state.reports.push(input); if (state.loseReportResponse) { state.loseReportResponse = false; throw new Error("response lost"); } return { report: input, auditEvent: {} }; }, createWorkflowTask: async (input: any) => { state.taskCalls.push(input); if (!state.failed && input.requestId === "task-2") { state.failed = true; throw new Error("temporary task failure"); } return { task: input }; } } as unknown as ApiClient;
  const progress: ReportSaveProgress = { reportId: "report-fixed", taskRequestIds: ["task-1", "task-2"], completedTaskIndexes: [], updatedAt: "2026-10-29T04:00:00.000Z" };
  return { state, api, progress };
}
test("report partial success is explicit and retry resumes tasks without duplicating committed records", async () => {
  const f = fixture();
  await assert.rejects(() => saveReportTaskWorkflow(f.api, draft, [project], f.progress), /报告草稿已保存，仍有1项/);
  assert.equal(f.state.reportCalls, 1); assert.deepEqual(f.progress.completedTaskIndexes, [0]);
  const result = await saveReportTaskWorkflow(f.api, draft, [{ ...project, stage: "投决" }], f.progress);
  assert.equal(result!.id, "report-fixed"); assert.equal(f.state.reportCalls, 1);
  assert.deepEqual(f.state.taskCalls.map(t => t.requestId), ["task-1", "task-2", "task-2"]);
  assert.equal(f.state.taskCalls[1].stage, f.state.taskCalls[2].stage);
  for (const task of f.state.taskCalls) { assert.equal(task.ownerId, user.id); assert.equal(task.projectId, project.id); assert.equal(task.owner, undefined); assert.equal(task.id, undefined); }
});
test("report missing-item identity is validated before any report or task write", async () => {
  const f = fixture();
  await assert.rejects(() => saveReportTaskWorkflow(f.api, draft, [], f.progress), /请选择.*真实项目|选择真实项目/);
  await assert.rejects(() => saveReportTaskWorkflow(f.api, { ...draft, missingItems: [{ ...draft.missingItems[0], ownerId: "unknown" }] }, [project], f.progress), /真实负责人账号/);
  assert.equal(f.state.reportCalls, 0); assert.equal(f.state.taskCalls.length, 0);
});
test("lost report response is recovered by its stable id before task retry", async () => {
  const f = fixture(); f.state.loseReportResponse = true; f.state.failed = true;
  await assert.rejects(() => saveReportTaskWorkflow(f.api, draft, [project], f.progress), /报告草稿已保存/);
  assert.equal(f.state.reports.length, 1);
  await saveReportTaskWorkflow(f.api, draft, [project], f.progress);
  assert.equal(f.state.reportCalls, 1); assert.equal(f.state.taskCalls.length, 2);
});

test("report target ID is required before report and task writes", async () => {
  const f = fixture();
  await assert.rejects(() => saveReportTaskWorkflow(f.api, { ...draft, targetId: undefined }, [project], f.progress), /真实的报告对象/);
  assert.equal(f.state.reportCalls, 0); assert.equal(f.state.taskCalls.length, 0);
});
