import type {RaisingView,RaisingTask,RaisingTemplate} from './fundraisingTypes';
import type {LpLedger,LpDetail,LpMasterInput,LpMoneyInput,LpInvestor,LpMaterial,LpTotals} from './lpLedgerTypes';
import type {CustomObjectType,CustomSchema,CustomSchemaWrite,CustomExportSnapshot,CustomWrite} from "./customFields.ts";
import type {RiskItem} from '../data/risks';
import {ledgerScopePath,type InvestmentLedger,type InvestmentLedgerScope} from './investmentLedgerTypes.ts';
import type {Company,CompanyInput,ProjectMasterInput} from './companyProjectTypes';
import {clientSessionEpoch,clientSessionContext,acceptClientSession,invalidateClientSession,sessionContextHeaders,responseSessionContext,establishClientSessionContext} from './sessionBoundary.ts';
import type {FundMasterInput,FundMasterResult,FundManager} from './fundMasterTypes';
import type {AccountUser,AccountDirectory,AccountCreate,AccountAction,AccountResult,OwnPasswordChange} from './accountTypes';
import type { PostInvestmentView, PostInvestmentState, PostInvestmentAction } from "./postInvestmentTypes";
import type { ExitSettlementAction, ExitSettlementView, ExitSettlementLedger } from './exitSettlementTypes';
import type {AssetHistoryAction,AssetHistoryView} from './assetHistoryTypes';
import type {InvestmentCashflowAction,InvestmentCashflowLedger,InvestmentCashflowView} from './investmentCashflowTypes';
import type {ReturnAction,ReturnView} from './returnBasisTypes';
import type { DealBatch, DealAction, DealFundAllocation } from "./dealTypes";
import type { DiligenceCase, DiligenceAction, DiligenceReport } from "./diligenceTypes";
import type { CapitalItem } from "../data/capital";
import type { AiIntakeItem, Fund, FundDocument, FundInvestor } from "../data/funds";
import type { MeetingRecord } from "../data/meetings";
import type { Project } from "../data/projects";
import type { ReportRecord } from "../data/reports";
import type { AuditEvent } from "./auditTrail";
import {isEngineeringRecord,type DataOrigin} from "./dataOrigin.ts";
import type { ApiMaterialRelationships, MaterialRecord } from "./materialFilters";
import type { MaterialTextChunk } from "./materialRag";
import type { ProjectTask } from "./workbenchLogic";

export type FundCompletenessField={label:string;detail:string;tab:string;action:string;kind:'missing'|'review'};
export type FundCompletenessResult={checkedAt:string;fundCount:number;rows:{fund:Pick<Fund,'id'|'name'|'dataOrigin'>;fields:FundCompletenessField[]}[]};
export type ApiFund = Fund;

export type ApiProjectCreateInput = CustomWrite & { stage?:"初筛"|"立项"|"尽调"|"投决"|"投后"|"退出"; requestId: string; name: string; shortName: string; industry: string; fundId: string; manager: string; collaborators: string; sourceChannel: string; description: string; companyId?:string; newCompany?:CompanyInput };

export type WorkflowUser = { id: string; name: string; email: string; role: string; canLogin: boolean };
export type ApprovalMaterial = { materialId: string; versionId?: string | null; name: string; sha256: string; sizeBytes: number; downloadHref?: string; readIssue?: string };
export type ApprovalDecision = { actor: ApiSessionUser; decision: "approve" | "return" | "reject"; opinion: string; time: string };
export type ApprovalRound = { id: string; projectId: string; meetingType: string; attempt: number; status: "pending" | "approved" | "returned" | "rejected"; revision: number; ownerId: string; submittedBy: ApiSessionUser; reviewers: ApiSessionUser[]; materials: ApprovalMaterial[]; dueDate: string; note: string; createdAt: string; decisions: ApprovalDecision[] };
export type ApprovalState = { ownerId: string | null; rounds: ApprovalRound[]; nextMeetingType: string | null; currentUser: ApiSessionUser };
export type WorkflowTask = ProjectTask & { projectId: string; ownerId?: string | null; kind?: string; approvalRoundId?: string | null; revision?: number; completedAt?: string | null; completionNote?: string };
export type WorkflowTaskInput = { requestId: string; projectId: string; name: string; type: string; stage: string; ownerId: string; dueDate: string; priority: string; relation: string; note: string };
export type WorkflowTaskUpdate = { requestId: string; expectedRevision: number; name?: string; type?: string; stage?: string; ownerId?: string; dueDate?: string; priority?: string; relation?: string; note?: string; status?: string; completionNote?: string };

export type ApiMaterialUpload = { file: File; requestId: string; type: string; projectId?: string; fundId?:string; materialId?: string; expectedVersion?: number };
export type ApiMaterialVersion = {dataPurpose?:string; historical?: boolean; id: string; materialId: string; version: number; name: string; sizeBytes: number; sha256: string; uploadedBy: string; createdAt: string; downloadHref: string };

export type ApiMaterial = {
  sourceBasis?:{id:string;dataOrigin:string;dataPurpose?:string;recordType?:string;projectId?:string}[];
  generatedDocumentHref?:string;
  generatedDocumentSource?:string;
  currentVersion?: number;
  currentVersionId?: string;
  id: string;
  fundId?: string | null;
  projectId?: string | null;
  companyId?: string | null;
  name: string;
  type: string;
  uploader: string;
  time: string;
  source: string;
  status: string;
  quotes: string;
  project: string;
  path?: string;
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
  relationships?: ApiMaterialRelationships;
  dataOrigin?: string;
  dataPurpose?:string;
  currentVersionPurpose?:string;
};

export type MaterialTextSearchRelationType = "fund" | "project" | "company" | "investor";

export type ApiMaterialPreviewLayoutBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ApiMaterialPreviewLayoutCache = {
  version: "material-preview-layout-cache/v1";
  generatedAt: string;
  source: {
    recognizedHtmlPath: string;
    rawHtmlPath?: string;
    summaryPath?: string;
  };
  page: {
    number: number;
    kind: "text" | "table";
    rotation: number;
    pdfRotation: number;
    pageBox: ApiMaterialPreviewLayoutBox;
    contentBox: ApiMaterialPreviewLayoutBox;
    coordinateSource: "ocr_metadata" | "estimated_from_ocr_html";
  };
  render: {
    mode: "page_box_text_reflow" | "table_complete_layout";
    html: string;
  };
  blocks: Array<{
    id: string;
    type: "text" | "title" | "table";
    tag: string;
    text: string;
    className?: string;
    box: ApiMaterialPreviewLayoutBox;
    coordinateSource: "ocr_metadata" | "estimated_from_ocr_html";
  }>;
  tables: Array<{
    id: string;
    box: ApiMaterialPreviewLayoutBox;
    rows: Array<Array<{ tag: "td" | "th"; text: string; rowSpan: number; colSpan: number }>>;
  }>;
  metrics: {
    textBlockCount: number;
    tableCount: number;
    rowCount: number;
    cellCount: number;
  };
};

export type ApiMaterialPreviewLayoutCacheBatchResult = {
  generatedCount: number;
  items: Array<{
    page: number;
    href: string;
    relativePath: string;
    blockCount: number;
    tableCount: number;
  }>;
};

