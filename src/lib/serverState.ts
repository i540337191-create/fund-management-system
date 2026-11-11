import {clientSessionEpoch} from './sessionBoundary.ts';
import type { CapitalItem } from "../data/capital";
import type { AiIntakeItem, Fund, FundDocument, FundInvestor } from "../data/funds";
import type { MeetingRecord } from "../data/meetings";
import type { Project } from "../data/projects";
import type { ReportRecord } from "../data/reports";
import type { AuditEvent } from "./auditTrail";
import { apiMaterialToRecord, type ApiClient, type ApiMaterial, type ApiReportExportRecord } from "./apiClient.ts";
import type { MaterialRecord } from "./materialFilters";
import type { ProjectTask } from "./workbenchLogic";

export type BusinessStateSnapshot = {
  capitalRecords: CapitalItem[];
  fundRecords: Fund[];
  projectRecords: Project[];
  reportRecords: ReportRecord[];
  reportExportRecords: ApiReportExportRecord[];
  meetingRecords: MeetingRecord[];
  aiIntakeRecords: AiIntakeItem[];
  fundInvestorRecords: (FundInvestor & { id?: string; updatedAt?: string })[];
  fundDocumentRecords: (FundDocument & { id?: string })[];
  fundAuditLogs: Record<string, string[]>;
  auditEvents: AuditEvent[];
  materialRecords: MaterialRecord[];
  materialApiRecords: ApiMaterial[];
  projectTaskRecordsById: Record<string, ProjectTask[]>;
};

export function createEmptyBusinessStateSnapshot(): BusinessStateSnapshot {
  return { capitalRecords: [], fundRecords: [], projectRecords: [], reportRecords: [], reportExportRecords: [], meetingRecords: [], aiIntakeRecords: [], fundInvestorRecords: [], fundDocumentRecords: [], fundAuditLogs: {}, auditEvents: [], materialRecords: [], materialApiRecords: [], projectTaskRecordsById: {} };
}

export type ServerBusinessStateResult =
  | { mode: "server"; state: BusinessStateSnapshot }
  | { mode: "degraded"; state: BusinessStateSnapshot; message: string };

type ServerStateClient = Pick<
  ApiClient,
  "getHealth" | "getFunds" | "getFund" | "getTasks" | "getMaterials" | "getReports" | "getCapitalRecords" | "getAuditEvents"
  | "getProjects" | "getAiIntakeItems" | "getMeetings"
>;

export async function loadBusinessStateFromServer(
  client: Partial<ServerStateClient>,
  _localDefaults: BusinessStateSnapshot,
  includeDemo=true,
): Promise<ServerBusinessStateResult> {
  try {
    if (
      !client.getFunds ||
      !client.getFund ||
      !client.getProjects ||
      !client.getTasks ||
      !client.getMaterials ||
      !client.getAiIntakeItems ||
      !client.getMeetings ||
      !client.getReports ||
      !client.getCapitalRecords ||
      !client.getAuditEvents
    ) {
      throw new Error("server_state_client_incomplete");
    }

    const startedEpoch=clientSessionEpoch();
    if(client.getHealth){
      const controller=new AbortController(),deadline=Date.now()+30_000;
      const timeout=setTimeout(()=>controller.abort(),30_000);
      try{
        for(;;){
          const health=await client.getHealth(controller.signal);
          if(startedEpoch!==clientSessionEpoch())throw Error('client_session_changed');
          const state=health.maintenance?.postInvestment?.state;
          if(!state||state==='idle')break;
          if(state==='failed'||Date.now()>=deadline)throw Error('maintenance_pending');
          await new Promise(resolve=>setTimeout(resolve,250));
        }
      }catch(error){if(controller.signal.aborted)throw Error('maintenance_pending');throw error;}
      finally{clearTimeout(timeout);}
    }
    if(startedEpoch!==clientSessionEpoch())throw Error('client_session_changed');
    const fundsPromise=client.getFunds(includeDemo);
    const fundDetailsPromise=fundsPromise.then(result=>Promise.all(result.funds.map(fund=>client.getFund!(fund.id,includeDemo))));
    const [fundsResponse, projectsResponse, tasksResponse, materialsResponse, aiIntakeResponse, meetingsResponse, reportsResponse, capitalResponse, auditResponse, fundDetails] = await Promise.all([
      fundsPromise,
      client.getProjects(),
      client.getTasks(),
      client.getMaterials(),
      client.getAiIntakeItems(),
      client.getMeetings(),
      client.getReports(),
      client.getCapitalRecords(),
      client.getAuditEvents().catch((error: unknown) => {
        if ((error as { status?: number })?.status === 403) return { auditEvents: [] };
        throw error;
      }),
      fundDetailsPromise,
    ]);
    const serverMaterialRecords = materialsResponse.materials.map(apiMaterialToRecord);

    return {
      mode: "server",
      state: {
        ...createEmptyBusinessStateSnapshot(),
        fundRecords: fundsResponse.funds,
        projectRecords: projectsResponse.projects,
        fundInvestorRecords: fundDetails.flatMap((detail) => detail.investors ?? []),
        fundDocumentRecords: fundDetails.flatMap((detail) => detail.documents ?? []),
        fundAuditLogs: deriveFundAuditLogs(auditResponse.auditEvents),
        auditEvents: auditResponse.auditEvents,
        materialApiRecords: materialsResponse.materials,
        materialRecords: serverMaterialRecords,
        meetingRecords: meetingsResponse.meetings,
        aiIntakeRecords: aiIntakeResponse.items,
        projectTaskRecordsById: groupTasksByProject(tasksResponse.tasks),
        reportRecords: reportsResponse.reports,
        reportExportRecords: reportsResponse.exportRecords ?? [],
        capitalRecords: capitalResponse.capitalRecords,
      },
    };
  } catch(error) {
    return {
      mode: "degraded",
      state: createEmptyBusinessStateSnapshot(),
      message: error instanceof Error&&error.message==='maintenance_pending'?'后台提醒核对尚未完成，本次未加载业务账本；请稍后刷新。':"服务端账本读取失败，未加载新的业务数据；请恢复连接后重试。",
    };
  }
}

function groupTasksByProject(tasks: (ProjectTask & { projectId: string })[]) {
  return tasks.reduce<Record<string, ProjectTask[]>>((groups, task) => {
    const { projectId, ...projectTask } = task;
    groups[projectId] = [...(groups[projectId] ?? []), projectTask];
    return groups;
  }, {});
}

function deriveFundAuditLogs(events: AuditEvent[]) {
  return events.reduce<Record<string, string[]>>((logs, event) => {
    if (event.targetType !== "基金") return logs;
    logs[event.targetId] = [...(logs[event.targetId] ?? []), `${event.actor}${event.action}：${event.targetName}`];
    return logs;
  }, {});
}
