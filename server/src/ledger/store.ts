import {takeNotices,type BusinessNotice} from '../notifications/outbox.ts';
import {meetingFileTransaction} from './meeting-file.ts';
import {assertReportReady} from './report-readiness.ts';
import {creationOrder} from './creation-order.ts';
import {requireCapitalReceipt,validateCapitalReceipt,sameCapitalCreate} from './capital-receipt.ts';
import {emptyRecordManagement,type RecordManagementData,type RecordManagementState} from './record-management.ts';
import {sameMeeting,sameMeetingMinutes,meetingVisibility} from './meeting-input.ts';
import {objectLock} from '../auth/object-lock.ts';
import {emptyLifecycleData,type LifecycleState,type LifecycleData,type LifecycleStore} from './fund-lifecycle.ts';
import {emptyAccess,type AccessState,type AccessData} from '../auth/object-access.ts';
import type {AssistantState,AssistantConversation} from '../ai/conversations.ts';
import {emptyLpData,type LpState,type LpData} from './lp-ledger.ts';
import { isLpMaterial } from './lp-privacy.ts';
import {customInput,emptySchemas,type CustomData,type Schemas} from './custom-fields.ts';
import { applySourcePurposes, restoreArchivedPurposeMetadata, purposeLookup, type SourcePurposeEntry } from './source-purposes.ts';
import type { DataPurpose, SourceBasis } from './source-policy.ts';
import { sourceBasisOf, reportExportSource, normalizeDataOrigin } from './source-policy.ts';
import { createBoundProject, companyBinding, type Company, type CompanyMetadata, type MasterState } from './company-project-master.ts';
import type { FundMasterState } from './fund-master.ts';
import type {AccountStore,AccountState,AuthSession,AccountReceipt} from './accounts.ts';
import type { WorkflowStore, StoredUser, ApprovalRound, Receipt, WorkflowState } from './workflow.ts';
import { WorkflowError } from './workflow.ts';
import { randomUUID } from 'node:crypto';
import { MaterialWriteError, uploadFingerprint, projectRelationships, materialProjectRelationships, applyVersion, type MaterialVersion, type UploadMaterialInput, type UploadMaterialResult } from './material-upload.ts';
export type DataOrigin = "unknown" | "seed_demo" | "source_pdf_ocr" | "source_file" | "user_input" | "system_generated";

export type Fund = CustomData & {
  createdAt?:string;
  managerId?: string | null;
  revision?: number;
  id: string;
  name: string;
  shortName: string;
  stage: string;
  manager: string;
  scale: string;
  paidIn: string;
  invested: string;
  balance: string;
  projectCount: number;
  investorCount: number;
  openTasks: number;
  riskCount: number;
  nextAction: string;
  updatedAt: string;
  dataOrigin?: DataOrigin | string;
  dataPurpose?: DataPurpose;
  sourceBasis?: SourceBasis[];
};

export type Project = CustomData & {
  createdAt?:string;
  companyId?: string | null;
  masterRevision?: number;
  id: string;
  fundId: string;
  name: string;
  shortName: string;
  fund: string;
  industry: string;
  status: string;
  stage: string;
  manager: string;
  ownerId?: string | null;
  managerLabel?: string;
  collaborators?: string;
  sourceChannel?: string;
  amount: string;
  risk: string;
  latest: string;
  todoCount: number;
  updatedAt: string;
  description: string;
  thesis: string;
  nextAction: string;
  dataOrigin?: DataOrigin | string;
  dataPurpose?: DataPurpose;
  sourceBasis?: SourceBasis[];
};

export type FundInvestor = {
  createdAt?:string;
  profile?:import('./lp-profile.ts').LpProfile; revision?:number; contactName?:string; contactPhone?:string; contactEmail?:string;
  id: string;
  fundId: string;
  name: string;
  type: string;
  commitment: string;
  paidIn: string;
  suitabilityStatus: string;
  signStatus: string;
  updatedAt: string;
  dataOrigin?: DataOrigin | string;
  dataPurpose?: DataPurpose;
  sourceBasis?: SourceBasis[];
};

export type FundDocument = {
  createdAt?:string;
  id: string;
  fundId: string;
  name: string;
  category: string;
  owner: string;
  archivedAt: string;
  path: string;
  dataOrigin?: DataOrigin | string;
  dataPurpose?: DataPurpose;
  sourceBasis?: SourceBasis[];
};

export type FundClause = {
  createdAt?:string;
  id: string;
  fundId: string;
  title: string;
  source: string;
  trigger: string;
  owner: string;
  status: string;
  dataOrigin?: DataOrigin | string;
  dataPurpose?: DataPurpose;
  sourceBasis?: SourceBasis[];
};

export type ProjectTask = {
  createdAt?:string;
  ownerId?: string | null;
  kind?: "manual"|"review"|"supplement"|"diligence"|"post_clause";
  approvalRoundId?: string | null;
  revision?: number;
  completedAt?: string | null;
  id: string;
  projectId: string;
  name: string;
  type: string;
  stage: string;
  owner: string;
  dueDate: string;
  status: string;
  priority: string;
  relation: string;
  note: string;
  updatedAt: string;
  dataOrigin?: DataOrigin | string;
  dataPurpose?: DataPurpose;
  sourceBasis?: SourceBasis[];
};

export type Material = {
  createdAt?:string;
  scopeRevision?:number;
  lpSensitive?: boolean;
  currentVersionPurpose?: DataPurpose;
  id: string;
  fundId: string | null;
  projectId: string | null;
  companyId?: string | null;
  version?: number;
  currentVersion?: number;
  currentVersionId?: string | null;
  name: string;
  type: string;
  uploader: string;
  time: string;
  source: string;
  status: string;
  quotes: string;
  project: string;
  path: string;
  primaryScope?: string | null;
  archivePath?: string | null;
  originalFilePath?: string | null;
  previewFilePath?: string | null;
  recognizedTextPath?: string | null;
  recognizedHtmlPath?: string | null;
  pageImageManifestPath?: string | null;
  pageImageDir?: string | null;
  sourceMaterialId?: string | null;
  fileExtension?: string | null;
  sizeBytes?: number | null;
  sha256?: string | null;
  relationships?: MaterialRelationships;
  dataOrigin?: DataOrigin | string;
  dataPurpose?: DataPurpose;
  sourceBasis?: SourceBasis[];
};

export type MaterialRelation = {
  id: string;
  name: string;
  relationType?: string;
  isPrimary?: boolean;
};

export type MaterialRelationships = {
  funds: MaterialRelation[];
  projects: MaterialRelation[];
  companies: MaterialRelation[];
  investors: MaterialRelation[];
};

export type MaterialTextSearchRelationType = "fund" | "project" | "company" | "investor";

export type MaterialTextChunk = {
  location?: string;
  id: string;
  materialId: string;
  dataOrigin?: string;
  dataPurpose?: DataPurpose;
  sourceBasis?: SourceBasis[];
  fileName: string;
  category: string;
  projectOrFund: string;
  archivePath: string;
  page: number;
  chunkIndex: number;
  text: string;
  recognizedTextPath: string;
  recognizedTextHref: string;
  originalPath: string;
  originalDocumentHref: string;
};

export type Report = {
  createdById?:string;lastApprovalById?:string;
  createdAt?:string;
  templateSnapshot?:import('../agent/model.ts').Template;
  sections?:{title:string;text:string}[];
  targetType?: "project" | "fund";
  targetId?: string;
  id: string;
  fundId: string | null;
  projectId: string | null;
  name: string;
  target: string;
  type: string;
  status: string;
  owner: string;
  updatedAt: string;
  dataOrigin?: DataOrigin | string;
  dataPurpose?: DataPurpose;
  sourceBasis?: SourceBasis[];
};

// Resolve old name-only callers only when exactly one object owns that exact name.
export function resolveReportTarget(input: Pick<Report, "target"> & Partial<Pick<Report, "fundId" | "projectId" | "targetType" | "targetId">>, projects: Pick<Project, "id" | "name" | "shortName" | "fundId">[], funds: Pick<Fund, "id" | "name" | "shortName">[]) {
  let projectId = input.projectId;
  let fundId = input.fundId;
  if (input.targetType || input.targetId) {
    if (!input.targetId || !["project", "fund"].includes(input.targetType ?? "")) throw new WorkflowError("invalid_report_target", 400);
    if (input.targetType === "project") {
      if (projectId && projectId !== input.targetId) throw new WorkflowError("report_target_conflict", 400);
      projectId = input.targetId;
    } else {
      if (projectId || (fundId && fundId !== input.targetId)) throw new WorkflowError("report_target_conflict", 400);
      fundId = input.targetId;
    }
  }
  if (!projectId && !fundId) {
    const matches = [
      ...projects.filter(p => p.name === input.target || p.shortName === input.target).map(p => ({ projectId: p.id, fundId: null as string | null })),
      ...funds.filter(f => f.name === input.target || f.shortName === input.target).map(f => ({ projectId: null as string | null, fundId: f.id })),
    ];
    if (matches.length > 1) throw new WorkflowError("report_target_ambiguous", 409);
    if (!matches.length) throw new WorkflowError("report_target_not_found", 404);
    ({ projectId, fundId } = matches[0]);
  }
  if (projectId) {
    const project = projects.find(p => p.id === projectId);
    if (!project) throw new WorkflowError("project_not_found", 404);
    if (fundId && fundId !== project.fundId) throw new WorkflowError("report_target_conflict", 400);
    return { projectId: project.id, fundId: project.fundId, target: project.name, targetType: "project" as const, targetId: project.id };
  }
  const fund = funds.find(f => f.id === fundId);
  if (!fund) throw new WorkflowError("fund_not_found", 404);
  return { projectId: null, fundId: fund.id, target: fund.name, targetType: "fund" as const, targetId: fund.id };
}

export type ReportExport = {
  sectionsSnapshot?:{title:string;text:string}[];
  dataOrigin?: DataOrigin | string;
  dataPurpose?: DataPurpose;
  sourceBasis?: SourceBasis[];
  id: string;
  reportId: string;
  reportName: string;
  fileName: string;
  downloadFileName: string;
  downloadMimeType: "text/html;charset=utf-8" | "application/pdf" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  format: "PDF" | "DOCX";
  exportedAt: string;
  actor: string;
  watermark: string;
  sources: string[];
};

export type CapitalRecord = {
  createdById?:string;lastApprovalById?:string;
  createdAt?:string;
  id: string;
  fundId: string;
  projectId: string | null;
  company: string;
  fund: string;
  received: string;
  date: string;
  rule: string;
  receivable: string;
  dueDate: string;
  status: string;
  source?: string;
  confirmationStatus?: string;
  updatedAt: string;
  dataOrigin?: DataOrigin | string;
  dataPurpose?: DataPurpose;
  sourceBasis?: SourceBasis[];
};

export type Meeting = {
  createdById?:string;lastApprovalById?:string;
  createdAt?:string;
  scheduleStatus?:'unknown'|'scheduled'|'in_progress'|'ended'|'cancelled';startsAt?:string;endsAt?:string;
  revision?:number;deletedAt?:string;deletedBy?:string;
  taskDueDate?:string;
  id: string;
  projectId: string | null;
  project: string;
  title: string;
  date: string;
  attendees: string;
  status: string;
  summary: string;
  todos: number;
  risks: number;
  conclusions: string[];
  todoItems: string[];
  riskItems: string[];
  dataOrigin?: DataOrigin | string;
  dataPurpose?: DataPurpose;
  sourceBasis?: SourceBasis[];
};

