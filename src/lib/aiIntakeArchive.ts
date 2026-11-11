import type { AiIntakeItem, Fund, FundDocument } from "../data/funds";
import type { Project } from "../data/projects";
import type { MaterialRecord } from "./materialFilters";

export type AiArchiveTaskRecord = {
  id: string;
  name: string;
  type: string;
  stage: string;
  owner: string;
  dueDate: string;
  status: "未开始";
  priority: "高" | "中";
  relation: string;
  note: string;
};

export type AiIntakeArchiveResult = {
  archivedItem: AiIntakeItem;
  fundDocument: FundDocument;
  materialRecord: MaterialRecord;
  projectTasks: AiArchiveTaskRecord[];
  fundAuditLog: string;
  projectId: string | null;
};

const documentExt: Record<AiIntakeItem["inputType"], string> = {
  会议纪要: "txt",
  投资协议: "pdf",
  财务报表: "xlsx",
};

const materialCategory: Record<AiIntakeItem["inputType"], string> = {
  会议纪要: "会议资料",
  投资协议: "法务资料",
  财务报表: "财务资料",
};

export function createAiIntakeArchiveResult(
  item: AiIntakeItem,
  context: { funds: Fund[]; projects: Project[] },
): AiIntakeArchiveResult | null {
  const fund = context.funds.find((fundItem) => fundItem.name === item.suggestedFund);
  if (!fund) return null;

  const project =
    context.projects.find(
      (projectItem) => projectItem.name === item.suggestedProject || projectItem.shortName === item.suggestedProject,
    ) ?? null;
  const fileName = `${item.title}.${documentExt[item.inputType]}`;
  const archivedDate = item.submittedAt.slice(0, 10);

  return {
    archivedItem: { ...item, status: "已归档" },
    fundDocument: {
      fundId: fund.id,
      name: fileName,
      category: item.inputType,
      owner: item.submittedBy,
      archivedAt: archivedDate,
      path: item.suggestedPath,
    },
    materialRecord: [
      fileName,
      materialCategory[item.inputType],
      item.submittedBy,
      archivedDate,
      `AI 收件箱 / ${item.source}`,
      "已摘要",
      String(item.extracted.length),
      item.suggestedProject,
    ],
    projectTasks: item.generatedTasks.map((taskName, index) => ({
      id: `ai-${item.id}-${index + 1}`,
      name: taskName,
      type: inferTaskType(taskName),
      stage: project?.stage ?? "投后",
      owner: project?.manager ?? item.submittedBy,
      dueDate: addDays(archivedDate, 3),
      status: "未开始",
      priority: inferPriority(taskName),
      relation: `${item.inputType} / ${item.suggestedPath}`,
      note: `AI 收件箱从${item.source}提取，确认归档后生成。`,
    })),
    fundAuditLog: `AI 收件箱确认归档：${item.title} -> ${item.suggestedPath}`,
    projectId: project?.id ?? null,
  };
}

export function updateAiIntakeSuggestion(
  item: AiIntakeItem,
  patch: Pick<AiIntakeItem, "suggestedFund" | "suggestedProject" | "suggestedPath">,
): AiIntakeItem {
  return {
    ...item,
    ...patch,
    status: "待确认",
    reviewNote: "已人工修改归档建议，等待确认。",
  };
}

export function rejectAiIntakeItem(item: AiIntakeItem, reviewNote: string): AiIntakeItem {
  return {
    ...item,
    status: "已退回",
    reviewNote,
  };
}

export function createSimulatedAiIntakeItem(
  inputType: AiIntakeItem["inputType"],
  {
    submittedAt,
    sequence,
  }: {
    submittedAt: string;
    sequence: number;
  },
): AiIntakeItem {
  const template = simulatedTemplates[inputType];
  return {
    id: `simulated-${template.idPart}-${sequence}`,
    title: template.title,
    inputType,
    source: template.source,
    submittedBy: template.submittedBy,
    submittedAt,
    summary: template.summary,
    confidence: template.confidence,
    suggestedFund: template.suggestedFund,
    suggestedProject: template.suggestedProject,
    suggestedPath: template.suggestedPath,
    extracted: template.extracted,
    generatedTasks: template.generatedTasks,
    status: "待确认",
  };
}

