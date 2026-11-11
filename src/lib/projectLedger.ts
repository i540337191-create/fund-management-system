import type { Fund, FundClauseMonitor } from "../data/funds";
import type { MeetingRecord } from "../data/meetings";
import type { Project } from "../data/projects";
import type { RiskItem } from "../data/risks";
import type { AuditEvent } from "./auditTrail.ts";
import {
  createMaterialDirectoryRows,
  type MaterialDirectoryRow,
  type MaterialRecord,
  type ApiMaterialRecord,
  createApiMaterialDirectoryRows,
} from "./materialFilters.ts";

export type ProjectClauseRow = {
  fundId: string;
  fundName: string;
  projectName: string;
  title: string;
  source: string;
  trigger: string;
  owner: string;
  status: string;
  scope: "项目条款" | "基金条款";
  nextAction: string;
};

export type ProjectRiskRow = RiskItem & {
  sourceLabel: string;
  actionLabel: string;
};

export type ProjectMeetingRow = MeetingRecord & {
  taskSummary: string;
};

export function deriveProjectClauseRows(
  project: Project,
  funds: Fund[],
  clauses: FundClauseMonitor[],
  localDemo=false,
): ProjectClauseRow[] {
  const fund = funds.find((item) => project.fundId?item.id===project.fundId:localDemo&&item.name===project.fund);
  if (!fund) return [];

  return clauses
    .filter((clause) => clause.fundId === fund.id)
    .map((clause) => {
      const projectSpecific = isProjectSpecificClause(clause, project);
      return {
        fundId: fund.id,
        fundName: fund.name,
        projectName: projectSpecific ? project.name : fund.name,
        title: clause.title,
        source: clause.source,
        trigger: clause.trigger,
        owner: clause.owner,
        status: clause.status,
        scope: projectSpecific ? ("项目条款" as const) : ("基金条款" as const),
        nextAction: clause.status === "已生成" ? "查看已生成提醒" : "生成提醒任务",
      };
    })
    .sort((left, right) => Number(right.scope === "项目条款") - Number(left.scope === "项目条款"));
}

export function deriveProjectMaterialDirectoryRows(
  project: Project,
  materials: MaterialRecord[],
  projects: Project[],
  apiMaterials?:ApiMaterialRecord[],
): MaterialDirectoryRow[] {
  if(apiMaterials)return createApiMaterialDirectoryRows(apiMaterials.filter(m=>m.projectId===project.id||m.relationships?.projects.some(r=>r.id===project.id)),projects).map(row=>({...row,project:project.name,fund:project.fund,stage:project.stage}));
  return createMaterialDirectoryRows(materials, projects).filter(
    (row) => row.project === project.name || row.project.includes(project.shortName),
  );
}

export function deriveProjectRiskRows(project: Project, riskItems: RiskItem[], localDemo=false): ProjectRiskRow[] {
  return riskItems
    .filter((risk) => risk.projectId===project.id||localDemo&&!risk.projectId&&(risk.target === project.name || risk.target.includes(project.shortName)))
    .sort((left, right) => right.time.localeCompare(left.time))
    .map((risk) => ({
      ...risk,
      sourceLabel: `${risk.type} / ${risk.source}`,
      actionLabel: risk.level === "高" ? "立即生成风险任务" : "生成跟进任务",
    }));
}

export function deriveProjectMeetingRows(project: Project, meetingItems: MeetingRecord[], localDemo=false): ProjectMeetingRow[] {
  return meetingItems
    .filter((meeting) => meeting.projectId===project.id||localDemo&&!meeting.projectId&&(meeting.project === project.name || meeting.project.includes(project.shortName)))
    .sort((left, right) => right.date.localeCompare(left.date))
    .map((meeting) => ({
      ...meeting,
      taskSummary: `${meeting.todos} 项待办 / ${meeting.risks} 个风险点`,
    }));
}

export function deriveProjectAuditRows(project: Project, events: AuditEvent[]): AuditEvent[] {
  return events
    .filter((event) => {
      const text = `${event.targetId} ${event.targetName} ${event.detail} ${event.source ?? ""}`;
      return event.targetId === project.id || text.includes(project.name) || text.includes(project.shortName);
    })
    .sort((left, right) => right.time.localeCompare(left.time));
}

function isProjectSpecificClause(clause: FundClauseMonitor, project: Project) {
  return clause.title.includes(project.shortName) || clause.trigger.includes(project.shortName) || clause.source.includes(project.shortName);
}
