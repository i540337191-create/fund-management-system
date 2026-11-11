import type { ReportRecord } from "../data/reports";
import type { ProjectTask } from "./workbenchLogic";

export type ReportMissingItem = {
  ownerId?: string;
  label: string;
  owner: string;
  projectId: string;
};

export type ReportWorkflowDraft = {
  targetType?: "project" | "fund";
  targetId?: string;
  name: string;
  target: string;
  type: string;
  owner: string;
  missingItems: ReportMissingItem[];
};

export function createSavedReportRecord(draft: ReportWorkflowDraft, updatedAt: string): ReportRecord {
  return {
    ...(draft.targetType && draft.targetId ? { targetType: draft.targetType, targetId: draft.targetId, projectId: draft.targetType === "project" ? draft.targetId : null, fundId: draft.targetType === "fund" ? draft.targetId : null } : {}),
    name: draft.name,
    target: draft.target,
    type: draft.type,
    status: "待审核",
    owner: draft.owner,
    updatedAt,
  };
}

export function createReportMissingDataTasks(draft: ReportWorkflowDraft, createdAt: string): ProjectTask[] {
  return draft.missingItems.map((item) => ({
    id: `report-missing-${item.projectId}-${slugifyReportLabel(item.label)}`,
    name: `补充${item.label}`,
    type: "报告收集",
    stage: "投后",
    owner: item.owner,
    dueDate: addDays(createdAt, 3),
    status: "未开始",
    priority: "高",
    relation: `报告缺失项 / ${draft.name}`,
    note: `由${draft.type}生成流程识别，需责任人补齐后进入人工审核。`,
  }));
}

export function prependUniqueReport(records: ReportRecord[], report: ReportRecord) {
  const exists = records.some((item) => item.name === report.name && (report.id ? item.id === report.id : report.targetId ? item.targetId === report.targetId && item.targetType === report.targetType : item.target === report.target));
  return exists ? records : [report, ...records];
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function slugifyReportLabel(value: string) {
  const dictionary: Record<string, string> = {
    经: "jing",
    营: "ying",
    数: "shu",
    据: "ju",
    最: "zui",
    新: "xin",
    审: "shen",
    计: "ji",
    报: "bao",
    告: "gao",
    核: "he",
    心: "xin",
    客: "ke",
    户: "hu",
    反: "fan",
    馈: "kui",
  };

  return value
    .match(/[A-Za-z0-9]+|./g)!
    .map((token) => {
      if (/^[A-Za-z0-9]+$/.test(token)) return token.toLowerCase();
      return dictionary[token] ?? "-";
    })
    .join("-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