export type ApiReportExportRecord = {
  dataOrigin?:string;
  sourceBasis?:{id:string;dataOrigin:string}[];
  id: string;
  reportId?: string;
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

export type ApiSessionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type ApiClient = ReturnType<typeof createApiClient>;

export type ApiMeetingRecord = MeetingRecord & { id: string; projectId?: string | null };

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type ApiClientOptions = {
  baseUrl?: string;
  fetchImpl?: FetchLike;
};

export function createApiClient({ baseUrl = "", fetchImpl = globalThis.fetch.bind(globalThis) }: ApiClientOptions = {}) {
  return {
    getFundraising: (fundId:string,id:string,includeDemo=true)=>request<RaisingView>(fetchImpl,baseUrl,`/api/funds/${encodeURIComponent(fundId)}/investors/${encodeURIComponent(id)}/fundraising?includeDemo=${includeDemo}`),
    actOnFundraising: (fundId:string,id:string,body:Record<string,unknown>)=>request<RaisingView>(fetchImpl,baseUrl,`/api/funds/${encodeURIComponent(fundId)}/investors/${encodeURIComponent(id)}/fundraising/actions`,{method:'POST',body:JSON.stringify(body)}),
    getFundraisingTemplates: ()=>request<{templates:RaisingTemplate[]}>(fetchImpl,baseUrl,'/api/fundraising/templates'),
    getFundraisingTasks: (includeDemo=true)=>request<{tasks:RaisingTask[]}>(fetchImpl,baseUrl,`/api/fundraising/tasks?includeDemo=${includeDemo}`),
    getCustomFieldSchema: (kind:CustomObjectType) => request<{schema:CustomSchema}>(fetchImpl,baseUrl,`/api/custom-field-schemas/${kind}`),
    saveCustomFieldSchema: (kind:CustomObjectType,body:CustomSchemaWrite) => request<{schema:CustomSchema}>(fetchImpl,baseUrl,`/api/custom-field-schemas/${kind}`,{method:"PUT",body:JSON.stringify(body)}),
    exportCustomFieldData: (kind:CustomObjectType) => request<CustomExportSnapshot>(fetchImpl,baseUrl,`/api/custom-field-export/${kind}`),
    getHealth: (signal?:AbortSignal) => request<{ok:boolean;maintenance?:{postInvestment?:{state:'initial'|'running'|'idle'|'failed';lastCompletedAt:string|null}}}>(fetchImpl,baseUrl,'/api/health',signal?{signal}:undefined),
    getAssetHistory: (filters:{q?:string;fundId?:string;status?:string;includeDemo?:'false'}={}) => request<{currentUser:ApiSessionUser;projects:AssetHistoryView[]}>(fetchImpl,baseUrl,'/api/asset-history?'+new URLSearchParams(Object.entries(filters).filter(([,v])=>Boolean(v)) as [string,string][])),
    getReturnBasis: (projectId:string,filters:{dealId?:string;fundId?:string;asOfDate?:string;knownAt?:string}={}) => request<ReturnView>(fetchImpl,baseUrl,`/api/projects/${encodeURIComponent(projectId)}/returns?`+new URLSearchParams(Object.entries(filters).filter(([,v])=>Boolean(v)) as [string,string][])),
    actOnReturnBasis: (projectId:string,input:ReturnAction) => request<{created:boolean;ledger:ReturnView}>(fetchImpl,baseUrl,`/api/projects/${encodeURIComponent(projectId)}/returns/actions`,{method:'POST',body:JSON.stringify(input)}),
    getInvestmentCashflows: (projectId:string,includeDemo=true) => request<InvestmentCashflowView>(fetchImpl,baseUrl,`/api/projects/${encodeURIComponent(projectId)}/investment-cashflows${includeDemo?'':'?includeDemo=false'}`),
    actOnInvestmentCashflows: (projectId:string,input:InvestmentCashflowAction) => request<{created:boolean;ledger:InvestmentCashflowView}>(fetchImpl,baseUrl,`/api/projects/${encodeURIComponent(projectId)}/investment-cashflows/actions`,{method:'POST',body:JSON.stringify(input)}),
    getInvestmentCashflowLedger: (filters:{fundId?:string;projectId?:string;includeDemo?:'false'}={}) => request<InvestmentCashflowLedger>(fetchImpl,baseUrl,'/api/investment-cashflows?'+new URLSearchParams(Object.entries(filters).filter(([,v])=>Boolean(v)) as [string,string][])),
    getProjectAssetHistory: (projectId:string,includeDemo=true,signal?:AbortSignal) => request<AssetHistoryView>(fetchImpl,baseUrl,`/api/projects/${encodeURIComponent(projectId)}/asset-history${includeDemo?'':'?includeDemo=false'}`,signal?{signal}:undefined),
    actOnAssetHistory: (projectId:string,input:AssetHistoryAction) => request<{created:boolean;asset:AssetHistoryView}>(fetchImpl,baseUrl,`/api/projects/${encodeURIComponent(projectId)}/asset-history/actions`,{method:'POST',body:JSON.stringify(input)}),
    getExitSettlement: (projectId:string,includeDemo=true,signal?:AbortSignal) => request<ExitSettlementView>(fetchImpl,baseUrl,`/api/projects/${encodeURIComponent(projectId)}/exit-settlements${includeDemo?'':'?includeDemo=false'}`,signal?{signal}:undefined),
    actOnExitSettlement: (projectId:string,input:ExitSettlementAction) => request<{created:boolean;settlement:ExitSettlementView}>(fetchImpl,baseUrl,`/api/projects/${encodeURIComponent(projectId)}/exit-settlements/actions`,{method:'POST',body:JSON.stringify(input)}),
    getExitSettlementLedger: (filters:{fundId?:string;projectId?:string;includeDemo?:'false'}={}) => request<ExitSettlementLedger>(fetchImpl,baseUrl,'/api/exit-settlements?'+new URLSearchParams(Object.entries(filters).filter(([,v])=>Boolean(v)) as [string,string][])),
    getPostInvestment: (projectId:string,includeDemo=true) => request<PostInvestmentView>(fetchImpl,baseUrl,`/api/projects/${encodeURIComponent(projectId)}/post-investment${includeDemo?'':'?includeDemo=false'}`),
    actOnPostInvestment: (projectId: string, input: PostInvestmentAction) => request<{ postInvestment: PostInvestmentState; created: boolean }>(fetchImpl, baseUrl, `/api/projects/${encodeURIComponent(projectId)}/post-investment/actions`, { method: "POST", body: JSON.stringify(input) }),
    getDeals: (projectId: string, signal?: AbortSignal) => request<{ deals: DealBatch[]; currentUser: ApiSessionUser }>(fetchImpl, baseUrl, `/api/projects/${encodeURIComponent(projectId)}/deals`, signal ? { signal } : undefined),
    createDeal: (projectId: string, input: { requestId: string; title: string; reviewerIds: string[] }) => request<{ deal: DealBatch; created: boolean }>(fetchImpl, baseUrl, `/api/projects/${encodeURIComponent(projectId)}/deals`, { method: "POST", body: JSON.stringify(input) }),
    actOnDeal: (projectId: string, dealId: string, input: DealAction) => request<{ deal: DealBatch; created: boolean }>(fetchImpl, baseUrl, `/api/projects/${encodeURIComponent(projectId)}/deals/${encodeURIComponent(dealId)}/actions`, { method: "POST", body: JSON.stringify(input) }),
    getFundDeals: (fundId: string,includeDemo=true) => request<{ allocations: DealFundAllocation[] }>(fetchImpl, baseUrl, `/api/funds/${encodeURIComponent(fundId)}/deals${includeDemo?'':'?includeDemo=false'}`),
    getInvestmentLedger: (scope:InvestmentLedgerScope,includeDemo=true) => request<InvestmentLedger>(fetchImpl,baseUrl,ledgerScopePath(scope)+(includeDemo?'':'?includeDemo=false')),
    getDiligence: (projectId: string,signal?:AbortSignal) => request<{ diligence: DiligenceCase | null; currentUser: ApiSessionUser }>(fetchImpl, baseUrl, `/api/projects/${encodeURIComponent(projectId)}/diligence`,signal?{signal}:undefined),
    createDiligence: (projectId: string, input: { requestId: string; reviewerIds: string[]; note: string }) => request<{ diligence: DiligenceCase; created: boolean }>(fetchImpl, baseUrl, `/api/projects/${encodeURIComponent(projectId)}/diligence`, { method: "POST", body: JSON.stringify(input) }),
    actOnDiligence: (projectId: string, input: DiligenceAction) => request<{ diligence: DiligenceCase; created: boolean }>(fetchImpl, baseUrl, `/api/projects/${encodeURIComponent(projectId)}/diligence/actions`, { method: "POST", body: JSON.stringify(input) }),
    getDiligenceReport: (projectId: string, reportId: string) => request<{ report: DiligenceReport; currentUser: ApiSessionUser }>(fetchImpl, baseUrl, `/api/projects/${encodeURIComponent(projectId)}/diligence/reports/${encodeURIComponent(reportId)}`),
    logout: (signal?:AbortSignal) => request(fetchImpl, baseUrl, "/api/session/logout", { method: "POST", signal }),
    getOwnAccount: () => request<{user:AccountUser}>(fetchImpl,baseUrl,'/api/session/account'),
    getAdminAccounts: () => request<AccountDirectory>(fetchImpl,baseUrl,'/api/admin/users'),
    createAccount: (input:AccountCreate) => request<AccountResult>(fetchImpl,baseUrl,'/api/users',{method:'POST',body:JSON.stringify(input)}),
    actOnAccount: (id:string,input:AccountAction) => request<AccountResult>(fetchImpl,baseUrl,`/api/admin/users/${encodeURIComponent(id)}/actions`,{method:'POST',body:JSON.stringify(input)}),
    revokeOwnSessions: (input:{requestId:string;expectedRevision:number|null}) => request<AccountResult>(fetchImpl,baseUrl,'/api/session/revoke-sessions',{method:'POST',body:JSON.stringify(input)}),
    changeOwnPassword: (input:OwnPasswordChange) => request<AccountResult>(fetchImpl,baseUrl,'/api/session/password',{method:'POST',body:JSON.stringify(input)}),
    getObjectAccess:()=>request<any>(fetchImpl,baseUrl,'/api/object-access'),
    setObjectAccess:(kind:string,id:string,body:unknown)=>request<any>(fetchImpl,baseUrl,`/api/object-access/${kind}/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(body)}),
    getDocumentTemplates:(fundId:string,deletedOnly=false)=>request<any>(fetchImpl,baseUrl,`/api/funds/${encodeURIComponent(fundId)}/document-templates${deletedOnly?'?deleted=true':''}`),
    saveDocumentTemplate:(fundId:string,body:unknown)=>request<any>(fetchImpl,baseUrl,`/api/funds/${encodeURIComponent(fundId)}/document-templates`,{method:'POST',body:JSON.stringify(body)}),
    getDocumentTemplateOptions:(fundId:string)=>request<any>(fetchImpl,baseUrl,`/api/funds/${encodeURIComponent(fundId)}/document-templates/generation-options`),
    getFundOperations:(includeDemo=true)=>request<import('./fundOperationsTypes').FundOperations>(fetchImpl,baseUrl,`/api/fund-operations?includeDemo=${includeDemo}`),
    getFundLifecycle:(fundId:string)=>request<any>(fetchImpl,baseUrl,`/api/funds/${encodeURIComponent(fundId)}/lifecycle`),
    actOnFundLifecycle:(fundId:string,body:unknown)=>request<any>(fetchImpl,baseUrl,`/api/funds/${encodeURIComponent(fundId)}/lifecycle/actions`,{method:'POST',body:JSON.stringify(body)}),
    getFundLifecycleMaterials:(fundId:string)=>request<any>(fetchImpl,baseUrl,`/api/funds/${encodeURIComponent(fundId)}/lifecycle/materials`),
    getUsers: () => request<{ users: WorkflowUser[] }>(fetchImpl, baseUrl, "/api/users"),
    createUser: (input: { name: string; email: string; role: string; password: string }) => request<{ user: WorkflowUser }>(fetchImpl, baseUrl, "/api/users", { method: "POST", body: JSON.stringify(input) }),
    setProjectOwner: (id: string, ownerId: string) => request(fetchImpl, baseUrl, `/api/projects/${encodeURIComponent(id)}/owner`, { method: "PUT", body: JSON.stringify({ ownerId }) }),
    getApprovals: (id: string, signal?: AbortSignal) => request<ApprovalState>(fetchImpl, baseUrl, `/api/projects/${encodeURIComponent(id)}/approvals`, signal ? { signal } : undefined),
    submitApproval: (id: string, input: { requestId: string; meetingType: string; reviewerIds: string[]; materialIds: string[]; dueDate: string; note: string }) => request(fetchImpl, baseUrl, `/api/projects/${encodeURIComponent(id)}/approvals`, { method: "POST", body: JSON.stringify(input) }),
    decideApproval: (id: string, roundId: string, input: { requestId: string; expectedRevision: number; decision: "approve" | "return" | "reject"; opinion: string }) => request(fetchImpl, baseUrl, `/api/projects/${encodeURIComponent(id)}/approvals/${encodeURIComponent(roundId)}/decisions`, { method: "POST", body: JSON.stringify(input) }),
    getFundConcernFindings:(includeDemo=true)=>request<{findings:import('./dashboardConcerns').FundConcernFinding[]}>(fetchImpl,baseUrl,'/api/ai/fund-completeness/findings?includeDemo='+includeDemo),
    getMaterialConcernFindings:()=>request<{findings:import('./dashboardConcerns').MaterialConcernFinding[]}>(fetchImpl,baseUrl,'/api/ai/material-completeness/findings'),
    getRiskRecords:(projectId?:string)=>request<{risks:import('../components/ManualRiskWorkspace').ManualRisk[]}>(fetchImpl,baseUrl,'/api/risks/records'+(projectId?'?projectId='+encodeURIComponent(projectId):'')),
    getFundProjectClauses:(fundId:string,includeDemo=true)=>request<{clauses:{id:string;title:string;status:string;trigger:string;project:{id:string;name:string}}[]}>(fetchImpl,baseUrl,`/api/funds/${encodeURIComponent(fundId)}/project-clauses?includeDemo=${includeDemo}`),
    getManualRisks:(id:string)=>request<{risks:import('../components/ManualRiskWorkspace').ManualRisk[]}>(fetchImpl,baseUrl,`/api/projects/${encodeURIComponent(id)}/manual-risks`),
    actManualRisk:(id:string,body:unknown)=>request(fetchImpl,baseUrl,`/api/projects/${encodeURIComponent(id)}/manual-risks/actions`,{method:'POST',body:JSON.stringify(body)}),
    getWorkflowTasks: (projectId?: string) => request<{ tasks: WorkflowTask[] }>(fetchImpl, baseUrl, `/api/tasks${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`),
    createWorkflowTask: (input: WorkflowTaskInput) => request(fetchImpl, baseUrl, "/api/tasks", { method: "POST", body: JSON.stringify(input) }),
    updateWorkflowTask: (id: string, input: WorkflowTaskUpdate) => request(fetchImpl, baseUrl, `/api/tasks/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) }),
    getSessionMe: () => request<{ user: ApiSessionUser }>(fetchImpl, baseUrl, "/api/session/me"),
    login: (credentials: { email: string; password: string }) =>
      request<{ user: ApiSessionUser }>(fetchImpl, baseUrl, "/api/session/login", {
        method: "POST",
        body: JSON.stringify(credentials),
      }),
    getFundManagers: () => request<{users:FundManager[]}>(fetchImpl,baseUrl,'/api/funds/managers'),
    createFund: (input:FundMasterInput) => request<FundMasterResult>(fetchImpl,baseUrl,'/api/funds',{method:'POST',body:JSON.stringify(input)}),
    updateFund: (id:string,input:FundMasterInput & {expectedRevision:number}) => request<FundMasterResult>(fetchImpl,baseUrl,`/api/funds/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(input)}),
    getLpLedger:(fundId:string,includeDemo=true)=>request<LpLedger>(fetchImpl,baseUrl,`/api/funds/${encodeURIComponent(fundId)}/investors?includeDemo=${includeDemo}`),
    getLpDetail:(fundId:string,id:string,includeDemo=true)=>request<LpDetail>(fetchImpl,baseUrl,`/api/funds/${encodeURIComponent(fundId)}/investors/${encodeURIComponent(id)}?includeDemo=${includeDemo}`),
    createLp:(fundId:string,input:LpMasterInput)=>request<LpDetail>(fetchImpl,baseUrl,`/api/funds/${encodeURIComponent(fundId)}/investors`,{method:'POST',body:JSON.stringify(input)}),
    updateLp:(fundId:string,id:string,input:LpMasterInput)=>request<LpDetail>(fetchImpl,baseUrl,`/api/funds/${encodeURIComponent(fundId)}/investors/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(input)}),
    saveLpMoney:(fundId:string,id:string,kind:'commitment'|'receipt'|'correction',input:LpMoneyInput,receiptId?:string)=>request<LpDetail>(fetchImpl,baseUrl,`/api/funds/${encodeURIComponent(fundId)}/investors/${encodeURIComponent(id)}/${kind==='commitment'?'commitments':kind==='receipt'?'receipts':`receipts/${encodeURIComponent(receiptId??'')}/corrections`}`,{method:'POST',body:JSON.stringify(input)}),
    exportLpLedger:(fundId:string,includeDemo=true)=>request<{filename:string;csv:string;totals:LpTotals}>(fetchImpl,baseUrl,`/api/funds/${encodeURIComponent(fundId)}/investors/ledger.csv?includeDemo=${includeDemo}`),
    uploadLpMaterial:(fundId:string,id:string,file:File,input:{requestId:string;expectedRevision:number;type:string;materialId?:string;expectedVersion?:number})=>request<{investor:LpInvestor;material:LpMaterial;version:{id:string}}>(fetchImpl,baseUrl,`/api/funds/${encodeURIComponent(fundId)}/investors/${encodeURIComponent(id)}/materials/upload?${new URLSearchParams({requestId:input.requestId,expectedRevision:String(input.expectedRevision),name:file.name,type:input.type,...(input.materialId?{materialId:input.materialId,expectedVersion:String(input.expectedVersion??0)}:{})})}`,{method:'POST',body:file,headers:{'content-type':'application/octet-stream'}}),
    checkFundCompleteness: (fundIds:string[],includeDemo=true) => request<FundCompletenessResult>(fetchImpl,baseUrl,"/api/ai/fund-completeness",{method:"POST",body:JSON.stringify({fundIds,includeDemo})}),
    getFunds: (includeDemo=true) => request<{ funds: ApiFund[] }>(fetchImpl, baseUrl, `/api/funds${includeDemo?'':'?includeDemo=false'}`),
    getFund: (id: string,includeDemo=true) =>
      request<{
        fund: ApiFund;
        investors: (FundInvestor & { id: string; updatedAt?: string })[];
        documents: (FundDocument & { id: string })[];
        clauses?: unknown[];
      }>(fetchImpl, baseUrl, `/api/funds/${encodeURIComponent(id)}${includeDemo?'':'?includeDemo=false'}`),
    getCompanies: () => request<{companies:Company[]}>(fetchImpl,baseUrl,'/api/companies'),
    getCompany: (id:string) => request<{company:Company;projects:Project[]}>(fetchImpl,baseUrl,`/api/companies/${encodeURIComponent(id)}`),
    createCompany: (input:CompanyInput & {requestId:string}) => request<{company:Company;auditEvent:AuditEvent;created:boolean}>(fetchImpl,baseUrl,'/api/companies',{method:'POST',body:JSON.stringify(input)}),
    updateCompany: (id:string,input:CompanyInput & {requestId:string;expectedRevision:number}) => request<{company:Company;auditEvent:AuditEvent;created:boolean}>(fetchImpl,baseUrl,`/api/companies/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(input)}),
    updateProjectMaster: (id:string,input:ProjectMasterInput) => request<{project:Project;auditEvent:AuditEvent;created:boolean}>(fetchImpl,baseUrl,`/api/projects/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(input)}),
    getProject: (id:string) => request<{project:Project;tasks:ProjectTask[];materials:ApiMaterial[];meetings:ApiMeetingRecord[];capitalRecords:CapitalItem[];auditEvents:AuditEvent[];risks:RiskItem[]}>(fetchImpl,baseUrl,`/api/projects/${encodeURIComponent(id)}`),
    createProject: (input: ApiProjectCreateInput) => request<{ project: Project; auditEvent: AuditEvent; created: boolean }>(fetchImpl, baseUrl, "/api/projects", { method: "POST", body: JSON.stringify(input) }),
    getProjects: () => request<{ projects: (Project & { fundId?: string })[] }>(fetchImpl, baseUrl, "/api/projects"),
    updateProjectStage: (id: string, payload: { stage: string; actor?: string }) =>
      request<{ project: Project & { fundId?: string }; auditEvent: AuditEvent }>(fetchImpl, baseUrl, `/api/projects/${encodeURIComponent(id)}/stage`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    getTasks: () => request<{ tasks: (ProjectTask & { projectId: string; updatedAt?: string })[] }>(fetchImpl, baseUrl, "/api/tasks"),
    uploadMaterial: (input: ApiMaterialUpload) => {
      const params = new URLSearchParams({ requestId: input.requestId, name: input.file.name, type: input.type,...(input.fundId?{fundId:input.fundId}:{projectId:input.projectId??''}) });
      if (input.materialId) params.set("materialId", input.materialId);
      if (input.expectedVersion !== undefined) params.set("expectedVersion", String(input.expectedVersion));
      return request<{ material: ApiMaterial; auditEvent: AuditEvent; created: boolean }>(fetchImpl, baseUrl, `/api/materials/upload?${params}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: input.file });
    },
    changeDocumentTemplateVisibility:(fundId:string,id:string,deleted:boolean,body:{requestId:string;expectedRevision:number;expectedTemplateVersion:number})=>request(fetchImpl,baseUrl,`/api/funds/${encodeURIComponent(fundId)}/document-templates/${encodeURIComponent(id)}/${deleted?'delete':'restore'}`,{method:'POST',body:JSON.stringify(body)}),
    updateCapitalRecord:(id:string,body:Record<string,unknown>)=>request(fetchImpl,baseUrl,`/api/capital-records/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(body)}),
    updateMeetingSchedule:(id:string,body:{expectedRevision:number;scheduleStatus:NonNullable<import('../data/meetings').MeetingRecord['scheduleStatus']>;startsAt?:string;endsAt?:string})=>request<{meeting:ApiMeetingRecord}>(fetchImpl,baseUrl,`/api/meetings/${encodeURIComponent(id)}/schedule`,{method:'PATCH',body:JSON.stringify(body)}),
    updateMeeting:(id:string,body:Record<string,unknown>)=>request<{meeting:import('../data/meetings').MeetingRecord&{id:string}}>(fetchImpl,baseUrl,`/api/meetings/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(body)}),
    getDeletedRecords: (kind:string) => request<{records:{id:string;kind:'company'|'project'|'fund'|'material'|'report'|'capital'|'intake'|'investor';title:string;deletedAt:string;fundId?:string|null}[];versions:Record<string,string>}>(fetchImpl,baseUrl,`/api/record-management/${encodeURIComponent(kind)}`),
    changeRecordVisibility: (kind:string,id:string,deleted:boolean,body:{requestId:string;expectedVersion:string}) => request(fetchImpl,baseUrl,`/api/record-management/${encodeURIComponent(kind)}/${encodeURIComponent(id)}/${deleted?'delete':'restore'}`,{method:'POST',body:JSON.stringify({requestId:body.requestId,expectedVersion:body.expectedVersion})}),
    getMaterialExtractionText: (id:string,page:number) => request<{page:number;pageCount:number;text:string;method:string;versionId:string}>(fetchImpl,baseUrl,`/api/materials/${encodeURIComponent(id)}/extraction/text?page=${page}`),
    getMaterialExtraction: (id: string) => request<{versionId:string;status:'ready'|'failed'|'pending';pages:number;characters:number;methods?:string[]}>(fetchImpl,baseUrl,`/api/materials/${encodeURIComponent(id)}/extraction`),
    retryMaterialExtraction: (id: string) => request<{versionId:string;status:'ready'|'failed'|'pending';pages:number;characters:number;methods?:string[]}>(fetchImpl,baseUrl,`/api/materials/${encodeURIComponent(id)}/extraction`,{method:'POST'}),
    getMaterialVersions: (id: string) => request<{ versions: ApiMaterialVersion[] }>(fetchImpl, baseUrl, `/api/materials/${encodeURIComponent(id)}/versions`),
    updateMaterialProjects: (id: string, projectIds: string[]) => request<{ material: ApiMaterial; auditEvent: AuditEvent }>(fetchImpl, baseUrl, `/api/materials/${encodeURIComponent(id)}/projects`, { method: "PUT", body: JSON.stringify({ projectIds }) }),
    getMaterials: () => request<{ materials: ApiMaterial[] }>(fetchImpl, baseUrl, "/api/materials"),
    searchMaterialText: (input: {
      query: string;
      relationType?: MaterialTextSearchRelationType;
      relationId?: string;
      limit?: number;
      allowedDataOrigins?: DataOrigin[];
      includeDemo?: boolean;
    }) => {
      const params = new URLSearchParams({ q: input.query });
      if (input.relationType) params.set("relationType", input.relationType);
      if (input.relationId) params.set("relationId", input.relationId);
      if (input.limit) params.set("limit", String(input.limit));
      if(input.includeDemo===false)params.set("includeDemo","false");
      if (input.allowedDataOrigins?.length) params.set("allowedDataOrigins", input.allowedDataOrigins.join(","));
      return request<{ chunks: MaterialTextChunk[] }>(fetchImpl, baseUrl, `/api/materials/text-search?${params.toString()}`);
    },
    generateMaterialPreviewLayoutCache: (input: { recognizedHtmlHref: string; page: number }) =>
      request<{ href: string; relativePath: string; cache: ApiMaterialPreviewLayoutCache }>(
        fetchImpl,
        baseUrl,
        "/api/materials/preview-layout-cache",
        {
          method: "POST",
          body: JSON.stringify(input),
        },
      ),
    generateMaterialPreviewLayoutCacheBatch: (input: { recognizedHtmlHref: string; pages?: number[]; pageCount?: number }) =>
      request<ApiMaterialPreviewLayoutCacheBatchResult>(
        fetchImpl,
        baseUrl,
        "/api/materials/preview-layout-cache/batch",
        {
          method: "POST",
          body: JSON.stringify(input),
        },
      ),
    getAiIntakeItems: () => request<{ items: AiIntakeItem[] }>(fetchImpl, baseUrl, "/api/ai-intake-items"),
    getMeetings: (deletedOnly=false) => request<{ meetings: ApiMeetingRecord[] }>(fetchImpl, baseUrl, "/api/meetings"+(deletedOnly?"?deleted=true":"")),
    setMeetingDeleted: (id:string,deleted:boolean,body:{requestId:string;expectedRevision:number}) => request<{meeting:ApiMeetingRecord}>(fetchImpl,baseUrl,`/api/meetings/${encodeURIComponent(id)}/${deleted?'delete':'restore'}`,{method:'POST',body:JSON.stringify(body)}),
    saveReportContent:(id:string,sections:{title:string;text:string}[],expectedUpdatedAt:string,templateRef?:{id:string;version:number})=>request<{report:ReportRecord & {id:string;sections:{title:string;text:string}[]}}>(fetchImpl,baseUrl,`/api/reports/${encodeURIComponent(id)}/content`,{method:'PATCH',body:JSON.stringify({sections,expectedUpdatedAt,...(templateRef?{templateRef}:{})})}),
    getReports: () => request<{ reports: (ReportRecord & { id: string; fundId?: string | null; projectId?: string | null })[]; exportRecords?: ApiReportExportRecord[] }>(fetchImpl, baseUrl, "/api/reports"),
    getCapitalRecords: () => request<{ capitalRecords: (CapitalItem & { id: string; fundId?: string; projectId?: string | null; updatedAt?: string })[] }>(fetchImpl, baseUrl, "/api/capital-records"),
    getAuditEvents: () => request<{ auditEvents: AuditEvent[] }>(fetchImpl, baseUrl, "/api/audit-events"),
    archiveMaterial: (material: MaterialRecord | Omit<ApiMaterial, "id"> | ApiMaterial) =>
      request<{ material: ApiMaterial; auditEvent: AuditEvent }>(fetchImpl, baseUrl, "/api/materials/archive", {
        method: "POST",
        body: JSON.stringify(withoutSourceClaims(Array.isArray(material) ? materialTupleToPayload(material) : material)),
      }),
    createAiIntakeFromMaterial: (materialId:string,inputType:AiIntakeItem['inputType']) => request<{item:AiIntakeItem;auditEvent:AuditEvent|null}>(fetchImpl,baseUrl,'/api/ai-intake-items/from-material',{method:'POST',body:JSON.stringify({materialId,inputType})}),
    createAiIntakeItem: (item: AiIntakeItem) =>
      request<{ item: AiIntakeItem; auditEvent: AuditEvent }>(fetchImpl, baseUrl, "/api/ai-intake-items", {
        method: "POST",
        body: JSON.stringify({...withoutSourceClaims(item),...(item.dataOrigin==='seed_demo'?{isDemo:true}:{})}),
      }),
    updateAiIntakeSuggestion: (id: string, patch: Pick<AiIntakeItem, "suggestedFund" | "suggestedFundId" | "suggestedProject" | "suggestedPath">) =>
      request<{ item: AiIntakeItem; auditEvent: AuditEvent }>(fetchImpl, baseUrl, `/api/ai-intake-items/${encodeURIComponent(id)}/suggestion`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    rejectAiIntakeItem: (id: string, reviewNote: string) =>
      request<{ item: AiIntakeItem; auditEvent: AuditEvent }>(fetchImpl, baseUrl, `/api/ai-intake-items/${encodeURIComponent(id)}/reject`, {
        method: "POST",
        body: JSON.stringify({ reviewNote }),
      }),
    archiveAiIntakeItem: (id: string) =>
      request<{ item: AiIntakeItem; fundDocument: FundDocument & { id?: string }; material: ApiMaterial; tasks: (ProjectTask & { projectId: string })[]; auditEvents: AuditEvent[] }>(
        fetchImpl,
        baseUrl,
        `/api/ai-intake-items/${encodeURIComponent(id)}/archive`,
        { method: "POST" },
      ),
    getMeetingSource: (body:{projectId:string;materialId:string}) => request<{sourceText:string}>(fetchImpl,baseUrl,'/api/meetings/source',{method:'POST',body:JSON.stringify(body)}),
    prepareMeeting: (body:{projectId:string;text?:string;materialId?:string}) => request<{draft:{title:string;date:string;attendees:string;summary:string;conclusions:string[];todoItems:string[];riskItems:string[];taskDueDate:string};sourceText:string}>(fetchImpl,baseUrl,'/api/meetings/prepare',{method:'POST',body:JSON.stringify(body)}),
    createMeeting: (body: {scheduleStatus?:import('../data/meetings').MeetingRecord['scheduleStatus'];startsAt?:string;endsAt?:string;taskDueDate?:string;requestId:string;projectId:string;title:string;date:string;attendees:string;summary:string;conclusions:string[];todoItems:string[];riskItems:string[]}) =>
      request<{meeting:ApiMeetingRecord}>(fetchImpl,baseUrl,'/api/meetings',{method:'POST',body:JSON.stringify(body)}),
    confirmMeeting: (id: string) =>
      request<{ meeting: ApiMeetingRecord; material: ApiMaterial; tasks: (ProjectTask & { projectId: string })[]; auditEvents: AuditEvent[] }>(
        fetchImpl,
        baseUrl,
        `/api/meetings/${encodeURIComponent(id)}/confirm`,
        { method: "POST" },
      ),
    createReport: (report: ReportRecord) =>
      request<{ report: ReportRecord & { id: string }; auditEvent: AuditEvent }>(fetchImpl, baseUrl, "/api/reports", {
        method: "POST",
        body: JSON.stringify(withoutSourceClaims(report)),
      }),
    approveReport: (id: string, expectedUpdatedAt: string) =>
      request<{ report: ReportRecord & { id: string }; auditEvent: AuditEvent }>(fetchImpl, baseUrl, `/api/reports/${encodeURIComponent(id)}/approve`, {
        method: "POST",
        body: JSON.stringify({ expectedUpdatedAt }),
      }),
    exportReport: (id: string, format: ApiReportExportRecord["format"] = "PDF") =>
      request<{ report: ReportRecord & { id: string }; exportRecord: ApiReportExportRecord; auditEvent: AuditEvent }>(
        fetchImpl,
        baseUrl,
        `/api/reports/${encodeURIComponent(id)}/export`,
        {
          method: "POST",
          body: JSON.stringify({ format }),
        },
      ),
    createCapitalRecord: (record: CapitalItem) =>
      request<{ capitalRecord: CapitalItem & { id: string }; auditEvent: AuditEvent }>(fetchImpl, baseUrl, "/api/capital-records", {
        method: "POST",
        body: JSON.stringify(withoutSourceClaims(record)),
      }),
    confirmCapitalRecord: (id: string) =>
      request<{ capitalRecord: CapitalItem & { id: string }; auditEvent: AuditEvent }>(fetchImpl, baseUrl, `/api/capital-records/${encodeURIComponent(id)}/confirm`, {
        method: "POST",
      }),
    confirmInvestorSignature: (id: string, input?:{requestId:string;expectedRevision:number}) =>
      request<LpDetail & {auditEvent:AuditEvent}>(
        fetchImpl,
        baseUrl,
        `/api/fund-investors/${encodeURIComponent(id)}/confirm-signature`,
        { method: "POST",body:JSON.stringify(input) },
      ),
    handleRisk: (payload: {
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
    }) =>
      request<{ risk: unknown; auditEvent: AuditEvent }>(fetchImpl, baseUrl, "/api/risks/handle", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  };
}

export function apiMaterialToRecord(material: ApiMaterial): MaterialRecord {
  return [
    material.name,
    material.type,
    material.uploader,
    material.time,
    material.source,
    material.status,
    material.quotes,
    material.project,
    material.dataOrigin??'unknown',
    isEngineeringRecord(material)?'engineering_fixture':'unknown',
  ];
}

function withoutSourceClaims<T extends object>(value:T){const {dataOrigin:_origin,sourceBasis:_basis,dataPurpose:_purpose,currentVersionPurpose:_versionPurpose,sourcePurposes:_purposes,...body}=value as T&{dataOrigin?:unknown;sourceBasis?:unknown;dataPurpose?:unknown;currentVersionPurpose?:unknown;sourcePurposes?:unknown};return body;}

async function request<T>(fetchImpl: FetchLike, baseUrl: string, path: string, init: RequestInit = {}): Promise<T> {
  const startedEpoch=clientSessionEpoch(),startedContext=clientSessionContext();
  const handshake=path==="/api/session/me";
  const authentication=path==="/api/session/login";
  const response = await fetchImpl(`${baseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...sessionContextHeaders(init.headers,authentication||handshake),
    },
  });

  if(!authentication&&startedEpoch!==clientSessionEpoch())throw Object.assign(new Error("Session changed while request was pending"),{status:409,code:"client_session_changed"});
  const nextContext=responseSessionContext(response);
  if(!authentication&&(startedContext??clientSessionContext())&&nextContext&&(startedContext??clientSessionContext())!==nextContext){invalidateClientSession('context_changed');throw Object.assign(new Error("Session identity changed"),{status:401,code:"session_context_changed"});}
  if (!response.ok) {
    let code: string | undefined; let fields: string[] | undefined; let latest: unknown; let existingMaterialId:string|undefined;
    try { const body = await response.json(); if (typeof body?.error === "string") code = body.error; if(Array.isArray(body?.fields))fields=body.fields.filter((v:unknown)=>typeof v==="string"); latest=body?.latest;if(typeof body?.existingMaterialId==='string')existingMaterialId=body.existingMaterialId; } catch { /* Non-JSON gateway errors still retain their status. */ }
    if(!authentication&&startedEpoch!==clientSessionEpoch())throw Object.assign(new Error("Session changed while error response was pending"),{status:409,code:"client_session_changed"});
    if(response.status===401&&!authentication)invalidateClientSession(code==='session_context_changed'?'context_changed':'unauthenticated');
    throw Object.assign(new Error(`API request failed: ${response.status} ${path}`), { status: response.status, code, ...(fields?{fields}:{}), ...(latest!==undefined?{latest}:{}),...(existingMaterialId?{existingMaterialId}:{}) });
  }

  const result=(await response.json()) as T;
  if(!authentication&&startedEpoch!==clientSessionEpoch())throw Object.assign(new Error("Session changed while response was pending"),{status:409,code:"client_session_changed"});
  if(authentication)acceptClientSession(nextContext);
  else if(handshake&&nextContext&&!startedContext)establishClientSessionContext(nextContext);
  if(path==="/api/session/logout")invalidateClientSession();
  return result;
}

function materialTupleToPayload(material: MaterialRecord): Omit<ApiMaterial, "id"> {
  return {
    name: material[0],
    type: material[1],
    uploader: material[2],
    time: material[3],
    source: material[4],
    status: material[5],
    quotes: material[6],
    project: material[7],
  };
}