export type AiIntakeItem = {
  createdAt?:string;
  sourceMaterialId?: string;
  sourceVersionId?: string;
  ownerId?: string | null;
  id: string;
  title: string;
  inputType: "会议纪要" | "投资协议" | "财务报表";
  source: string;
  submittedBy: string;
  submittedAt: string;
  summary: string;
  confidence: string;
  suggestedFund: string;
  suggestedFundId?: string | null;
  suggestedProject: string;
  suggestedPath: string;
  extracted: string[];
  generatedTasks: string[];
  status: string;
  reviewNote?: string;
  dataOrigin?: DataOrigin | string;
  dataPurpose?: DataPurpose;
  sourceBasis?: SourceBasis[];
};

export type RiskRecord = {
  id: string;
  fundId?: string;
  projectId: string | null;
  target: string;
  title: string;
  type: string;
  level: string;
  source: string;
  time: string;
  summary: string;
  status: string;
  updatedAt: string;
  dataOrigin?: DataOrigin | string;
  dataPurpose?: DataPurpose;
  sourceBasis?: SourceBasis[];
};

export type AuditEvent = {
  id: string;
  module: string;
  action: string;
  targetType: string;
  targetId: string;
  targetName: string;
  actor: string;
  time: string;
  detail: string;
  source?: string;
  dataOrigin?: DataOrigin | string;
  dataPurpose?: DataPurpose;
  sourceBasis?: SourceBasis[];
};

export type LedgerState = {
  customFieldSchemas?: Schemas;
  companies?: Company[];
  risks?: RiskRecord[];
  funds: Fund[];
  projects: Project[];
  investors: FundInvestor[];
  documents: FundDocument[];
  clauses: FundClause[];
  tasks: ProjectTask[];
  materials: Material[];
  reports: Report[];
  reportExports: ReportExport[];
  capitalRecords: CapitalRecord[];
  meetings: Meeting[];
  aiIntakeItems: AiIntakeItem[];
  auditEvents: AuditEvent[];
};

type MaybePromise<T> = T | Promise<T>;

export const projectInitialStages = ["初筛", "立项", "尽调", "投决", "投后", "退出"] as const;
export type CreateProjectInput = CustomData & {
  stage?: typeof projectInitialStages[number];
  companyId?: string;
  newCompany?: CompanyMetadata;
  requestId: string;
  name: string;
  shortName: string;
  industry: string;
  fundId: string;
  manager: string;
  collaborators: string;
  sourceChannel: string;
  description: string;
};

export class ProjectCreationError extends Error {
  code: "invalid_project_payload" | "fund_not_found" | "project_request_conflict";
  fields: string[];

  constructor(code: ProjectCreationError["code"], fields: string[] = []) {
    super(code);
    this.code = code;
    this.fields = fields;
  }
}

export function normalizeProjectInput(value: unknown): CreateProjectInput {
  const limits = { requestId: 36, name: 200, shortName: 100, industry: 200, fundId: 200, manager: 200, collaborators: 2000, sourceChannel: 500, description: 20000 };
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ProjectCreationError("invalid_project_payload");
  const body = value as Record<string, unknown>;
  const fields = Object.keys(limits) as (keyof typeof limits)[];
  const invalid:string[] = fields.filter(key => typeof body[key] !== "string" || ((body[key] as string).length > limits[key] || (body[key] as string).includes("\0")));
  invalid.push(...Object.keys(body).filter(key => !Object.hasOwn(limits, key) && key !== "companyId" && key !== "newCompany" && key !== "customFields" && key !== "schemaRevision" && key !== "stage"));
  if (body.stage !== undefined && (typeof body.stage!=="string" || !projectInitialStages.includes(body.stage as typeof projectInitialStages[number]))) invalid.push("stage");
  if (invalid.length) throw new ProjectCreationError("invalid_project_payload", invalid);
  const input = Object.fromEntries(fields.map(key => [key, (body[key] as string).trim()])) as unknown as CreateProjectInput;
  const empty: string[] = (["name", "shortName", "industry", "fundId"] as const).filter(key => !input[key]);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)) empty.push("requestId");
  if (empty.length) throw new ProjectCreationError("invalid_project_payload", empty);
  input.requestId = input.requestId.toLowerCase();
  if(body.stage!==undefined)input.stage=body.stage as typeof projectInitialStages[number];
  Object.assign(input, companyBinding(body),customInput(body));
  return input;
}

export function projectCreationDetail(input: CreateProjectInput, actorId: string) {
  return JSON.stringify({ actorId, input });
}

export type LedgerStore = WorkflowStore & AccountStore & LifecycleStore & {
  readPendingBusinessNotices:()=>Promise<BusinessNotice[]>;
  acknowledgeBusinessNotices:(ids:string[])=>Promise<void>;
  healthCheck:()=>Promise<void>;
  readRecordManagement:()=>MaybePromise<RecordManagementData>;
  recordManagementTransaction:<T>(action:(state:RecordManagementState)=>T|Promise<T>)=>Promise<T>;
  readObjectAccessSnapshot:()=>Promise<import('../auth/object-access.ts').ObjectAccessSnapshot>;
  withObjectAccessLock:<T>(action:()=>Promise<T>)=>Promise<T>;
  accessTransaction:<T>(action:(state:AccessState)=>Promise<T>|T)=>Promise<T>;
  assistantTransaction:<T>(owner:string,action:(state:AssistantState)=>Promise<T>|T)=>Promise<T>;
  readPostInvestmentArchive(projectId:string,kind:'report'|'exit_preparation',id:string,version:string):MaybePromise<import('./post-report.ts').PostReport|import('./exit-preparation.ts').ExitPreparation|null>;
  readInvestmentLedgerSnapshot(): Promise<import('./investment-ledger.ts').InvestmentLedgerSnapshot>;
  masterTransaction<T>(action:(state:MasterState)=>T|Promise<T>):Promise<T>;
  listCompanies: () => MaybePromise<Company[]>;
  lpTransaction<T>(action:(state:LpState)=>Promise<T>|T):Promise<T>;
  fundTransaction<T>(action:(state:FundMasterState)=>T|Promise<T>):Promise<T>;
  readLpPrivacy: () => MaybePromise<{ identities: {id:string; name:string}[]; materialIds:string[]; materialVersions?:{id:string;materialId:string}[]; taskContexts?:{projectId:string;postInvestment?:WorkflowState['postInvestment'];deals?:WorkflowState['deals'];rounds?:ApprovalRound[]}[]; diligenceCases?:Pick<import('./diligence.ts').DiligenceCase,'projectId'|'items'|'findings'|'reports'|'supplements'>[] }>;
  listFunds: () => MaybePromise<Fund[]>;
  getFundDetail: (id: string) => MaybePromise<{
    fund: Fund;
    investors: FundInvestor[];
    documents: FundDocument[];
    clauses: FundClause[];
    projects: Project[];
    reports: Report[];
    capitalRecords: CapitalRecord[];
    auditEvents: AuditEvent[];
  } | null>;
  listProjects: () => MaybePromise<Project[]>;
  createProject: (input: CreateProjectInput, actor: { id: string; name: string }) => MaybePromise<{ project: Project; auditEvent: AuditEvent; created: boolean }>;
  updateProjectStage: (id: string, input: { stage: string; actor?: string }) => MaybePromise<{ project: Project; auditEvent: AuditEvent } | null>;
  getProjectDetail: (id: string) => MaybePromise<{
    project: Project;
    tasks: ProjectTask[];
    risks: RiskRecord[];
    materials: Material[];
    reports: Report[];
    meetings: Meeting[];
    capitalRecords: CapitalRecord[];
    auditEvents: AuditEvent[];
  } | null>;
  listTasks: (projectId?: string) => MaybePromise<ProjectTask[]>;
  createTask: (input: Omit<ProjectTask, "id" | "updatedAt"> & { id?: string }) => MaybePromise<{ task: ProjectTask; auditEvent: AuditEvent }>;
  updateTask: (id: string, patch: Partial<Omit<ProjectTask, "id" | "projectId">>) => MaybePromise<{ task: ProjectTask; auditEvent: AuditEvent } | null>;
  listMaterials: () => MaybePromise<Material[]>;
  listMaterialVersions: (id: string) => MaybePromise<MaterialVersion[]>;
  uploadMaterial: (input: UploadMaterialInput) => MaybePromise<UploadMaterialResult>;
  setMaterialProjects: (id: string, projectIds: string[], actor: {id:string;name:string}) => MaybePromise<{material:Material;auditEvent:AuditEvent}>;
  searchMaterialTextChunks: (input: {
    query: string;
    relationType?: MaterialTextSearchRelationType;
    relationId?: string;
    limit?: number;
    includeDemo?: boolean;
    allowedDataOrigins?: string[];
    allowedMaterialIds?: string[];
  }) => MaybePromise<MaterialTextChunk[]>;
  archiveMaterial: (
    input: Omit<Material, "id" | "fundId" | "projectId" | "path"> & Partial<Pick<Material, "fundId" | "projectId" | "path">>,
  ) => MaybePromise<{ material: Material; auditEvent: AuditEvent }>;
  listReports: () => MaybePromise<Report[]>;
  listReportExports: () => MaybePromise<ReportExport[]>;
  createReport: (
    input: Omit<Report, "id" | "fundId" | "projectId"> & Partial<Pick<Report, "id" | "fundId" | "projectId">>,
  ) => MaybePromise<{ report: Report; auditEvent: AuditEvent }>;
  saveReportContent:(id:string,sections:{title:string;text:string}[],expectedUpdatedAt:string,actor:{id:string;name:string},templateSnapshot?:Report['templateSnapshot'])=>MaybePromise<Report|null>;
  approveReport: (id: string,actor?:{id:string;name:string},expectedUpdatedAt?:string) => MaybePromise<{ report: Report; auditEvent: AuditEvent } | null>;
  exportReport: (id: string, format?: ReportExport["format"],actor?:{id:string;name:string}) => MaybePromise<{ report: Report; exportRecord: ReportExport; auditEvent: AuditEvent } | null>;
  listCapitalRecords: () => MaybePromise<CapitalRecord[]>;
  createCapitalRecord: (
    input: Omit<CapitalRecord, "id" | "fundId" | "projectId" | "updatedAt"> & Partial<Pick<CapitalRecord, "id" | "fundId" | "projectId">>,
    actor?:{id:string;name:string},
  ) => MaybePromise<{ capitalRecord: CapitalRecord; auditEvent: AuditEvent }>;
  updateCapitalRecord:(id:string,input:CapitalRecord,expectedUpdatedAt:string,actor:{id:string;name:string})=>MaybePromise<CapitalRecord>;
  confirmCapitalRecord: (id: string,actor?:{id:string;name:string}) => MaybePromise<{ capitalRecord: CapitalRecord; auditEvent: AuditEvent } | null>;
  handleRisk: (input: {
    title: string;
    target?: string;
    type?: string;
    level?: string;
    source?: string;
    time?: string;
    summary?: string;
    projectId?: string | null;
    actor?: string;
    result: string;
  }) => MaybePromise<{ risk: RiskRecord; auditEvent: AuditEvent } | null>;
  listRisks: () => MaybePromise<RiskRecord[]>;
  listAiIntakeItems: () => MaybePromise<AiIntakeItem[]>;
  updateAiIntakeSuggestion: (
    id: string,
    patch: Pick<AiIntakeItem, "suggestedFund" | "suggestedFundId" | "suggestedProject" | "suggestedPath">,
  ) => MaybePromise<{ item: AiIntakeItem; auditEvent: AuditEvent } | null>;
  rejectAiIntakeItem: (id: string, reviewNote: string) => MaybePromise<{ item: AiIntakeItem; auditEvent: AuditEvent } | null>;
  createAiIntakeItem: (input: Omit<AiIntakeItem, "status" | "reviewNote"> & Partial<Pick<AiIntakeItem, "status" | "reviewNote">>) => MaybePromise<{ item: AiIntakeItem; auditEvent: AuditEvent }>;
  archiveAiIntakeItem: (id: string, actor?: {id:string;name:string}) => MaybePromise<{
    item: AiIntakeItem;
    fundDocument: FundDocument;
    material: Material;
    tasks: ProjectTask[];
    auditEvents: AuditEvent[];
  } | null>;
  createMeeting: (meeting: Meeting, actor: {id:string;name:string}) => MaybePromise<Meeting>;
  updateMeeting:(id:string,input:Meeting,expectedRevision:number,actor:{id:string;name:string})=>MaybePromise<Meeting>;
  listMeetings: (deletedOnly?:boolean) => MaybePromise<Meeting[]>;
  setMeetingDeleted: (id:string,deleted:boolean,input:{requestId:string;expectedRevision:number},actor:{id:string;name:string})=>MaybePromise<Meeting>;
  confirmMeeting: (id: string, actor?: {id:string;name:string}, expectedRevision?:number, storageRoot?:string) => MaybePromise<{
    meeting: Meeting;
    material: Material;
    tasks: ProjectTask[];
    auditEvents: AuditEvent[];
  } | null>;
  listAuditEvents: (projectId?: string) => MaybePromise<AuditEvent[]>;
};

