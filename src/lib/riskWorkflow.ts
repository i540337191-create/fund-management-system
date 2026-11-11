import type { Project } from "../data/projects";
import type { RiskItem } from "../data/risks";
import { createAuditEvent, type AuditEvent } from "./auditTrail.ts";
import { findProjectForTarget } from "./workbenchLogic.ts";

export type RiskDecisionDetail = {
  projectId: string | null;
  owner: string;
  dueDate: string;
  impact: string;
  suggestedAction: string;
  sources: string[];
};

export function createRiskDecisionDetail(
  risk: RiskItem,
  projects: Project[],
  createdAt: string,
): RiskDecisionDetail {
  const project = risk.projectId?projects.find(p=>p.id===risk.projectId):findProjectForTarget(projects, risk.target);
  const dueDate = addDays(createdAt, risk.level === "高" ? 1 : risk.level === "中" ? 3 : 7);

  return {
    projectId: project?.id ?? null,
    owner: project?.manager ?? "投后负责人",
    dueDate,
    impact: inferRiskImpact(risk),
    suggestedAction: inferRiskAction(risk),
    sources: [risk.source, `风险监控 / ${risk.type}`],
  };
}

export function createRiskAuditEvent(
  risk: RiskItem,
  projects: Project[],
  {
    actor,
    handledAt,
    result,
  }: {
    actor: string;
    handledAt: string;
    result: string;
  },
): AuditEvent {
  const project = risk.projectId?projects.find(p=>p.id===risk.projectId):findProjectForTarget(projects, risk.target);

  return createAuditEvent({
    module: "风险监控",
    action: "确认风险处理",
    targetType: project ? "项目" : "风险",
    targetId: project?.id ?? risk.title,
    targetName: risk.title,
    actor,
    time: handledAt,
    detail: `${risk.summary} 处理结果：${result}`,
    source: risk.source,
  });
}

function inferRiskImpact(risk: RiskItem) {
  if (risk.type === "诉讼信息") return "投决前必须完成法务核查，必要时调整投资委员会材料。";
  if (risk.type === "知识产权") return "需确认核心权利是否影响投后价值和后续融资披露。";
  if (risk.type === "经营风险") return "需更新现金流和客户回款判断，避免报告口径滞后。";
  if (risk.type === "行业动态") return "需复核市场增速和估值假设，更新行业判断。";
  return "需确认该事项是否影响项目推进、报告披露或条款触发。";
}

function inferRiskAction(risk: RiskItem) {
  if (risk.level === "高") return "立即创建风险核查任务，并要求法务补充来源材料。";
  if (risk.level === "中") return "今日完成责任人确认，并补充来源材料或企业反馈。";
  return "纳入持续观察清单，保留来源并在下次例会复核。";
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
