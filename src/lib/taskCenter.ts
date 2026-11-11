import type { Project } from "../data/projects";
import type { ProjectTask, TaskPriority, TaskStatus } from "./workbenchLogic";

export type TaskCenterRow = ProjectTask & {
  projectId: string;
  projectName: string;
  fundName: string;
  projectPath: string;
  urgencyLabel: string;
};

export type TaskCenterFilters = {
  owner: string;
  status: "全部状态" | TaskStatus;
  priority: "全部优先级" | TaskPriority;
  query: string;
};

export function createTaskCenterRows(
  tasksByProject: Record<string, ProjectTask[]>,
  projects: Project[],
): TaskCenterRow[] {
  return Object.entries(tasksByProject)
    .flatMap(([projectId, tasks]) => {
      const project = projects.find((item) => item.id === projectId);
      return tasks.map((task) => ({
        ...task,
        projectId,
        projectName: project?.name ?? projectId,
        fundName: project?.fund ?? "未匹配基金",
        projectPath: `/projects/${projectId}`,
        urgencyLabel: `${task.status} / ${task.priority}优先级`,
      }));
    })
    .sort((left, right) => {
      const statusDelta = statusRank(right.status) - statusRank(left.status);
      if (statusDelta !== 0) return statusDelta;
      const priorityDelta = priorityRank(right.priority) - priorityRank(left.priority);
      if (priorityDelta !== 0) return priorityDelta;
      return left.dueDate.localeCompare(right.dueDate);
    });
}

export function filterTaskCenterRows(rows: TaskCenterRow[], filters: TaskCenterFilters) {
  const normalizedQuery = filters.query.trim().toLowerCase();

  return rows.filter((row) => {
    const ownerMatches = filters.owner === "全部负责人" || row.owner === filters.owner;
    const statusMatches = filters.status === "全部状态" || row.status === filters.status;
    const priorityMatches = filters.priority === "全部优先级" || row.priority === filters.priority;
    const queryMatches =
      !normalizedQuery ||
      [row.name, row.projectName, row.fundName, row.relation, row.note]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);

    return ownerMatches && statusMatches && priorityMatches && queryMatches;
  });
}

export function summarizeTaskCenter(rows: TaskCenterRow[]) {
  return {
    total: rows.length,
    overdue: rows.filter((row) => row.status === "已逾期").length,
    highPriority: rows.filter((row) => row.priority === "高").length,
    open: rows.filter((row) => row.status !== "已完成" && row.status !== "已取消").length,
  };
}

function statusRank(status: TaskStatus) {
  const rank: Record<TaskStatus, number> = {
    已逾期: 5,
    待确认: 4,
    进行中: 3,
    未开始: 2,
    已完成: 1,
    已取消: 0,
  };
  return rank[status];
}

function priorityRank(priority: TaskPriority) {
  const rank: Record<TaskPriority, number> = {
    高: 3,
    中: 2,
    低: 1,
  };
  return rank[priority];
}