const DEFAULT_NOW = "2026-06-11 10:00";

export function createSeedLedgerState(): LedgerState {
  return {
    funds: [
      {
        id: "fundapp-growth-i",
        name: "示例成长一期基金",
        shortName: "示例成长一期",
        stage: "投后管理",
        manager: "演示投资经理",
        scale: "5.00 亿",
        paidIn: "4.72 亿",
        invested: "3.67 亿",
        balance: "1.05 亿",
        projectCount: 1,
        investorCount: 1,
        openTasks: 1,
        riskCount: 1,
        nextAction: "二季度投后报告需收集财务与经营数据",
        updatedAt: "2026-06-08",
      },
    ],
    projects: [
      {
        id: "demo-robotics",
        fundId: "fundapp-growth-i",
        name: "演示智能设备有限公司",
        shortName: "演示智能设备",
        fund: "示例成长一期基金",
        industry: "先进制造 / 智能装备",
        status: "已投",
        stage: "投后管理",
        manager: "演示投资经理",
        amount: "1 亿元",
        risk: "中",
        latest: "首笔 3000 万到账，需跟进二季度经营数据。",
        todoCount: 1,
        updatedAt: "2026-04-27",
        description: "公司聚焦工业级智能装备控制系统，为新能源、精密制造产线提供视觉检测、运动控制与设备联网方案。",
        thesis: "制造业设备智能化改造需求明确，团队具备核心控制算法与行业交付经验。",
        nextAction: "确认二季度订单、复核知识产权变更影响，并生成月度监控报告。",
      },
    ],
    investors: [
      {
        id: "investor-fundapp-growth-i-beijing-fundapp",
        fundId: "fundapp-growth-i",
        name: "演示机构投资人A",
        type: "机构投资者",
        commitment: "1.20 亿",
        paidIn: "1.20 亿",
        suitabilityStatus: "已完成",
        signStatus: "已签署",
        updatedAt: "2026-04-18",
      },
    ],
    documents: [
      {
        id: "document-fundapp-growth-i-q1-report",
        fundId: "fundapp-growth-i",
        name: "2026 Q1 基金运营报告.docx",
        category: "投后报告",
        owner: "演示投资经理",
        archivedAt: "2026-04-30",
        path: "基金档案 / 投后 / 季度报告",
      },
    ],
    clauses: [
      {
        id: "clause-fundapp-growth-i-quarterly-report",
        fundId: "fundapp-growth-i",
        title: "基金季度报告提交",
        source: "基金运营规则",
        trigger: "每季度结束后 15 个工作日内完成投资人报告",
        owner: "演示投资经理",
        status: "待收集数据",
      },
    ],
    tasks: [
      {
        id: "task-audit-report",
        projectId: "demo-robotics",
        name: "补充 2025 年审计报告",
        type: "资料补充",
        stage: "尽调",
        owner: "演示投资经理",
        dueDate: "2026-05-01",
        status: "已逾期",
        priority: "高",
        relation: "资料缺口 / 财务资料",
        note: "需企业财务负责人确认审计机构版本。",
        updatedAt: "2026-05-01",
      },
    ],
    materials: [],
    reports: [
      {
        id: "report-fundapp-growth-i-q1-2026",
        fundId: "fundapp-growth-i",
        projectId: null,
        name: "示例成长一期基金 2026 年一季度运营报告",
        target: "示例成长一期基金",
        type: "基金季度报告",
        status: "待审核",
        owner: "基金运营 / 演示财务经理",
        updatedAt: "2026-04-27 17:20",
      },
    ],
    reportExports: [],
    capitalRecords: [
      {
        id: "capital-demo-robotics-20260427",
        fundId: "fundapp-growth-i",
        projectId: "demo-robotics",
        company: "演示智能设备有限公司",
        fund: "示例成长一期基金",
        received: "3000 万元",
        date: "2026-04-27",
        rule: "年化 2%，按日计费",
        receivable: "407,671 元",
        dueDate: "2026-05-06",
        status: "未收",
        updatedAt: "2026-05-06",
      },
    ],
    meetings: [
      {
        id: "meeting-demo-robotics-20260608",
        projectId: "demo-robotics",
        project: "演示智能设备有限公司",
        title: "演示智能设备投后月度沟通会",
        date: "2026-06-08",
        attendees: "演示投资经理 / 企业财务负责人",
        status: "待确认",
        summary: "跟进二季度经营数据、核心客户回款与知识产权变更。",
        todos: 3,
        risks: 2,
        conclusions: ["二季度订单仍按计划推进", "补贴申报材料由企业本周内补齐", "专利变更需法务复核"],
        todoItems: ["收集二季度经营数据", "补齐补贴申报资料", "法务确认专利变更文件"],
        riskItems: ["行业增速放缓", "核心专利变更待复核"],
      },
    ],
    aiIntakeItems: [
      {
        id: "meeting-20260608",
        title: "基金管理系统 AI Agent 项目会议纪要",
        inputType: "会议纪要",
        source: "语音转写 / 逐字稿",
        submittedBy: "演示投资经理",
        submittedAt: "2026-06-08 14:21",
        summary: "识别到基金账本、AI 收件箱、资料归集、条款监控、报告协同、私有化部署等升级需求。",
        confidence: "92%",
        suggestedFund: "示例成长一期基金",
        suggestedProject: "平台建设项目",
        suggestedPath: "项目档案 / 会议纪要 / 需求沟通",
        extracted: ["新增基金账本", "AI 输入归档确认", "资料长期保存", "私有化部署与备份"],
        generatedTasks: ["补充基金全生命周期脱敏样例", "整理角色职责清单", "确认资料目录模板"],
        status: "待确认",
      },
      {
        id: "agreement-demo-robotics",
        title: "演示智能设备投资协议条款识别",
        inputType: "投资协议",
        source: "PDF 上传",
        submittedBy: "演示投后经理",
        submittedAt: "2026-06-07 16:40",
        summary: "识别到业绩承诺、回购触发、季度报告义务和管理费相关条款。",
        confidence: "88%",
        suggestedFund: "示例成长一期基金",
        suggestedProject: "演示智能设备有限公司",
        suggestedPath: "项目档案 / 协议条款 / 投资协议",
        extracted: ["2026 年营收承诺", "季度经营数据提交", "重大事项通知义务"],
        generatedTasks: ["创建业绩承诺监控项", "生成季度经营数据收集任务"],
        status: "待确认",
      },
      {
        id: "financial-q2",
        title: "二季度基金大表数据归档",
        inputType: "财务报表",
        source: "Excel 上传",
        submittedBy: "财务",
        submittedAt: "2026-06-06 10:15",
        summary: "识别到投资金额、到账金额、管理费应收和项目余额字段，可作为季度报告数据来源。",
        confidence: "95%",
        suggestedFund: "示例成长一期基金",
        suggestedProject: "演示智能设备有限公司",
        suggestedPath: "基金档案 / 账户资金 / 季度大表",
        extracted: ["已投金额 1.73 亿", "待收管理费 127.6 万", "演示智能设备到账 3000 万"],
        generatedTasks: ["财务确认管理费口径", "投资经理确认项目最新进展"],
        status: "已归档",
      },
    ],
    auditEvents: [
      {
        id: "audit-fundapp-growth-i-init",
        module: "资金事项",
        action: "生成管理费清单",
        targetType: "基金",
        targetId: "fundapp-growth-i",
        targetName: "示例成长一期基金",
        actor: "财务",
        time: "2026-05-08 09:30",
        detail: "基于到账记录和管理费规则生成应收提醒。",
        source: "资金规则",
      },
    ],
  };
}

