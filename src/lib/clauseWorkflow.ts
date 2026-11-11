import type { Fund, FundClauseMonitor } from "../data/funds";
import type { Project } from "../data/projects";
import { createAuditEvent, type AuditEvent } from "./auditTrail.ts";
import { slugifyBusinessText } from "./textSlug.ts";
import type { ProjectTask } from "./workbenchLogic";

export type ClauseReminderResult = {
  projectId: string | null;
  task: ProjectTask;
};

export function createClauseReminderTask({
  clause,
  fund,
  projects,
  createdAt,
}: {
  clause: FundClauseMonitor;
  fund: Fund;
  projects: Project[];
  createdAt: string;
}): ClauseReminderResult {
  const project = findClauseProject(clause, projects);
  const targetId = project?.id ?? fund.id;
  const owner = project?.manager ?? clause.owner;

  return {
    projectId: project?.id ?? null,
    task: {
      id: `clause-${targetId}-${slugifyBusinessText(clause.title)}`,
      name: `核查${clause.title}`,
      type: "条款监控",
      stage: project?.stage ?? fund.stage,
      owner,
      dueDate: addDays(createdAt, 7),
      status: "未开始",
      priority: clause.status.includes("待") ? "高" : "中",
      relation: `协议条款 / ${fund.name}`,
      note: `${clause.source}：${clause.trigger}`,
    },
  };
}

export function createClauseReminderAuditEvent({
  clause,
  fund,
  actor,
  createdAt,
}: {
  clause: FundClauseMonitor;
  fund: Fund;
  actor: string;
  createdAt: string;
}): AuditEvent {
  return createAuditEvent({
    module: "基金账本",
    action: "生成条款提醒",
    targetType: "基金",
    targetId: fund.id,
    targetName: clause.title,
    actor,
    time: createdAt,
    detail: `${clause.source}：${clause.trigger}`,
    source: fund.name,
  });
}

function findClauseProject(clause: FundClauseMonitor, projects: Project[]) {
  return (
    projects.find(
      (project) =>
        clause.title.includes(project.shortName) ||
        clause.title.includes(project.name.replace("智能装备有限公司", "")),
    ) ?? null
  );
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
