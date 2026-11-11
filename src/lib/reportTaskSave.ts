import type { ApiClient, WorkflowTaskInput } from "./apiClient.ts";
import type { Project } from "../data/projects.ts";
import type { ReportRecord } from "../data/reports.ts";
import { createReportMissingDataTasks, createSavedReportRecord, type ReportWorkflowDraft } from "./reportWorkflow.ts";

export type ReportSaveProgress = { reportId: string; taskRequestIds: string[]; report?: ReportRecord; completedTaskIndexes: number[]; updatedAt: string; taskInputs?: WorkflowTaskInput[] };

// shortcut: retry progress is retained in the current App session; durable report-draft recovery belongs to the report workflow.
// Keep the same progress object on retry so committed report/task writes are recovered, not repeated.
export async function saveReportTaskWorkflow(api: ApiClient, draft: ReportWorkflowDraft, projects: Project[], progress: ReportSaveProgress) {
  if (!draft.targetId?.trim() || !["project", "fund"].includes(draft.targetType ?? "")) throw new Error("报告尚未保存：请选择真实的报告对象。");
  if (draft.targetType === "project" && !projects.some(project => project.id === draft.targetId)) throw new Error("报告尚未保存：请选择真实项目。");
  const [directory, session] = await Promise.all([api.getUsers(), api.getSessionMe()]);
  const eligible = directory.users.filter((user) => user.canLogin && ["admin", "investment_manager", "post_investment"].includes(user.role));
  const tasks = createReportMissingDataTasks(draft, progress.updatedAt.slice(0, 10));
  const prefix = progress.report ? "报告草稿已保存，后续任务未全部完成：" : "报告尚未保存：";
  const assignments = !progress.taskInputs ? draft.missingItems.map((item) => {
    const project = projects.find((project) => project.id === item.projectId);
    if (!project) throw new Error(prefix + "请为缺失项选择真实项目。");
    const owner = eligible.find((user) => user.id === (item.ownerId ?? project.ownerId));
    if (!owner) throw new Error(prefix + "请为缺失项选择可登录的真实负责人账号。");
    return { project, owner };
  }) : [];
  if (!progress.taskInputs) progress.taskInputs = tasks.map((task, index) => {
    const { project, owner } = assignments[index];
    return { requestId: progress.taskRequestIds[index], projectId: project.id, ownerId: owner.id, name: task.name, type: task.type, stage: project.stage, dueDate: task.dueDate, priority: task.priority, relation: task.relation, note: task.note };
  });
  try {
    if (!progress.report) {
      // A previous create response may have been lost after the database committed.
      const existing = (await api.getReports()).reports.find((report) => report.id === progress.reportId);
      progress.report = existing ?? (await api.createReport({ ...createSavedReportRecord(draft, progress.updatedAt), id: progress.reportId, owner: session.user.name })).report;
    }
    for (let index = 0; index < tasks.length; index++) {
      if (progress.completedTaskIndexes.includes(index)) continue;
      await api.createWorkflowTask(progress.taskInputs[index]);
      progress.completedTaskIndexes.push(index);
    }
    return progress.report;
  } catch (error) {
    const knownReport = progress.report ?? (await api.getReports().catch(() => ({ reports: [] }))).reports.find((report) => report.id === progress.reportId);
    if (knownReport) { progress.report = knownReport; throw new Error(`报告草稿已保存，仍有${tasks.length - progress.completedTaskIndexes.length}项缺件任务待确认。请原样重试以继续，已保存记录不会重复创建。`); }
    throw new Error("暂未确认报告是否保存。请原样重试，系统会先核对已有报告记录。");
  }
}