export function createMemoryLedgerStore(initialState: LedgerState = createSeedLedgerState(), options:{sourcePurposes?:SourcePurposeEntry[]}={}) {
  const notificationOutbox=new Map<string,BusinessNotice>();
  const collectNotices=(value:object)=>{for(const event of takeNotices(value))notificationOutbox.set(event.id,structuredClone(event));};
  const purposes=purposeLookup(structuredClone(options.sourcePurposes??[]));
  const state = applySourcePurposes(cloneLedgerState(initialState),purposes);
  const lpMaterialIds = new Set(state.materials.filter(m=>isLpMaterial(m)).map(m=>m.id));
  const lpIdentities = new Map(state.investors.map(i=>[i.id+":"+i.name,{id:i.id,name:i.name}]));
  state.companies??=[];
  for(const project of state.projects){project.companyId??=null;project.masterRevision??=1;}
  let masterReceipts:MasterState["receipts"]={};
  const meetingActionReceipts=new Map<string,{fingerprint:string;result:Meeting}>();
  for(const fund of state.funds){fund.revision??=1;fund.managerId??=null;}
  for(const item of state.aiIntakeItems){
    if(item.suggestedFundId==null){const matches=state.funds.filter(f=>f.id===item.suggestedFund||f.name===item.suggestedFund||f.shortName===item.suggestedFund);if(matches.length===1)item.suggestedFundId=matches[0].id;}
  }
  let lpData=emptyLpData();
  const assistantConversations=new Map<string,AssistantConversation[]>();
  let fundReceipts:FundMasterState["receipts"]={};
  let sequence = 0;
  const versions: MaterialVersion[] = [];
  const users: StoredUser[] = [];
  let rounds: ApprovalRound[] = [];
  const postStates = new Map<string, import('./post-investment.ts').PostInvestmentState>();
  const deals = new Map<string, import('./deal.ts').DealBatch[]>();
  const diligences = new Map<string, import('./diligence.ts').DiligenceCase>();
  let receipts: Record<string,Receipt> = {};
  let workflowQueue: Promise<unknown> = Promise.resolve();
  let authSessions:AuthSession[]=[];let accountReceipts:Record<string,AccountReceipt>={};

  function serializeWorkflow<T>(action: () => T | Promise<T>): Promise<T> {
    const result = workflowQueue.then(action);
    workflowQueue = result.catch(() => {});
    return result;
  }

  function nextId(prefix: string, value: string) {
    sequence += 1;
    return `${prefix}-${slugify(value)}-${String(sequence).padStart(3, "0")}`;
  }

  function addAuditEvent(input: Omit<AuditEvent, "id" | "time"> & { time?: string }): AuditEvent {
    const event: AuditEvent = {
      dataOrigin:"system_generated",
      ...input,
      time: input.time ?? DEFAULT_NOW,
      id: nextId("audit", `${input.targetId}-${input.action}`),
    };
    state.auditEvents.unshift(event);
    return event;
  }

  const withObjectAccessLock=objectLock();
  let recordManagementData=emptyRecordManagement();
  const lifecycleData=new Map<string,LifecycleData>();
  let accessData:AccessData={funds:Object.fromEntries(state.funds.map(f=>[f.id,{visibility:'public' as const,memberIds:[],revision:1}])),projects:{}};
  const masterTransaction = <T>(action:(s:MasterState)=>T|Promise<T>):Promise<T> => serializeWorkflow(async()=>{
      const next:MasterState=structuredClone({legacyAudits:state.auditEvents,schemas:state.customFieldSchemas??emptySchemas(),companies:state.companies!,projects:state.projects,funds:state.funds,receipts:masterReceipts,auditEvents:[]});
      const result=await action(next);
      state.customFieldSchemas=next.schemas;state.companies=next.companies;state.projects=next.projects;masterReceipts=next.receipts;state.auditEvents.unshift(...next.auditEvents);
      return structuredClone(result);
    });
  const store = {
    readPendingBusinessNotices:async()=>[...notificationOutbox.values()].slice(0,200).map(v=>structuredClone(v)),
    acknowledgeBusinessNotices:async(ids:string[])=>{for(const id of ids)notificationOutbox.delete(id);},
    healthCheck:async()=>{},
    readRecordManagement:()=>structuredClone(recordManagementData),
    recordManagementTransaction:<T>(action:(s:RecordManagementState)=>T|Promise<T>)=>serializeWorkflow(async()=>{const next:RecordManagementState={data:structuredClone(recordManagementData),auditEvents:[]};const result=await action(next);recordManagementData=next.data;state.auditEvents.unshift(...next.auditEvents);return structuredClone(result);}),
    readObjectAccessSnapshot:async()=>structuredClone({data:accessData,funds:state.funds,projects:state.projects,materials:state.materials,rows:[...versions.map(v=>({id:v.id,materialId:v.materialId,objectType:'material_version'})),...state.companies!.map(c=>({id:c.id,objectType:'company',ownerId:c.ownerId})),...[...state.reports,...state.reportExports,...state.capitalRecords,...state.meetings].map(r=>({...r,objectType:'scoped'})),...state.aiIntakeItems.map(i=>({id:i.id,objectType:'scoped',ownerId:i.ownerId,sourceMaterialId:i.sourceMaterialId,sourceBasis:i.sourceBasis,fundId:i.suggestedFundId,projectId:state.projects.find(p=>[p.id,p.name,p.shortName].includes(i.suggestedProject))?.id})),...[...state.tasks,...state.investors,...state.documents,...state.clauses,...(state.risks??[])].map(r=>({...r,objectType:'scoped'}))]}),
    withObjectAccessLock,
    lifecycleTransaction:<T>(fundId:string,action:(s:LifecycleState)=>Promise<T>):Promise<T>=>serializeWorkflow(async()=>{
      const fund=state.funds.find(f=>f.id===fundId);if(!fund)throw new WorkflowError('fund_not_found',404);
      const next:LifecycleState=structuredClone({fund,users,sessions:authSessions,materials:state.materials,versions,investors:state.investors,data:lifecycleData.get(fundId)??emptyLifecycleData(),auditEvents:[]});
      applySourcePurposes(next,purposes);const result=await action(next);lifecycleData.set(fundId,next.data);state.auditEvents.unshift(...next.auditEvents);collectNotices(next);return structuredClone(result);
    }),
    accessTransaction:<T>(action:(s:AccessState)=>Promise<T>|T):Promise<T>=>withObjectAccessLock(()=>serializeWorkflow(async()=>{const next:AccessState=structuredClone({data:accessData,users,sessions:authSessions,auditEvents:[]});const result=await action(next);accessData=next.data;state.auditEvents.unshift(...next.auditEvents);return structuredClone(result);})),
    assistantTransaction:<T>(owner:string,action:(state:AssistantState)=>Promise<T>|T):Promise<T>=>serializeWorkflow(async()=>{const next:AssistantState=structuredClone({users,sessions:authSessions,conversations:assistantConversations.get(owner)??[]});const result=await action(next);assistantConversations.set(owner,next.conversations);return structuredClone(result);}),
    listCompanies: () => structuredClone(state.companies!),
    masterTransaction,
    lpTransaction: <T>(action:(s:LpState)=>Promise<T>|T):Promise<T> => serializeWorkflow(async()=>{
      const next:LpState=structuredClone({users,sessions:authSessions,purposes,deletedMaterialIds:recordManagementData.entries.filter(e=>e.kind==='material'&&e.deletedAt).map(e=>e.id),funds:state.funds,investors:state.investors,data:lpData,materials:state.materials,versions,auditEvents:[]});
      let result:T;try{result=await action(next);}catch(e){if(e&&typeof e==='object')Object.assign(e,{safeToDeleteBlob:true});throw e;}
      state.investors=next.investors;lpData=next.data;state.materials=next.materials;versions.splice(0,versions.length,...next.versions);state.auditEvents.unshift(...next.auditEvents);collectNotices(next);return structuredClone(result);
    }),
    fundTransaction: <T>(action:(s:FundMasterState)=>T|Promise<T>):Promise<T> => serializeWorkflow(async()=>{
      const next=structuredClone({schemas:state.customFieldSchemas??emptySchemas(),funds:state.funds,users,receipts:fundReceipts,auditEvents:[]}) as FundMasterState;
      const result=await action(next);
      state.customFieldSchemas=next.schemas;state.funds=next.funds;fundReceipts=next.receipts;state.auditEvents.unshift(...next.auditEvents);
      return structuredClone(result);
    }),
    accountTransaction: <T>(action:(s:AccountState)=>Promise<T>|T):Promise<T> => withObjectAccessLock(()=>serializeWorkflow(async()=>{
      const next:AccountState=structuredClone({users,sessions:authSessions,receipts:accountReceipts,auditEvents:[]});
      const result=await action(next);
      users.splice(0,users.length,...next.users);authSessions=next.sessions;accountReceipts=next.receipts;state.auditEvents.unshift(...next.auditEvents);
      return structuredClone(result);
    })),
    readAuthSession: async(hash:string)=>{const session=authSessions.find(s=>s.hash===hash);return session?structuredClone({session,user:users.find(u=>u.id===session.actorId)??null}):null;},
    listUsers: () => structuredClone(users),
    insertUser: (user: StoredUser) => { if(users.some(u=>u.email.toLowerCase()===user.email.toLowerCase())) throw new WorkflowError('email_exists',409); users.push(structuredClone(user)); },
    listPostInvestmentProjectIds: () => [...postStates.keys()],
    readInvestmentLedgerSnapshot: () => serializeWorkflow(() => structuredClone({capturedAt:new Date().toISOString(),funds:state.funds,companies:state.companies!,states:state.projects.map(project=>({project,deals:deals.get(project.id)??[],postInvestment:postStates.get(project.id)}))})),
    readExitStates: () => serializeWorkflow(() => structuredClone(state.projects.filter(project=>postStates.has(project.id)||(deals.get(project.id)??[]).length>0).map(project=>({project,deals:deals.get(project.id)??[],postInvestment:postStates.get(project.id)})))),
    readApprovals: (id: string) => structuredClone(rounds.filter(r=>r.projectId===id)),
    workflowTransaction: <T>(id:string,action:(s:WorkflowState)=>Promise<T>,options?:{reportSources?:boolean;exitPaymentIdentities?:boolean;bankEventIdentities?:boolean}):Promise<T> => {
      return serializeWorkflow(async()=>{
        const project=state.projects.find(p=>p.id===id); if(!project) throw new WorkflowError('project_not_found',404);
        const w:WorkflowState=structuredClone({...((options?.bankEventIdentities||options?.exitPaymentIdentities)?{bankEventIdentities:[...postStates.values()].flatMap(p=>[...(p.exitPayments??[]),...(p.investmentCashflows??[])])}:{}),...(options?.exitPaymentIdentities?{exitPaymentIdentities:[...postStates.values()].flatMap(p=>p.exitPayments??[])}:{}),...(options?.reportSources?{reportSources:{risks:[...(state.risks??[]).filter(v=>v.projectId===id),...(postStates.get(id)?.manualRisks??[]).filter(r=>!r.deletedAt)],capitalRecords:state.capitalRecords.filter(v=>v.projectId===id)}}:{}),project,postInvestment:postStates.get(id),deals:deals.get(id) ?? [],diligence:diligences.get(id) ?? null,tasks:state.tasks.filter(t=>t.projectId===id),rounds:rounds.filter(r=>r.projectId===id),receipts,auditEvents:[]});
        applySourcePurposes(w,purposes,undefined,id);
        let result:T; try { result=await action(w); } catch(error) { if(error && typeof error==='object') Object.assign(error,{safeToDeleteBlob:true}); throw error; }
        if(w.postInvestment){const persisted=structuredClone(w.postInvestment);restoreArchivedPurposeMetadata(persisted,postStates.get(id));postStates.set(id,persisted);} if(w.deals) deals.set(id,w.deals); if(w.diligence) diligences.set(id,w.diligence); Object.assign(project,w.project); state.tasks=[...state.tasks.filter(t=>t.projectId!==id),...w.tasks];rounds=[...rounds.filter(r=>r.projectId!==id),...w.rounds];receipts=w.receipts;state.auditEvents.unshift(...w.auditEvents);collectNotices(w);return structuredClone(result);
      });
    },
    readLpPrivacy: () => {
      for(const i of state.investors) lpIdentities.set(i.id+":"+i.name,{id:i.id,name:i.name});
      for(const m of state.materials) if(isLpMaterial(m)) lpMaterialIds.add(m.id);
      return {identities:[...lpIdentities.values(),...lpData.history,...state.investors.flatMap(i=>[...Object.values(i.profile?.fields??{}),...Object.values(i.profile?.extraFields??{}).filter((v):v is string=>typeof v==='string')].filter(Boolean).map(name=>({id:i.id,name:name!}))) ],materialIds:[...lpMaterialIds],taskContexts:structuredClone(state.projects.map(p=>({projectId:p.id,postInvestment:postStates.get(p.id),deals:deals.get(p.id),rounds:rounds.filter(r=>r.projectId===p.id)}))),diligenceCases:structuredClone([...diligences.values()].map(d=>({projectId:d.projectId,items:d.items,findings:d.findings,reports:d.reports,supplements:d.supplements}))),materialVersions:[...versions.map(v=>({id:v.id,materialId:v.materialId})),...state.materials.filter(m=>m.currentVersionId).map(m=>({id:m.currentVersionId!,materialId:m.id}))]};
    },
    listFunds: () => state.funds,
    getFundDetail: (id: string) => {
      const fund = state.funds.find((item) => item.id === id);
      if (!fund) return null;
      return {
        fund,
        investors: state.investors.filter((item) => item.fundId === id),
        documents: state.documents.filter((item) => item.fundId === id),
        clauses: state.clauses.filter((item) => item.fundId === id),
        projects: state.projects.filter((item) => item.fundId === id).map(p=>({...p,fund:fund.name})),
        reports: state.reports.filter((item) => item.fundId === id),
        capitalRecords: state.capitalRecords.filter((item) => item.fundId === id),
        auditEvents: state.auditEvents.filter((item) => item.targetId === id || item.source === fund.name),
      };
    },
    listProjects: () => {for(const p of state.projects)p.fund=state.funds.find(f=>f.id===p.fundId)?.name??p.fund;return state.projects;},
    createProject: (value: CreateProjectInput, actor: { id: string; name: string }) => {
      const input = normalizeProjectInput(value);
      return createBoundProject({masterTransaction} as LedgerStore,input,actor);
    },
    updateProjectStage: (id: string, input: { stage: string; actor?: string }) => {
      const project = state.projects.find((item) => item.id === id);
      if (!project) return null;

      const previousStage = project.stage;
      project.stage = input.stage;
      project.updatedAt = DEFAULT_NOW;
      const auditEvent = addAuditEvent({
        module: "项目账本",
        action: "更新项目阶段",
        targetType: "项目",
        targetId: project.id,
        targetName: project.name,
        actor: input.actor ?? project.manager,
        detail: `项目阶段从“${previousStage}”更新为“${project.stage}”。`,
        source: "项目详情",
      });
      return { project, auditEvent };
    },
    getProjectDetail: (id: string) => {
      const project = state.projects.find((item) => item.id === id);
      if (!project) return null;
      return {
        project: {...project,fund:state.funds.find(f=>f.id===project.fundId)?.name??project.fund},
        tasks: state.tasks.filter((item) => item.projectId === id),
        risks: [...(state.risks??[]).filter(item=>item.projectId===id),...(postStates.get(id)?.manualRisks??[]).filter(r=>!r.deletedAt)],
        materials: state.materials.filter((item) => item.projectId === id || item.relationships?.projects.some(relation => relation.id === id)),
        reports: state.reports.filter((item) => item.projectId === id),
        meetings: state.meetings.filter((item) => item.projectId === id&&!item.deletedAt),
        capitalRecords: state.capitalRecords.filter((item) => item.projectId === id),
        auditEvents: state.auditEvents.filter((item) => item.targetId === id || state.tasks.some(task => task.projectId === id && task.id === item.targetId)),
      };
    },
    listTasks: (projectId?: string) => state.tasks.filter((item) => !projectId || item.projectId === projectId),
    createTask: (input: Omit<ProjectTask, "id" | "updatedAt"> & { id?: string }) => {
      const task: ProjectTask = {
        ...input,
        id: input.id ?? nextId("task", input.name),
        updatedAt: DEFAULT_NOW,
      };
      state.tasks.unshift(task);
      const auditEvent = addAuditEvent({
        module: "任务中心",
        action: "创建任务",
        targetType: "项目",
        targetId: task.projectId,
        targetName: projectNameForTask(state.projects, task),
        actor: task.owner,
        detail: `创建${task.type}任务 ${task.id}：${task.name}，负责人 ${task.owner}，截止 ${task.dueDate}。`,
        source: task.relation,
      });
      return { task, auditEvent };
    },
    updateTask: (id: string, patch: Partial<Omit<ProjectTask, "id" | "projectId">>) => {
      const task = state.tasks.find((item) => item.id === id);
      if (!task) return null;

      Object.assign(task, patch, { updatedAt: DEFAULT_NOW });
      const auditEvent = addAuditEvent({
        module: "任务中心",
        action: "更新任务",
        targetType: "项目",
        targetId: task.projectId,
        targetName: projectNameForTask(state.projects, task),
        actor: task.owner,
        detail: `任务 ${task.id} 状态更新为 ${task.status}。`,
        source: task.relation,
      });
      return { task, auditEvent };
    },
    listMaterialVersions: (id: string) => versions.filter(v => v.materialId === id).sort((a, b) => b.version - a.version),
    uploadMaterial: (input: UploadMaterialInput): UploadMaterialResult => {
        const fingerprint = uploadFingerprint(input);
        const prior = versions.find(v => v.requestId === input.requestId);
        if (prior) {
            if (prior.fingerprint !== fingerprint)
                throw new MaterialWriteError('upload_request_conflict', 409);
            return {
                material: state.materials.find(m => m.id === prior.materialId)!,
                version: prior,
                auditEvent: state.auditEvents.find(a => a.id === prior.auditEventId)!,
                created: false
            };
        }
        const project = state.projects.find(p => p.id === input.projectId);
        const fund = input.fundId ? state.funds.find(f=>f.id===input.fundId) : undefined;
        const company = input.companyId ? state.companies!.find(c=>c.id===input.companyId) : undefined;
        if ([input.projectId,input.fundId,input.companyId].filter(Boolean).length!==1 || (input.companyId ? !company : input.fundId ? !fund : !project))
            throw new MaterialWriteError('project_not_found', 404);
        let material = input.materialId ? state.materials.find(m => m.id === input.materialId) : undefined;
        if (input.materialId && !material)
            throw new MaterialWriteError('material_not_found', 404);
        if (material && (input.companyId ? !material.relationships?.companies.some(c=>c.id===input.companyId) || Boolean(material.projectId) || Boolean(material.fundId) : input.fundId ? Boolean(material.projectId) || material.fundId !== input.fundId : material.projectId !== input.projectId))
            throw new MaterialWriteError('invalid_uploaded_material', 409);
        if (material && (material.name !== input.name || material.type !== input.type))
            throw new MaterialWriteError('material_identity_conflict', 409);
        const adoptingLegacy = Boolean(material && !material.currentVersionId);
        if (adoptingLegacy && !input.legacyVersion)
            throw new MaterialWriteError('legacy_original_unavailable', 409);
        if (material && (material.currentVersion ?? 0) !== input.expectedVersion)
            throw new MaterialWriteError('material_version_conflict', 409);
        const duplicate = !material && state.materials.find(m => m.currentVersionId && m.name === input.name && (input.companyId ? m.relationships?.companies.some(c=>c.id===input.companyId) : input.fundId ? !m.projectId && m.fundId===input.fundId : m.projectId === input.projectId || m.relationships?.projects.some(p => p.id === input.projectId)) && m.id !== material?.id);
        if (duplicate)
            throw new MaterialWriteError('material_name_conflict', 409, duplicate.id);
        if (!material)
            material = {
                id: `material-${randomUUID()}`,
                fundId: project?.fundId ?? fund?.id ?? null,
                projectId: project?.id ?? null,
                project: project?.name ?? fund?.name ?? company!.name,
                path: project ? '项目档案 / 用户上传' : company ? '企业档案 / 用户上传' : '基金档案 / 用户上传',
                name: input.name,
                type: input.type,
                uploader: input.actor.name,
                time: '',
                source: '用户上传',
                dataOrigin: 'user_input',
                status: '待复核',
                quotes: '0',
                primaryScope: project ? 'project' : company ? 'company' : 'fund',
                relationships: company ? {projects:[],funds:[],companies:[{id:company.id,name:company.name,relationType:'primary',isPrimary:true}],investors:[]} : project ? projectRelationships([project], state.funds) : {projects:[],funds:[{id:fund!.id,name:fund!.name,relationType:'primary',isPrimary:true}],companies:[],investors:[]}
            };
        const version: MaterialVersion = {
            id: input.versionId,
            blobId: input.versionId,
            materialId: material.id,
            version: adoptingLegacy ? 2 : (material.currentVersion ?? 0) + 1,
            name: input.name,
            sizeBytes: input.sizeBytes,
            sha256: input.sha256,
            mimeType: input.mimeType,
            uploadedBy: input.actor.name,
            uploadedById: input.actor.id,
            createdAt: new Date().toISOString(),
            requestId: input.requestId,
            fingerprint,
            auditEventId: ''
        };
        applyVersion(material, version, input.type);
        const auditEvent = addAuditEvent({
            module: '资料库',
            action: '上传资料版本',
            targetType: '资料',
            targetId: material.id,
            targetName: material.name,
            actor: input.actor.name,
            detail: `${adoptingLegacy ? "保留历史原件为版本 1；" : ""}上传版本 ${version.version}，SHA256 ${version.sha256}`,
            source: '用户上传',
            dataOrigin: 'user_input',
            time: version.createdAt
        });
        version.auditEventId = auditEvent.id;
        if (adoptingLegacy)
            versions.push({
                ...input.legacyVersion!,
                materialId: material.id,
                version: 1,
                auditEventId: auditEvent.id
            });
        versions.push(version);
        upsertById(state.materials, material);
        return {
            material,
            version,
            auditEvent,
            created: true
        };
    },
    setMaterialProjects: (id: string, projectIds: string[], actor: {
        id: string;
        name: string;
    }) => {
        const material = state.materials.find(m => m.id === id);
        if (!material)
            throw new MaterialWriteError('material_not_found', 404);
        const projects = projectIds.map(id => state.projects.find(p => p.id === id));
        if (projects.some(p => !p))
            throw new MaterialWriteError('project_not_found', 404);
        const selected = projects as Project[];
        const previousProjectIds = material.relationships?.projects.map(p => p.id) ?? [material.projectId];
        const preserveLegacy = !material.currentVersionId || versions.some(version => version.materialId === id && version.fingerprint.startsWith('legacy:'));
        Object.assign(material, {
            projectId: selected[0].id,
            fundId: preserveLegacy ? material.fundId ?? selected[0].fundId : selected[0].fundId,
            project: selected[0].name,
            relationships: materialProjectRelationships(material, selected, state.funds, preserveLegacy)
        });
        const auditEvent = addAuditEvent({
            module: '资料库',
            action: '调整项目关联',
            targetType: '资料',
            targetId: id,
            targetName: material.name,
            actor: actor.name,
            detail: `项目关联从 [${previousProjectIds.join(', ')}] 调整为 [${projectIds.join(', ')}]`,
            source: '用户上传',
            dataOrigin: 'user_input',
            time: new Date().toISOString()
        });
        return { material, auditEvent };
    },
    listMaterials: () => {
      for(const m of state.materials)for(const relation of m.relationships?.funds??[]){const fund=state.funds.find(f=>f.id===relation.id);if(fund)relation.name=fund.name;}
      for(const m of state.materials) { if(isLpMaterial(m)) lpMaterialIds.add(m.id); m.lpSensitive=lpMaterialIds.has(m.id); }
      return state.materials;
    },
    searchMaterialTextChunks: () => [],
    archiveMaterial: (input: Omit<Material, "id" | "fundId" | "projectId" | "path"> & Partial<Pick<Material, "fundId" | "projectId" | "path">>) => {
      const project = findProjectByDisplayName(state.projects, input.project);
      const material: Material = {
        ...input,
        id: nextId("material", input.name),
        fundId: input.fundId ?? project?.fundId ?? null,
        projectId: input.projectId ?? project?.id ?? null,
        path: input.path ?? inferMaterialPath(input.name, input.type, input.source),
      };
      state.materials.unshift(material);
      const auditEvent = addAuditEvent({
        module: "AI 收件箱",
        action: "确认资料归档",
        targetType: "资料",
        targetId: material.id,
        targetName: material.name,
        actor: material.uploader,
        detail: `确认归档到 ${material.path}。`,
        source: material.source,
      });
      return { material, auditEvent };
    },
    listReports: () => state.reports,
    listReportExports: () => state.reportExports.map(e=>({...e,...reportExportSource(e,state.reports.find(r=>r.id===e.reportId))})),
    createReport: (input: Omit<Report, "id" | "fundId" | "projectId"> & Partial<Pick<Report, "id" | "fundId" | "projectId">>) => {
      const target = resolveReportTarget(input, state.projects, state.funds);
      const report: Report = {
        ...input,
        id: input.id ?? nextId("report", input.name),
        ...target,
      };
      state.reports.unshift(report);
      const auditEvent = addAuditEvent({
        module: "报告中心",
        action: "保存报告草稿",
        targetType: "报告",
        targetId: report.id,
        targetName: report.name,
        actor: report.owner,
        detail: `保存${report.type}，目标对象 ${report.target}。`,
        source: "报告生成流程",
      });
      return { report, auditEvent };
    },
    saveReportContent:(id:string,sections:{title:string;text:string}[],expectedUpdatedAt:string,actor:{id:string;name:string},templateSnapshot?:Report['templateSnapshot'])=>serializeWorkflow(()=>{
      const report=state.reports.find(r=>r.id===id);if(!report)return null;if(report.updatedAt!==expectedUpdatedAt)throw new WorkflowError('report_revision_conflict',409);
      report.sections=structuredClone(sections);if(templateSnapshot)report.templateSnapshot=structuredClone(templateSnapshot);report.status='草稿';report.updatedAt=new Date(Math.max(Date.now(),Date.parse(report.updatedAt)+1||0)).toISOString();
      addAuditEvent({module:'报告中心',action:'保存报告正文',targetType:'报告',targetId:id,targetName:report.name,actor:actor.name,detail:JSON.stringify({actorId:actor.id,sections,templateSnapshot:report.templateSnapshot?{id:report.templateSnapshot.id,version:report.templateSnapshot.version,sourceMaterialId:report.templateSnapshot.sourceMapping?.materialId,sourceVersionId:report.templateSnapshot.sourceMapping?.versionId}:undefined}),source:'正文编辑'});return structuredClone(report);
    }),
    approveReport: (id: string,actor={id:'legacy-reviewer',name:'未指定审核人'},expectedUpdatedAt?:string) => serializeWorkflow(() => {
      const report = state.reports.find((item) => item.id === id);
      if (!report) return null;
      if(expectedUpdatedAt!==undefined&&report.updatedAt!==expectedUpdatedAt)throw new WorkflowError('report_revision_conflict',409);
      assertReportReady(report);

      report.status = "已完成";report.lastApprovalById=actor.id;
      report.updatedAt = new Date(Math.max(Date.now(),Date.parse(report.updatedAt)+1||0)).toISOString();
      const auditEvent = addAuditEvent({
        module: "报告中心",
        action: "审核通过报告",
        targetType: "报告",
        targetId: report.id,
        targetName: report.name,
        actor: actor.name,
        detail: `${report.type}已由${actor.name}审核通过，进入可导出状态。`,
        source: report.target,
      });
      return { report, auditEvent };
    }),
    exportReport: (id: string, format: ReportExport["format"] = "PDF",actor={id:'legacy-reviewer',name:'演示财务经理'}) => {
      const report = state.reports.find((item) => item.id === id);
      if (!report) return null;

      if(report.status!=='已完成')throw new WorkflowError('report_not_approved',409);
      assertReportReady(report);

      const extension = format.toLowerCase();
      const fileName = `${report.name.replace(/\s+/g, "-")}.${extension}`;
      const exportRecord: ReportExport = {
        ...reportExportSource({},report),
        id: nextId("export", report.name),
        reportId: report.id,
        reportName: report.name,
        fileName,
        downloadFileName: fileName,
        sectionsSnapshot: structuredClone(report.sections??[]),
        downloadMimeType: format==='PDF'?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        format,
        exportedAt: new Date().toISOString(),
        actor: actor.name,
        watermark: `内部材料 / ${actor.name} / ${new Date().toISOString()}`,
        sources: ["报告中心", "资料库", "审计日志"],
      };
      state.reportExports.unshift(exportRecord);
      const auditEvent = addAuditEvent({
        module: "报告中心",
        action: "生成报告导出包",
        targetType: "报告",
        targetId: report.id,
        targetName: report.name,
        actor: actor.name,
        detail: `生成正式文件：${exportRecord.downloadFileName}；目标格式：${format}。`,
        source: "报告中心",
      });
      return { report, exportRecord, auditEvent };
    },
    listCapitalRecords: () => {for(const r of state.capitalRecords)r.fund=state.funds.find(f=>f.id===r.fundId)?.name??r.fund;return state.capitalRecords;},
    createCapitalRecord: (input: Omit<CapitalRecord, "id" | "fundId" | "projectId" | "updatedAt"> & Partial<Pick<CapitalRecord, "id" | "fundId" | "projectId">>,actor?:{id:string;name:string}) => {
      validateCapitalReceipt(input);
      const fund = resolveFund(state.funds, input.fundId??input.fund);
      if(input.fundId&&!fund)throw new WorkflowError("fund_not_found",404);
      const project = resolveCapitalProject(state.projects, input);
      const capitalRecord: CapitalRecord = {
        ...input,createdById:actor?.id,
        id: input.id ?? nextId("capital", `${input.company}-${input.date}`),
        fundId: input.fundId ?? fund?.id ?? project?.fundId ?? "unknown-fund",
        projectId: project?.id ?? null,
        source: input.source ?? "人工创建",
        confirmationStatus: input.confirmationStatus ?? "待确认",
        updatedAt: new Date().toISOString(),
      };
      const prior=state.capitalRecords.find(r=>r.id===capitalRecord.id);
      if(prior){const auditEvent=state.auditEvents.find(e=>e.targetId===prior.id&&e.action==='创建资金事项');if(!sameCapitalCreate(prior as unknown as Record<string,unknown>,capitalRecord as unknown as Record<string,unknown>)||!auditEvent||auditEvent.time!==prior.updatedAt)throw new WorkflowError('capital_create_conflict',409);return {capitalRecord:prior,auditEvent};}
      state.capitalRecords.unshift(capitalRecord);
      const auditEvent = addAuditEvent({
        module: "资金事项",
        action: "创建资金事项",
        time:capitalRecord.updatedAt,
        targetType: "资金",
        targetId: capitalRecord.id,
        targetName: `${capitalRecord.company}${capitalRecord.received}`,
        actor: actor?.name??"演示投资经理",
        detail: `人工创建${capitalRecord.fund}资金事项，应收金额 ${capitalRecord.receivable}。`,
        source: capitalRecord.source,
      });
      return { capitalRecord, auditEvent };
    },
    updateCapitalRecord:(id:string,input:CapitalRecord,expectedUpdatedAt:string,actor:{id:string;name:string})=>serializeWorkflow(()=>{validateCapitalReceipt(input);const current=state.capitalRecords.find(r=>r.id===id);if(!current)throw new WorkflowError('capital_record_not_found',404);const keys=['fundId','projectId','company','received','date','rule','receivable','dueDate','status'] as const;if(current.updatedAt!==expectedUpdatedAt){if(keys.every(k=>current[k]===input[k]))return current;throw new WorkflowError('capital_revision_conflict',409);}if(!state.funds.some(f=>f.id===input.fundId)||input.projectId&&!state.projects.some(p=>p.id===input.projectId))throw new WorkflowError('capital_relation_not_found',404);const before=structuredClone(current);Object.assign(current,Object.fromEntries(keys.map(k=>[k,input[k]])),{updatedAt:new Date(Math.max(Date.now(),Date.parse(current.updatedAt)+1||0)).toISOString(),confirmationStatus:'待确认'});current.fund=state.funds.find(f=>f.id===current.fundId)!.name;addAuditEvent({module:'资金事项',action:'编辑资金事项',targetType:'资金',targetId:id,targetName:current.company,actor:actor.name,detail:JSON.stringify({before,after:current}),source:'人工维护资金事项'});return current;}),
    confirmCapitalRecord: (id: string,actor?:{id:string;name:string}) => serializeWorkflow(() => {
      const capitalRecord = state.capitalRecords.find((item) => item.id === id);
      if (!capitalRecord) return null;

      if(capitalRecord.status==='已收'&&capitalRecord.confirmationStatus?.includes('已确认')){const auditEvent=state.auditEvents.find(e=>e.targetId===capitalRecord.id&&e.action==='确认管理费到账');if(!auditEvent||auditEvent.time!==capitalRecord.updatedAt)throw new WorkflowError('capital_confirmation_already_recorded',409);return {capitalRecord,auditEvent};}
      requireCapitalReceipt(capitalRecord);
      capitalRecord.status = "已收";capitalRecord.lastApprovalById=actor?.id;
      capitalRecord.confirmationStatus = actor?actor.name+" 已确认":"AI 已确认";
      capitalRecord.updatedAt = new Date(Math.max(Date.now(),Date.parse(capitalRecord.updatedAt)+1||0)).toISOString();
      const fund = state.funds.find((item) => item.id === capitalRecord.fundId);
      const auditEvent = addAuditEvent({
        module: "资金事项",
        action: "确认管理费到账",
        time:capitalRecord.updatedAt,
        targetType: "资金",
        targetId: capitalRecord.id,
        targetName: `${capitalRecord.company} 管理费`,
        actor: actor?.name??"财务",
        detail: `仅登记本事项的人工到账确认，金额及口径须核对原凭证；不代表银行收付或基金账户同步。`,
        source: "基金账本 / 账户资金",
      });
      return { capitalRecord, auditEvent };
    }),
    handleRisk: (input: {
      title: string;
      target?: string;
      type?: string;
      level?: string;
      source?: string;
      time?: string;
      summary?: string;
      projectId?: string | null;
      actor?: string;
      result: string;
    }) => {
      const project = state.projects.find((item) => item.id === input.projectId || input.title.includes(item.name) || input.title.includes(item.shortName) || input.target === item.name);
      const risk: RiskRecord = {
        id: nextId("risk", input.title),
        projectId: project?.id ?? null,
        target: input.target ?? project?.name ?? input.title,
        title: input.title,
        type: input.type ?? "风险处理",
        level: input.level ?? project?.risk ?? "中",
        source: input.source ?? "风险监控",
        time: input.time ?? DEFAULT_NOW,
        summary: input.summary ?? input.result,
        dataOrigin: "user_input",
        status: "已处理",
        updatedAt: DEFAULT_NOW,
      };
      const auditEvent = addAuditEvent({
        module: "风险监控",
        action: "确认风险处理",
        targetType: project ? "项目" : "风险",
        targetId: project?.id ?? risk.id,
        targetName: input.title,
        actor: input.actor ?? project?.manager ?? "投后负责人",
        detail: `${risk.summary} 处理结果：${input.result}`,
        source: risk.source,
      });
      (state.risks??=[]).unshift(risk);
      return { risk, auditEvent };
    },
    listRisks:()=>state.risks??[],
    listAiIntakeItems: () => state.aiIntakeItems,
    updateAiIntakeSuggestion: (id: string, patch: Pick<AiIntakeItem, "suggestedFund" | "suggestedFundId" | "suggestedProject" | "suggestedPath">) => {
      const item = state.aiIntakeItems.find((entry) => entry.id === id);
      if (!item) return null;
      if(item.status!=="待确认")throw new WorkflowError("ai_intake_state_changed",409);

      const fund=resolveAiFund(state.funds,patch);
      Object.assign(item, patch, {
        suggestedFundId:fund?.id??null,
        suggestedFund:fund?.name??patch.suggestedFund,
        status: "待确认",
        reviewNote: "已人工修改归档建议，等待确认。",
      });
      const auditEvent = addAuditEvent({
        module: "AI 收件箱",
        action: "修改归档建议",
        targetType: "资料",
        targetId: item.id,
        targetName: item.title,
        actor: item.submittedBy,
        detail: `人工修改归属为 ${item.suggestedFund} / ${item.suggestedProject} / ${item.suggestedPath}。`,
        source: item.source,
      });
      return { item, auditEvent };
    },
    rejectAiIntakeItem: (id: string, reviewNote: string) => {
      const item = state.aiIntakeItems.find((entry) => entry.id === id);
      if (!item) return null;
      if(item.status!=="待确认")throw new WorkflowError("ai_intake_state_changed",409);

      item.status = "已退回";
      item.reviewNote = reviewNote;
      const auditEvent = addAuditEvent({
        module: "AI 收件箱",
        action: "退回归档建议",
        targetType: "资料",
        targetId: item.id,
        targetName: item.title,
        actor: item.submittedBy,
        detail: reviewNote,
        source: item.source,
      });
      return { item, auditEvent };
    },
    createAiIntakeItem: (input: Omit<AiIntakeItem, "status" | "reviewNote"> & Partial<Pick<AiIntakeItem, "status" | "reviewNote">>) => {
      if(input.sourceMaterialId && !state.materials.some(m=>m.id===input.sourceMaterialId && m.currentVersionId===input.sourceVersionId))throw new WorkflowError("ai_intake_source_changed",409);
      const fund=resolveAiFund(state.funds,input);
      const prior=state.aiIntakeItems.find(v=>v.id===input.id);
      if(prior && input.sourceMaterialId) return {item:prior,auditEvent:state.auditEvents.find(e=>e.targetId===prior.id)!};
      const item: AiIntakeItem = {
        ...input,
        dataOrigin:normalizeDataOrigin(prior?prior.dataOrigin:input.dataOrigin),
        ownerId:prior?prior.ownerId:input.ownerId,
        suggestedFundId:fund?.id??null,
        suggestedFund:fund?.name??input.suggestedFund,
        status: input.status ?? "待确认",
        reviewNote: input.reviewNote,
      };
      upsertById(state.aiIntakeItems,item);
      const auditEvent = addAuditEvent({
        module: "AI 收件箱",
        action: "创建收件草稿",
        targetType: "资料",
        targetId: item.id,
        targetName: item.title,
        actor: item.submittedBy,
        detail: `解析${item.inputType}，生成归档建议：${item.suggestedPath}。`,
        source: item.source,
      });
      return { item, auditEvent };
    },
    archiveAiIntakeItem: (id: string, actor?: {id:string;name:string}) => serializeWorkflow(() => {
      const item = state.aiIntakeItems.find((entry) => entry.id === id);
      if (!item) return null;

      if(!["待确认","已归档"].includes(item.status))throw new WorkflowError("ai_intake_state_changed",409);
      const fund = resolveAiFund(state.funds,item);
      if (!fund) return null;
      const project = findProjectByDisplayName(state.projects, item.suggestedProject);
      const sourceMaterial=item.sourceMaterialId?state.materials.find(m=>m.id===item.sourceMaterialId):undefined;
      if(item.sourceMaterialId && (!sourceMaterial || sourceMaterial.currentVersionId!==item.sourceVersionId)) throw new WorkflowError("ai_intake_source_changed",409);
      if(sourceMaterial && ((sourceMaterial.fundId??null)!==fund.id || (sourceMaterial.projectId??null)!==(project?.id??null)))throw new WorkflowError("ai_intake_scope_change_required",409);
      const archivedDate = item.submittedAt.slice(0, 10);
      const document: FundDocument = {
        dataOrigin:normalizeDataOrigin(item.dataOrigin),
        sourceBasis:sourceBasisOf(item,'intake',''),
        id: `document-ai-${item.id}`,
        fundId: fund.id,
        name: sourceMaterial?.name ?? `${item.title}.${documentExtensionForAiIntake(item.inputType)}`,
        category: item.inputType,
        owner: item.submittedBy,
        archivedAt: archivedDate,
        path: item.suggestedPath,
      };
      upsertById(state.documents, document);

      const material: Material = sourceMaterial ?? {
        dataOrigin:normalizeDataOrigin(item.dataOrigin),
        sourceBasis:sourceBasisOf(item,'intake',''),
        id: `material-ai-${item.id}`,
        fundId: fund.id,
        projectId: project?.id ?? null,
        name: document.name,
        type: materialCategoryForAiIntake(item.inputType),
        uploader: item.submittedBy,
        time: archivedDate,
        source: `AI 收件箱 / ${item.source}`,
        status: "已摘要",
        quotes: String(item.extracted.length),
        project: item.suggestedProject,
        path: item.suggestedPath,
      };
      if(sourceMaterial)Object.assign(material,{path:item.suggestedPath,archivePath:item.suggestedPath});
      upsertById(state.materials, material);

      const tasks=state.tasks.filter(task=>task.id.startsWith(`ai-${item.id}-`));

      item.status = "已归档";
      item.reviewNote = undefined;
      if(item.status==='已归档' && state.auditEvents.some(event=>event.action==='确认 AI 收件箱归档'&&event.source===`AI 收件箱:${item.id}`)) return {item,fundDocument:document,material,tasks,auditEvents:[]};
      const materialAudit = addAuditEvent({
        module: "AI 收件箱",
        action: "确认资料归档",
        targetType: "资料",
        targetId: material.id,
        targetName: material.name,
        actor: actor?.name ?? item.submittedBy,
        detail: `确认归档到 ${material.path}。`,
        source: material.source,
      });
      const taskAudits = tasks.map((task) =>
        addAuditEvent({
          module: "任务中心",
          action: "创建任务",
          targetType: "项目",
          targetId: task.projectId,
          targetName: projectNameForTask(state.projects, task),
          actor: actor?.name ?? task.owner,
          detail: `创建${task.type}任务 ${task.id}：${task.name}，负责人 ${task.owner}，截止 ${task.dueDate}。`,
          source: task.relation,
        }),
      );
      const intakeAudit = addAuditEvent({
        module: "AI 收件箱",
        action: "确认 AI 收件箱归档",
        targetType: "基金",
        targetId: fund.id,
        targetName: item.title,
        actor: actor?.name ?? item.submittedBy,
        detail: `确认归档到 ${item.suggestedPath}，并生成 ${tasks.length} 条建议任务。`,
        source: `AI 收件箱:${item.id}`,
      });
      return { item, fundDocument: document, material, tasks, auditEvents: [materialAudit, ...taskAudits, intakeAudit] };
    }),
    createMeeting: (meeting: Meeting,actor: {id:string;name:string}) => serializeWorkflow(() => {
      const prior=state.meetings.find(v=>v.id===meeting.id);
      if(prior){if(prior.deletedAt)throw new WorkflowError('meeting_deleted',409);if(!sameMeeting(prior,meeting))throw new WorkflowError('meeting_request_conflict',409);return prior;}
      if(!state.projects.some(p=>p.id===meeting.projectId))throw new WorkflowError('project_not_found',404);
      meeting.createdById=actor.id;meeting.revision=1;state.meetings.unshift(meeting);
      addAuditEvent({module:'会议纪要',action:'新建会议纪要',targetType:'项目',targetId:meeting.projectId!,targetName:meeting.title,actor:actor.name,detail:'保存待确认纪要，尚未归档或生成任务。',source:'会议纪要'});
      return meeting;
    }),
    updateMeeting:(id:string,input:Meeting,expectedRevision:number,actor:{id:string;name:string})=>serializeWorkflow(()=>{const current=state.meetings.find(m=>m.id===id&&!m.deletedAt);if(!current)throw new WorkflowError('meeting_not_found',404);if(current.status==='已归档'&&!sameMeetingMinutes(current,input))throw new WorkflowError('archived_meeting_readonly',409);if((current.revision??1)===expectedRevision+1&&sameMeeting(current,input))return current;if((current.revision??1)!==expectedRevision)throw new WorkflowError('meeting_revision_conflict',409);if(!state.projects.some(p=>p.id===input.projectId))throw new WorkflowError('project_not_found',404);const scheduleOnly=sameMeetingMinutes(current,input);Object.assign(current,input,{id,status:current.status,revision:expectedRevision+1,dataOrigin:current.dataOrigin});addAuditEvent({module:'会议纪要',action:scheduleOnly?'调整会议安排':'编辑会议纪要',targetType:'项目',targetId:current.projectId!,targetName:current.title,actor:actor.name,detail:scheduleOnly?JSON.stringify({scheduleStatus:current.scheduleStatus,startsAt:current.startsAt,endsAt:current.endsAt}):'编辑待确认会议内容，尚未归档或生成任务。',source:'会议纪要'});return current;}),
    listMeetings: (deletedOnly=false) => state.meetings.filter(m=>Boolean(m.deletedAt)===deletedOnly),
    setMeetingDeleted:(id:string,deleted:boolean,input:{requestId:string;expectedRevision:number},actor:{id:string;name:string})=>serializeWorkflow(()=>{
      const fingerprint=JSON.stringify({id,deleted,...input,actorId:actor.id}),prior=meetingActionReceipts.get(input.requestId);
      if(prior){if(prior.fingerprint!==fingerprint)throw new WorkflowError('meeting_request_conflict',409);return structuredClone(prior.result);}
      const current=state.meetings.find(m=>m.id===id);if(!current)throw new WorkflowError('meeting_not_found',404);
      const result=meetingVisibility(current,deleted,input.expectedRevision,actor);Object.assign(current,result);
      addAuditEvent({module:'会议纪要',action:deleted?'删除会议纪要':'恢复会议纪要',targetType:current.projectId?'项目':'会议纪要',targetId:current.projectId??id,targetName:current.title,actor:actor.name,detail:deleted?'移入最近删除，关联任务、资料和历史记录保留。':'从最近删除恢复，关联任务和资料未重复生成。',source:`会议纪要:${id}`});
      meetingActionReceipts.set(input.requestId,{fingerprint,result:structuredClone(result)});return result;
    }),
    confirmMeeting: (id: string, actor?: {id:string;name:string}, expectedRevision?:number, storageRoot?:string) => meetingFileTransaction(storageRoot, stage => serializeWorkflow(async () => {
      const meeting = state.meetings.find((entry) => entry.id === id&&!entry.deletedAt);
      if (!meeting) return null;
      if(expectedRevision!==undefined&&(meeting.revision??1)!==expectedRevision&&!(meeting.status==='已归档'&&(meeting.revision??1)===expectedRevision+1))throw new WorkflowError('meeting_revision_conflict',409);
      const project = meeting.projectId ? state.projects.find((entry) => entry.id === meeting.projectId) ?? null : findProjectByDisplayName(state.projects, meeting.project) ?? null;
      if(meeting.status==='已归档') {
        const material=state.materials.find(m=>m.id===`material-meeting-${meeting.id}`);
        if(material)return {meeting,material,tasks:project?state.tasks.filter(task=>meeting.dataOrigin==='user_input'?task.id.startsWith(`meeting-${project.id}-${meeting.id}-`):task.relation===`会议纪要 / ${meeting.title}`):[],auditEvents:[]};
        throw new WorkflowError('meeting_archive_unavailable',409);
      }
      if(state.materials.some(m=>m.id===`material-meeting-${meeting.id}`))throw new WorkflowError('meeting_archive_conflict',409);
      const version=await stage(meeting,actor??{id:'',name:project?.manager??'未指定确认人'});
      const archivedDate = version.createdAt;
      const material: Material = {
        dataOrigin:normalizeDataOrigin(meeting.dataOrigin),
        sourceBasis:sourceBasisOf(meeting,'meeting',''),
        id: `material-meeting-${meeting.id}`,
        fundId: project?.fundId ?? null,
        projectId: project?.id ?? null,
        name: `${meeting.title}.docx`,
        type: "会议资料",
        uploader: project?.manager ?? "演示投资经理",
        time: archivedDate,
        source: "会议纪要",
        status: "已摘要",
        quotes: String(meeting.conclusions.length + meeting.todoItems.length + meeting.riskItems.length),
        project: meeting.project,
        path: "项目档案 / 会议纪要 / 投后沟通",
      };

      applyVersion(material,version,"会议资料");
      material.source="会议纪要生成";material.status="已摘要";material.quotes=String(meeting.conclusions.length+meeting.todoItems.length+meeting.riskItems.length);
      upsertById(state.materials, material);
      versions.push(version);

      const tasks: ProjectTask[] = project
        ? meeting.todoItems.map((taskName, index) => ({
            id: meeting.dataOrigin==='user_input'?`meeting-${project.id}-${meeting.id}-${index + 1}`:`meeting-${project.id}-${index + 1}`,
            dataOrigin:normalizeDataOrigin(meeting.dataOrigin),
        sourceBasis:sourceBasisOf(meeting,'meeting',''),
            projectId: project.id,
            name: `跟进${taskName}`,
            type: "会议待办",
            stage: project.stage,
            owner: project.manager,
            ownerId:project.ownerId??(users.filter(u=>u.name===project.manager).length===1?users.find(u=>u.name===project.manager)!.id:null),
            dueDate: meeting.taskDueDate ?? "2026-06-12",
            status: "未开始",
            priority: meeting.risks > 0 ? "高" : "中",
            relation: `会议纪要 / ${meeting.title}`,
            note: `由${meeting.title}确认归档后生成。会议风险点：${meeting.riskItems.join("、") || "无"}`,
            updatedAt: DEFAULT_NOW,
          }))
        : [];
      for (let index=0;index<tasks.length;index++) { const existing=state.tasks.find(task=>task.id===tasks[index].id); if(existing) tasks[index]=existing; else state.tasks.unshift(tasks[index]); }

      if(meeting.status!=="已归档")meeting.revision=(meeting.revision??1)+1;meeting.status = "已归档";meeting.lastApprovalById=actor?.id;
      const materialAudit = addAuditEvent({
        module: "AI 收件箱",
        action: "确认资料归档",
        targetType: "资料",
        targetId: material.id,
        targetName: material.name,
        actor: actor?.name ?? material.uploader,
        detail: `确认归档到 ${material.path}。`,
        source: material.source,
      });
      const taskAudits = tasks.map((task) =>
        addAuditEvent({
          module: "任务中心",
          action: "创建任务",
          targetType: "项目",
          targetId: task.projectId,
          targetName: projectNameForTask(state.projects, task),
          actor: actor?.name ?? task.owner,
          detail: `创建${task.type}任务 ${task.id}：${task.name}，负责人 ${task.owner}，截止 ${task.dueDate}。`,
          source: task.relation,
        }),
      );
      const meetingAudit = addAuditEvent({
        module: "会议纪要",
        action: "确认会议纪要",
        targetType: project ? "项目" : "基金",
        targetId: project?.id ?? slugify(meeting.project),
        targetName: meeting.title,
        actor: actor?.name ?? material.uploader,
        detail: "会议纪要已归档到资料库，并绑定对应项目或基金。",
        source: `会议纪要:${meeting.id}`,
      });
      version.auditEventId=materialAudit.id;
      return { meeting, material, tasks, auditEvents: [materialAudit, ...taskAudits, meetingAudit] };
    }), true),
    listAuditEvents: (projectId?: string) => state.auditEvents.filter(item => !projectId || item.targetId === projectId || state.tasks.some(task => task.projectId === projectId && task.id === item.targetId)),
  };
  const creationCollections=()=>[state.companies??[],state.funds,state.projects,state.investors,state.documents,state.clauses,state.risks??[],state.tasks,state.materials,state.reports,state.capitalRecords,state.meetings,state.aiIntakeItems].filter(Boolean) as {id:string;createdAt?:string}[][];
  const creationTimes=new Map(creationCollections().flat().filter(row=>row.createdAt).map(row=>[row.id,row.createdAt!]));
  const creationLists=new Set(['listCompanies','listFunds','listProjects','listFundInvestors','listFundDocuments','listFundClauses','listTasks','listMaterials','listReports','listCapitalRecords','listMeetings','listAiIntakeItems','listRisks']);
  const readTypes:Record<string,string>={listCompanies:'company',listFunds:'fund',listProjects:'project',listTasks:'task',listMaterials:'material',listMaterialVersions:'material_version',listReports:'report',listReportExports:'report_export',listCapitalRecords:'capital',listMeetings:'meeting',listAiIntakeItems:'intake',listAuditEvents:'audit',readApprovals:'approval_round'};
  for(const [name,method] of Object.entries(store)) {
    const wrapped=(...args:unknown[])=>{
      const existing=new Map(creationCollections().flat().map(row=>[row.id,row.createdAt]));
      const result=(method as (...args:unknown[])=>unknown)(...args);
      const finish=(value:unknown)=>{
        const records=creationCollections().flat(),stamp=new Date().toISOString();
        for(const row of records){if(!existing.has(row.id)){if(!creationTimes.has(row.id))creationTimes.set(row.id,stamp);row.createdAt=creationTimes.get(row.id);}else if(existing.get(row.id))row.createdAt=existing.get(row.id);else delete row.createdAt;}
        const times=new Map(records.filter(r=>r.createdAt).map(r=>[r.id,r.createdAt]));
        const attachRow=(v:unknown)=>{if(v&&typeof v==='object'&&!Array.isArray(v)){const row=v as {id?:string;createdAt?:string};if(row.id&&times.has(row.id))row.createdAt=times.get(row.id);}};
        if(Array.isArray(value))value.forEach(attachRow);else if(value&&typeof value==='object'){attachRow(value);const dto=value as Record<string,unknown>;for(const key of ['company','fund','project','investor','material','report','meeting','task','capitalRecord','item','companies','funds','projects','investors','materials','reports','meetings','tasks','capitalRecords','documents','clauses','risks']){const part=dto[key];if(Array.isArray(part))part.forEach(attachRow);else attachRow(part);}}
        if((name==='getFundDetail'||name==='getProjectDetail')&&value&&typeof value==='object'){const detail=value as Record<string,unknown>;for(const key of ['investors','documents','clauses','projects','reports','capitalRecords','tasks','risks','materials','meetings'])if(Array.isArray(detail[key]))detail[key]=creationOrder(detail[key] as {id:string;createdAt?:string}[]);}
        if(name==='lpTransaction'&&value&&typeof value==='object'&&Array.isArray((value as {investors?:unknown}).investors)){const dto=value as {investors:{id:string;createdAt?:string}[]};dto.investors=creationOrder(dto.investors);}
        return creationLists.has(name)&&Array.isArray(value)?creationOrder(value):value;
      };
      const annotate=(value:unknown)=>applySourcePurposes(finish(value),purposes,readTypes[name],typeof args[0]==='string'?args[0]:'');
      return result instanceof Promise?result.then(annotate):annotate(result);
    };
    (store as unknown as Record<string,unknown>)[name]=wrapped;
  }
  return {...store,readPostInvestmentArchive:(projectId:string,kind:'report'|'exit_preparation',id:string,version:string)=>structuredClone((kind==='report'?postStates.get(projectId)?.reports:postStates.get(projectId)?.exitPreparations)?.find(v=>v.id===id&&String(v.version)===version)??null)};
}