export function prependUniqueFundDocument(items: FundDocument[], document: FundDocument) {
  const exists = items.some(
    (item) => item.fundId === document.fundId && item.name === document.name && item.path === document.path,
  );
  return exists ? items : [document, ...items];
}

export function prependUniqueMaterialRecord(items: MaterialRecord[], record: MaterialRecord) {
  const exists = items.some(
    (item) => item[0] === record[0] && item[3] === record[3] && item[7] === record[7],
  );
  return exists ? items : [record, ...items];
}

export function prependUniqueProjectTasks<T extends { id: string }>(items: T[], tasks: T[]) {
  const existingIds = new Set(items.map((item) => item.id));
  return [...tasks.filter((task) => !existingIds.has(task.id)), ...items];
}

export function prependUniqueAuditLog(items: string[], log: string) {
  return items.includes(log) ? items : [log, ...items];
}

function inferTaskType(taskName: string) {
  if (/[条款业绩回购监控]/.test(taskName)) return "条款监控";
  if (/[报告数据收集]/.test(taskName)) return "报告收集";
  if (/[补充资料整理]/.test(taskName)) return "资料补充";
  if (/[确认复核口径]/.test(taskName)) return "人工确认";
  return "任务跟进";
}

function inferPriority(taskName: string): "高" | "中" {
  return /[业绩管理费确认复核口径风险条款]/.test(taskName) ? "高" : "中";
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

const simulatedTemplates: Record<
  AiIntakeItem["inputType"],
  Omit<AiIntakeItem, "id" | "inputType" | "submittedAt" | "status"> & { idPart: string }
> = {
  会议纪要: {
    idPart: "meeting",
    title: "模拟上传：演示智能设备投后会议纪要",
    source: "模拟上传 / 语音转写",
    submittedBy: "演示投资经理",
    summary: "识别到二季度经营数据、核心客户回款和知识产权变更三个投后跟进事项。",
    confidence: "91%",
    suggestedFund: "示例成长一期基金",
    suggestedProject: "演示智能设备有限公司",
    suggestedPath: "项目档案 / 会议纪要 / 投后沟通",
    extracted: ["二季度经营数据待补", "核心客户回款拉长", "知识产权变更需复核"],
    generatedTasks: ["跟进二季度经营数据", "补充核心客户回款说明"],
  },
  投资协议: {
    idPart: "agreement",
    title: "模拟上传：演示智能设备补充投资协议",
    source: "模拟上传 / PDF",
    submittedBy: "法务",
    summary: "识别到业绩承诺、季度报告义务和回购触发条件，需要进入协议条款监控。",
    confidence: "89%",
    suggestedFund: "示例成长一期基金",
    suggestedProject: "演示智能设备有限公司",
    suggestedPath: "项目档案 / 协议条款 / 投资协议",
    extracted: ["2026 年营收承诺", "季度报告义务", "回购触发条件"],
    generatedTasks: ["创建业绩承诺监控项", "生成季度经营数据收集任务"],
  },
  财务报表: {
    idPart: "financial",
    title: "模拟上传：演示示例成长二季度财务大表",
    source: "模拟上传 / Excel",
    submittedBy: "财务",
    summary: "识别到到账金额、管理费应收和项目余额，可作为季度报告和资金事项来源。",
    confidence: "94%",
    suggestedFund: "示例成长一期基金",
    suggestedProject: "演示智能设备有限公司",
    suggestedPath: "基金档案 / 账户资金 / 季度大表",
    extracted: ["到账金额 3000 万", "待收管理费 127.6 万", "项目余额待确认"],
    generatedTasks: ["财务确认管理费口径", "投资经理确认项目最新进展"],
  },
};
