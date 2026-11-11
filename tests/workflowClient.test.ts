import assert from "node:assert/strict";
import test from "node:test";
import { createApiClient } from "../src/lib/apiClient.ts";
import { summarizeTaskCenter } from "../src/lib/taskCenter.ts";
test("approval signing sends a stable request, exact revision and session cookie without client actor", async () => {
  let captured: any;
  const api = createApiClient({ fetchImpl: async (url, init = {}) => { captured = { url, init }; return { ok: true, json: async () => ({}) } as Response; } });
  await api.decideApproval("project-a", "round-a", { requestId: "stable-request", expectedRevision: 3, decision: "return", opinion: "补充资料\n保留原意见" });
  assert.equal(captured.url, "/api/projects/project-a/approvals/round-a/decisions");
  assert.equal(captured.init.credentials, "include"); assert.deepEqual(JSON.parse(captured.init.body), { requestId: "stable-request", expectedRevision: 3, decision: "return", opinion: "补充资料\n保留原意见" });
});
test("task cancel is terminal for pending metrics, not an open task", () => {
  const task = { id: "task", projectId: "project", name: "审批免签", owner: "用户", dueDate: "2026-10-01", status: "已取消", priority: "中", relation: "审批", note: "负责人独立放行", type: "审批", stage: "立项", projectName: "项目", fundName: "基金", projectPath: "/projects/project", urgencyLabel: "已取消" } as const;
  assert.equal(summarizeTaskCenter([task]).open, 0);
});