function cloneLedgerState(state: LedgerState): LedgerState {
  return JSON.parse(JSON.stringify(state)) as LedgerState;
}

function upsertById<T extends { id: string }>(items: T[], nextItem: T) {
  const index = items.findIndex((item) => item.id === nextItem.id);
  if (index === -1) {
    items.unshift(nextItem);
  } else {
    items[index] = nextItem;
  }
}

function findProjectByDisplayName(projects: Project[], value: string) {
  return projects.find((item) => item.id === value || item.name === value || item.shortName === value);
}

function projectNameForTask(projects: Project[], task: ProjectTask) {
  return projects.find((item) => item.id === task.projectId)?.name ?? task.projectId;
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "item";
}

function inferMaterialPath(name: string, type: string, source: string) {
  const text = `${name} ${type} ${source}`;
  if (/信披|信息披露|半年度报告|年度报告|实施细则/.test(text)) return "基金档案 / 信息披露 / 报告模板";
  if (/清算|终止|股权转让|财产分配|合伙人大会/.test(text)) return "基金档案 / 清算退出 / 清算文件";
  if (/份额转让|转让申请/.test(text)) return "基金档案 / 重大事项 / 份额转让";
  if (/立项审批/.test(text)) return "基金档案 / 投资管理 / 立项审批";
  if (/资金到账|缴款|出资能力|审计报告/.test(text)) return "基金档案 / 募集 / 出资证明";
  if (/适当性|风险测评|基本信息表|合格投资者|回访|税收居民|风险匹配|调查表/.test(text)) {
    return "基金档案 / 募集 / 投资者适当性";
  }
  if (/托管协议|监督协议|无托管|合伙协议|招募说明|备案承诺|备案模版|风险揭示/.test(text)) {
    return "基金档案 / 募集 / 备案与协议";
  }
  if (/产品结构图|工商公示/.test(text)) return "基金档案 / 募集 / 基础信息";
  if (/功能构想|需求/.test(text)) return "产品资料 / 需求构想 / 功能说明";
  if (/协议|条款|PDF/.test(text)) return "项目档案 / 协议条款 / 投资协议";
  if (/会议|纪要|语音/.test(text)) return "项目档案 / 会议纪要 / 投后沟通";
  if (/财务|报表|Excel|xlsx/.test(text)) return "基金档案 / 账户资金 / 季度大表";
  return "项目档案 / 其他资料 / 待复核";
}

function documentExtensionForAiIntake(inputType: AiIntakeItem["inputType"]) {
  if (inputType === "投资协议") return "pdf";
  if (inputType === "财务报表") return "xlsx";
  return "txt";
}

function materialCategoryForAiIntake(inputType: AiIntakeItem["inputType"]) {
  if (inputType === "投资协议") return "法务资料";
  if (inputType === "财务报表") return "财务资料";
  return "会议资料";
}

function inferAiTaskType(taskName: string) {
  if (/[条款业绩回购监控]/.test(taskName)) return "条款监控";
  if (/[报告数据收集]/.test(taskName)) return "报告收集";
  if (/[补充资料整理]/.test(taskName)) return "资料补充";
  if (/[确认复核口径]/.test(taskName)) return "人工确认";
  return "任务跟进";
}

function inferAiTaskPriority(taskName: string) {
  return /[业绩管理费确认复核口径风险条款]/.test(taskName) ? "高" : "中";
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function resolveFund(funds:Fund[],value:string){
  const id=funds.find(f=>f.id===value);if(id)return id;
  const matches=funds.filter(f=>f.name===value||f.shortName===value);
  if(matches.length>1)throw new WorkflowError('fund_ambiguous',409);
  return matches[0];
}

function resolveAiFund(funds:Fund[],input:Pick<AiIntakeItem,'suggestedFund'|'suggestedFundId'>){
  if(input.suggestedFundId!=null){const fund=funds.find(f=>f.id===input.suggestedFundId);if(!fund)throw new WorkflowError('fund_not_found',404);return fund;}
  return resolveFund(funds,input.suggestedFund);
}

export function resolveCapitalProject(projects:Project[],input:{projectId?:string|null;company:string}):Project|undefined{
  if(Object.hasOwn(input,'projectId')){
    if(input.projectId===null)return undefined;
    if(typeof input.projectId!=='string'||!input.projectId.trim()||input.projectId.length>200||input.projectId.includes('\0'))throw new WorkflowError('invalid_capital_record_payload',400);
    const project=projects.find(p=>p.id===input.projectId);if(!project)throw new WorkflowError('project_not_found',404);return project;
  }
  const exact=projects.find(p=>p.id===input.company);if(exact)return exact;
  const matches=projects.filter(p=>p.name===input.company||p.shortName===input.company);
  if(matches.length>1)throw new WorkflowError('project_ambiguous',409);
  return matches[0];
}
