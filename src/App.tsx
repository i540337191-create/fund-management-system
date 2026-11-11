import {sessionEntry} from './lib/sessionEntry';
import {LoginScreen} from './components/LoginScreen';
import {ProjectAuditHistory} from './components/ProjectAuditHistory';
import {ReportGenerationTasks} from './components/ReportGenerationTasks';
import type {ReportGeneration} from './lib/reportGeneration';
import {FundFeeRegister} from './iterationB/FundFeeRegister';
import {UnifiedRiskWorkspace} from './components/UnifiedRiskWorkspace';
import {ReportCatalogue} from './components/ReportCatalogue';
import {ReportCreationDialog} from './components/ReportCreationDialog';
import {TaskBusinessViews} from './components/TaskBusinessViews';
import {MaterialReviewTicker} from './components/MaterialReviewTicker';
import {AppLoading} from './components/AppLoading';
import {MaterialDirectoryTree} from './components/MaterialDirectoryTree';
import {checkRouteChange,registerRouteGuard,routeCommittedEvent} from "./lib/routeGuard";
import {ProjectArchiveSummary} from "./components/ProjectArchiveSummary";
import {ProjectModuleNavigation} from "./components/ProjectModuleNavigation";
import {projectView} from "./lib/projectModules";
import {LedgerPagination} from "./components/LedgerPagination";
import {fundStageFromSearch} from './lib/dashboardLifecycle';
import {FundAccountMetrics} from "./iterationB/FundAccountMetrics";
import {ProjectHeaderA} from "./iterationB/ProjectHeaderA";
import {ProjectReviewStrip} from "./iterationB/ProjectReviewStrip";
import {InboxSourcePane} from './iterationA/InboxSourcePane';
import {MaterialDetailPane} from './iterationA/MaterialDetailPane';
import './iterationA/approved-c.css';
import "./iterationB/projectRegister.css";
import {FundOverviewMetrics} from './components/FundOverviewMetrics';
import {FundAuditJournal} from './iterationB/FundAuditJournal';
import {DossierSections} from './iterationB/DossierSections';
import {FundDossier} from "./iterationB/FundDossier";
import {fundDossierTab,fundFeeSection} from "./iterationB/fundDossierNavigation";
import {DocumentTemplateSettings} from "./components/DocumentTemplateSettings";
import {ProjectOverviewA} from "./iterationB/ProjectOverviewA";
import {CapitalRelationNotice} from "./iterationB/CapitalRelationNotice";
import {capitalScopeFund,capitalRelationNeedsConfirmation} from "./iterationB/capitalRelation";
import {riskGroups} from './iterationA/riskGroups';
import {CapitalPortfolio} from "./iterationB/CapitalPortfolioView";
import {CapitalDetailWorkspace} from "./iterationB/CapitalDetailWorkspace";
import {revealCapitalTarget} from "./iterationB/capitalNavigation";
import {useAgentWorkspace} from './lib/agentWorkspaceClient';
import {isOpenWorkspaceTask,matchesTaskFund} from './lib/taskFundScope';
import {ProjectNextAction} from './components/ProjectNextAction';
import {confirmAction} from './components/SystemConfirmation';
import {NotificationWorkspace} from './components/NotificationCenter';
import {AgentWorkbench,AgentTaskWorkspace,AgentTemplateWorkspace,AgentReminderPreferences} from './components/AgentWorkbench';
import {BusinessIntakePanel,bindBusinessIntake} from './components/BusinessIntakePanel';
import {ManualRiskWorkspace} from './components/ManualRiskWorkspace';
import {IntakeUploadDialog} from './components/IntakeUploadDialog';
import {FundInvestmentWorkspace,ScopedReportsWorkspace,ScopedMaterialsWorkspace,FundClauseWorkspace} from './components/BusinessEntryWorkspaces';
import {useMenuDismiss} from './lib/useMenuDismiss';
import {accountRoleLabels,type AccountUser} from './lib/accountTypes';
import {intakeQueue} from './lib/inboxView';
import {MaterialFileIcon} from './components/MaterialFileIcon';
import {filterMonitoringRisks,riskCategories} from './lib/riskMonitoring';
import {FundRelations} from './components/FundRelations';
import {isOpenTask} from './lib/taskDeadlineSummary';
import {ProjectStageChart} from './components/ProjectStageChart';
import {ReceivableAging} from './components/ReceivableAging';
import {capitalAgeBucket} from './lib/chartModels';
import {RecordManagementProvider,DeleteRecordButton,DeletedRecordsButton,useRecordManagement} from './components/RecordManagement';
import {MaterialExtractionButton} from './components/MaterialExtractionButton';
import {WorkflowDialog} from './components/MaterialFileDialogs';
import {NoticeHelp} from './components/NoticeHelp';
import { MeetingCreateDialog } from './components/MeetingCreateDialog';
import { ActionableNotice } from './components/ActionableNotice';
import { writeFailure, type WriteFailure } from './lib/writeFailure';
import {useBackdropDismiss} from './lib/useBackdropDismiss';
import {SettingsOverview} from './components/SettingsOverview';
import {MeetingScheduleDialog} from './components/MeetingScheduleDialog';
import {meetingScheduleLabels,meetingLocalTime,getUpcomingMeetings,upcomingMeetingScope,groupMeetingsByMonth} from './lib/meetingSchedule';
import {LifecycleLabelFilter} from './components/LifecycleLabelFilter';
import {matchesLifecycleLabel} from './lib/lifecycleLabels';
import {FundOperationsSummary} from './components/FundOperationsSummary';
import {auditActionLabel} from './lib/auditTrail';
import {DocumentTemplatesPanel} from './components/DocumentTemplatesPanel';
import {FundLifecyclePanel} from './components/FundLifecyclePanel';
import {ReportContentEditor} from './components/ReportContentEditor';
import {ObjectAccessPanel} from './components/ObjectAccessPanel';
import {downloadDocument} from './lib/documentDownload';
import {AiEmployeePage} from './components/AiEmployeePage';
import {FundraisingTasks} from './components/FundraisingPanel';
import {formatLpMoney} from './lib/lpLedgerView';
import {LpLedgerPanel} from './components/LpLedgerPanel';
import {canViewFullLp,canConfirmLpSignature} from './lib/lpPrivacy';
import {CustomFieldSettings} from './components/CustomFieldSettings';
import {CustomFieldForm,CustomFieldDetails,useCustomFields} from './components/CustomFieldInputs';
import {customErrorMessage} from './lib/customFields';
import {dataPurposeLabel,hasConfirmedSource} from './lib/dataOrigin';
import {useSourceScope} from './lib/useSourceScope';
import {SourceVisibilityContext,useHideSeedDemo} from './lib/sourceVisibility';
import {InvestmentLedgerPanel} from './components/InvestmentLedgerPanel';
import {useProjectEvidence} from './lib/useProjectEvidence';
import {CompanyRecordDialog} from './components/CompanyRecordDialog';
import {ProjectMasterEditor,CompanyBindingFields} from './components/ProjectMasterEditor';
import {companyBindingPayload,emptyCompanyBinding,canEditProjectMaster} from './lib/companyProjectTypes';
import {FundMasterEditor} from './components/FundMasterEditor';
import {canManageFunds,resolveIntakeFundId,selectedIntakeFund} from './lib/fundMasterTypes';
import {AccountSettingsPanel} from './components/AccountSettingsPanel';
import {subscribeSessionInvalidation,fetchInSession,clientSessionEpoch,invalidateClientSession} from './lib/sessionBoundary';
import { DashboardWorkspace } from "./components/DashboardWorkspace";
import { PostInvestmentPanel as PostInvestmentWorkspace } from "./components/PostInvestmentPanel";
import { DealPanel, FundDealPanel } from "./components/DealPanel";
import {ExitSettlementLedgerPanel} from './components/ExitSettlementPanel';
import {InvestmentCashflowLedgerPanel} from './components/InvestmentCashflowPanel';
import {withAssetHistory,isHistoricalAsset,isExitingAsset,isManagedProject,projectLifecycleLabel,assetAiContext,assetAiNotice,matchesProjectAssetCategory} from './lib/projectAssetHistory';
import type {AssetHistoryView} from './lib/assetHistoryTypes';
import { DiligencePanel } from "./components/DiligencePanel";
import { saveReportTaskWorkflow, type ReportSaveProgress } from "./lib/reportTaskSave";
import { ProjectApprovalPanel, WorkflowTaskBoard, WorkflowTaskDialog } from "./components/WorkflowPanels";
import { MaterialOriginalImageButton } from "./components/MaterialOriginalImageButton";
import { MaterialUploadDialog, MaterialVersionDialog } from "./components/MaterialFileDialogs";
import {
  Fragment,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  Archive,
  Layers3,
  Building2,
  ChartColumnIncreasing,
  Scale,
  Bookmark,
  Users,
  ReceiptText,
  Flag,
  BriefcaseBusiness,
  Info,
  CircleAlert,
  Circle,
  ClipboardCheck,
  ArrowUpRight,
  ArrowLeft,
  Link2,
  AlertTriangle,
  Bot,
  Calculator,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  ClipboardList,
  Columns2,
  Database,
  Download,
  FileCheck2,
  FileText,
  Filter,
  FolderOpen,
  Image,
  ListChecks,
  MessageSquareText,
  Mic,
  MoreHorizontal,
  PenLine,
  Plus,
  RotateCcw,
  RotateCw,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Upload,
  WalletCards,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Layout, navigate } from "./components/Layout";
import {
  Badge,
  Card,
  PrimaryButton,
  RiskBadge,
  SecondaryButton,
  SectionHeader,
  StatCard,
  StatusBadge,
  Table,
} from "./components/ui";
import { aiMessages, type ChatMessage } from "./data/aiMessages";
import { capitalItems, type CapitalItem } from "./data/capital";
import {
  aiIntakeItems,
  fundClauseMonitors,
  fundDocuments,
  fundInvestors,
  funds,
  type AiIntakeItem,
  type Fund,
  type FundClauseMonitor,
  type FundDocument,
} from "./data/funds";
import { meetings, type MeetingRecord } from "./data/meetings";
import { projects as seedProjects, projectBoard } from "./data/projects";
import type { Project, RiskLevel } from "./data/projects";
import { reportDraftSections, reports, reportTypes, type ReportRecord } from "./data/reports";
import { risks, riskTimeline } from "./data/risks";
import { MaterialKnowledgeProvider, useMaterialKnowledge } from "./lib/runtimeMaterialKnowledge";
import type { ApiProjectCreateInput } from "./lib/apiClient";
import {
  estimateInlineWrap,
  estimateTextBlock,
  estimateVirtualListHeights,
  TEXT_LAYOUT_FONTS,
} from "./lib/pretextLayout";
import {
  createApiMaterialDirectoryRows,
  createMaterialDirectoryRows,
  filterApiMaterials,
  filterMaterials,
  filterMaterialsByProject,
  selectProjectMaterialRecords,
  type ApiMaterialRecord,
  type MaterialDirectoryRow,
  type MaterialRecord,
  type MaterialRelationScope,
} from "./lib/materialFilters";
import type { MaterialKnowledgeEntry } from "./lib/materialKnowledge";
import {
  createMaterialPreviewEvidenceLinks,
  createMaterialPrimaryPreviewLink,
} from "./lib/materialPreviewLinks";
import { readMaterialPreviewHtmlPageKind, readMaterialPreviewHtmlPageSize } from "./lib/materialPreviewHtml";
import {
  createMaterialArchivePayload,
  createMaterialReviewDraft,
  type MaterialArchivePayload,
  type MaterialReviewDraft,
  type MaterialReviewPrimaryScope,
} from "./lib/materialReview";
import { createMaterialAssistantReply, isMaterialKnowledgePrompt } from "./lib/materialAssistant";
import {
  createAiIntakeArchiveResult,
  prependUniqueAuditLog,
  prependUniqueFundDocument,
  prependUniqueMaterialRecord,
  prependUniqueProjectTasks,
  rejectAiIntakeItem,
  updateAiIntakeSuggestion,
} from "./lib/aiIntakeArchive";
import {
  createManualCapitalRecord,
  saveManualCapitalRecord,
  type ManualCapitalDraft,
  prependManualCapitalRecord,
  upsertAiCapitalRecord,
} from "./lib/capitalRecords";
import {
  createMaterialGapTask,
  createRiskFollowUpTask,
  shanghaiCalendarDate,
  deriveDashboardDecisions,
  findProjectForTarget,
  upsertTaskForProject,
  type DashboardDecisionItem,
  type DashboardTodoItem,
  type ProjectTask,
  type TaskPriority,
  type TaskStatus,
} from "./lib/workbenchLogic";
import { deriveCapitalLedger, filterCapitalRecords } from "./lib/capitalLedger";
import {
  confirmFundFeeRecord,
  confirmFundInvestorSignature,
  deriveFundFeeRows,
  deriveFundReportRows,
  deriveFundraisingRows,
} from "./lib/fundLedger";
import {
  createAuditJsonExportPackage,
  createAuditEvent,
  filterAuditEvents,
  prependUniqueAuditEvent,
  type AuditEvent,
} from "./lib/auditTrail";
import { createMeetingConfirmationResult } from "./lib/meetingWorkflow";
import { createClauseReminderAuditEvent, createClauseReminderTask } from "./lib/clauseWorkflow";
import { createRiskAuditEvent, createRiskDecisionDetail } from "./lib/riskWorkflow";
import {
  approveReportRecord,
  createReportApprovalAuditEvent,
  createReportExportRecord,
  createReportHtmlExportPackage,
  type ReportExportRecord,
} from "./lib/reportApproval";
import {
  createReportMissingDataTasks,
  createSavedReportRecord,
  prependUniqueReport,
  type ReportWorkflowDraft,
} from "./lib/reportWorkflow";
import {
  DEFAULT_QWEN_AI_SETTINGS,
  createAiServiceStatus,
  createRuleBasedAiReply,
  fetchAiServiceStatus,
  requestProjectAiReply,
  type AiServiceStatus,
} from "./lib/aiService";
import { createMaterialRagReply, type MaterialTextChunk } from "./lib/materialRag";
import {
  deriveProjectAuditRows,
  deriveProjectClauseRows,
  deriveProjectMaterialDirectoryRows,
  deriveProjectMeetingRows,
  deriveProjectRiskRows,
} from "./lib/projectLedger";
import {
  createPersistentStateStore,
  FUND_MANAGEMENT_BUSINESS_STATE_KEY,
  FUND_MANAGEMENT_BUSINESS_STATE_VERSION,
} from "./lib/persistedState";
import {
  apiMaterialToRecord,
  createApiClient,
  type ApiClient,
  type ApiMaterial,
  type ApiMaterialPreviewLayoutCache,
  type ApiSessionUser,
  type WorkflowTask,
} from "./lib/apiClient";
import { createEmptyBusinessStateSnapshot, loadBusinessStateFromServer, type BusinessStateSnapshot } from "./lib/serverState";
import { dataOriginDescription, dataOriginLabel, normalizeDataOrigin, type DataOrigin } from "./lib/dataOrigin";
import {
  countSeedDemoRecords,
  filterMaterialRecordsBySeedDemo,
  filterProjectTaskRecordsBySeedDemo,
  filterSeedDemoRecords,
} from "./lib/dataOriginFilter.ts";
import {
  createTaskCenterRows,
  filterTaskCenterRows,
  summarizeTaskCenter,
} from "./lib/taskCenter";

const quickPrompts = [
  "查一下演示智能设备有限公司最新情况",
  "生成示例成长一期基金季度运营报告",
  "下周有哪些管理费需要收？",
];

const DEMO_TODAY = "2026-06-10";
const DEMO_NOW = "2026-06-10 18:30";
const HIDE_SEED_DEMO_DATA_KEY = "fund-management-hide-seed-demo-data";
const TRUSTED_AI_RAG_DATA_ORIGINS: DataOrigin[] = ["source_pdf_ocr", "source_file", "user_input", "system_generated"];

function getStoredHideSeedDemoData() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(HIDE_SEED_DEMO_DATA_KEY) === "true";
}

function deriveFundAuditLogs(events:AuditEvent[]){return events.filter(e=>e.targetType==='基金').reduce<Record<string,string[]>>((logs,e)=>{(logs[e.targetId]??=[]).push(`${e.actor}${e.action}：${e.targetName}`);return logs;},{});}

function setStoredHideSeedDemoData(value: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HIDE_SEED_DEMO_DATA_KEY, String(value));
}

const aiScenarioCommands = [
  "查企业最新情况",
  "生成基金季度报告",
  "记录到账信息",
  "查询管理费",
  "生成会议纪要",
  "查看风险提醒",
];

type ConversationThread = {
  id: string;
  title: string;
  meta: string;
  messages: MeasuredChatMessage[];
};

type MeasuredChatMessage = ChatMessage & {
  layoutHint?: string;
  streaming?: boolean;
};

const conversationSeeds: ConversationThread[] = [
  {
    id: "demo-robotics-review",
    title: "演示智能设备最新情况",
    meta: "刚刚 · 项目问答",
    messages: aiMessages,
  },
  {
    id: "quarterly-report",
    title: "生成基金季度报告",
    meta: "今天 · 报告草稿",
    messages: [
      { role: "user", content: "生成示例成长一期基金季度运营报告" },
      {
        role: "assistant",
        content: "已匹配季度运营报告模板，可先生成草稿，并列出缺失字段供人工补充。",
        sources: ["报告模板库", "基金运营数据", "会议纪要归档"],
      },
    ],
  },
  {
    id: "capital-fee",
    title: "下周管理费待收",
    meta: "昨天 · 资金事项",
    messages: [
      { role: "user", content: "下周有哪些管理费需要收？" },
      {
        role: "assistant",
        content: "下周共有 4 笔管理费待收，合计应收 127.6 万元。建议先核对金额较大的应收项。",
        sources: ["资金事项 / 应收提醒", "管理费规则配置"],
      },
    ],
  },
];

const draftSectionSourceMap: Record<string, string[]> = {
  "一、基金基本情况": ["基金运营数据", "项目主数据", "协会模板"],
  "二、本季度投资进展": ["到账记录", "投决材料", "项目台账"],
  "三、被投企业经营情况": ["企业反馈", "会议纪要", "经营数据"],
  "四、财务数据概览": ["财务报表", "管理费规则", "资金事项"],
  "五、重大事项说明": ["风险监控", "政府公告", "诉讼信息"],
  "六、风险事项": ["风险监控", "知识产权", "行业报告"],
  "七、下季度工作计划": ["投后任务", "会议纪要", "资料缺口"],
};

const initialTasks: ProjectTask[] = [
  {
    id: "audit-2025",
    name: "补充 2025 年审计报告",
    type: "资料补充",
    stage: "尽调",
    owner: "演示投资经理",
    dueDate: "2026-05-01",
    status: "已逾期",
    priority: "高",
    relation: "资料缺口 / 财务资料",
    note: "需企业财务负责人确认审计机构版本。",
  },
  {
    id: "q2-data",
    name: "确认二季度经营数据",
    type: "企业访谈",
    stage: "投后",
    owner: "演示投资经理",
    dueDate: "2026-05-03",
    status: "进行中",
    priority: "高",
    relation: "投后经营月报",
    note: "重点核对收入确认、订单交付与现金流。",
  },
  {
    id: "ip-change",
    name: "核查知识产权变更原因",
    type: "风险核查",
    stage: "尽调",
    owner: "演示投资经理",
    dueDate: "2026-05-02",
    status: "待确认",
    priority: "高",
    relation: "风险 / 知识产权变更",
    note: "需法务补充权利人变更文件。",
  },
  {
    id: "committee-risk",
    name: "准备投委会风险说明",
    type: "决策准备",
    stage: "投决",
    owner: "演示投资经理",
    dueDate: "2026-05-06",
    status: "未开始",
    priority: "中",
    relation: "报告 / 投决材料",
    note: "需引用风险监控和行业资料。",
  },
  {
    id: "monthly-report",
    name: "生成月度企业监控报告",
    type: "报告撰写",
    stage: "投后",
    owner: "演示投资经理",
    dueDate: "2026-05-04",
    status: "进行中",
    priority: "中",
    relation: "报告中心 / 企业监控报告",
    note: "资料来源含风险监控、会议纪要和资金事项。",
  },
];

const projectTasksByProjectId: Record<string, ProjectTask[]> = {
  "demo-robotics": initialTasks.slice(0, 4),
  "beijing-fundapp-new-energy": [
    {
      id: "beijing-litigation-review",
      name: "核验新增开庭公告影响",
      type: "风险核查",
      stage: "尽调",
      owner: "演示研究员",
      dueDate: "2026-05-02",
      status: "已逾期",
      priority: "高",
      relation: "风险 / 诉讼信息",
      note: "补充法院公告、案件标的和交易对手说明。",
    },
    {
      id: "beijing-legal-material",
      name: "补充法务尽调材料",
      type: "资料补充",
      stage: "尽调",
      owner: "演示研究员",
      dueDate: "2026-05-03",
      status: "进行中",
      priority: "高",
      relation: "资料库 / 法务资料",
      note: "需上传主要合同、历史纠纷说明和律师意见。",
    },
    {
      id: "beijing-storage-model",
      name: "复核储能收益模型",
      type: "财务测算",
      stage: "尽调",
      owner: "演示财务经理",
      dueDate: "2026-05-05",
      status: "未开始",
      priority: "中",
      relation: "投决材料 / 收益测算",
      note: "更新电价、利用小时和运维成本假设。",
    },
    {
      id: "beijing-founder-interview",
      name: "安排创始人补充访谈",
      type: "企业访谈",
      stage: "尽调",
      owner: "演示研究员",
      dueDate: "2026-05-06",
      status: "未开始",
      priority: "中",
      relation: "会议纪要 / 创始人访谈",
      note: "重点确认诉讼进展、融资计划和客户回款周期。",
    },
    {
      id: "beijing-committee-appendix",
      name: "更新投委会风险附件",
      type: "决策准备",
      stage: "投决",
      owner: "演示研究员",
      dueDate: "2026-05-07",
      status: "待确认",
      priority: "高",
      relation: "报告 / 投决材料",
      note: "需引用法务核查结论和行业数据。",
    },
    {
      id: "beijing-industry-check",
      name: "补充工商业储能行业数据",
      type: "行业核查",
      stage: "尽调",
      owner: "演示项目经理",
      dueDate: "2026-05-08",
      status: "未开始",
      priority: "中",
      relation: "行业资料 / 储能",
      note: "更新区域需求、补贴政策和竞争格局。",
    },
  ],
  "hangzhou-digital-health": [
    {
      id: "hangzhou-bp-review",
      name: "复核新版 BP 关键指标",
      type: "资料复核",
      stage: "初筛",
      owner: "演示项目经理",
      dueDate: "2026-05-04",
      status: "进行中",
      priority: "中",
      relation: "资料库 / 企业基础资料",
      note: "确认收入结构、客户数量和产品化进展。",
    },
    {
      id: "hangzhou-finance-request",
      name: "催收近两年财务数据",
      type: "资料补充",
      stage: "初筛",
      owner: "演示项目经理",
      dueDate: "2026-05-06",
      status: "未开始",
      priority: "中",
      relation: "资料缺口 / 财务资料",
      note: "需企业补充 2024-2025 财务报表。",
    },
  ],
  "chengdu-materials": [
    {
      id: "chengdu-subsidy-file",
      name: "归档政府补贴公示文件",
      type: "资料归档",
      stage: "投后",
      owner: "演示风控经理",
      dueDate: "2026-05-03",
      status: "进行中",
      priority: "中",
      relation: "资料库 / 政府补贴",
      note: "归档公示截图、批复文件和预计到账说明。",
    },
  ],
  "shenzhen-hailian": [
    {
      id: "hailian-cashflow",
      name: "收集三月回款明细",
      type: "投后跟踪",
      stage: "投后",
      owner: "演示投资经理",
      dueDate: "2026-05-02",
      status: "已逾期",
      priority: "高",
      relation: "风险 / 现金流",
      note: "重点关注核心客户账期和逾期金额。",
    },
    {
      id: "hailian-client-call",
      name: "安排核心客户回访",
      type: "企业访谈",
      stage: "投后",
      owner: "演示投资经理",
      dueDate: "2026-05-05",
      status: "进行中",
      priority: "中",
      relation: "会议纪要 / 客户回访",
      note: "确认订单稳定性和付款计划。",
    },
    {
      id: "hailian-risk-ledger",
      name: "更新现金流风险台账",
      type: "风险核查",
      stage: "投后",
      owner: "演示财务经理",
      dueDate: "2026-05-06",
      status: "未开始",
      priority: "中",
      relation: "风险监控 / 经营风险",
      note: "同步回款明细、风险等级和后续动作。",
    },
  ],
  "northwest-digital-infra": [
    {
      id: "northwest-archive",
      name: "复核退出归档材料",
      type: "资料归档",
      stage: "已退出",
      owner: "演示研究员",
      dueDate: "2026-05-04",
      status: "待确认",
      priority: "低",
      relation: "资料库 / 退出协议",
      note: "确认清算凭证、审计资料和复盘报告完整。",
    },
  ],
};

const materialCategories = [
  "企业基础资料",
  "财务资料",
  "业务经营资料",
  "股权资料",
  "法务资料",
  "知识产权资料",
  "行业资料",
  "会议资料",
  "历史报告",
  "募集文件",
  "投资者适当性资料",
  "资金资料",
  "信息披露资料",
  "清算资料",
  "重大事项资料",
  "投资管理资料",
  "需求资料",
  "其他资料",
];

const materialCategoryIcons: Record<string, typeof FileText> = {
  '全部资料': Layers3, '企业基础资料': Building2, '财务资料': WalletCards,
  '业务经营资料': ChartColumnIncreasing, '股权资料': Layers3, '法务资料': Scale,
  '知识产权资料': ShieldAlert, '行业资料': Bookmark, '会议资料': Users,
  '历史报告': ClipboardList, '募集文件': FileText, '投资者适当性资料': Users,
  '资金资料': Database, '信息披露资料': ClipboardList, '清算资料': ReceiptText,
  '重大事项资料': Flag, '投资管理资料': BriefcaseBusiness, '需求资料': Layers3, '其他资料': MoreHorizontal,
};

const uploadedMaterials: MaterialRecord[] = [
  ["演示智能设备 BP.pdf", "企业基础资料", "演示投资经理", "2026-04-20", "企业上传", "已摘要", "8", "演示智能设备有限公司"],
  ["2024-2025 财务报表.xlsx", "财务资料", "演示财务经理", "2026-04-25", "财务部门", "已摘要", "12", "演示智能设备有限公司"],
  ["核心专利清单.pdf", "知识产权资料", "法务顾问", "2026-04-25", "人工上传", "待复核", "5", "演示智能设备有限公司"],
  ["智能装备行业研究报告.pdf", "行业资料", "演示研究员", "2026-04-22", "行业资料库", "已摘要", "9", "演示智能设备有限公司"],
  ["创始人访谈纪要.docx", "会议资料", "演示投资经理", "2026-04-24", "会议纪要", "已摘要", "6", "演示智能设备有限公司"],
  ["储能诉讼核查材料.pdf", "法务资料", "演示研究员", "2026-04-25", "人工上传", "待复核", "3", "演示清洁能源有限公司"],
  ["先进制造补贴公示.pdf", "业务经营资料", "演示风控经理", "2026-04-27", "政府公告", "已摘要", "4", "演示先进材料有限公司"],
];

const materialGaps = ["2025 年审计报告", "近三个月经营数据", "核心客户访谈纪要", "投后经营月报", "知识产权变更说明"];

const stages = ["初筛", "立项", "尽调", "投决", "投后", "退出"];

const initialFundAuditLogs: Record<string, string[]> = {
  "fundapp-growth-i": ["财务确认管理费收取明细", "投后负责人复核演示智能设备季度经营数据"],
  "fundapp-growth": ["法务登记新增项目交割条件复核项"],
  "advanced-manufacturing": ["演示财务经理发起投资者适当性资料补齐"],
};

const initialAuditEvents: AuditEvent[] = [
  createAuditEvent({
    module: "AI 收件箱",
    action: "确认资料归档",
    targetType: "基金",
    targetId: "fundapp-growth-i",
    targetName: "二季度基金大表数据归档",
    actor: "财务",
    time: "2026-06-06 10:15",
    detail: "财务报表已归档到基金账户资金目录，可作为季度报告数据来源。",
    source: "Excel 上传",
  }),
  createAuditEvent({
    module: "项目账本",
    action: "更新项目阶段",
    targetType: "项目",
    targetId: "demo-robotics",
    targetName: "演示智能设备有限公司",
    actor: "演示投资经理",
    time: "2026-04-28 16:30",
    detail: "项目阶段更新为投后管理，并记录下一步投后跟踪动作。",
  }),
  createAuditEvent({
    module: "资金事项",
    action: "生成管理费清单",
    targetType: "基金",
    targetId: "fundapp-growth-i",
    targetName: "示例成长一期基金",
    actor: "财务",
    time: "2026-05-08 09:30",
    detail: "基于到账记录和管理费规则生成应收提醒。",
    source: "资金规则",
  }),
];

type BusinessStateMode = "loading" | "server" | "degraded" | "local";
type SessionStatus = "loading" | "authenticated" | "unauthenticated" | "unavailable" | "local";
export function isSessionRejection(error:unknown){const e=error as {status?:number;code?:string};return e?.status===401||e?.code==='unauthenticated';}

function createDefaultBusinessStateSnapshot(): BusinessStateSnapshot {
  return {
    capitalRecords: capitalItems,
    fundRecords: funds,
    projectRecords: seedProjects,
    reportRecords: reports,
    reportExportRecords: [],
    meetingRecords: meetings,
    aiIntakeRecords: aiIntakeItems,
    fundInvestorRecords: fundInvestors,
    fundDocumentRecords: fundDocuments,
    fundAuditLogs: initialFundAuditLogs,
    auditEvents: initialAuditEvents,
    materialRecords: uploadedMaterials.map((m):MaterialRecord=>{const row:MaterialRecord=[...m];row[8]??='seed_demo';return row;}),
    materialApiRecords: [],
    projectTaskRecordsById: projectTasksByProjectId,
  };
}

function loadBusinessStateSnapshot() {
  if (!isLocalBusinessStateMode()) return createEmptyBusinessStateSnapshot();
  const defaults = createDefaultBusinessStateSnapshot();
  if (typeof window === "undefined" || !isLocalBusinessStateMode()) return defaults;

  return createPersistentStateStore<BusinessStateSnapshot>({
    key: FUND_MANAGEMENT_BUSINESS_STATE_KEY,
    version: FUND_MANAGEMENT_BUSINESS_STATE_VERSION,
    storage: window.localStorage,
  }).load(defaults);
}

function saveBusinessStateSnapshot(snapshot: BusinessStateSnapshot, enabled: boolean) {
  if (typeof window === "undefined") return;

  createPersistentStateStore<BusinessStateSnapshot>({
    key: FUND_MANAGEMENT_BUSINESS_STATE_KEY,
    version: FUND_MANAGEMENT_BUSINESS_STATE_VERSION,
    storage: window.localStorage,
    enabled,
  }).save(snapshot);
}

function isLocalBusinessStateMode() {
  return false;
}

type TextDownloadFile = {
  fileName: string;
  mimeType: string;
  content: string;
};

type DownloadNotice = {
  targetId?: string;
  targetName: string;
  summary: string;
};

function downloadTextFile(file: TextDownloadFile) {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const blob = new Blob([file.content], { type: file.mimeType });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
}

function usePath() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    let generation=0;
    const sync=async()=>{const version=++generation,next=window.location.pathname;const result=await checkRouteChange();if(version!==generation)return;if(!result.allowed){if(result.restoreUrl)window.history.pushState({},'',result.restoreUrl);return;}setPath(next);window.dispatchEvent(new Event(routeCommittedEvent));};
    window.addEventListener("popstate", sync);
    if (window.location.pathname === "/"&&!sessionEntry.isSignedOut()) navigate("/dashboard");
    return () => window.removeEventListener("popstate", sync);
  }, []);

  return path;
}

function AuthStatusScreen() {return <AppLoading/>;}


function App() {
  const path = usePath();
  const apiClient = useMemo(() => createApiClient(), []);
  const localBusinessStateMode = isLocalBusinessStateMode();
  const [explicitSignOut,setExplicitSignOut]=useState(()=>sessionEntry.isSignedOut());
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>(localBusinessStateMode ? "local" : sessionEntry.isSignedOut()?"unauthenticated":"loading");
  const [sessionUser, setSessionUser] = useState<ApiSessionUser | null>(null);
  const [sessionIssue,setSessionIssue]=useState<string|null>(null),[sessionChecking,setSessionChecking]=useState(false),[sessionCheckRevision,setSessionCheckRevision]=useState(0);
  const [workflowTaskEdit, setWorkflowTaskEdit] = useState<{ projectId: string; task?: WorkflowTask; seed?: Partial<WorkflowTask> } | null>(null);
  const lastServerSnapshot = useRef<BusinessStateSnapshot | null>(null);
  const reportSaveProgress = useRef(new Map<string, ReportSaveProgress>());
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoginSubmitting, setIsLoginSubmitting] = useState(false);
  const [initialBusinessState] = useState<BusinessStateSnapshot>(() => loadBusinessStateSnapshot());
  const [businessStateMode, setBusinessStateMode] = useState<BusinessStateMode>(localBusinessStateMode ? "local" : "loading");
  const [businessStateNotice, setBusinessStateNotice] = useState<string | null>(null);
  const [lastWriteFailure, setLastWriteFailure] = useState<WriteFailure | null>(null);
  const [recoveringData, setRecoveringData] = useState(false);
  const hideSeedDemoData = false;
  const renderSessionEpoch=clientSessionEpoch();
  const isCurrentSource=useSourceScope(`${sessionUser?.id??'unauthenticated'}:${sessionUser?.role??''}:${hideSeedDemoData}`);
  const [capitalRecords, setCapitalRecords] = useState<CapitalItem[]>(() => initialBusinessState.capitalRecords);
  const [fundRecords, setFundRecords] = useState<Fund[]>(() => initialBusinessState.fundRecords);
  const [projectRecords, setProjectRecords] = useState<Project[]>(() => initialBusinessState.projectRecords);
  const [assetRecords,setAssetRecords]=useState<AssetHistoryView[]|null>(null);
  const [assetNotice,setAssetNotice]=useState('');
  const [reportRecords, setReportRecords] = useState<ReportRecord[]>(() => initialBusinessState.reportRecords);
  const [reportExportRecords, setReportExportRecords] = useState<ReportExportRecord[]>(() => initialBusinessState.reportExportRecords);
  const [meetingRecords, setMeetingRecords] = useState<MeetingRecord[]>(() => initialBusinessState.meetingRecords);
  const [approvalTargetLoading,setApprovalTargetLoading]=useState(false);
  const approvalTargetSequence=useRef(0),approvalTargetRefresh=useRef<()=>void>(()=>{});
  approvalTargetRefresh.current=()=>{
    const sequence=++approvalTargetSequence.current;
    if(businessStateMode!=='server'){setApprovalTargetLoading(false);return;}
    const url=new URL(window.location.href);
    const read=url.pathname==='/reports'&&url.searchParams.has('reportId')?()=>apiClient.getReports().then(r=>{if(isCurrentSource()&&sequence===approvalTargetSequence.current){setReportRecords(r.reports);setReportExportRecords(r.exportRecords??[]);}}):url.pathname==='/meetings'&&url.searchParams.has('meetingId')?()=>apiClient.getMeetings().then(r=>{if(isCurrentSource()&&sequence===approvalTargetSequence.current)setMeetingRecords(r.meetings);}):url.pathname==='/capital'&&url.hash.startsWith('#capital-record-')?()=>apiClient.getCapitalRecords().then(r=>{if(isCurrentSource()&&sequence===approvalTargetSequence.current)setCapitalRecords(r.capitalRecords);}):null;
    if(!read){setApprovalTargetLoading(false);return;}setApprovalTargetLoading(true);
    void read().catch(()=>{if(isCurrentSource()&&sequence===approvalTargetSequence.current){setBusinessStateNotice('当前审批事项暂未读取成功，请恢复连接后重试。');setBusinessStateMode('degraded');}}).finally(()=>{if(sequence===approvalTargetSequence.current)setApprovalTargetLoading(false);});
  };
  useEffect(()=>{const refresh=()=>approvalTargetRefresh.current();refresh();window.addEventListener(routeCommittedEvent,refresh);return()=>{approvalTargetSequence.current++;window.removeEventListener(routeCommittedEvent,refresh);};},[businessStateMode,sessionUser?.id]);
  const [aiIntakeRecords, setAiIntakeRecords] = useState<AiIntakeItem[]>(() => initialBusinessState.aiIntakeRecords);
  const [fundInvestorRecords, setFundInvestorRecords] = useState<typeof fundInvestors>(() => initialBusinessState.fundInvestorRecords);
  const [fundDocumentRecords, setFundDocumentRecords] = useState<FundDocument[]>(() => initialBusinessState.fundDocumentRecords);
  const [fundAuditLogs, setFundAuditLogs] = useState<Record<string, string[]>>(() => initialBusinessState.fundAuditLogs);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>(() => initialBusinessState.auditEvents);
  const [materialRecords, setMaterialRecords] = useState<MaterialRecord[]>(() => initialBusinessState.materialRecords);
  const [materialApiRecords, setMaterialApiRecords] = useState<ApiMaterial[]>(() => initialBusinessState.materialApiRecords);
  const [projectTaskRecordsById, setProjectTaskRecordsById] = useState<Record<string, ProjectTask[]>>(
    () => initialBusinessState.projectTaskRecordsById,
  );
  const [lastReportDownloadNotice, setLastReportDownloadNotice] = useState<DownloadNotice | null>(null);
  const [lastAuditDownloadSummary, setLastAuditDownloadSummary] = useState<string | null>(null);
  const trustedAiRagDataOrigins = useMemo(
    () => (hideSeedDemoData ? TRUSTED_AI_RAG_DATA_ORIGINS : undefined),
    [hideSeedDemoData],
  );
  const visibleProjectRecords = useMemo(() => withAssetHistory(filterSeedDemoRecords(projectRecords, hideSeedDemoData),assetRecords), [projectRecords, hideSeedDemoData,assetRecords]);
  const visibleFundRecords = useMemo(() => filterSeedDemoRecords(fundRecords, hideSeedDemoData).map(f=>({...f,projectCount:visibleProjectRecords.filter(p=>(p.fundId===f.id||(localBusinessStateMode&&!p.fundId&&p.fund===f.name))&&isManagedProject(p)).length})), [fundRecords,hideSeedDemoData,visibleProjectRecords,localBusinessStateMode]);
  const visibleReportRecords = useMemo(() => filterSeedDemoRecords(reportRecords, hideSeedDemoData), [reportRecords, hideSeedDemoData]);
  const visibleMeetingRecords = useMemo(() => filterSeedDemoRecords(meetingRecords, hideSeedDemoData), [meetingRecords, hideSeedDemoData]);
  const visibleAiIntakeRecords = useMemo(() => filterSeedDemoRecords(aiIntakeRecords, hideSeedDemoData), [aiIntakeRecords, hideSeedDemoData]);
  const visibleFundInvestorRecords = useMemo(() => filterSeedDemoRecords(fundInvestorRecords, hideSeedDemoData), [fundInvestorRecords, hideSeedDemoData]);
  const visibleFundDocumentRecords = useMemo(() => filterSeedDemoRecords(fundDocumentRecords, hideSeedDemoData), [fundDocumentRecords, hideSeedDemoData]);
  const visibleCapitalRecords = useMemo(() => filterSeedDemoRecords(capitalRecords, hideSeedDemoData), [capitalRecords, hideSeedDemoData]);
  const visibleAuditEvents = useMemo(() => filterSeedDemoRecords(auditEvents, hideSeedDemoData), [auditEvents, hideSeedDemoData]);
  const visibleMaterialRecords = useMemo(() => filterMaterialRecordsBySeedDemo(materialRecords, hideSeedDemoData), [materialRecords, hideSeedDemoData]);
  const visibleMaterialApiRecords = useMemo(() => filterSeedDemoRecords(materialApiRecords, hideSeedDemoData), [materialApiRecords, hideSeedDemoData]);
  const visibleProjectTaskRecordsById = useMemo(
    () => filterProjectTaskRecordsBySeedDemo(projectTaskRecordsById, visibleProjectRecords.map((project) => project.id), hideSeedDemoData),
    [hideSeedDemoData, projectTaskRecordsById, visibleProjectRecords],
  );
  const visibleFundAuditLogs = useMemo(() => hideSeedDemoData ? deriveFundAuditLogs(visibleAuditEvents) : fundAuditLogs, [fundAuditLogs, hideSeedDemoData,visibleAuditEvents]);
  const hiddenSeedDemoCount = useMemo(() => {
    const visibleTaskCount = Object.values(visibleProjectTaskRecordsById).reduce((total, tasks) => total + tasks.length, 0);
    const totalTaskCount = Object.values(projectTaskRecordsById).reduce((total, tasks) => total + tasks.length, 0);
    return (
      countSeedDemoRecords(fundRecords) +
      countSeedDemoRecords(projectRecords) +
      countSeedDemoRecords(reportRecords) +
      countSeedDemoRecords(meetingRecords) +
      countSeedDemoRecords(aiIntakeRecords) +
      countSeedDemoRecords(fundInvestorRecords) +
      countSeedDemoRecords(fundDocumentRecords) +
      countSeedDemoRecords(capitalRecords) +
      countSeedDemoRecords(auditEvents) +
      (materialApiRecords.length ? countSeedDemoRecords(materialApiRecords) : materialRecords.length - filterMaterialRecordsBySeedDemo(materialRecords, true).length) +
      countSeedDemoRecords(risks) +
      (totalTaskCount - visibleTaskCount)
    );
  }, [
    aiIntakeRecords,
    auditEvents,
    capitalRecords,
    fundDocumentRecords,
    fundInvestorRecords,
    fundRecords,
    materialApiRecords,
    materialRecords,
    meetingRecords,
    projectRecords,
    projectTaskRecordsById,
    reportRecords,
    visibleProjectTaskRecordsById,
  ]);
  const pendingAiIntakeCount = visibleAiIntakeRecords.filter((item) => item.status === "待确认").length;

  const applyBusinessStateSnapshot = (snapshot: BusinessStateSnapshot) => {
    setCapitalRecords(snapshot.capitalRecords);
    setFundRecords(snapshot.fundRecords);
    setProjectRecords(snapshot.projectRecords);
    setReportRecords(snapshot.reportRecords);
    setReportExportRecords(snapshot.reportExportRecords);
    setMeetingRecords(snapshot.meetingRecords);
    setAiIntakeRecords(snapshot.aiIntakeRecords);
    setFundInvestorRecords(snapshot.fundInvestorRecords);
    setFundDocumentRecords(snapshot.fundDocumentRecords);
    setFundAuditLogs(snapshot.fundAuditLogs);
    setAuditEvents(snapshot.auditEvents);
    setMaterialRecords(snapshot.materialRecords);
    setMaterialApiRecords(snapshot.materialApiRecords);
    setProjectTaskRecordsById(snapshot.projectTaskRecordsById);
  };

  useEffect(()=>{
    if(localBusinessStateMode)return;
    return subscribeSessionInvalidation(reason=>{
      lastServerSnapshot.current=null;setSessionIssue(null);
      applyBusinessStateSnapshot(createEmptyBusinessStateSnapshot());
      setAssetRecords(null);setAssetNotice('');
      setSessionUser(null);setSessionStatus("unauthenticated");
      setBusinessStateMode("loading");setBusinessStateNotice(null);setLastWriteFailure(null);
      if(reason==='context_changed'){window.location.reload();return;}
      setLoginError(sessionStatus==="authenticated"?"登录已失效，请重新登录；如刚修改密码，请使用新密码。":null);
    });
  },[localBusinessStateMode,sessionStatus]);
  useEffect(()=>{
    if(localBusinessStateMode||sessionStatus!=="authenticated"||!sessionUser)return;
    let active=true,checking=false;
    const verify=async()=>{
      if(checking||document.visibilityState==='hidden')return;checking=true;setSessionChecking(true);const started=clientSessionEpoch();
      try{const next=await apiClient.getSessionMe();if(active){setSessionIssue(null);if(next.user.id!==sessionUser.id||next.user.role!==sessionUser.role)window.location.reload();}}
      catch(error){if(active&&started===clientSessionEpoch()){if(isSessionRejection(error))invalidateClientSession();else setSessionIssue('会话核验连接暂不可用。当前账号与未保存内容已保留，请重试连接。');}}
      finally{checking=false;if(active)setSessionChecking(false);}
    };
    window.addEventListener('focus',verify);document.addEventListener('visibilitychange',verify);
    return()=>{active=false;window.removeEventListener('focus',verify);document.removeEventListener('visibilitychange',verify);};
  },[apiClient,localBusinessStateMode,sessionStatus,sessionUser?.id,sessionUser?.role]);

  useEffect(() => {
    if (localBusinessStateMode||explicitSignOut) return;

    let cancelled = false;const started=clientSessionEpoch();setSessionChecking(true);
    apiClient
      .getSessionMe()
      .then((result) => {
        if (cancelled||started!==clientSessionEpoch()) return;
        setSessionUser(result.user);
        setSessionStatus("authenticated");setSessionIssue(null);
        setLoginError(null);
      })
      .catch((error) => {
        if (cancelled||started!==clientSessionEpoch()) return;
        if(isSessionRejection(error)){invalidateClientSession();return;}
        setSessionIssue('连接暂不可用，尚不能核验当前会话。请恢复连接后重试。');
        if(!sessionUser)setSessionStatus('unavailable');
      }).finally(()=>{if(!cancelled)setSessionChecking(false);});

    return () => {
      cancelled = true;
    };
  }, [apiClient, localBusinessStateMode,sessionCheckRevision,explicitSignOut]);

  useEffect(() => {
    if (localBusinessStateMode || sessionStatus !== "authenticated") return;

    let cancelled = false;
    loadBusinessStateFromServer(apiClient, createEmptyBusinessStateSnapshot(),!hideSeedDemoData).then((result) => {
      if (cancelled) return;
      if (result.mode === "server") { lastServerSnapshot.current = result.state; applyBusinessStateSnapshot(result.state); }
      else applyBusinessStateSnapshot(lastServerSnapshot.current ?? result.state);
      setBusinessStateMode(result.mode);
      setBusinessStateNotice(result.mode === "degraded" ? lastServerSnapshot.current ? "数据读取失败，当前显示最近成功读取的数据；请恢复连接后重试，部分功能暂不可用。" : result.message : null);
    });

    return () => {
      cancelled = true;
    };
  }, [apiClient, localBusinessStateMode, sessionStatus,hideSeedDemoData]);

  useEffect(()=>{
    if(localBusinessStateMode||sessionStatus!=='authenticated'||sessionUser?.role==='legal')return;
    let active=true;
    apiClient.getAssetHistory(hideSeedDemoData?{includeDemo:'false'}:{}).then(result=>{if(active){setAssetRecords(result.projects);setAssetNotice('');}}).catch(()=>{if(active){setAssetRecords(null);setAssetNotice('退出资产状态暂未能核验，当前分类与在管指标需恢复连接后刷新；历史标注不代表已核验完成。');}});
    return()=>{active=false;};
  },[apiClient,localBusinessStateMode,sessionStatus,sessionUser?.id,hideSeedDemoData]);

  const login = async (credentials: { email: string; password: string }) => {
    setIsLoginSubmitting(true);
    setLoginError(null);
    try {
      const result = await apiClient.login(credentials);
      sessionEntry.resume();setExplicitSignOut(false);
      window.history.replaceState({},'', '/dashboard');window.dispatchEvent(new PopStateEvent('popstate'));
      setSessionUser(result.user);setSessionIssue(null);
      setSessionStatus("authenticated");
      setLastWriteFailure(null);
      setBusinessStateMode("loading");
      setBusinessStateNotice(null);
    } catch {
      setLoginError("账号或密码不正确，或系统暂不可用。");
      setSessionStatus("unauthenticated");
    } finally {
      setIsLoginSubmitting(false);
    }
  };

  useEffect(() => {
    if (businessStateMode !== "local") return;

    saveBusinessStateSnapshot({
      capitalRecords,
      fundRecords,
      projectRecords,
      reportRecords,
      reportExportRecords,
      meetingRecords,
      aiIntakeRecords,
      fundInvestorRecords,
      fundDocumentRecords,
      fundAuditLogs,
      auditEvents,
      materialRecords,
      materialApiRecords,
      projectTaskRecordsById,
    }, businessStateMode === "local");
  }, [
    businessStateMode,
    capitalRecords,
    fundRecords,
    projectRecords,
    reportRecords,
    reportExportRecords,
    meetingRecords,
    aiIntakeRecords,
    fundInvestorRecords,
    fundDocumentRecords,
    fundAuditLogs,
    auditEvents,
    materialRecords,
    materialApiRecords,
    projectTaskRecordsById,
  ]);

  useEffect(() => {
    setStoredHideSeedDemoData(hideSeedDemoData);
  }, [hideSeedDemoData]);

  const appendAuditEvent = (event: AuditEvent) => {
    setAuditEvents((current) => prependUniqueAuditEvent(current, event));
  };
  const appendAuditEvents = (events: AuditEvent[]) => {
    setAuditEvents((current) => events.reduce((nextEvents, event) => prependUniqueAuditEvent(nextEvents, event), current));
  };
  const markServerWriteFailure = (operation: string, target: string, href: string, error: unknown) => {
    if(renderSessionEpoch!==clientSessionEpoch()||(error as {status?:number})?.status===401)return;
    setLastWriteFailure(writeFailure(operation, target, href, error));
  };
  const recoverBusinessData = async () => {
    if (recoveringData) return;
    setRecoveringData(true);
    try {
      const result = await loadBusinessStateFromServer(apiClient, createEmptyBusinessStateSnapshot(), !hideSeedDemoData);
      if (!isCurrentSource()) return;
      if (result.mode === "server") { lastServerSnapshot.current = result.state; applyBusinessStateSnapshot(result.state); }
      setBusinessStateMode(result.mode);
      setBusinessStateNotice(result.mode === "degraded" ? result.message : null);
    } finally { setRecoveringData(false); }
  };
  const confirmAiCapitalRecord = () => {
    if (businessStateMode !== "local") return;

    setCapitalRecords((current) => upsertAiCapitalRecord(current));
    appendAuditEvent(
      createAuditEvent({
        module: "资金事项",
        action: "确认到账记录",
        targetType: "资金",
        targetId: "capital-demo-20260427",
        targetName: "演示智能设备 3000 万到账",
        actor: "演示投资经理",
        time: DEMO_NOW,
        detail: "AI 数字员工识别到账信息，人工确认后写入资金事项。",
        source: "AI 数字员工",
      }),
    );
  };
  const createCapitalRecord = async (record: CapitalItem) => {
    if (businessStateMode === "server") {
      const result=await saveManualCapitalRecord(apiClient,record);
      setCapitalRecords(current=>[result.capitalRecord,...current.filter(row=>!record.id||row.id!==record.id)]);
      if(result.auditEvent)appendAuditEvent(result.auditEvent);
      return;
    }
    if (businessStateMode !== "local") throw Error("暂时无法保存，请稍后重试。");

    setCapitalRecords((current) => prependManualCapitalRecord(current, record));
    appendAuditEvent(
      createAuditEvent({
        module: "资金事项",
        action: "创建资金事项",
        targetType: "资金",
        targetId: `capital-${record.company}-${record.date}`,
        targetName: `${record.company}${record.received}`,
        actor: "演示投资经理",
        time: DEMO_NOW,
        detail: `人工创建${record.fund}资金事项，应收金额 ${record.receivable}。`,
        source: record.source ?? "人工创建",
      }),
    );
  };
  const refreshMaterials = async () => {
    if (businessStateMode !== "server") throw new Error("请连接系统后上传真实文件。");
    const [materials, audit] = await Promise.all([apiClient.getMaterials(), apiClient.getAuditEvents()]);
    setMaterialApiRecords(materials.materials);
    setMaterialRecords(materials.materials.map(apiMaterialToRecord));
    setAuditEvents(audit.auditEvents);
  };
  const archiveReviewedMaterial = async (payload: MaterialArchivePayload) => {
    if (businessStateMode === "server") {
      try {
        const result = await apiClient.archiveMaterial(payload);
        const createdMaterial = apiMaterialToRecord(result.material);
        setMaterialRecords((current) => prependUniqueMaterialRecord(current, createdMaterial));
        const sourceMaterialId = result.material.sourceMaterialId;
        setMaterialApiRecords((current) => [
          result.material,
          ...current.filter((item) => item.id !== result.material.id && (!sourceMaterialId || item.sourceMaterialId !== sourceMaterialId)),
        ]);
        appendAuditEvent(result.auditEvent);
        return result.material;
      } catch (error) {
        markServerWriteFailure("资料归档", payload.name, "/materials", error);
        return undefined;
      }
    }
    if (businessStateMode !== "local") return undefined;

    const material: ApiMaterial = {
      id: `material-${payload.sourceMaterialId ?? payload.name}`,
      ...payload,
    };
    setMaterialRecords((current) => prependUniqueMaterialRecord(current, apiMaterialToRecord(material)));
    const sourceMaterialId = material.sourceMaterialId;
    setMaterialApiRecords((current) => [
      material,
      ...current.filter((item) => item.id !== material.id && (!sourceMaterialId || item.sourceMaterialId !== sourceMaterialId)),
    ]);
    appendAuditEvent(
      createAuditEvent({
        module: "资料库",
        action: "确认资料归档",
        targetType: "资料",
        targetId: material.id,
        targetName: material.name,
        actor: material.uploader,
        time: DEMO_NOW,
        detail: `确认归档到 ${material.archivePath ?? material.path}。`,
        source: material.source,
        dataOrigin: material.dataOrigin,
      }),
    );
    return material;
  };
  const refreshWorkflow = async () => {
    const [projects, tasks, funds,reportSnapshot] = await Promise.all([apiClient.getProjects(), apiClient.getWorkflowTasks(), apiClient.getFunds(!hideSeedDemoData),apiClient.getReports()]);
    if(!isCurrentSource())return;
    setProjectRecords(projects.projects); setFundRecords(funds.funds);setReportRecords(reportSnapshot.reports);setReportExportRecords(reportSnapshot.exportRecords??[]);
    const grouped: Record<string, ProjectTask[]> = {};
    for (const task of tasks.tasks) (grouped[task.projectId] ??= []).push(task);
    setProjectTaskRecordsById(grouped);
    await apiClient.getAssetHistory(hideSeedDemoData?{includeDemo:'false'}:{}).then(result=>{if(!isCurrentSource())return;setAssetRecords(result.projects);setAssetNotice('');}).catch(()=>{if(!isCurrentSource())return;setAssetRecords(null);setAssetNotice('退出资产状态刷新失败，当前分类与在管统计尚未重新核验。');});
    await apiClient.getAuditEvents().then((result) => setAuditEvents(result.auditEvents)).catch(() => {});
  };
  const refreshFundMaster = async () => {
    await refreshWorkflow();
    const [capital,materials,meetings]=await Promise.all([apiClient.getCapitalRecords(),apiClient.getMaterials(),apiClient.getMeetings()]);
    setCapitalRecords(capital.capitalRecords);setMaterialApiRecords(materials.materials);setMaterialRecords(materials.materials.map(apiMaterialToRecord));setMeetingRecords(meetings.meetings);
  };
  const addProjectTask = async (projectId: string, task: ProjectTask) => {
    if (businessStateMode === "server") {
      setWorkflowTaskEdit({ projectId, seed: { ...task, projectId } });
      return undefined;
    }
    if (businessStateMode !== "local") return undefined;

    setProjectTaskRecordsById((current) => ({
      ...current,
      [projectId]: upsertTaskForProject(current[projectId] ?? [], task),
    }));
    appendAuditEvent(
      createAuditEvent({
        module: "任务中心",
        action: "创建任务",
        targetType: "项目",
        targetId: projectId,
        targetName: projectRecords.find((project) => project.id === projectId)?.name ?? projectId,
        actor: task.owner,
        time: DEMO_NOW,
        detail: `创建${task.type}任务 ${task.id}：${task.name}，负责人 ${task.owner}，截止 ${task.dueDate}。`,
        source: task.relation,
      }),
    );
    return task;
  };
  const updateProjectTask = async (
    projectId: string,
    taskId: string,
    patch: Partial<Omit<ProjectTask, "id">>,
  ) => {
    if (businessStateMode === "server") {
      const task = (projectTaskRecordsById[projectId] ?? []).find((item) => item.id === taskId);
      if (task) setWorkflowTaskEdit({ projectId, task: { ...task, projectId } });
      return undefined;
    }
    if (businessStateMode !== "local") return undefined;

    const existingTask = (projectTaskRecordsById[projectId] ?? []).find((task) => task.id === taskId);
    if (!existingTask) return undefined;

    const updatedTask = { ...existingTask, ...patch };
    setProjectTaskRecordsById((current) => ({
      ...current,
      [projectId]: (current[projectId] ?? []).map((task) => (task.id === taskId ? updatedTask : task)),
    }));
    appendAuditEvent(
      createAuditEvent({
        module: "任务中心",
        action: "更新任务",
        targetType: "项目",
        targetId: projectId,
        targetName: projectRecords.find((project) => project.id === projectId)?.name ?? projectId,
        actor: updatedTask.owner,
        time: DEMO_NOW,
        detail: `任务 ${taskId} 状态更新为 ${updatedTask.status}。`,
        source: updatedTask.relation,
      }),
    );
    return updatedTask;
  };
  const saveReport = async (draft: ReportWorkflowDraft) => {
    const report = createSavedReportRecord(draft, DEMO_NOW);
    const missingTasks = createReportMissingDataTasks(draft, DEMO_TODAY);

    if (businessStateMode === "server") {
      const key = JSON.stringify(draft);
      let progress = reportSaveProgress.current.get(key);
      if (!progress) {
        progress = { reportId: `report-${crypto.randomUUID()}`, taskRequestIds: draft.missingItems.map(() => crypto.randomUUID()), completedTaskIndexes: [], updatedAt: new Date().toISOString() };
        reportSaveProgress.current.set(key, progress);
      }
      const saved = await saveReportTaskWorkflow(apiClient, draft, projectRecords, progress);
      try { const reports = await apiClient.getReports(); setReportRecords(reports.reports); await refreshWorkflow(); }
      catch { throw new Error("报告与缺件任务已保存，但列表刷新失败。连接恢复后可原样重试，已保存记录不会重复创建。"); }
      return saved;
    }
    if (businessStateMode !== "local") return undefined;

    setReportRecords((current) => prependUniqueReport(current, report));
    await Promise.all(
      missingTasks.map((task, index) => addProjectTask(draft.missingItems[index]?.projectId ?? "demo-robotics", task)),
    );
    appendAuditEvent(
      createAuditEvent({
        module: "报告中心",
        action: "保存报告草稿",
        targetType: "报告",
        targetId: `report-${draft.target}-${draft.type}`,
        targetName: draft.name,
        actor: draft.owner,
        time: DEMO_NOW,
        detail: `保存报告草稿，并生成 ${draft.missingItems.length} 条缺失项任务。`,
        source: "报告生成流程",
      }),
    );
    return report;
  };
  const approveReport = async (report: ReportRecord) => {
    if (businessStateMode === "server" && report.id) {
      try {
        const result = await apiClient.approveReport(report.id,report.updatedAt);
        setReportRecords((current) =>
          current.map((item) => (item.id === report.id ? result.report : item)),
        );
        appendAuditEvent(result.auditEvent);
        return result.report;
      } catch (error) {
        if(['report_revision_conflict','report_not_ready','report_content_required'].includes((error as {code?:string})?.code??''))throw error;
        markServerWriteFailure("报告审核", report.name, `/reports?reportId=${encodeURIComponent(report.id ?? report.name)}`, error);
        return undefined;
      }
    }
    if (businessStateMode !== "local") return undefined;

    const approvedReport = approveReportRecord(report, DEMO_NOW);
    setReportRecords((current) =>
      current.map((item) => (item.name === report.name && item.target === report.target ? approvedReport : item)),
    );
    appendAuditEvent(
      createReportApprovalAuditEvent(report, {
        actor: "演示财务经理",
        approvedAt: DEMO_NOW,
      }),
    );
    return approvedReport;
  };
  const exportReport = async (report: ReportRecord,format:"PDF"|"DOCX"="PDF") => {
    if (businessStateMode === "server" && report.id) {
      try {
        const result = await apiClient.exportReport(report.id, format);
        await downloadDocument(`/api/reports/exports/${encodeURIComponent(result.exportRecord.id)}/file`,result.exportRecord.downloadFileName);
        setLastReportDownloadNotice({targetId:result.report.id,targetName:result.report.name,summary:`正式${format}已生成，已发起下载。`});
        setReportRecords((current) => current.map((item) => (item.id === report.id ? result.report : item)));
        setReportExportRecords((current) =>
          current.some((item) => item.id === result.exportRecord.id) ? current : [result.exportRecord, ...current],
        );
        appendAuditEvent(result.auditEvent);
        return result.exportRecord;
      } catch (error) {
        if(['report_not_ready','report_content_required','report_not_approved'].includes((error as {code?:string})?.code??''))throw error;
        markServerWriteFailure("报告导出", report.name, `/reports?reportId=${encodeURIComponent(report.id ?? report.name)}`, error);
        return undefined;
      }
    }
    if (businessStateMode !== "local") return undefined;

    const exportSourceReport = report.status === "已完成" ? report : approveReportRecord(report, DEMO_NOW);
    if (report.status !== "已完成") {
      setReportRecords((current) =>
        current.map((item) => (item.name === report.name && item.target === report.target ? exportSourceReport : item)),
      );
      appendAuditEvent(
        createReportApprovalAuditEvent(report, {
          actor: "演示财务经理",
          approvedAt: DEMO_NOW,
        }),
      );
    }
    const exportRecord = createReportExportRecord(exportSourceReport, {
      actor: "演示财务经理",
      exportedAt: DEMO_NOW,
      format: "PDF",
    });
    const downloadPackage = createReportHtmlExportPackage(exportSourceReport, exportRecord, {
      generatedAt: DEMO_NOW,
      sections: reportDraftSections,
    });
    downloadTextFile(downloadPackage);
    setLastReportDownloadNotice({ targetId: report.id, targetName: report.name, summary: downloadPackage.summary });
    setReportExportRecords((current) =>
      current.some((item) => item.id === exportRecord.id) ? current : [exportRecord, ...current],
    );
    appendAuditEvent(
      createAuditEvent({
        module: "报告中心",
        action: "生成报告导出包",
        targetType: "报告",
        targetId: report.name,
        targetName: report.name,
        actor: "演示财务经理",
        time: DEMO_NOW,
        detail: `生成 HTML 导出包：${downloadPackage.fileName}；目标格式：${exportRecord.format}。`,
        source: "报告中心",
      }),
    );
    return exportRecord;
  };
  const exportAuditTrail = () => {
    const downloadPackage = createAuditJsonExportPackage(visibleAuditEvents, {
      actor: "管理员",
      exportedAt: DEMO_NOW,
    });
    downloadTextFile(downloadPackage);
    setLastAuditDownloadSummary(downloadPackage.summary);
    appendAuditEvent(
      createAuditEvent({
        module: "系统设置",
        action: "导出审计日志",
        targetType: "系统",
        targetId: "audit-trail",
        targetName: "统一审计流",
        actor: "管理员",
        time: DEMO_NOW,
        detail: downloadPackage.summary,
        source: "系统设置",
      }),
    );
  };
  const confirmInvestorSignature = async (investor: (typeof fundInvestors)[number]) => {
    if (businessStateMode === "server" && investor.id) {
      try {
        const result = await apiClient.confirmInvestorSignature(investor.id,{requestId:crypto.randomUUID(),expectedRevision:investor.revision??0});
        setFundInvestorRecords((current) =>
          current.map((item) => (item.id === investor.id ? result.investor : item)),
        );
        appendAuditEvent(result.auditEvent);
        return;
      } catch (error) {
        markServerWriteFailure("确认募集签署", investor.name, `/funds/${encodeURIComponent(investor.fundId)}?tab=${encodeURIComponent("募集档案")}`, error);
        return;
      }
    }
    if (businessStateMode !== "local") return;

    const confirmed = confirmFundInvestorSignature(investor);
    const fund = funds.find((item) => item.id === investor.fundId);
    setFundInvestorRecords((current) =>
      current.map((item) => (item.fundId === investor.fundId && item.name === investor.name ? confirmed : item)),
    );
    appendAuditEvent(
      createAuditEvent({
        module: "基金账本",
        action: "确认募集签署",
        targetType: "基金",
        targetId: investor.fundId,
        targetName: `${investor.name} 签署材料`,
        actor: fund?.manager ?? "基金运营",
        time: DEMO_NOW,
        detail: `${investor.name}适当性状态更新为已完成，签署状态更新为已签署。`,
        source: fund?.name ?? "基金账本",
      }),
    );
  };
  const confirmFundFee = async (record: CapitalItem) => {
    if (businessStateMode === "server" && record.id) {
      try {
        const result = await apiClient.confirmCapitalRecord(record.id);
        setCapitalRecords((current) =>
          current.map((item) => (item.id === record.id ? result.capitalRecord : item)),
        );
        appendAuditEvent(result.auditEvent);
        return;
      } catch (error) {
        markServerWriteFailure("确认管理费到账", record.company, "/capital", error);
        return;
      }
    }
    if (businessStateMode !== "local") return;

    const confirmed = confirmFundFeeRecord(record);
    const fund = funds.find((item) => item.name === record.fund);
    setCapitalRecords((current) =>
      current.map((item) =>
        item.fund === record.fund && item.company === record.company && item.date === record.date ? confirmed : item,
      ),
    );
    appendAuditEvent(
      createAuditEvent({
        module: "资金事项",
        action: "确认管理费到账",
        targetType: "基金",
        targetId: fund?.id ?? record.fund,
        targetName: `${record.company} 管理费`,
        actor: "财务",
        time: DEMO_NOW,
        detail: `确认${record.company}管理费 ${record.receivable} 已到账，并同步基金账户资金。`,
        source: "基金账本 / 账户资金",
      }),
    );
  };
  const createClauseReminder = async (clause: FundClauseMonitor, fund: Fund) => {
    const result = createClauseReminderTask({ clause, fund, projects: projectRecords, createdAt: DEMO_TODAY });
    if (businessStateMode === "server") {
      if (result.projectId) await addProjectTask(result.projectId, result.task);
      return;
    }
    if (businessStateMode !== "local") return;

    if (result.projectId) await addProjectTask(result.projectId, result.task);
    appendAuditEvent(
      createClauseReminderAuditEvent({
        clause,
        fund,
        actor: fund.manager,
        createdAt: DEMO_NOW,
      }),
    );
  };
  const archiveAiIntake = async (item: AiIntakeItem) => {
    if (businessStateMode === "server") {
      try {
        await apiClient.updateAiIntakeSuggestion(item.id, {
          suggestedFund: item.suggestedFund,
          suggestedFundId:item.suggestedFundId,
          suggestedProject: item.suggestedProject,
          suggestedPath: item.suggestedPath,
        });
        const result = await apiClient.archiveAiIntakeItem(item.id);
        setAiIntakeRecords((current) =>
          current.map((entry) => (entry.id === result.item.id ? result.item : entry)),
        );
        setFundDocumentRecords((current) => prependUniqueFundDocument(current, result.fundDocument));
        setMaterialRecords((current) => prependUniqueMaterialRecord(current, apiMaterialToRecord(result.material)));
        setProjectTaskRecordsById((current) =>
          result.tasks.reduce<Record<string, ProjectTask[]>>(
            (next, task) => ({
              ...next,
              [task.projectId]: prependUniqueProjectTasks(next[task.projectId] ?? [], [task]),
            }),
            current,
          ),
        );
        appendAuditEvents(result.auditEvents);
        return result.item;
      } catch (error) {
        markServerWriteFailure("AI 资料归档", item.title, `/ai-inbox?itemId=${encodeURIComponent(item.id)}`, error);
        return undefined;
      }
    }
    if (businessStateMode !== "local") return undefined;

    const archiveResult = createAiIntakeArchiveResult(item, { funds, projects: projectRecords });
    if (!archiveResult) return undefined;

    setAiIntakeRecords((current) =>
      current.map((entry) => (entry.id === archiveResult.archivedItem.id ? archiveResult.archivedItem : entry)),
    );
    setFundDocumentRecords((current) => prependUniqueFundDocument(current, archiveResult.fundDocument));
    setMaterialRecords((current) => prependUniqueMaterialRecord(current, archiveResult.materialRecord));
    setFundAuditLogs((current) => {
      const existingLogs = current[archiveResult.fundDocument.fundId] ?? [];
      const nextLogs = prependUniqueAuditLog(existingLogs, archiveResult.fundAuditLog);
      return nextLogs === existingLogs
        ? current
        : { ...current, [archiveResult.fundDocument.fundId]: nextLogs };
    });
    if (archiveResult.projectId) {
      const projectId = archiveResult.projectId;
      const projectTasks: ProjectTask[] = archiveResult.projectTasks;
      setProjectTaskRecordsById((current) => ({
        ...current,
        [projectId]: prependUniqueProjectTasks(current[projectId] ?? [], projectTasks),
      }));
    }
    appendAuditEvent(
      createAuditEvent({
        module: "AI 收件箱",
        action: "确认资料归档",
        targetType: "基金",
        targetId: archiveResult.fundDocument.fundId,
        targetName: item.title,
        actor: item.submittedBy,
        time: DEMO_NOW,
        detail: `确认归档到 ${item.suggestedPath}，并生成 ${archiveResult.projectTasks.length} 条建议任务。`,
        source: item.source,
      }),
    );
    return archiveResult.archivedItem;
  };
  const updateAiIntake = async (id: string, patch: Pick<AiIntakeItem, "suggestedFund" | "suggestedFundId" | "suggestedProject" | "suggestedPath">) => {
    if (businessStateMode === "server") {
      try {
        const result = await apiClient.updateAiIntakeSuggestion(id, patch);
        setAiIntakeRecords((current) => current.map((item) => (item.id === id ? result.item : item)));
        appendAuditEvent(result.auditEvent);
        return result.item;
      } catch (error) {
        markServerWriteFailure("修改归档建议", aiIntakeRecords.find(item => item.id === id)?.title ?? id, `/ai-inbox?itemId=${encodeURIComponent(id)}`, error);
        return undefined;
      }
    }
    if (businessStateMode !== "local") return undefined;

    const currentItem = aiIntakeRecords.find((item) => item.id === id);
    if (!currentItem) return undefined;
    const updated = updateAiIntakeSuggestion(currentItem, patch);
    setAiIntakeRecords((current) => current.map((item) => (item.id === id ? updated : item)));
    appendAuditEvent(
      createAuditEvent({
        module: "AI 收件箱",
        action: "修改归档建议",
        targetType: "资料",
        targetId: id,
        targetName: currentItem.title,
        actor: currentItem.submittedBy,
        time: DEMO_NOW,
        detail: `人工修改归属为 ${patch.suggestedFund} / ${patch.suggestedProject} / ${patch.suggestedPath}。`,
        source: currentItem.source,
      }),
    );
    return updated;
  };
  const rejectAiIntake = async (id: string, reviewNote: string) => {
    if (businessStateMode === "server") {
      try {
        const result = await apiClient.rejectAiIntakeItem(id, reviewNote);
        setAiIntakeRecords((current) => current.map((item) => (item.id === id ? result.item : item)));
        appendAuditEvent(result.auditEvent);
        return result.item;
      } catch (error) {
        markServerWriteFailure("退回资料", aiIntakeRecords.find(item => item.id === id)?.title ?? id, `/ai-inbox?itemId=${encodeURIComponent(id)}`, error);
        return undefined;
      }
    }
    if (businessStateMode !== "local") return undefined;

    const currentItem = aiIntakeRecords.find((item) => item.id === id);
    if (!currentItem || currentItem.status !== "待确认") return undefined;
    const rejected = rejectAiIntakeItem(currentItem, reviewNote);
    setAiIntakeRecords((current) => current.map((item) => (item.id === id ? rejected : item)));
    appendAuditEvent(
      createAuditEvent({
        module: "AI 收件箱",
        action: "退回归档建议",
        targetType: "资料",
        targetId: id,
        targetName: currentItem.title,
        actor: currentItem.submittedBy,
        time: DEMO_NOW,
        detail: reviewNote,
        source: currentItem.source,
      }),
    );
    return rejected;
  };
  const receiveAiIntake = (result:Awaited<ReturnType<ApiClient['createAiIntakeFromMaterial']>>) => {
    setAiIntakeRecords(current=>[result.item,...current.filter(item=>item.id!==result.item.id)]);
    if(result.auditEvent)appendAuditEvent(result.auditEvent);
  };
  const confirmMeeting = async (meeting: MeetingRecord) => {
    const result = createMeetingConfirmationResult({
      meeting,
      projects: projectRecords,
      actor: "演示投资经理",
      confirmedAt: DEMO_NOW,
      dueDate: "2026-06-12",
    });
    const project = findProjectForTarget(projectRecords, meeting.project);

    if (businessStateMode === "server") {
      try {
        const meetingId = (meeting as MeetingRecord & { id?: string }).id;
        if (!meetingId) return undefined;
        const confirmed = await apiClient.confirmMeeting(meetingId);
        setMeetingRecords((current) =>
          current.map((item) => (item.title === meeting.title ? confirmed.meeting : item)),
        );
        setMaterialRecords((current) => prependUniqueMaterialRecord(current, apiMaterialToRecord(confirmed.material)));
        setProjectTaskRecordsById((current) =>
          confirmed.tasks.reduce<Record<string, ProjectTask[]>>(
            (next, task) => ({
              ...next,
              [task.projectId]: prependUniqueProjectTasks(next[task.projectId] ?? [], [task]),
            }),
            current,
          ),
        );
        appendAuditEvents(confirmed.auditEvents);
        return confirmed.meeting;
      } catch (error) {
        markServerWriteFailure("确认会议纪要并同步任务", meeting.title, `/meetings?meetingId=${encodeURIComponent(meeting.id ?? meeting.title)}`, error);
        return undefined;
      }
    }
    if (businessStateMode !== "local") return undefined;

    setMeetingRecords((current) =>
      current.map((item) => (item.title === meeting.title ? result.updatedMeeting : item)),
    );
    setMaterialRecords((current) => prependUniqueMaterialRecord(current, result.material));
    if (project) {
      setProjectTaskRecordsById((current) => ({
        ...current,
        [project.id]: prependUniqueProjectTasks(current[project.id] ?? [], result.tasks),
      }));
    }
    appendAuditEvents(result.auditEvents);
    return result.updatedMeeting;
  };

  if (!localBusinessStateMode && sessionStatus === "loading") {
    return <AuthStatusScreen />;
  }

  if (!localBusinessStateMode && sessionStatus === "unavailable") {
    return <main className="min-h-screen bg-[var(--paper)] p-8 text-[var(--ink)]"><section className="mx-auto mt-20 max-w-lg space-y-5"><h1 className="text-2xl font-semibold">连接暂不可用</h1><p role="alert">{sessionIssue}</p><button data-ui="primary" className="min-h-11 rounded-lg bg-[var(--bronze)] px-5 text-[var(--on-accent)]" disabled={sessionChecking} onClick={()=>setSessionCheckRevision(v=>v+1)}>{sessionChecking?'正在重试连接…':'重试连接'}</button></section></main>;
  }

  if (!localBusinessStateMode && sessionStatus === "unauthenticated") {
    return <LoginScreen onSubmit={login} isSubmitting={isLoginSubmitting} error={loginError} />;
  }

  if (path === "/materials/preview") {
    return <MaterialControlledPreviewPage />;
  }

  return (
    <SourceVisibilityContext.Provider value={hideSeedDemoData}><MaterialKnowledgeProvider sourceRevision={visibleMaterialApiRecords.map(m=>m.id).join('|')} versionedSourceIds={visibleMaterialApiRecords.filter((material) => material.currentVersion).flatMap((material) => [material.id, ...(material.sourceMaterialId ? [material.sourceMaterialId] : [])])}>
    <RecordManagementProvider key={`${sessionUser?.id}:${sessionUser?.role}`} role={sessionUser?.role??'viewer'} onChanged={async()=>{const result=await loadBusinessStateFromServer(apiClient,createEmptyBusinessStateSnapshot(),!hideSeedDemoData);if(result.mode!=='server')throw Error('列表未能重新读取');if(isCurrentSource()){lastServerSnapshot.current=result.state;applyBusinessStateSnapshot(result.state);}}}>
    <Layout
      sessionUser={sessionUser}
      onLogout={async () => {
        if(!(await checkRouteChange()).allowed)return;
        const controller=new AbortController(),timeout=window.setTimeout(()=>controller.abort(),12000);
        try{await apiClient.logout(controller.signal);}catch(error){if(!isSessionRejection(error))throw error;invalidateClientSession();}finally{window.clearTimeout(timeout);}
        const home=sessionEntry.signOut();setExplicitSignOut(true);setSessionUser(null);setSessionStatus('unauthenticated');setSessionIssue(null);setLoginError(null);
        window.history.replaceState({},'',home);window.dispatchEvent(new PopStateEvent('popstate'));
      }}
      currentPath={path}
      pendingInbox={pendingAiIntakeCount}
      searchItems={[
        ...visibleProjectRecords.map(project=>({title:project.name,kind:'项目',href:'/projects/'+encodeURIComponent(project.id),keywords:project.fund})),
        ...visibleFundRecords.map(fund=>({title:fund.name,kind:'基金',href:'/funds/'+encodeURIComponent(fund.id),keywords:fund.manager})),
        ...visibleMaterialApiRecords.map(material=>({title:material.name,kind:'资料',href:'/materials?materialId='+encodeURIComponent(material.id)})),
      ]}
      meetingWorkspace={<MeetingsPage meetings={visibleMeetingRecords} projects={visibleProjectRecords} api={apiClient} onChanged={refreshFundMaster} currentRole={sessionUser?.role} onConfirm={confirmMeeting}/>}
    >
      {sessionIssue?<div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--warning-bg)] p-4 text-sm text-[var(--ink)]"><span>{sessionIssue}</span><button data-ui="secondary" className="min-h-10 rounded-md border border-[var(--line)] px-3" disabled={sessionChecking} onClick={()=>setSessionCheckRevision(v=>v+1)}>{sessionChecking?'正在重试连接…':'重试连接'}</button></div>:null}
      {businessStateMode==='degraded'&&businessStateNotice?<div className="business-sync-feedback" role="alert"><ActionableNotice href="/settings" action="查看系统连接与状态" onRefresh={()=>void recoverBusinessData()} busy={recoveringData}>{businessStateNotice}</ActionableNotice></div>:null}
      {lastWriteFailure ? <ActionableNotice href={lastWriteFailure.href} action={lastWriteFailure.action} onRefresh={() => void recoverBusinessData()} busy={recoveringData} onDismiss={() => setLastWriteFailure(null)}>{lastWriteFailure.message}</ActionableNotice> : null}
      {workflowTaskEdit ? <WorkflowTaskDialog projects={visibleProjectRecords} projectId={workflowTaskEdit.projectId} task={workflowTaskEdit.task} seed={workflowTaskEdit.seed} onClose={() => setWorkflowTaskEdit(null)} onSaved={async () => { await refreshWorkflow(); setWorkflowTaskEdit(null); }} /> : null}
      {assetNotice?<ActionableNotice href="/projects" action="前往项目管理核对资产" onRefresh={() => void refreshWorkflow().catch(() => setAssetNotice('退出资产状态仍未读取成功，请恢复连接后重新核对。'))}>{assetNotice}</ActionableNotice>:null}
      {approvalTargetLoading?<AppLoading/>:!localBusinessStateMode&&!lastServerSnapshot.current&&['loading','degraded'].includes(businessStateMode)&&['/','/dashboard','/projects','/funds','/capital','/monitoring','/materials','/ai-inbox','/meetings','/reports'].some(route=>path===route||path.startsWith(route+'/'))?businessStateMode==='loading'?<AppLoading/>:<section className="business-initial-loading rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6" style={{minHeight:'70vh'}} aria-busy="false"><h1 className="text-xl font-semibold">业务记录尚未读取成功</h1><p className="mt-4 text-sm text-[var(--secondary)]">尚未取得可核实的业务快照，请使用上方恢复连接入口重试。</p></section>:<Router
        currentRole={sessionUser?.role}
        onWorkflowRefresh={refreshWorkflow}
        onFundMasterChanged={refreshFundMaster}
        path={path}
        capitalRecords={visibleCapitalRecords}
        fundRecords={visibleFundRecords}
        reportRecords={visibleReportRecords}
        reportExportRecords={filterSeedDemoRecords(reportExportRecords,hideSeedDemoData)}
        meetingRecords={visibleMeetingRecords}
        aiIntakeRecords={visibleAiIntakeRecords}
        fundInvestorRecords={visibleFundInvestorRecords}
        pendingAiIntakeCount={pendingAiIntakeCount}
        projectRecords={visibleProjectRecords}
        setProjectRecords={setProjectRecords}
        fundDocuments={visibleFundDocumentRecords}
        fundAuditLogs={visibleFundAuditLogs}
        auditEvents={visibleAuditEvents}
        materialRecords={visibleMaterialRecords}
        materialApiRecords={visibleMaterialApiRecords}
        trustedAiRagDataOrigins={trustedAiRagDataOrigins}
        onProjectCreate={async (input) => {
          if (businessStateMode !== "server") throw new Error("项目尚未保存，请检查连接后重试。");
          const result = await apiClient.createProject(input);
          setProjectRecords((current) => [result.project, ...current.filter((project) => project.id !== result.project.id)]);
          appendAuditEvent(result.auditEvent);
          const refreshedFunds = await apiClient.getFunds().catch(() => null);
          if (refreshedFunds) setFundRecords(refreshedFunds.funds);
          return result.project;
        }}
        onMaterialsRefresh={refreshMaterials}
        onMaterialArchiveConfirm={archiveReviewedMaterial}
        projectTaskRecordsById={visibleProjectTaskRecordsById}
        onProjectTaskCreate={addProjectTask}
        onProjectTaskUpdate={updateProjectTask}
        onReportSave={saveReport}
        onReportApprove={approveReport}
        onReportExport={exportReport}
        lastReportDownloadNotice={lastReportDownloadNotice}
        businessStateMode={businessStateMode}
        businessStateNotice={businessStateNotice}
        auditDownloadSummary={lastAuditDownloadSummary}
        onAuditExport={exportAuditTrail}
        onInvestorSignatureConfirm={confirmInvestorSignature}
        onFundFeeConfirm={confirmFundFee}
        onClauseReminderCreate={createClauseReminder}
        onCapitalRecordConfirm={confirmAiCapitalRecord}
        onCapitalRecordCreate={createCapitalRecord}
        onAiIntakeArchive={archiveAiIntake}
        onAiIntakeUpdate={updateAiIntake}
        onAiIntakeReject={rejectAiIntake}
        onAiIntakeCreated={receiveAiIntake}
        onMeetingConfirm={confirmMeeting}
        onAuditEventCreate={appendAuditEvent}
        onProjectStageUpdate={async (projectId, nextStage, previousStage) => {
          if (businessStateMode === "server") {
            try {
              const result = await apiClient.updateProjectStage(projectId, { stage: nextStage, actor: "演示投资经理" });
              setProjectRecords((current) => current.map((item) => (item.id === projectId ? result.project : item)));
              appendAuditEvent(result.auditEvent);
              return result.auditEvent;
            } catch (error) {
              markServerWriteFailure("更新项目阶段", projectRecords.find(item => item.id === projectId)?.name ?? projectId, `/projects/${encodeURIComponent(projectId)}`, error);
              return undefined;
            }
          }
          if (businessStateMode !== "local") return undefined;

          const project = projectRecords.find((item) => item.id === projectId);
          const event = createAuditEvent({
            module: "项目账本",
            action: "更新项目阶段",
            targetType: "项目",
            targetId: projectId,
            targetName: project?.name ?? projectId,
            actor: "演示投资经理",
            time: DEMO_NOW,
            detail: `项目阶段从“${previousStage}”更新为“${nextStage}”。`,
          });
          setProjectRecords((current) =>
            current.map((item) => (item.id === projectId ? { ...item, stage: nextStage, updatedAt: DEMO_NOW } : item)),
          );
          appendAuditEvent(event);
          return event;
        }}
        onRiskHandle={async (risk) => {
          const project = findProjectForTarget(projectRecords, risk.target);
          const resultText = "已确认责任人并保留来源材料。";
          if (businessStateMode === "server") {
            try {
              const result = await apiClient.handleRisk({
                ...risk,
                projectId: project?.id ?? null,
                actor: project?.manager ?? "投后负责人",
                result: resultText,
              });
              appendAuditEvent(result.auditEvent);
              return result.auditEvent;
            } catch (error) {
              markServerWriteFailure("处理风险", risk.title, "/monitoring", error);
              return undefined;
            }
          }
          if (businessStateMode !== "local") return undefined;

          const event = createRiskAuditEvent(risk, projectRecords, {
            actor: project?.manager ?? "投后负责人",
            handledAt: DEMO_NOW,
            result: resultText,
          });
          appendAuditEvent(event);
          return event;
        }}
        apiClient={apiClient}
      />}
    </Layout></RecordManagementProvider>
    </MaterialKnowledgeProvider></SourceVisibilityContext.Provider>
  );
}

function Router({
  currentRole,
  onWorkflowRefresh,
  onFundMasterChanged,
  path,
  capitalRecords,
  fundRecords,
  projectRecords,
  setProjectRecords,
  reportRecords,
  reportExportRecords,
  meetingRecords,
  aiIntakeRecords,
  fundInvestorRecords,
  pendingAiIntakeCount,
  fundDocuments,
  fundAuditLogs,
  auditEvents,
  materialRecords,
  materialApiRecords,
  trustedAiRagDataOrigins,
  onProjectCreate,
  onMaterialsRefresh,
  onMaterialArchiveConfirm,
  projectTaskRecordsById,
  onProjectTaskCreate,
  onProjectTaskUpdate,
  onReportSave,
  onReportApprove,
  onReportExport,
  lastReportDownloadNotice,
  businessStateMode,
  businessStateNotice,
  auditDownloadSummary,
  onAuditExport,
  onInvestorSignatureConfirm,
  onFundFeeConfirm,
  onClauseReminderCreate,
  onCapitalRecordConfirm,
  onCapitalRecordCreate,
  onAiIntakeArchive,
  onAiIntakeUpdate,
  onAiIntakeReject,
  onAiIntakeCreated,
  onMeetingConfirm,
  onAuditEventCreate,
  onProjectStageUpdate,
  onRiskHandle,
  apiClient,
}: {
  currentRole?:ApiSessionUser['role'];
  onWorkflowRefresh: () => Promise<void>;
  onFundMasterChanged: () => Promise<void>;
  path: string;
  capitalRecords: CapitalItem[];
  fundRecords: Fund[];
  projectRecords: Project[];
  setProjectRecords: Dispatch<SetStateAction<Project[]>>;
  reportRecords: ReportRecord[];
  reportExportRecords: ReportExportRecord[];
  meetingRecords: MeetingRecord[];
  aiIntakeRecords: AiIntakeItem[];
  fundInvestorRecords: typeof fundInvestors;
  pendingAiIntakeCount: number;
  fundDocuments: FundDocument[];
  fundAuditLogs: Record<string, string[]>;
  auditEvents: AuditEvent[];
  materialRecords: MaterialRecord[];
  materialApiRecords: ApiMaterial[];
  trustedAiRagDataOrigins?: DataOrigin[];
  onProjectCreate: (input: ApiProjectCreateInput) => Promise<Project>;
  onMaterialsRefresh: () => Promise<void>;
  onMaterialArchiveConfirm: (payload: MaterialArchivePayload) => Promise<ApiMaterial | undefined>;
  projectTaskRecordsById: Record<string, ProjectTask[]>;
  onProjectTaskCreate: (projectId: string, task: ProjectTask) => Promise<ProjectTask | undefined>;
  onProjectTaskUpdate: (projectId: string, taskId: string, patch: Partial<Omit<ProjectTask, "id">>) => Promise<ProjectTask | undefined>;
  onReportSave: (draft: ReportWorkflowDraft) => Promise<ReportRecord | undefined>;
  onReportApprove: (report: ReportRecord) => Promise<ReportRecord | undefined>;
  onReportExport: (report: ReportRecord,format?:"PDF"|"DOCX") => Promise<ReportExportRecord | undefined>;
  lastReportDownloadNotice: DownloadNotice | null;
  businessStateMode: BusinessStateMode;
  businessStateNotice: string | null;
  auditDownloadSummary: string | null;
  onAuditExport: () => void;
  onInvestorSignatureConfirm: (investor: (typeof fundInvestors)[number]) => void;
  onFundFeeConfirm: (record: CapitalItem) => void;
  onClauseReminderCreate: (clause: FundClauseMonitor, fund: Fund) => void;
  onCapitalRecordConfirm: () => void;
  onCapitalRecordCreate: (record: CapitalItem) => Promise<void>;
  onAiIntakeArchive: (item: AiIntakeItem) => Promise<AiIntakeItem | undefined>;
  onAiIntakeUpdate: (id: string, patch: Pick<AiIntakeItem, "suggestedFund" | "suggestedFundId" | "suggestedProject" | "suggestedPath">) => Promise<AiIntakeItem | undefined>;
  onAiIntakeReject: (id: string, reviewNote: string) => Promise<AiIntakeItem | undefined>;
  onAiIntakeCreated: (result:Awaited<ReturnType<ApiClient['createAiIntakeFromMaterial']>>)=>void;
  onMeetingConfirm: (meeting: MeetingRecord) => Promise<MeetingRecord | undefined>;
  onAuditEventCreate: (event: AuditEvent) => void;
  onProjectStageUpdate: (projectId: string, nextStage: string, previousStage: string) => Promise<AuditEvent | undefined>;
  onRiskHandle: (risk: (typeof risks)[number]) => Promise<AuditEvent | undefined>;
  apiClient: ApiClient;
}) {
  if(path.startsWith('/companies/'))return <CompanyRecordDialog companyId={decodeURIComponent(path.split('/')[2])} currentRole={currentRole} onClose={()=>navigate('/projects')} onChanged={onWorkflowRefresh}/>;
  if (path.startsWith("/funds/")) {
    return (
      <FundDetailPage key={`fund-${path.split('/')[2]}`}
        onAssetChanged={onWorkflowRefresh}
        onMasterChanged={onFundMasterChanged}
        currentRole={currentRole}
        fundRecords={fundRecords}
        investors={fundInvestorRecords}
        documents={fundDocuments}
        auditEvents={auditEvents}
        capitalRecords={capitalRecords}
        reports={reportRecords}
        projects={projectRecords}
        onInvestorSignatureConfirm={onInvestorSignatureConfirm}
        onFundFeeConfirm={onFundFeeConfirm}
        onClauseReminderCreate={onClauseReminderCreate}
      />
    );
  }
  if (path === "/funds") return <FundsPage funds={fundRecords} currentRole={currentRole} onChanged={onFundMasterChanged} />;
  if (path === "/ai-inbox") {
    return (
      <AiInboxPage
        pendingCount={pendingAiIntakeCount}
        fundRecords={fundRecords}
        items={aiIntakeRecords}
        projects={projectRecords}
        onArchive={onAiIntakeArchive}
        onUpdate={onAiIntakeUpdate}
        onReject={onAiIntakeReject}
        onCreated={onAiIntakeCreated}
        materials={materialApiRecords}
        api={apiClient}
        canWrite={currentRole==='admin'||currentRole==='post_investment'}
        onMaterialsRefresh={onMaterialsRefresh}
        onTasksRefresh={onWorkflowRefresh}
      />
    );
  }
  if (path.startsWith("/projects/")) {
    return (
      <ProjectDetailPage projectId={path.split('/')[2]} funds={fundRecords} key={`project-${path.split('/')[2]}`}
        onMasterChanged={onFundMasterChanged}
        currentRole={currentRole}
        onWorkflowRefresh={onWorkflowRefresh}
        materialApiRecords={materialApiRecords}
        materials={materialRecords}
        projects={projectRecords}
        tasksByProject={projectTaskRecordsById}
        onProjectTaskCreate={onProjectTaskCreate}
        onProjectTaskUpdate={onProjectTaskUpdate}
        reports={reportRecords}
        meetings={meetingRecords}
        capitalRecords={capitalRecords}
        auditEvents={auditEvents}
        onMeetingConfirm={onMeetingConfirm}
        onAuditEventCreate={onAuditEventCreate}
        onProjectStageUpdate={onProjectStageUpdate}
      />
    );
  }
  if (path === "/projects") {
    return <ProjectsPage currentRole={currentRole} funds={fundRecords} onCreate={onProjectCreate} projects={projectRecords} tasksByProject={projectTaskRecordsById} onProjectTaskUpdate={onProjectTaskUpdate} />;
  }
  if ((path==='/meetings'||path==='/reports')&&(businessStateMode==='loading'||businessStateMode==='degraded')&&!(path==='/meetings'?meetingRecords.length:reportRecords.length)) return <div><SectionHeader title={path==='/meetings'?'会议纪要':'报告中心'} eyebrow="业务资料"/><Card className="p-6"><p role={businessStateMode==='loading'?'status':'alert'}>{businessStateMode==='loading'?'正在读取业务数据…':'业务数据暂未读取成功，请恢复连接后重新读取。'}</p></Card></div>;
  if (path === "/reports/create") return <ReportCreatePage projects={projectRecords} funds={fundRecords} onChanged={onWorkflowRefresh} />;
  if (path === "/reports") {
    return (
      <ReportsPage
        projects={projectRecords} funds={fundRecords}
        serverBacked={businessStateMode==='server'}
        onChanged={onWorkflowRefresh}
        currentRole={currentRole}
        reports={reportRecords}
        exportRecords={reportExportRecords}
        onApprove={onReportApprove}
        onExport={onReportExport}
        lastDownloadNotice={lastReportDownloadNotice}
      />
    );
  }
  if (path === "/monitoring") {
    return <MonitoringPage projects={projectRecords} onTaskCreate={onProjectTaskCreate} onRiskHandle={onRiskHandle} onChanged={onWorkflowRefresh} />;
  }
  if (path === "/tasks/notifications") return <NotificationWorkspace/>;
  if (path === "/tasks") return <div className="tasks-workspace"><AgentTaskWorkspace title="任务中心" role={currentRole}/><TaskBusinessViews project={<WorkflowTaskBoard projects={projectRecords} onChanged={onWorkflowRefresh}/>} fund={<FundOperationsSummary mode="tasks"/>} lp={<FundraisingTasks/>}/></div>;
  if (path === "/capital") return <><CapitalPage items={capitalRecords} projects={projectRecords} funds={fundRecords} currentRole={currentRole} onCreate={onCapitalRecordCreate} onChanged={onWorkflowRefresh} /></>;
  if (path === "/materials") {
    return (
      <MaterialsPage
        projects={projectRecords}
        materials={materialRecords}
        materialApiRecords={materialApiRecords}
        onMaterialsRefresh={onMaterialsRefresh}
        onMaterialArchiveConfirm={onMaterialArchiveConfirm}
      />
    );
  }
  if (path === "/meetings") return <MeetingsPage meetings={meetingRecords} projects={projectRecords} api={apiClient} onChanged={onFundMasterChanged} currentRole={currentRole} onConfirm={onMeetingConfirm} />;
  if (path.startsWith("/ai-assistant/")) return <AgentWorkbench section={path} role={currentRole}/>;
  if (path === "/ai-assistant") {
    return (
      <AiEmployeePage projects={projectRecords} role={currentRole} onBusinessChanged={onWorkflowRefresh} />
    );
  }
  if (path === "/settings") {
    return (
      <SettingsPage
        funds={fundRecords}
        currentRole={currentRole}
        onAccountsChanged={onWorkflowRefresh}
        auditEvents={auditEvents}
        onAuditExport={onAuditExport}
        auditDownloadSummary={auditDownloadSummary}
        businessStateMode={businessStateMode}
        businessStateNotice={businessStateNotice}
      />
    );
  }
  return (
    <DashboardPage
      currentRole={currentRole}
      mayReadProgress={currentRole!=='finance'}
      onRefresh={onWorkflowRefresh}
      apiClient={apiClient}
      materials={materialApiRecords}
      meetingRecords={meetingRecords}
      funds={fundRecords}
      onCreate={onProjectCreate}
      pendingAiIntakeCount={pendingAiIntakeCount}
      projects={projectRecords}
      reports={reportRecords}
      tasksByProject={projectTaskRecordsById}
      capitalRecords={capitalRecords}
    />
  );
}

type MaterialPreviewLoadState = "idle" | "loading" | "ready" | "error";
type MaterialPreviewQuery = ReturnType<typeof readMaterialPreviewQuery>;
type MaterialPreviewPageSize = { width: number; height: number };
type MaterialPreviewScrollRatios = { top: number; left: number };
type MaterialPreviewPaneKind = "original" | "recognized";
type MaterialPreviewLayoutCacheState = "idle" | "loading" | "missing" | "ready" | "generating" | "error";
type MaterialPreviewLayoutCacheBatchState = "idle" | "generating" | "ready" | "error";
type MaterialPreviewOcrMode = "reading" | "raw" | "faithful";
type MaterialPreviewLayoutCacheRecord = {
  href: string;
  cache: ApiMaterialPreviewLayoutCache;
};
type MaterialPreviewDragState = {
  source: MaterialPreviewPaneKind;
  startX: number;
  startY: number;
  originalStartLeft: number;
  originalStartTop: number;
  recognizedStartLeft: number;
  recognizedStartTop: number;
};

type MaterialPreviewRotationMap = Record<number, number>;

const MATERIAL_PREVIEW_DEFAULT_PAGE_SIZE: MaterialPreviewPageSize = { width: 794, height: 1123 };
const MATERIAL_PREVIEW_PANE_PADDING = 24;
const MATERIAL_RECOGNIZED_THUMBNAIL_SIZE: MaterialPreviewPageSize = { width: 68, height: 90 };

function MaterialControlledPreviewPage() {
  const preview = useMemo(readMaterialPreviewQuery, []);
  const previewApiClient = useMemo(() => createApiClient(), []);
  const [loadState, setLoadState] = useState<MaterialPreviewLoadState>("idle");
  const [remoteContent, setRemoteContent] = useState("");
  const [layoutCacheState, setLayoutCacheState] = useState<MaterialPreviewLayoutCacheState>("idle");
  const [layoutCacheRecord, setLayoutCacheRecord] = useState<MaterialPreviewLayoutCacheRecord | null>(null);
  const [layoutCacheError, setLayoutCacheError] = useState("");
  const [layoutCacheBatchState, setLayoutCacheBatchState] = useState<MaterialPreviewLayoutCacheBatchState>("idle");
  const [layoutCacheBatchError, setLayoutCacheBatchError] = useState("");
  const [layoutCacheBatchCount, setLayoutCacheBatchCount] = useState(0);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [syncScroll, setSyncScroll] = useState(true);
  const [showMetadata, setShowMetadata] = useState(false);
  const [originalRotationsByPage, setOriginalRotationsByPage] = useState<MaterialPreviewRotationMap>({});
  const [recognizedRotationsByPage, setRecognizedRotationsByPage] = useState<MaterialPreviewRotationMap>({});
  const [recognizedOcrMode, setRecognizedOcrMode] = useState<MaterialPreviewOcrMode>("reading");
  const [originalPageSizesByHref, setOriginalPageSizesByHref] = useState<Record<string, MaterialPreviewPageSize>>({});
  const [originalPaneSize, setOriginalPaneSize] = useState<MaterialPreviewPageSize>({ width: 0, height: 0 });
  const sourceHref = preview.sourceHref;
  const downloadHref = preview.downloadHref || sourceHref;
  const pageCount = Math.max(1, Number.parseInt(preview.pageCount, 10) || 1);
  const [currentPage, setCurrentPage] = useState(() => clampNumber(Number.parseInt(preview.page, 10) || 1, 1, pageCount));
  const originalPaneRef = useRef<HTMLDivElement>(null);
  const recognizedPaneRef = useRef<HTMLDivElement>(null);
  const originalThumbnailRailRef = useRef<HTMLDivElement>(null);
  const recognizedThumbnailRailRef = useRef<HTMLDivElement>(null);
  const syncingScrollRef = useRef(false);
  const syncingThumbnailRailRef = useRef(false);
  const dragPanRef = useRef<MaterialPreviewDragState | null>(null);
  const lastSyncedScrollRatiosRef = useRef<MaterialPreviewScrollRatios>({ top: 0, left: 0 });
  const pendingSyncedScrollRatiosRef = useRef<MaterialPreviewScrollRatios | null>(null);
  const originalPageHref = preview.pageImageDir ? createPageImageHref(preview.pageImageDir, currentPage) : "";
  const originalImageHref = originalPageHref || (sourceHref && isImagePreviewKind(preview.kind, sourceHref) ? sourceHref : "");
  const hasRecognizedPreview = Boolean(
    preview.recognizedHtmlHref ||
      preview.recognizedTextHref ||
      preview.kind === "recognized_html" ||
      preview.kind === "recognized_text",
  );
  const recognizedHref =
    hasRecognizedPreview
      ? preview.recognizedHtmlHref ||
        preview.recognizedTextHref ||
        (sourceHref && isTextPreviewKind(preview.kind, sourceHref) ? sourceHref : "")
      : "";
  const recognizedKind = preview.recognizedHtmlHref
    ? "recognized_html"
    : preview.recognizedTextHref
      ? "recognized_text"
      : hasRecognizedPreview
        ? preview.kind
        : "metadata_preview";
  const layoutCacheHref = preview.recognizedHtmlHref
    ? createMaterialPreviewLayoutCacheHref(preview.recognizedHtmlHref, currentPage)
    : "";
  const shouldLoadRemoteText = Boolean(recognizedHref) && isTextPreviewKind(recognizedKind, recognizedHref);
  const highlightTerms = useMemo(() => createPreviewHighlightTerms(preview.highlightTerms), [preview.highlightTerms]);
  const highlightTermsKey = highlightTerms.join("\u0000");
  const hasPageThumbnails = Boolean(preview.pageImageDir && pageCount > 1);
  const originalPageSize = originalImageHref
    ? originalPageSizesByHref[originalImageHref] ?? MATERIAL_PREVIEW_DEFAULT_PAGE_SIZE
    : MATERIAL_PREVIEW_DEFAULT_PAGE_SIZE;
  const originalRotation = normalizeMaterialPreviewRotation(originalRotationsByPage[currentPage] ?? 0);
  const recognizedRotation = normalizeMaterialPreviewRotation(recognizedRotationsByPage[currentPage] ?? 0);
  const rotatedOriginalPageSize = useMemo(
    () => rotateMaterialPreviewPageSize(originalPageSize, originalRotation),
    [originalPageSize, originalRotation],
  );
  const pageDisplaySize = useMemo(
    () => computeMaterialPreviewPageDisplaySize(rotatedOriginalPageSize, originalPaneSize, zoomPercent),
    [rotatedOriginalPageSize, originalPaneSize, zoomPercent],
  );
  const originalDisplayScale = computeMaterialPreviewDisplayScale(rotatedOriginalPageSize, pageDisplaySize);
  const originalFrameSize = scaleMaterialPreviewPageSize(originalPageSize, originalDisplayScale);

  useEffect(() => {
    setCurrentPage((page) => clampNumber(page, 1, pageCount));
  }, [pageCount]);

  useEffect(() => {
    const pane = originalPaneRef.current;
    if (!pane) return undefined;

    const updateOriginalPaneSize = () => {
      setOriginalPaneSize({
        width: pane.clientWidth,
        height: pane.clientHeight,
      });
    };

    updateOriginalPaneSize();
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateOriginalPaneSize);
    resizeObserver?.observe(pane);
    window.addEventListener("resize", updateOriginalPaneSize);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateOriginalPaneSize);
    };
  }, []);

  useEffect(() => {
    if (!shouldLoadRemoteText || !recognizedHref) {
      setLoadState("idle");
      setRemoteContent("");
      return;
    }

    const abortController = new AbortController();
    setLoadState("loading");
    setRemoteContent("");

    fetchInSession(fetch,recognizedHref, { signal: abortController.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .then((text) => {
        setRemoteContent(text);
        setLoadState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setRemoteContent("");
        setLoadState("error");
      });

    return () => abortController.abort();
  }, [shouldLoadRemoteText, recognizedHref]);

  useEffect(() => {
    if (!layoutCacheHref || recognizedKind !== "recognized_html") {
      setLayoutCacheState("idle");
      setLayoutCacheRecord(null);
      setLayoutCacheError("");
      return;
    }

    const abortController = new AbortController();
    setLayoutCacheState("loading");
    setLayoutCacheRecord((current) => (current?.href === layoutCacheHref ? current : null));
    setLayoutCacheError("");

    fetchInSession(fetch,layoutCacheHref, { signal: abortController.signal, cache: "no-store" })
      .then(async (response) => {
        if (response.status === 404) {
          setLayoutCacheState("missing");
          return;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const cache = (await response.json()) as ApiMaterialPreviewLayoutCache;
        setLayoutCacheRecord({ href: layoutCacheHref, cache });
        setLayoutCacheState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLayoutCacheRecord((current) => (current?.href === layoutCacheHref ? current : null));
        setLayoutCacheError(error instanceof Error ? error.message : "版式缓存加载失败");
        setLayoutCacheState("error");
      });

    return () => abortController.abort();
  }, [layoutCacheHref, recognizedKind]);

  const setPaneScrollToRatios = (pane: HTMLDivElement | null, ratios: MaterialPreviewScrollRatios) => {
    if (!pane) return;
    const verticalRange = pane.scrollHeight - pane.clientHeight;
    const horizontalRange = pane.scrollWidth - pane.clientWidth;
    pane.scrollTop = verticalRange > 0 ? verticalRange * clampNumber(ratios.top, 0, 1) : 0;
    pane.scrollLeft = horizontalRange > 0 ? horizontalRange * clampNumber(ratios.left, 0, 1) : 0;
  };

  const readPaneScrollRatios = (pane: HTMLDivElement | null): MaterialPreviewScrollRatios | null => {
    if (!pane) return null;
    const verticalRange = pane.scrollHeight - pane.clientHeight;
    const horizontalRange = pane.scrollWidth - pane.clientWidth;
    return {
      top: verticalRange > 0 ? clampNumber(pane.scrollTop / verticalRange, 0, 1) : 0,
      left: horizontalRange > 0 ? clampNumber(pane.scrollLeft / horizontalRange, 0, 1) : 0,
    };
  };

  const readCurrentPreviewScrollRatios = () => {
    return readPaneScrollRatios(originalPaneRef.current) ?? readPaneScrollRatios(recognizedPaneRef.current) ?? { top: 0, left: 0 };
  };

  const findRecognizedPageElement = (page: number) => {
    const recognized = recognizedPaneRef.current;
    if (!recognized) return null;
    return recognized.querySelector<HTMLElement>(`.ocr-document-page[data-page="${page}"]`);
  };

  const scrollRecognizedHighlightIntoView = (page: number) => {
    const recognized = recognizedPaneRef.current;
    if (!recognized || highlightTerms.length === 0) return false;

    const pageElement = findRecognizedPageElement(page);
    const highlight = (pageElement ?? recognized).querySelector<HTMLElement>(".material-preview-highlight");
    if (!highlight) return false;

    const paneRect = recognized.getBoundingClientRect();
    const highlightRect = highlight.getBoundingClientRect();
    recognized.scrollTop += highlightRect.top - paneRect.top - 72;
    recognized.scrollLeft += highlightRect.left - paneRect.left - 72;
    return true;
  };

  const mutateSyncedScroll = (mutation: () => void) => {
    syncingScrollRef.current = true;
    mutation();
    window.requestAnimationFrame(() => {
      syncingScrollRef.current = false;
    });
  };

  const syncPanesToRatios = (ratios: MaterialPreviewScrollRatios) => {
    const safeRatios = {
      top: clampNumber(ratios.top, 0, 1),
      left: clampNumber(ratios.left, 0, 1),
    };
    lastSyncedScrollRatiosRef.current = safeRatios;
    mutateSyncedScroll(() => {
      setPaneScrollToRatios(originalPaneRef.current, safeRatios);
      setPaneScrollToRatios(recognizedPaneRef.current, safeRatios);
    });
  };

  const syncOriginalScrollToRecognized = () => {
    if (!syncScroll || syncingScrollRef.current) return;
    const ratios = readPaneScrollRatios(originalPaneRef.current);
    if (ratios) syncPanesToRatios(ratios);
  };

  const syncRecognizedScrollToOriginal = () => {
    if (!syncScroll || syncingScrollRef.current) return;
    const ratios = readPaneScrollRatios(recognizedPaneRef.current);
    if (ratios) syncPanesToRatios(ratios);
  };

  const readThumbnailRailScrollRatio = (rail: HTMLDivElement | null) => {
    if (!rail) return null;
    const verticalRange = rail.scrollHeight - rail.clientHeight;
    return verticalRange > 0 ? clampNumber(rail.scrollTop / verticalRange, 0, 1) : 0;
  };

  const setThumbnailRailScrollRatio = (rail: HTMLDivElement | null, ratio: number) => {
    if (!rail) return;
    const verticalRange = rail.scrollHeight - rail.clientHeight;
    rail.scrollTop = verticalRange > 0 ? verticalRange * clampNumber(ratio, 0, 1) : 0;
  };

  const mutateThumbnailRailScroll = (mutation: () => void) => {
    syncingThumbnailRailRef.current = true;
    mutation();
    window.requestAnimationFrame(() => {
      syncingThumbnailRailRef.current = false;
    });
  };

  const syncThumbnailRailsToRatio = (ratio: number) => {
    mutateThumbnailRailScroll(() => {
      setThumbnailRailScrollRatio(originalThumbnailRailRef.current, ratio);
      setThumbnailRailScrollRatio(recognizedThumbnailRailRef.current, ratio);
    });
  };

  const syncOriginalThumbnailRailToRecognized = () => {
    if (syncingThumbnailRailRef.current) return;
    const ratio = readThumbnailRailScrollRatio(originalThumbnailRailRef.current);
    if (ratio !== null) syncThumbnailRailsToRatio(ratio);
  };

  const syncRecognizedThumbnailRailToOriginal = () => {
    if (syncingThumbnailRailRef.current) return;
    const ratio = readThumbnailRailScrollRatio(recognizedThumbnailRailRef.current);
    if (ratio !== null) syncThumbnailRailsToRatio(ratio);
  };

  const scrollThumbnailRailsToPage = (page: number) => {
    mutateThumbnailRailScroll(() => {
      scrollMaterialPreviewRailPageIntoView(originalThumbnailRailRef.current, page);
      scrollMaterialPreviewRailPageIntoView(recognizedThumbnailRailRef.current, page);
    });
  };

  const updateZoom = (delta: number) => {
    pendingSyncedScrollRatiosRef.current = syncScroll ? lastSyncedScrollRatiosRef.current : readCurrentPreviewScrollRatios();
    setZoomPercent((current) => clampNumber(current + delta, 60, 220));
  };

  const resetZoom = () => {
    pendingSyncedScrollRatiosRef.current = syncScroll ? lastSyncedScrollRatiosRef.current : readCurrentPreviewScrollRatios();
    setZoomPercent(100);
  };

  const rememberPreviewTransformAnchor = () => {
    pendingSyncedScrollRatiosRef.current = syncScroll ? lastSyncedScrollRatiosRef.current : readCurrentPreviewScrollRatios();
  };

  const setPreviewPageRotation = (
    setter: Dispatch<SetStateAction<MaterialPreviewRotationMap>>,
    page: number,
    rotation: number,
  ) => {
    const nextRotation = normalizeMaterialPreviewRotation(rotation);
    setter((current) => {
      const next = { ...current };
      if (nextRotation === 0) {
        delete next[page];
      } else {
        next[page] = nextRotation;
      }
      return next;
    });
  };

  const rotateOriginalPage = () => {
    rememberPreviewTransformAnchor();
    setPreviewPageRotation(setOriginalRotationsByPage, currentPage, originalRotation + 90);
  };

  const rotateRecognizedPage = () => {
    rememberPreviewTransformAnchor();
    setPreviewPageRotation(setRecognizedRotationsByPage, currentPage, recognizedRotation + 90);
  };

  const updateRecognizedOcrMode = (mode: MaterialPreviewOcrMode) => {
    rememberPreviewTransformAnchor();
    setRecognizedOcrMode(mode);
  };

  const regenerateCurrentPageLayoutCache = async () => {
    if (!preview.recognizedHtmlHref || layoutCacheState === "generating") return;
    rememberPreviewTransformAnchor();
    setLayoutCacheState("generating");
    setLayoutCacheError("");

    try {
      const result = await previewApiClient.generateMaterialPreviewLayoutCache({
        recognizedHtmlHref: preview.recognizedHtmlHref,
        page: currentPage,
      });
      setLayoutCacheRecord({ href: result.href, cache: result.cache });
      setLayoutCacheState("ready");
      pendingSyncedScrollRatiosRef.current = lastSyncedScrollRatiosRef.current;
    } catch (error) {
      setLayoutCacheError(error instanceof Error ? error.message : "本页高保真排版生成失败");
      setLayoutCacheState("error");
    }
  };

  const regenerateDocumentLayoutCache = async () => {
    if (!preview.recognizedHtmlHref || layoutCacheBatchState === "generating") return;
    rememberPreviewTransformAnchor();
    setLayoutCacheBatchState("generating");
    setLayoutCacheBatchError("");

    try {
      const result = await previewApiClient.generateMaterialPreviewLayoutCacheBatch({
        recognizedHtmlHref: preview.recognizedHtmlHref,
        pageCount,
      });
      setLayoutCacheBatchCount(result.generatedCount);
      setLayoutCacheBatchState("ready");

      const currentCacheHref = createMaterialPreviewLayoutCacheHref(preview.recognizedHtmlHref, currentPage);
      if (currentCacheHref) {
        const response = await fetchInSession(fetch,currentCacheHref, { cache: "no-store" });
        if (response.ok) {
          const cache = (await response.json()) as ApiMaterialPreviewLayoutCache;
          setLayoutCacheRecord({ href: currentCacheHref, cache });
          setLayoutCacheState("ready");
          setLayoutCacheError("");
        }
      }
      pendingSyncedScrollRatiosRef.current = lastSyncedScrollRatiosRef.current;
    } catch (error) {
      setLayoutCacheBatchError(error instanceof Error ? error.message : "全文高保真排版生成失败");
      setLayoutCacheBatchState("error");
    }
  };

  useEffect(() => {
    if (!syncScroll) {
      pendingSyncedScrollRatiosRef.current = null;
      return undefined;
    }
    const pendingRatios = pendingSyncedScrollRatiosRef.current ?? lastSyncedScrollRatiosRef.current;
    pendingSyncedScrollRatiosRef.current = null;
    let frameId = 0;
    let secondFrameId = 0;
    let timeoutId = 0;
    const syncAfterLayout = () => syncPanesToRatios(pendingRatios);
    frameId = window.requestAnimationFrame(() => {
      secondFrameId = window.requestAnimationFrame(() => {
        syncAfterLayout();
        timeoutId = window.setTimeout(syncAfterLayout, 120);
      });
    });
    return () => {
      window.cancelAnimationFrame(frameId);
      window.cancelAnimationFrame(secondFrameId);
      window.clearTimeout(timeoutId);
    };
  }, [currentPage, layoutCacheRecord?.href, originalRotation, pageDisplaySize.height, pageDisplaySize.width, recognizedOcrMode, recognizedRotation, syncScroll, zoomPercent]);

  const startSyncedPreviewPan = (source: MaterialPreviewPaneKind, event: ReactPointerEvent<HTMLDivElement>) => {
    if (!syncScroll || event.button !== 0) return;
    const original = originalPaneRef.current;
    const recognized = recognizedPaneRef.current;
    if (!original || !recognized) return;

    dragPanRef.current = {
      source,
      startX: event.clientX,
      startY: event.clientY,
      originalStartLeft: original.scrollLeft,
      originalStartTop: original.scrollTop,
      recognizedStartLeft: recognized.scrollLeft,
      recognizedStartTop: recognized.scrollTop,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const moveSyncedPreviewPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragPanRef.current;
    const original = originalPaneRef.current;
    const recognized = recognizedPaneRef.current;
    if (!dragState || !original || !recognized) return;

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    mutateSyncedScroll(() => {
      if (dragState.source === "original") {
        original.scrollLeft = dragState.originalStartLeft - deltaX;
        original.scrollTop = dragState.originalStartTop - deltaY;
        const ratios = readPaneScrollRatios(original);
        if (ratios) {
          lastSyncedScrollRatiosRef.current = ratios;
          setPaneScrollToRatios(recognized, ratios);
        }
      } else {
        recognized.scrollLeft = dragState.recognizedStartLeft - deltaX;
        recognized.scrollTop = dragState.recognizedStartTop - deltaY;
        const ratios = readPaneScrollRatios(recognized);
        if (ratios) {
          lastSyncedScrollRatiosRef.current = ratios;
          setPaneScrollToRatios(original, ratios);
        }
      }
    });
    event.preventDefault();
  };

  const endSyncedPreviewPan = () => {
    dragPanRef.current = null;
  };

  const goToPageNumber = (page: number, focusHighlight = false) => {
    const nextPage = clampNumber(page, 1, pageCount);
    lastSyncedScrollRatiosRef.current = { top: 0, left: 0 };
    pendingSyncedScrollRatiosRef.current = { top: 0, left: 0 };
    setCurrentPage(nextPage);
    window.requestAnimationFrame(() => {
      scrollThumbnailRailsToPage(nextPage);
      mutateSyncedScroll(() => {
        setPaneScrollToRatios(originalPaneRef.current, { top: 0, left: 0 });
        setPaneScrollToRatios(recognizedPaneRef.current, { top: 0, left: 0 });
        if (focusHighlight && scrollRecognizedHighlightIntoView(nextPage)) {
          const ratios = readPaneScrollRatios(recognizedPaneRef.current);
          if (ratios) {
            lastSyncedScrollRatiosRef.current = ratios;
            setPaneScrollToRatios(originalPaneRef.current, ratios);
          }
        }
      });
    });
  };

  const goToPage = (delta: number) => {
    goToPageNumber(currentPage + delta);
  };

  useEffect(() => {
    if (!hasRecognizedPreview) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreMaterialPreviewPageKeydown(event)) return;
      if (event.key === "ArrowUp") {
        event.preventDefault();
        goToPageNumber(currentPage - 1, true);
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        goToPageNumber(currentPage + 1, true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentPage, hasRecognizedPreview, pageCount]);

  useEffect(() => {
    if (loadState !== "ready" || highlightTerms.length === 0) return;
    window.requestAnimationFrame(() => {
      mutateSyncedScroll(() => {
        lastSyncedScrollRatiosRef.current = { top: 0, left: 0 };
        setPaneScrollToRatios(originalPaneRef.current, { top: 0, left: 0 });
        setPaneScrollToRatios(recognizedPaneRef.current, { top: 0, left: 0 });
        if (scrollRecognizedHighlightIntoView(currentPage)) {
          const ratios = readPaneScrollRatios(recognizedPaneRef.current);
          if (ratios) {
            lastSyncedScrollRatiosRef.current = ratios;
            setPaneScrollToRatios(originalPaneRef.current, ratios);
          }
        }
      });
    });
  }, [currentPage, highlightTerms.length, highlightTermsKey, loadState, remoteContent]);

  useEffect(() => {
    if (!hasPageThumbnails) return undefined;
    const frameId = window.requestAnimationFrame(() => scrollThumbnailRailsToPage(currentPage));
    return () => window.cancelAnimationFrame(frameId);
  }, [currentPage, hasPageThumbnails, loadState, remoteContent]);

  const metadataRows: Array<[string, string]> = [
    ["资料类型", preview.type],
    ["数据来源", preview.dataOrigin === "seed_demo" ? "模拟业务数据" : preview.source],
    ["上传人", preview.uploader],
    ["上传时间", preview.time],
    ["状态", preview.status],
    ["关联对象", preview.project],
    ["基金", preview.fund],
    ["归档路径", preview.path],
    ["规则说明", preview.rule],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  const recognizedPaneSubtitle = createRecognizedPreviewSubtitle({
    recognizedHref,
    recognizedKind,
    recognizedOcrMode,
    layoutCacheState,
    layoutCacheRecord,
  });
  const previewGridColumns = hasPageThumbnails
    ? hasRecognizedPreview
      ? "xl:grid-cols-[88px_minmax(0,1fr)_minmax(0,1fr)_88px]"
      : "xl:grid-cols-[88px_minmax(0,1fr)]"
    : hasRecognizedPreview
      ? "xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
      : "xl:grid-cols-[minmax(0,1fr)]";

  return (
    <main className="flex h-screen overflow-hidden bg-[#11161d] text-[#eaecef]">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <MaterialCompareToolbar
          preview={preview}
          downloadHref={downloadHref}
          currentPage={currentPage}
          pageCount={pageCount}
          zoomPercent={zoomPercent}
          recognizedOcrMode={recognizedOcrMode}
          layoutCacheState={layoutCacheState}
          layoutCacheError={layoutCacheError}
          layoutCacheBatchState={layoutCacheBatchState}
          layoutCacheBatchError={layoutCacheBatchError}
          layoutCacheBatchCount={layoutCacheBatchCount}
          hasRecognizedPreview={hasRecognizedPreview}
          hasRecognizedHtml={recognizedKind === "recognized_html" && Boolean(preview.recognizedHtmlHref)}
          syncScroll={syncScroll}
          highlightTerms={highlightTerms}
          setSyncScroll={setSyncScroll}
          onPreviousPage={() => goToPage(-1)}
          onNextPage={() => goToPage(1)}
          onZoomOut={() => updateZoom(-20)}
          onZoomIn={() => updateZoom(20)}
          onResetZoom={resetZoom}
          onRegenerateCurrentPageLayoutCache={regenerateCurrentPageLayoutCache}
          onRegenerateDocumentLayoutCache={regenerateDocumentLayoutCache}
        />

        <section className={`grid min-h-0 flex-1 gap-2 p-2 ${previewGridColumns}`}>
          {hasPageThumbnails ? (
            <MaterialPreviewThumbnailRail
              pageImageDir={preview.pageImageDir}
              pageCount={pageCount}
              currentPage={currentPage}
              scrollRef={originalThumbnailRailRef}
              onRailScroll={syncOriginalThumbnailRailToRecognized}
              onPageSelect={(page) => goToPageNumber(page, hasRecognizedPreview)}
            />
          ) : null}

          <MaterialComparePane
            title={hasRecognizedPreview ? "左原文" : "原文预览"}
            subtitle={originalImageHref ? `第 ${currentPage} / ${pageCount} 页` : "无页图"}
            titleActions={
              <MaterialPaneHeaderButton
                icon={<RotateCw size={13} />}
                label={`原文旋转 ${originalRotation}°`}
                onClick={rotateOriginalPage}
              />
            }
            scrollRef={originalPaneRef}
            onScroll={hasRecognizedPreview ? syncOriginalScrollToRecognized : noopMaterialPreviewScroll}
            onPointerDown={hasRecognizedPreview ? (event) => startSyncedPreviewPan("original", event) : undefined}
            onPointerMove={hasRecognizedPreview ? moveSyncedPreviewPan : undefined}
            onPointerUp={hasRecognizedPreview ? endSyncedPreviewPan : undefined}
            onPointerCancel={hasRecognizedPreview ? endSyncedPreviewPan : undefined}
          >
            {originalImageHref ? (
              <div
                className="material-preview-page-stage relative mx-auto overflow-visible transition-[height,width] duration-150"
                style={createRotatedMaterialPreviewStageStyle(pageDisplaySize)}
              >
                <div style={createRotatedMaterialPreviewFrameStyle(originalFrameSize, originalRotation)}>
                  <img
                    src={originalImageHref}
                    alt={`${preview.name} 原始页图预览`}
                    className="h-full w-full max-w-none rounded bg-white object-contain shadow-lg"
                    onLoad={(event) => {
                      const image = event.currentTarget;
                      if (!image.naturalWidth || !image.naturalHeight) return;
                      setOriginalPageSizesByHref((current) => {
                        if (current[originalImageHref]) return current;
                        return {
                          ...current,
                          [originalImageHref]: {
                            width: image.naturalWidth,
                            height: image.naturalHeight,
                          },
                        };
                      });
                    }}
                  />
                </div>
              </div>
            ) : (
              <MaterialPreviewEmptyState
                title={sourceHref ? "当前资源不是页图" : "暂无原始页图"}
                detail={sourceHref ? "可下载原始文件，或等待系统生成页图后在线预览。" : "该资料当前只有系统元数据，尚未绑定原始文件或页图。"}
              />
            )}
          </MaterialComparePane>

          {hasRecognizedPreview ? (
            <>
              <MaterialComparePane
                title="右识别"
                subtitle={recognizedPaneSubtitle}
                titleActions={
                  <MaterialPaneHeaderButton
                    icon={<RotateCw size={13} />}
                    label={`识别旋转 ${recognizedRotation}°`}
                    onClick={rotateRecognizedPage}
                  />
                }
                actions={
                  <MaterialPreviewOcrModeSelect
                    currentMode={recognizedOcrMode}
                    onSelect={updateRecognizedOcrMode}
                  />
                }
                scrollRef={recognizedPaneRef}
                onScroll={syncRecognizedScrollToOriginal}
                onPointerDown={(event) => startSyncedPreviewPan("recognized", event)}
                onPointerMove={moveSyncedPreviewPan}
                onPointerUp={endSyncedPreviewPan}
                onPointerCancel={endSyncedPreviewPan}
              >
                {recognizedHref ? (
                  <div>
                    <RemoteMaterialPreviewContent
                      kind={recognizedKind}
                      content={remoteContent}
                      loadState={loadState}
                      highlightTerms={highlightTerms}
                      currentPage={currentPage}
                      rotationDegrees={recognizedRotation}
                      ocrMode={recognizedOcrMode}
                      layoutCache={recognizedOcrMode === "faithful" ? layoutCacheRecord?.cache : undefined}
                      pageBox={pageDisplaySize}
                    />
                  </div>
                ) : (
                  <MaterialPreviewEmptyState
                    title="暂无识别结果"
                    detail="该资料还没有可展示的 识别正文。"
                  />
                )}
              </MaterialComparePane>
              {hasPageThumbnails ? (
                <MaterialRecognizedThumbnailRail
                  kind={recognizedKind}
                  content={remoteContent}
                  loadState={loadState}
                  pageCount={pageCount}
                  currentPage={currentPage}
                  scrollRef={recognizedThumbnailRailRef}
                  onRailScroll={syncRecognizedThumbnailRailToOriginal}
                  onPageSelect={(page) => goToPageNumber(page, true)}
                />
              ) : null}
            </>
          ) : null}
        </section>

        <MaterialCompareMetaBar
          rows={metadataRows}
          sourceHref={sourceHref}
          downloadHref={preview.downloadHref}
          expanded={showMetadata}
          onExpandedChange={setShowMetadata}
        />
      </div>
    </main>
  );
}

function MaterialCompareToolbar({
  preview,
  downloadHref,
  currentPage,
  pageCount,
  zoomPercent,
  recognizedOcrMode,
  layoutCacheState,
  layoutCacheError,
  layoutCacheBatchState,
  layoutCacheBatchError,
  layoutCacheBatchCount,
  hasRecognizedPreview,
  hasRecognizedHtml,
  syncScroll,
  highlightTerms,
  setSyncScroll,
  onPreviousPage,
  onNextPage,
  onZoomOut,
  onZoomIn,
  onResetZoom,
  onRegenerateCurrentPageLayoutCache,
  onRegenerateDocumentLayoutCache,
}: {
  preview: MaterialPreviewQuery;
  downloadHref: string;
  currentPage: number;
  pageCount: number;
  zoomPercent: number;
  recognizedOcrMode: MaterialPreviewOcrMode;
  layoutCacheState: MaterialPreviewLayoutCacheState;
  layoutCacheError: string;
  layoutCacheBatchState: MaterialPreviewLayoutCacheBatchState;
  layoutCacheBatchError: string;
  layoutCacheBatchCount: number;
  hasRecognizedPreview: boolean;
  hasRecognizedHtml: boolean;
  syncScroll: boolean;
  highlightTerms: string[];
  setSyncScroll: (value: boolean) => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onResetZoom: () => void;
  onRegenerateCurrentPageLayoutCache: () => void;
  onRegenerateDocumentLayoutCache: () => void;
}) {
  const isFaithfulOcrMode = hasRecognizedPreview && recognizedOcrMode === "faithful";
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreMenu = useRef<HTMLDivElement>(null);
  useMenuDismiss(moreMenu, () => setIsMoreOpen(false), isMoreOpen);

  return (
    <header className="shrink-0 border-b border-[#2b3139] bg-[#1e2329] px-2 py-1.5">
      <div className="flex min-w-0 flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex min-w-0 flex-col">
            <h1 className="min-w-0 truncate text-base font-semibold leading-6 text-[#eaecef]">{preview.name}</h1>
            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5">
            <Badge tone={preview.dataOrigin === "seed_demo" ? "orange" : "green"}>
              {preview.dataOrigin === "seed_demo" ? "模拟业务数据" : "资料库文件"}
            </Badge>
            {highlightTerms.length > 0 ? <Badge tone="gold">命中高亮 {highlightTerms.length}</Badge> : null}
            {preview.status ? <Badge tone="slate">{preview.status}</Badge> : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 xl:flex-nowrap">
          <div className="inline-flex h-8 items-center overflow-hidden rounded-md border border-[#2b3139] bg-[#11161d]">
            <button
              type="button"
              onClick={onPreviousPage}
              disabled={currentPage <= 1}
              className="h-8 px-2 text-xs font-semibold text-[#eaecef] hover:text-gold disabled:cursor-not-allowed disabled:text-[#58606c]"
              title="上一页"
            >
              上页
            </button>
            <span className="border-x border-[#2b3139] px-2 text-xs font-semibold text-[#929aa5]">
              {currentPage}/{pageCount}
            </span>
            <button
              type="button"
              onClick={onNextPage}
              disabled={currentPage >= pageCount}
              className="h-8 px-2 text-xs font-semibold text-[#eaecef] hover:text-gold disabled:cursor-not-allowed disabled:text-[#58606c]"
              title="下一页"
            >
              下页
            </button>
          </div>

          {hasRecognizedPreview ? (
              <button data-ui={syncScroll?'primary':'secondary'}
                type="button"
                onClick={() => setSyncScroll(!syncScroll)}
                aria-pressed={syncScroll}
                className={`inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs font-semibold ${
                  syncScroll
                    ? "border-gold bg-gold text-[#181a20]"
                    : "border-[#2b3139] bg-[#11161d] text-[#eaecef] hover:border-gold hover:text-gold"
                }`}
                title="同步滚动"
              >
                <Columns2 size={14} />
                同步
              </button>
          ) : null}

          <div className="inline-flex h-8 items-center overflow-hidden rounded-md border border-[#2b3139] bg-[#11161d]">
            <button type="button" onClick={onZoomOut} className="h-8 px-2 text-[#eaecef] hover:text-gold" aria-label="缩小" title="缩小">
              <ZoomOut size={15} />
            </button>
            <span className="w-14 border-x border-[#2b3139] text-center text-xs font-semibold text-[#929aa5]">{zoomPercent}%</span>
            <button type="button" onClick={onZoomIn} className="h-8 px-2 text-[#eaecef] hover:text-gold" aria-label="放大" title="放大">
              <ZoomIn size={15} />
            </button>
            <button data-ui="secondary" type="button" onClick={onResetZoom} className="h-8 border-l border-[#2b3139] px-2 text-[#eaecef] hover:text-gold" aria-label="重置缩放" title="重置缩放">
              <RotateCcw size={14} />
            </button>
          </div>

          {isFaithfulOcrMode ? (
            <div ref={moreMenu} className="relative">
              <button data-ui="secondary"
                type="button"
                onClick={() => setIsMoreOpen((open) => !open)}
                aria-expanded={isMoreOpen}
                aria-label="更多预览工具"
                className="inline-flex h-8 items-center justify-center rounded-md border border-[#2b3139] bg-[#11161d] px-2 text-[#eaecef] hover:border-gold hover:text-gold"
                title="更多预览工具"
              >
                <MoreHorizontal size={15} />
              </button>
              {isMoreOpen ? (
                <div className="absolute right-0 top-9 z-30 w-56 overflow-hidden rounded-lg border border-[#2b3139] bg-[#1e2329] p-1.5 shadow-2xl">
                  <MaterialPreviewMenuButton
                    icon={<FileCheck2 size={14} />}
                    label={layoutCacheState === "generating" ? "本页生成中" : "重排本页"}
                    disabled={!hasRecognizedHtml || layoutCacheState === "generating"}
                    title={createMaterialPreviewLayoutCacheActionTitle(layoutCacheState, layoutCacheError)}
                    onClick={() => {
                      onRegenerateCurrentPageLayoutCache();
                      setIsMoreOpen(false);
                    }}
                  />
                  <MaterialPreviewMenuButton
                    icon={<Database size={14} />}
                    label={layoutCacheBatchState === "generating" ? "全文生成中" : "重排全文"}
                    disabled={!hasRecognizedHtml || layoutCacheBatchState === "generating"}
                    title={createMaterialPreviewLayoutCacheBatchActionTitle(
                      layoutCacheBatchState,
                      layoutCacheBatchError,
                      layoutCacheBatchCount,
                    )}
                    onClick={() => {
                      onRegenerateDocumentLayoutCache();
                      setIsMoreOpen(false);
                    }}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          <a data-ui="secondary"
            href="/materials"
            className="inline-flex h-8 items-center justify-center rounded-md border border-[#2b3139] bg-[#11161d] px-2 text-xs font-semibold text-[#eaecef] hover:border-gold hover:text-gold"
            title="返回资料库"
          >
            返回
          </a>
          {downloadHref ? (
            <a data-ui="info"
              href={downloadHref}
              download
              className="inline-flex h-8 items-center justify-center gap-1 rounded-md bg-gold px-2 text-xs font-semibold text-[#181a20] hover:bg-[#f0b90b]"
              title={createPreviewDownloadLabel(preview.kind, Boolean(preview.downloadHref))}
            >
              <Download size={15} />
              下载原件
            </a>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function MaterialPreviewMenuButton({
  icon,
  label,
  compact = false,
  disabled = false,
  title,
  onClick,
}: {
  icon?: ReactNode;
  label: string;
  compact?: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button data-ui="secondary"
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className={`flex h-8 w-full items-center rounded-md text-xs font-semibold ${
        compact ? "justify-center gap-1 px-1" : "justify-start gap-2 px-2"
      } ${
        disabled
          ? "cursor-not-allowed text-[#58606c]"
          : "text-[#eaecef] hover:bg-[#11161d] hover:text-gold"
      }`}
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      {label}
    </button>
  );
}

function MaterialPaneHeaderButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button data-ui="secondary"
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#2b3139] bg-[#0b0f14] text-[#eaecef] hover:border-gold hover:text-gold"
    >
      {icon}
    </button>
  );
}

function MaterialPreviewOcrModeSelect({
  currentMode,
  onSelect,
}: {
  currentMode: MaterialPreviewOcrMode;
  onSelect: (mode: MaterialPreviewOcrMode) => void;
}) {
  return (
    <label className="relative inline-flex h-7 shrink-0 items-center">
      <span className="sr-only">正文预览模式</span>
      <select
        value={currentMode}
        onChange={(event) => onSelect(event.target.value as MaterialPreviewOcrMode)}
        className="h-7 appearance-none rounded-md border border-[#2b3139] bg-[#0b0f14] pl-2.5 pr-7 text-xs font-semibold text-[#eaecef] outline-none hover:border-gold focus:border-gold"
        title="正文预览模式"
      >
        <option value="reading">阅读版</option>
        <option value="raw">原始识别结果</option>
        <option value="faithful">表格高保真</option>
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 text-[#929aa5]" size={13} />
    </label>
  );
}

function MaterialPreviewThumbnailRail({
  pageImageDir,
  pageCount,
  currentPage,
  scrollRef,
  onRailScroll,
  onPageSelect,
}: {
  pageImageDir: string;
  pageCount: number;
  currentPage: number;
  scrollRef: RefObject<HTMLDivElement>;
  onRailScroll: () => void;
  onPageSelect: (page: number) => void;
}) {
  return (
    <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-[#2b3139] bg-[#1e2329]">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-[#2b3139] bg-[#11161d] px-2">
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#eaecef]">
          <Image size={13} />
          页
        </span>
        <span className="text-xs font-semibold text-[#707a8a]">{pageCount}</span>
      </div>
      <div ref={scrollRef} onScroll={onRailScroll} className="min-h-0 flex-1 overflow-auto p-2" data-preview-rail="original">
        <div className="grid gap-2">
          {Array.from({ length: pageCount }, (_, index) => {
            const page = index + 1;
            const active = page === currentPage;
            return (
              <button
                key={page}
                type="button"
                onClick={() => onPageSelect(page)}
                aria-current={active ? "page" : undefined}
                data-page={page}
                className={`group overflow-hidden rounded-md border bg-[#0b0f14] text-left transition ${
                  active ? "border-gold ring-1 ring-gold/50" : "border-[#2b3139] hover:border-gold/70"
                }`}
                title={`跳转第 ${page} 页`}
              >
                <div className="aspect-[3/4] overflow-hidden bg-white">
                  <img
                    src={createPageImageHref(pageImageDir, page)}
                    alt={`第 ${page} 页缩略图`}
                    loading="lazy"
                    className="h-full w-full object-cover object-top"
                  />
                </div>
                <div className={`px-2 py-1 text-center text-xs font-semibold ${active ? "text-gold" : "text-[#929aa5] group-hover:text-gold"}`}>
                  {page}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function MaterialRecognizedThumbnailRail({
  kind,
  content,
  loadState,
  pageCount,
  currentPage,
  scrollRef,
  onRailScroll,
  onPageSelect,
}: {
  kind: string;
  content: string;
  loadState: MaterialPreviewLoadState;
  pageCount: number;
  currentPage: number;
  scrollRef: RefObject<HTMLDivElement>;
  onRailScroll: () => void;
  onPageSelect: (page: number) => void;
}) {
  const htmlThumbnails = useMemo(
    () => createMaterialRecognizedHtmlThumbnails(kind, content, pageCount),
    [content, kind, pageCount],
  );
  const textThumbnails = useMemo(
    () => (kind === "recognized_text" ? createMaterialRecognizedTextThumbnails(content, pageCount) : []),
    [content, kind, pageCount],
  );

  return (
    <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-[#2b3139] bg-[#1e2329]">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-[#2b3139] bg-[#11161d] px-2">
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#eaecef]">
          <FileText size={13} />
          识别页
        </span>
        <span className="text-xs font-semibold text-[#707a8a]">{pageCount}</span>
      </div>
      <div ref={scrollRef} onScroll={onRailScroll} className="min-h-0 flex-1 overflow-auto p-2" data-preview-rail="recognized">
        <div className="grid gap-2">
          {Array.from({ length: pageCount }, (_, index) => {
            const page = index + 1;
            const active = page === currentPage;
            const htmlThumbnail = htmlThumbnails.find((thumbnail) => thumbnail.page === page);
            const textThumbnail = textThumbnails.find((thumbnail) => thumbnail.page === page);
            return (
              <button
                key={page}
                type="button"
                onClick={() => onPageSelect(page)}
                aria-current={active ? "page" : undefined}
                data-page={page}
                className={`group overflow-hidden rounded-md border bg-[#0b0f14] text-left transition ${
                  active ? "border-gold ring-1 ring-gold/50" : "border-[#2b3139] hover:border-gold/70"
                }`}
                title={`跳转第 ${page} 页识别结果`}
              >
                <div className="aspect-[3/4] overflow-hidden bg-white">
                  {htmlThumbnail ? (
                    <MaterialRecognizedHtmlThumbnail thumbnail={htmlThumbnail} />
                  ) : textThumbnail ? (
                    <div className="h-full w-full overflow-hidden bg-white p-1 text-[5px] leading-tight text-[#111713]">
                      {textThumbnail.text}
                    </div>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[#f4f6f8] text-[10px] font-semibold text-[#707a8a]">
                      {loadState === "loading" ? "..." : page}
                    </div>
                  )}
                </div>
                <div className={`px-2 py-1 text-center text-xs font-semibold ${active ? "text-gold" : "text-[#929aa5] group-hover:text-gold"}`}>
                  {page}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function MaterialRecognizedHtmlThumbnail({
  thumbnail,
}: {
  thumbnail: {
    html: string;
    pageSize: MaterialPreviewPageSize;
  };
}) {
  const scale = Math.min(
    MATERIAL_RECOGNIZED_THUMBNAIL_SIZE.width / thumbnail.pageSize.width,
    MATERIAL_RECOGNIZED_THUMBNAIL_SIZE.height / thumbnail.pageSize.height,
  );
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 0.08;

  return (
    <div className="h-full w-full overflow-hidden bg-white">
      <div
        className="material-recognized-thumbnail-origin text-[#111713]"
        style={{
          width: `${thumbnail.pageSize.width}px`,
          height: `${thumbnail.pageSize.height}px`,
          transform: `scale(${safeScale})`,
          transformOrigin: "top left",
        }}
      >
        <div
          className="material-recognized-html-preview max-w-none"
          dangerouslySetInnerHTML={{ __html: thumbnail.html }}
        />
      </div>
    </div>
  );
}

function MaterialComparePane({
  title,
  subtitle,
  titleActions,
  actions,
  scrollRef,
  onScroll,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  children,
}: {
  title: string;
  subtitle: string;
  titleActions?: ReactNode;
  actions?: ReactNode;
  scrollRef: RefObject<HTMLDivElement>;
  onScroll: () => void;
  onPointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  children: ReactNode;
}) {
  const panCursorClass = onPointerDown ? "cursor-grab active:cursor-grabbing" : "";

  return (
    <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-[#2b3139] bg-[#1e2329]">
      <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-[#2b3139] bg-[#11161d] px-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="shrink-0 text-sm font-semibold text-[#eaecef]">{title}</h2>
          {titleActions ? <div className="shrink-0">{titleActions}</div> : null}
          <span className="truncate text-xs font-semibold text-[#929aa5]">{subtitle}</span>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        className={`material-preview-sync-pane min-h-0 flex-1 overflow-auto bg-[#0b0f14] p-3 ${panCursorClass}`}
      >
        {children}
      </div>
    </section>
  );
}

function noopMaterialPreviewScroll() {}

function MaterialPreviewEmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center rounded-md border border-[#2b3139] bg-[#11161d] p-6 text-center">
      <FileText className="text-gold" size={36} />
      <h3 className="mt-3 text-base font-semibold text-[#eaecef]">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-[#929aa5]">{detail}</p>
    </div>
  );
}

function MaterialCompareMetaBar({
  rows,
  sourceHref,
  downloadHref,
  expanded,
  onExpandedChange,
}: {
  rows: string[][];
  sourceHref: string;
  downloadHref: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  return (
    <footer className="shrink-0 border-t border-[#2b3139] bg-[#1e2329] px-3 py-2">
      <button data-ui="secondary"
        type="button"
        onClick={() => onExpandedChange(!expanded)}
        data-expand-entry
        aria-expanded={expanded}
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[#2b3139] bg-[#11161d] px-2.5 text-xs font-semibold text-[#eaecef] hover:border-gold hover:text-gold"
      >
        资料信息
        <ChevronDown className={expanded ? "rotate-180 transition-transform" : "transition-transform"} size={13} />
      </button>
      {expanded ? (
        <div className="mt-2 flex gap-2 overflow-x-auto text-xs">
          {rows.map(([label, value]) => (
            <div key={label} className="flex shrink-0 items-center gap-2 rounded-md border border-[#2b3139] bg-[#11161d] px-2.5 py-1.5">
              <span className="font-semibold text-[#707a8a]">{label}</span>
              <span className="max-w-[280px] truncate text-[#eaecef]">{value}</span>
            </div>
          ))}

        </div>
      ) : null}
    </footer>
  );
}

function RemoteMaterialPreviewContent({
  kind,
  content,
  loadState,
  highlightTerms,
  currentPage,
  rotationDegrees,
  ocrMode,
  layoutCache,
  pageBox,
}: {
  kind: string;
  content: string;
  loadState: MaterialPreviewLoadState;
  highlightTerms: string[];
  currentPage: number;
  rotationDegrees: number;
  ocrMode: MaterialPreviewOcrMode;
  layoutCache?: ApiMaterialPreviewLayoutCache;
  pageBox?: MaterialPreviewPageSize;
}) {
  const recognizedHtmlContentRef = useRef<HTMLDivElement>(null);
  const useLayoutCache = ocrMode === "faithful";
  const layoutCacheHtml = useLayoutCache ? layoutCache?.render.html : undefined;
  const previewContent = layoutCacheHtml ?? content;
  const recognizedHtmlContentKey = `${kind}:${currentPage}:${previewContent.length}:${layoutCacheHtml ? layoutCache?.generatedAt : "raw"}:${ocrMode}`;
  const [recognizedHtmlContentMeasurement, setRecognizedHtmlContentMeasurement] = useState<{
    key: string;
    size: MaterialPreviewPageSize;
  } | null>(null);
  const recognizedHtmlContentSize =
    recognizedHtmlContentMeasurement?.key === recognizedHtmlContentKey ? recognizedHtmlContentMeasurement.size : null;

  useEffect(() => {
    if (kind !== "recognized_html" || !previewContent || loadState !== "ready") return;

    const element = recognizedHtmlContentRef.current;
    if (!element) return;

    let animationFrame = 0;
    const updateMeasuredSize = () => {
      const nextSize = measureMaterialPreviewRenderedPageSize(element);
      setRecognizedHtmlContentMeasurement((current) => {
        if (current?.key === recognizedHtmlContentKey && isSameMaterialPreviewPageSize(current.size, nextSize)) {
          return current;
        }
        return { key: recognizedHtmlContentKey, size: nextSize };
      });
    };

    animationFrame = window.requestAnimationFrame(updateMeasuredSize);
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            window.cancelAnimationFrame(animationFrame);
            animationFrame = window.requestAnimationFrame(updateMeasuredSize);
          });
    resizeObserver?.observe(element);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
    };
  }, [currentPage, kind, loadState, previewContent, recognizedHtmlContentKey]);

  if (loadState === "loading") {
    return (
      <div className="flex min-h-full items-center justify-center rounded-lg border border-[#2b3139] bg-[#11161d] text-sm font-semibold text-[#929aa5]">
        正在加载识别结果...
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="flex min-h-full flex-col items-center justify-center rounded-lg border border-[#3a1f28] bg-[#1e1116] p-6 text-center">
        <AlertTriangle className="text-[#f6465d]" size={34} />
        <p className="mt-3 text-sm font-semibold text-[#f8b4bf]">识别结果加载失败</p>
        <p className="mt-2 text-xs leading-5 text-[#929aa5]">请确认本地服务正在运行，且文档路径仍存在。</p>
      </div>
    );
  }

  if (kind === "recognized_html" && previewContent) {
    if (ocrMode === "reading") {
      return (
        <article
          className="material-preview-reading-page mx-auto min-h-full rounded bg-white p-8 text-[#111713] shadow-lg"
          style={pageBox ? { width: `${pageBox.width}px`, minHeight: `${pageBox.height}px` } : undefined}
        >
          <div
            ref={recognizedHtmlContentRef}
            data-layout-fidelity="reading"
            className="material-recognized-html-preview material-recognized-html-preview--reading max-w-none text-base leading-8"
            dangerouslySetInnerHTML={{ __html: sanitizeMaterialPreviewHtml(previewContent, highlightTerms, currentPage, ocrMode) }}
          />
        </article>
      );
    }

    const cachedPageBox = layoutCache?.page.pageBox
      ? { width: layoutCache.page.pageBox.width, height: layoutCache.page.pageBox.height }
      : undefined;
    const declaredOcrPageSize = cachedPageBox ?? readMaterialPreviewHtmlPageSize(previewContent, currentPage) ?? pageBox ?? MATERIAL_PREVIEW_DEFAULT_PAGE_SIZE;
    const recognizedPageKind = layoutCache?.page.kind ?? readMaterialPreviewHtmlPageKind(previewContent, currentPage);
    const preserveRecognizedPageBox = ocrMode === "raw" || recognizedPageKind === "text";
    const ocrPageSize = preserveRecognizedPageBox
      ? declaredOcrPageSize
      : expandMaterialPreviewPageSize(declaredOcrPageSize, recognizedHtmlContentSize);
    const normalizedRotation = normalizeMaterialPreviewRotation(rotationDegrees);
    const rotatedOcrPageSize = rotateMaterialPreviewPageSize(ocrPageSize, normalizedRotation);
    const displayPageSize = computeRecognizedHtmlDisplaySize(rotatedOcrPageSize, pageBox, preserveRecognizedPageBox);
    const scale = computeMaterialPreviewDisplayScale(rotatedOcrPageSize, displayPageSize);
    const ocrFrameSize = scaleMaterialPreviewPageSize(ocrPageSize, scale);

    return (
      <div
        className="material-preview-recognized-page-stage mx-auto overflow-visible rounded bg-white text-[#111713] shadow-lg relative"
        style={createRotatedMaterialPreviewStageStyle(displayPageSize)}
      >
        <div
          className="material-preview-recognized-page-rotation-frame"
          style={createRotatedMaterialPreviewFrameStyle(ocrFrameSize, normalizedRotation)}
        >
          <div
            ref={recognizedHtmlContentRef}
            className="material-preview-recognized-page-scale"
            style={{
              width: `${ocrPageSize.width}px`,
              height: `${ocrPageSize.height}px`,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            <div
              data-layout-fidelity={ocrMode === "faithful" ? "faithful" : "raw"}
              className={`material-recognized-html-preview max-w-none text-sm leading-6 ${
                ocrMode === "faithful" ? MATERIAL_RECOGNIZED_HTML_PREVIEW_FAITHFUL_CLASS : ""
              }`}
              dangerouslySetInnerHTML={{ __html: sanitizeMaterialPreviewHtml(previewContent, highlightTerms, currentPage, ocrMode) }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <pre
      className="mx-auto min-h-full whitespace-pre-wrap break-words rounded-lg border border-[#2b3139] bg-[#0b0f14] p-4 text-sm leading-6 text-[#eaecef]"
      style={pageBox ? { width: `${pageBox.width}px`, minHeight: `${pageBox.height}px` } : undefined}
    >
      {content ? <HighlightedPlainText content={content} highlightTerms={highlightTerms} /> : "暂无可显示内容。"}
    </pre>
  );
}

function computeRecognizedHtmlDisplaySize(
  ocrPageSize: MaterialPreviewPageSize,
  pageBox?: MaterialPreviewPageSize,
  preserveRecognizedPageBox = false,
): MaterialPreviewPageSize {
  if (!pageBox) return ocrPageSize;
  if (preserveRecognizedPageBox) return pageBox;

  const allowHeightOverflowForCompleteness = true;
  const fitScale = allowHeightOverflowForCompleteness
    ? pageBox.width / ocrPageSize.width
    : Math.min(pageBox.width / ocrPageSize.width, pageBox.height / ocrPageSize.height);
  const safeScale = Number.isFinite(fitScale) && fitScale > 0 ? fitScale : 1;
  return {
    width: Math.max(1, Math.round(ocrPageSize.width * safeScale)),
    height: Math.max(1, Math.round(ocrPageSize.height * safeScale)),
  };
}

function expandMaterialPreviewPageSize(
  declaredSize: MaterialPreviewPageSize,
  renderedSize: MaterialPreviewPageSize | null,
): MaterialPreviewPageSize {
  if (!renderedSize) return declaredSize;
  return {
    width: Math.max(declaredSize.width, renderedSize.width),
    height: Math.max(declaredSize.height, renderedSize.height),
  };
}

function measureMaterialPreviewRenderedPageSize(element: HTMLElement): MaterialPreviewPageSize {
  const candidates = [
    element,
    ...Array.from(
      element.querySelectorAll<HTMLElement>(
        ".material-recognized-html-preview, .ocr-document-page, .ocr-srcdoc-page, .page, .content-flow-center, .crop-page, table",
      ),
    ),
  ];

  const width = Math.max(
    1,
    ...candidates.map((candidate) => Math.ceil(Math.max(candidate.scrollWidth, candidate.offsetWidth))),
  );
  const height = Math.max(
    1,
    ...candidates.map((candidate) => Math.ceil(Math.max(candidate.scrollHeight, candidate.offsetHeight))),
  );

  return { width, height };
}

function isSameMaterialPreviewPageSize(
  first: MaterialPreviewPageSize | null | undefined,
  second: MaterialPreviewPageSize,
) {
  return Boolean(first && first.width === second.width && first.height === second.height);
}

function HighlightedPlainText({ content, highlightTerms }: { content: string; highlightTerms: string[] }) {
  const highlightRegex = createMaterialHighlightRegex(highlightTerms);
  if (!highlightRegex) return <>{content}</>;

  const parts: ReactNode[] = [];
  let lastIndex = 0;
  for (const match of content.matchAll(highlightRegex)) {
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push(content.slice(lastIndex, index));
    parts.push(
      <mark key={`${index}-${match[0]}`} className="material-preview-highlight">
        {match[0]}
      </mark>,
    );
    lastIndex = index + match[0].length;
  }
  if (lastIndex < content.length) parts.push(content.slice(lastIndex));
  return <>{parts}</>;
}

function readMaterialPreviewQuery() {
  const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  return {
    kind: params.get("kind") ?? "metadata_preview",
    label: params.get("label") ?? "查看资料卡片",
    sourceHref: params.get("sourceHref") ?? "",
    downloadHref: params.get("downloadHref") ?? "",
    recognizedHtmlHref: params.get("recognizedHtmlHref") ?? "",
    recognizedTextHref: params.get("recognizedTextHref") ?? "",
    pageImageDir: params.get("pageImageDir") ?? "",
    pageCount: params.get("pageCount") ?? "1",
    page: params.get("page") ?? "1",
    highlightTerms: params.getAll("highlight"),
    name: params.get("name") ?? "资料",
    type: params.get("type") ?? "",
    uploader: params.get("uploader") ?? "",
    time: params.get("time") ?? "",
    source: params.get("source") ?? "",
    status: params.get("status") ?? "",
    project: params.get("project") ?? "",
    fund: params.get("fund") ?? "",
    path: params.get("path") ?? "",
    rule: params.get("rule") ?? "",
    dataOrigin: params.get("dataOrigin") ?? "",
  };
}

function createMaterialRecognizedHtmlThumbnails(kind: string, content: string, pageCount: number) {
  if (kind !== "recognized_html" || !content) return [];
  return Array.from({ length: Math.max(1, pageCount) }, (_, index) => {
    const page = index + 1;
    return {
      page,
      html: sanitizeMaterialPreviewHtml(content, [], page, "raw"),
      pageSize: readMaterialPreviewHtmlPageSize(content, page) ?? MATERIAL_PREVIEW_DEFAULT_PAGE_SIZE,
    };
  });
}

function createMaterialRecognizedTextThumbnails(content: string, pageCount: number) {
  if (!content) return [];
  const normalizedContent = content.replace(/\r/g, "");
  const pageMatches = Array.from(normalizedContent.matchAll(/^#{1,3}\s*Page\s+(\d+)\s*$/gim));
  if (pageMatches.length === 0) {
    return [{ page: 1, text: truncateMaterialRecognizedThumbnailText(normalizedContent) }];
  }

  return pageMatches
    .map((match, index) => {
      const page = clampNumber(Number.parseInt(match[1] ?? "", 10), 1, pageCount);
      const start = (match.index ?? 0) + match[0].length;
      const end = index + 1 < pageMatches.length ? pageMatches[index + 1].index ?? normalizedContent.length : normalizedContent.length;
      return {
        page,
        text: truncateMaterialRecognizedThumbnailText(normalizedContent.slice(start, end)),
      };
    })
    .filter((entry, index, entries) => entries.findIndex((candidate) => candidate.page === entry.page) === index);
}

function truncateMaterialRecognizedThumbnailText(text: string) {
  const normalizedText = text.replace(/\s+/g, " ").trim();
  return normalizedText.length > 90 ? `${normalizedText.slice(0, 90)}...` : normalizedText;
}

function shouldIgnoreMaterialPreviewPageKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return true;
  const target = event.target;
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function createPageImageHref(pageImageDir: string, page: number) {
  const normalizedDir = pageImageDir.startsWith("/") ? pageImageDir : `/${pageImageDir}`;
  return `${normalizedDir.replace(/\/$/, "")}/page-${String(page).padStart(3, "0")}.png`;
}

function createMaterialPreviewLayoutCacheHref(recognizedHtmlHref: string, page: number) {
  const cleanHref = recognizedHtmlHref.split("#")[0].split("?")[0];
  const match = cleanHref.match(/^(\/?docs\/source-materials\/.+?)\/ocr-results\/([^/]+)\/combined\.html$/);
  if (!match) return "";
  return `/${match[1].replace(/^\/+/, "")}/layout-cache/${match[2]}/page-${String(Math.max(1, Math.floor(page))).padStart(3, "0")}.json`;
}

function createMaterialPreviewLayoutCacheActionTitle(state: MaterialPreviewLayoutCacheState, error: string) {
  if (state === "ready") return "本页已有版式缓存；点击会重新生成并覆盖缓存";
  if (state === "generating") return "正在生成本页版式缓存";
  if (state === "loading") return "正在检查是否已有本页版式缓存";
  if (state === "error") return error || "本页版式缓存生成或加载失败";
  return "重新生成本页高保真排版，并写入可复用版式缓存";
}

function createMaterialPreviewLayoutCacheBatchActionTitle(
  state: MaterialPreviewLayoutCacheBatchState,
  error: string,
  count: number,
) {
  if (state === "ready") return `全文版式缓存已生成 ${count} 页；点击会重新生成并覆盖缓存`;
  if (state === "generating") return "正在生成全文版式缓存";
  if (state === "error") return error || "全文版式缓存生成失败";
  return "重新生成全文高保真排版，并写入可复用版式缓存";
}

function createRecognizedPreviewSubtitle({
  recognizedHref,
  recognizedKind,
  recognizedOcrMode,
  layoutCacheState,
  layoutCacheRecord,
}: {
  recognizedHref: string;
  recognizedKind: string;
  recognizedOcrMode: MaterialPreviewOcrMode;
  layoutCacheState: MaterialPreviewLayoutCacheState;
  layoutCacheRecord: MaterialPreviewLayoutCacheRecord | null;
}) {
  if (!recognizedHref) return "无识别结果";
  if (recognizedKind !== "recognized_html") return "识别文本";
  if (recognizedOcrMode === "reading") return "正文阅读版";
  if (recognizedOcrMode === "raw") return "原始识别结果";
  if (layoutCacheState === "ready" && layoutCacheRecord) {
    return `表格高保真 / 版式缓存已应用 / ${layoutCacheRecord.cache.blocks.length} 块`;
  }
  if (layoutCacheState === "error" && layoutCacheRecord) {
    return `表格高保真 / 版式缓存已保留 / ${layoutCacheRecord.cache.blocks.length} 块 / 重新生成失败`;
  }
  if (layoutCacheState === "generating") return "表格高保真 / 正在生成版式缓存";
  if (layoutCacheState === "loading") return "表格高保真 / 检查版式缓存";
  if (layoutCacheState === "error") return "表格高保真 / 版式缓存异常";
  return "表格高保真 / 未生成版式缓存";
}

function computeMaterialPreviewPageDisplaySize(
  pageSize: MaterialPreviewPageSize,
  paneSize: MaterialPreviewPageSize,
  zoomPercent: number,
): MaterialPreviewPageSize {
  const availableWidth = Math.max(240, paneSize.width - MATERIAL_PREVIEW_PANE_PADDING);
  const availableHeight = Math.max(320, paneSize.height - MATERIAL_PREVIEW_PANE_PADDING);
  const fitScale = Math.min(availableWidth / pageSize.width, availableHeight / pageSize.height);
  const safeFitScale = Number.isFinite(fitScale) && fitScale > 0 ? fitScale : 1;
  const zoomScale = clampNumber(zoomPercent, 40, 400) / 100;
  return {
    width: Math.max(1, Math.round(pageSize.width * safeFitScale * zoomScale)),
    height: Math.max(1, Math.round(pageSize.height * safeFitScale * zoomScale)),
  };
}

function normalizeMaterialPreviewRotation(rotation: number) {
  const normalized = rotation % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function rotateMaterialPreviewPageSize(pageSize: MaterialPreviewPageSize, rotation: number): MaterialPreviewPageSize {
  return normalizeMaterialPreviewRotation(rotation) % 180 === 90
    ? { width: pageSize.height, height: pageSize.width }
    : pageSize;
}

function computeMaterialPreviewDisplayScale(sourceSize: MaterialPreviewPageSize, displaySize: MaterialPreviewPageSize) {
  const scale = Math.min(displaySize.width / sourceSize.width, displaySize.height / sourceSize.height);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function scaleMaterialPreviewPageSize(pageSize: MaterialPreviewPageSize, scale: number): MaterialPreviewPageSize {
  return {
    width: Math.max(1, Math.round(pageSize.width * scale)),
    height: Math.max(1, Math.round(pageSize.height * scale)),
  };
}

function createRotatedMaterialPreviewStageStyle(size: MaterialPreviewPageSize): CSSProperties {
  return {
    width: `${size.width}px`,
    height: `${size.height}px`,
  };
}

function createRotatedMaterialPreviewFrameStyle(size: MaterialPreviewPageSize, rotation: number): CSSProperties {
  return {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: `${size.width}px`,
    height: `${size.height}px`,
    transform: `translate(-50%, -50%) rotate(${normalizeMaterialPreviewRotation(rotation)}deg)`,
    transformOrigin: "center center",
  };
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function scrollMaterialPreviewRailPageIntoView(rail: HTMLDivElement | null, page: number) {
  if (!rail) return;
  const pageButton = rail.querySelector<HTMLElement>(`[data-page="${page}"]`);
  if (!pageButton) return;

  const scrollRange = Math.max(0, rail.scrollHeight - rail.clientHeight);
  const targetTop = pageButton.offsetTop - (rail.clientHeight - pageButton.offsetHeight) / 2;
  rail.scrollTop = clampNumber(targetTop, 0, scrollRange);
}

function createPreviewDownloadLabel(kind: string, hasOriginalDownload: boolean) {
  if (hasOriginalDownload) return "下载原始文件";
  if (kind === "original_page_images") return "下载当前页图";
  if (kind === "recognized_text") return "下载识别文本";
  if (kind === "recognized_html") return "下载识别 HTML";
  return "下载当前文件";
}

function isImagePreviewKind(kind: string, sourceHref: string) {
  return kind === "original_page_images" || /\.(png|jpe?g|webp|gif|bmp|svg)(?:$|\?)/i.test(sourceHref);
}

function isTextPreviewKind(kind: string, sourceHref: string) {
  return kind === "recognized_text" || kind === "recognized_html" || /\.(md|txt|html?)(?:$|\?)/i.test(sourceHref);
}

const MATERIAL_RECOGNIZED_HTML_PREVIEW_SCOPE = ".material-recognized-html-preview";
const MATERIAL_RECOGNIZED_HTML_PREVIEW_FAITHFUL_CLASS = "material-recognized-html-preview--faithful";
const MATERIAL_RECOGNIZED_HTML_PREVIEW_FAITHFUL_SELECTOR = `.${MATERIAL_RECOGNIZED_HTML_PREVIEW_FAITHFUL_CLASS}`;
const MATERIAL_PREVIEW_PAGE_SCOPE_PREFIX = "material-preview-page-scope-";

function sanitizeMaterialPreviewHtml(
  html: string,
  highlightTerms: string[],
  currentPage?: number,
  ocrMode: MaterialPreviewOcrMode = "raw",
) {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  sanitizeMaterialPreviewDocument(doc);
  filterMaterialPreviewHtmlToPage(doc, currentPage, { readingMode: ocrMode === "reading" });
  applyMaterialPreviewHighlights(doc.body, highlightTerms);
  const headStyles = createScopedMaterialPreviewStyleTags(doc);
  return `${headStyles}${createMaterialPreviewDocumentIntegrityStyleTag()}${doc.body.innerHTML || doc.documentElement.textContent || ""}`;
}

function filterMaterialPreviewHtmlToPage(
  doc: Document,
  currentPage?: number,
  options: { readingMode?: boolean } = {},
) {
  if (!currentPage) return;
  const pageElement = doc.body.querySelector<HTMLElement>(`.ocr-document-page[data-page="${currentPage}"]`);
  if (!pageElement) return;

  const pageClone = pageElement.cloneNode(true) as HTMLElement;
  pageClone.style.margin = "0";
  pageClone.style.boxShadow = "none";
  pageClone.style.background = "#ffffff";
  pageClone.style.overflow = "visible";
  if (options.readingMode) {
    pageClone.style.width = "auto";
    pageClone.style.height = "auto";
    pageClone.style.minHeight = "0";
  } else {
    pageClone.style.height = "auto";
    pageClone.style.minHeight = "0";
  }
  doc.body.replaceChildren(pageClone);
}

function sanitizeMaterialPreviewDocument(doc: Document) {
  expandMaterialPreviewSrcdocIframes(doc);
  doc.querySelectorAll("script, iframe, object, embed, link, meta").forEach((node) => node.remove());
  doc.querySelectorAll("*").forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith("on") || value.startsWith("javascript:")) {
        element.removeAttribute(attribute.name);
      }
    });
  });
}

function expandMaterialPreviewSrcdocIframes(doc: Document) {
  if (typeof DOMParser === "undefined") return;
  doc.querySelectorAll("iframe[srcdoc]").forEach((iframe, index) => {
    const srcdoc = iframe.getAttribute("srcdoc");
    if (!srcdoc) return;
    const iframeDoc = new DOMParser().parseFromString(srcdoc, "text/html");
    sanitizeMaterialPreviewDocument(iframeDoc);

    const pageScopeClass = createMaterialPreviewPageScopeClass(iframe, index);
    const pageScopeSelector = `.${pageScopeClass}`;
    const replacement = doc.createElement("div");
    replacement.className = `ocr-srcdoc-page ${pageScopeClass}`;
    const iframeStyles = [
      createScopedMaterialPreviewStyleTags(iframeDoc, pageScopeSelector),
      createMaterialPreviewIntegrityStyleTag(pageScopeSelector),
    ].join("");
    replacement.innerHTML = `${iframeStyles}${iframeDoc.body.innerHTML}`;
    iframe.replaceWith(replacement);
  });
}

function createMaterialPreviewPageScopeClass(iframe: Element, index: number) {
  const rawPage =
    iframe.closest("[data-page]")?.getAttribute("data-page") ??
    iframe.getAttribute("title")?.match(/\d+/)?.[0] ??
    String(index + 1);
  const normalizedPage = rawPage.replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "") || String(index + 1);
  return `${MATERIAL_PREVIEW_PAGE_SCOPE_PREFIX}${normalizedPage}`;
}

function createScopedMaterialPreviewStyleTags(doc: Document, scopeSelector = MATERIAL_RECOGNIZED_HTML_PREVIEW_SCOPE) {
  return Array.from(doc.head.querySelectorAll("style"))
    .map((style) => `<style>${scopeMaterialPreviewCss(style.textContent ?? "", scopeSelector)}</style>`)
    .join("");
}

function createMaterialPreviewDocumentIntegrityStyleTag() {
  return `<style>
${MATERIAL_RECOGNIZED_HTML_PREVIEW_SCOPE},
${MATERIAL_RECOGNIZED_HTML_PREVIEW_SCOPE} .ocr-document-page {
  overflow: visible !important;
  background: #ffffff !important;
}
${MATERIAL_RECOGNIZED_HTML_PREVIEW_SCOPE} .ocr-document-page {
  height: auto !important;
  min-height: 0 !important;
}
${MATERIAL_RECOGNIZED_HTML_PREVIEW_SCOPE} .page {
  background: #ffffff !important;
}
${MATERIAL_RECOGNIZED_HTML_PREVIEW_SCOPE}.material-recognized-html-preview--reading,
${MATERIAL_RECOGNIZED_HTML_PREVIEW_SCOPE}.material-recognized-html-preview--reading .ocr-document-page,
${MATERIAL_RECOGNIZED_HTML_PREVIEW_SCOPE}.material-recognized-html-preview--reading .page,
${MATERIAL_RECOGNIZED_HTML_PREVIEW_SCOPE}.material-recognized-html-preview--reading .content-crop,
${MATERIAL_RECOGNIZED_HTML_PREVIEW_SCOPE}.material-recognized-html-preview--reading .crop-page,
${MATERIAL_RECOGNIZED_HTML_PREVIEW_SCOPE}.material-recognized-html-preview--reading .content-flow-center,
${MATERIAL_RECOGNIZED_HTML_PREVIEW_SCOPE}.material-recognized-html-preview--reading .content {
  position: static !important;
  width: auto !important;
  max-width: none !important;
  height: auto !important;
  min-height: 0 !important;
  margin: 0 !important;
  overflow: visible !important;
  transform: none !important;
}
${MATERIAL_RECOGNIZED_HTML_PREVIEW_SCOPE}.material-recognized-html-preview--reading .page {
  display: block !important;
  padding: 0 !important;
}
${MATERIAL_RECOGNIZED_HTML_PREVIEW_SCOPE}.material-recognized-html-preview--reading div,
${MATERIAL_RECOGNIZED_HTML_PREVIEW_SCOPE}.material-recognized-html-preview--reading p,
${MATERIAL_RECOGNIZED_HTML_PREVIEW_SCOPE}.material-recognized-html-preview--reading span,
${MATERIAL_RECOGNIZED_HTML_PREVIEW_SCOPE}.material-recognized-html-preview--reading li {
  max-width: 100% !important;
  font-size: 16px !important;
  line-height: 1.85 !important;
  letter-spacing: 0 !important;
  white-space: normal !important;
  word-break: break-word !important;
  overflow-wrap: anywhere !important;
}
${MATERIAL_RECOGNIZED_HTML_PREVIEW_SCOPE}.material-recognized-html-preview--reading .title,
${MATERIAL_RECOGNIZED_HTML_PREVIEW_SCOPE}.material-recognized-html-preview--reading h1,
${MATERIAL_RECOGNIZED_HTML_PREVIEW_SCOPE}.material-recognized-html-preview--reading h2 {
  margin: 0 0 16px !important;
  text-align: center !important;
  font-size: 24px !important;
  line-height: 1.45 !important;
  font-weight: 700 !important;
}
${MATERIAL_RECOGNIZED_HTML_PREVIEW_SCOPE}.material-recognized-html-preview--reading table {
  width: 100% !important;
  table-layout: auto !important;
  border-collapse: collapse !important;
}
</style>`;
}

function createMaterialPreviewIntegrityStyleTag(scopeSelector: string) {
  return `<style>
${scopeSelector} .page {
  align-items: flex-start !important;
  justify-content: flex-start !important;
}
${scopeSelector} .content-flow-center,
${scopeSelector} .crop-page {
  overflow: visible !important;
}
${MATERIAL_RECOGNIZED_HTML_PREVIEW_FAITHFUL_SELECTOR} ${scopeSelector} .page:has(table) {
  align-items: flex-start !important;
  justify-content: flex-start !important;
  padding: 12px !important;
  height: auto !important;
  min-height: 0 !important;
}
${MATERIAL_RECOGNIZED_HTML_PREVIEW_FAITHFUL_SELECTOR} ${scopeSelector} .page:has(table) .content-flow-center,
${MATERIAL_RECOGNIZED_HTML_PREVIEW_FAITHFUL_SELECTOR} ${scopeSelector} .page:has(table) .crop-page {
  width: max-content !important;
  min-width: 100% !important;
  max-width: none !important;
  height: auto !important;
  overflow: visible !important;
}
${MATERIAL_RECOGNIZED_HTML_PREVIEW_FAITHFUL_SELECTOR} ${scopeSelector} .page:has(table) table {
  width: max-content !important;
  min-width: 100% !important;
  max-width: none !important;
  table-layout: auto !important;
  border-collapse: collapse !important;
}
${MATERIAL_RECOGNIZED_HTML_PREVIEW_FAITHFUL_SELECTOR} ${scopeSelector} .page:has(table) th,
${MATERIAL_RECOGNIZED_HTML_PREVIEW_FAITHFUL_SELECTOR} ${scopeSelector} .page:has(table) td {
  white-space: nowrap !important;
  word-break: keep-all !important;
  overflow-wrap: normal !important;
  text-overflow: clip !important;
  padding: 1px 2px !important;
  line-height: 1.05 !important;
  font-size: 8px !important;
  vertical-align: middle !important;
}
${MATERIAL_RECOGNIZED_HTML_PREVIEW_FAITHFUL_SELECTOR} ${scopeSelector} .page:has(table) div,
${MATERIAL_RECOGNIZED_HTML_PREVIEW_FAITHFUL_SELECTOR} ${scopeSelector} .page:has(table) p,
${MATERIAL_RECOGNIZED_HTML_PREVIEW_FAITHFUL_SELECTOR} ${scopeSelector} .page:has(table) span {
  word-break: keep-all !important;
  overflow-wrap: normal !important;
}
</style>`;
}

function scopeMaterialPreviewCss(css: string, scopeSelector = MATERIAL_RECOGNIZED_HTML_PREVIEW_SCOPE) {
  return css.replace(/(^|})\s*([^@{}][^{]+)\{/g, (match, close: string, selectors: string) => {
    const scopedSelectors = selectors
      .split(",")
      .map((selector) => {
        const trimmedSelector = selector.trim();
        if (!trimmedSelector) return trimmedSelector;
        if (trimmedSelector === "*") return `${scopeSelector} *`;
        if (trimmedSelector.startsWith(scopeSelector)) return trimmedSelector;
        const selectorWithoutRoot = trimmedSelector.replace(/^(html|body)(\s+|$)/, "").trim();
        if (!selectorWithoutRoot) return scopeSelector;
        return `${scopeSelector} ${selectorWithoutRoot}`;
      })
      .filter(Boolean)
      .join(", ");
    return `${close} ${scopedSelectors} {`;
  });
}

function createPreviewHighlightTerms(rawTerms: string[]) {
  return Array.from(
    new Set(
      rawTerms
        .flatMap((term) => term.split("|"))
        .map((term) => term.trim())
        .filter((term) => term.length >= 2),
    ),
  ).slice(0, 8);
}

function applyMaterialPreviewHighlights(root: HTMLElement, highlightTerms: string[]) {
  const highlightRegex = createMaterialHighlightRegex(highlightTerms);
  if (!highlightRegex) return;
  highlightTextNodeChildren(root, highlightRegex);
}

function highlightTextNodeChildren(element: Element, highlightRegex: RegExp) {
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === 3) {
      const text = child.textContent ?? "";
      if (!highlightRegex.test(text)) {
        highlightRegex.lastIndex = 0;
        continue;
      }

      highlightRegex.lastIndex = 0;
      const fragment = document.createDocumentFragment();
      let lastIndex = 0;
      for (const match of text.matchAll(highlightRegex)) {
        const index = match.index ?? 0;
        if (index > lastIndex) fragment.append(text.slice(lastIndex, index));
        const mark = document.createElement("mark");
        mark.className = "material-preview-highlight";
        mark.textContent = match[0];
        fragment.append(mark);
        lastIndex = index + match[0].length;
      }
      if (lastIndex < text.length) fragment.append(text.slice(lastIndex));
      child.parentNode?.replaceChild(fragment, child);
      highlightRegex.lastIndex = 0;
      continue;
    }

    if (child.nodeType !== 1) continue;
    const childElement = child as Element;
    if (["STYLE", "SCRIPT", "MARK"].includes(childElement.tagName)) continue;
    highlightTextNodeChildren(childElement, highlightRegex);
  }
}

function createMaterialHighlightRegex(highlightTerms: string[]) {
  const escapedTerms = createPreviewHighlightTerms(highlightTerms)
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp);
  if (escapedTerms.length === 0) return null;
  return new RegExp(`(${escapedTerms.join("|")})`, "giu");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function DashboardPage({ currentRole,mayReadProgress, funds, onCreate, pendingAiIntakeCount, projects, reports, tasksByProject, capitalRecords, meetingRecords, apiClient, materials, onRefresh }: {
  currentRole?:string;mayReadProgress:boolean; onRefresh: () => Promise<void>; apiClient: ApiClient; materials: ApiMaterial[]; meetingRecords: MeetingRecord[]; funds: Fund[]; onCreate: (input: ApiProjectCreateInput) => Promise<Project>;
  pendingAiIntakeCount: number; projects: Project[]; reports: ReportRecord[]; tasksByProject: Record<string, ProjectTask[]>; capitalRecords: CapitalItem[];
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  return <><DashboardWorkspace currentRole={currentRole} onCreateFund={canManageFunds(currentRole)&&funds.every(fund=>Number.isInteger(fund.revision))?()=>navigate('/funds?create=1'):undefined} mayReadProgress={mayReadProgress} onRefresh={onRefresh} funds={funds} pendingAiIntakeCount={pendingAiIntakeCount} projects={projects} reports={reports} tasksByProject={tasksByProject} capitalRecords={capitalRecords} meetingRecords={meetingRecords} apiClient={apiClient} materials={materials} onCreate={canEditProjectMaster(currentRole)?() => setDrawerOpen(true):undefined} quickPrompts={projects.length?[`检索${projects[0].name}的已归档资料`,'查看未完成任务','创建报告草稿']:['检索已归档原件','新增基金主档','创建项目主档']} legacyReminders={null} />
    <ProjectCreateDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} funds={funds} onSave={onCreate} /></>;
}

function PriorityMetaTag({ children }: { children: string }) {
  const tone = children.startsWith("高") ? "red" : children.startsWith("中") ? "yellow" : "gray";
  return (
    <span
      className="decision-meta-tag inline-flex items-center border bg-transparent px-2 py-0.5 text-xs font-medium"
      data-tone={tone}
    >
      {children}
    </span>
  );
}

function getProjectBoardEntries(projects: Project[]) {
  return projectBoard.map((column) => {
    const items = projects.filter(project=>matchesProjectAssetCategory(project,column.label));

    return {
      ...column,
      count: items.length,
      items,
    };
  });
}

function ProjectCreateDrawer({ open, onClose, onSave, funds }: {
  open: boolean;
  onClose: () => void;
  onSave: (input: ApiProjectCreateInput) => Promise<Project>;
  funds: Fund[];
}) {
  const [draft, setDraft] = useState<ApiProjectCreateInput>(() => ({ requestId: crypto.randomUUID(), name: "", shortName: "", industry: "", fundId: "", manager: "", collaborators: "", sourceChannel: "", description: "" }));
  const [initialStage,setInitialStage]=useState<NonNullable<ApiProjectCreateInput['stage']>>('初筛');
  const intakePrepare=useRef<(()=>Promise<string>)|undefined>(undefined);
  const [intakeDraftId,setIntakeDraftId]=useState<string|undefined>();
  const intakeDraftRef=useRef<string|undefined>();
  const custom=useCustomFields('project',undefined,String(open),initialStage);
  const [companySchemaRefresh,setCompanySchemaRefresh]=useState(0);
  const [binding,setBinding]=useState(emptyCompanyBinding);
  const [unknown,setUnknown]=useState(false);
  const pending=useRef<ApiProjectCreateInput|null>(null);
  const working=useRef(false),touched=useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const [errorFields,setErrorFields]=useState<string[]>([]);
  const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(() => {
    if (!open) return;
    setDraft({ requestId: crypto.randomUUID(), name: "", shortName: "", industry: "", fundId: funds.find(f=>f.id===new URLSearchParams(window.location.search).get('fundId'))?.id ?? funds[0]?.id ?? "", manager: "", collaborators: "", sourceChannel: "", description: "" });
    touched.current=false;intakeDraftRef.current=undefined;setInitialStage('初筛');setIntakeDraftId(undefined);setError(null);custom.setValues({});setBinding(emptyCompanyBinding());setUnknown(false);pending.current=null;
    const trigger = document.activeElement as HTMLElement | null;
    container.current?.querySelector<HTMLInputElement>("input")?.focus({preventScroll:true});
    return () => trigger?.focus({preventScroll:true});
  }, [open]);
  const close=async()=>{if(working.current||busy)return false;const hasInput=Boolean(touched.current||intakeDraftId||[draft.name,draft.shortName,draft.industry,draft.manager,draft.collaborators,draft.sourceChannel,draft.description].some(value=>value?.trim())||Object.keys(custom.values).length);if(hasInput){setBusy(true);try{await intakePrepare.current?.();}catch(cause){setError(cause instanceof Error?cause.message:'草稿尚未保存，当前填写已保留，请重试。');return false;}finally{setBusy(false);}}onClose();return true;};
  const dismiss=useBackdropDismiss(()=>{void close();},busy);
  if (!open) return null;
  const update = (key: keyof ApiProjectCreateInput, value: string) => {
    setDraft((current) => ({ ...current, [key]: value, requestId: crypto.randomUUID() }));
    setError(null);setErrorFields([]);pending.current=null;
  };
  const fields = [
    ["项目名称", "name", true, 200], ["项目简称", "shortName", true, 100], ["所属行业", "industry", true, 200],
    ["项目负责人", "manager", false, 200], ["协同人员", "collaborators", false, 2000], ["项目来源", "sourceChannel", false, 500],
  ] as const;
  return (
    <div {...dismiss} ref={container} role="dialog" aria-modal="true" aria-labelledby="project-create-title" className="fixed inset-0 z-50 bg-black/60"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) { event.preventDefault(); void close(); }
        if (event.key === "Tab") {
          const nodes = container.current?.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)");
          const first = nodes?.[0], last = nodes?.[nodes.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
      <form aria-busy={busy} onChangeCapture={()=>{touched.current=true;}} className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col border-l border-[#2b3139] bg-[#1e2329] text-[#eaecef] shadow-2xl"
        onSubmit={async (event) => {
          event.preventDefault();
          if (working.current) return;
          if (![draft.name, draft.shortName, draft.industry, draft.fundId].every((value) => value.trim())) { setError("请填写项目名称、简称、行业并选择所属基金。"); return; }
          working.current=true;setBusy(true); setError(null);
          try {
            if(!pending.current){await intakePrepare.current?.();if(binding.mode==='new'&&binding.newCompany.schemaRevision===undefined)throw Error('企业字段设置尚未读取，请先重试。');pending.current={...draft,stage:initialStage,...custom.payload(),...companyBindingPayload(binding)};}
            const project = await onSave(pending.current);
            await bindBusinessIntake(intakeDraftRef.current,project.id);
            if(!mounted.current)return;
            onClose();
            navigate(`/projects/${encodeURIComponent(project.id)}`);
          } catch (cause) {
            const {status,code}=cause as {status?:number;code?:string};
            const failedFields=(cause as {fields?:string[]}).fields??[];setErrorFields(failedFields);
            const failedLabels=failedFields.map(key=>fields.find(field=>field[1]===key)?.[0]??(key==='fundId'?'所属基金':custom.schema?.fields.find(field=>field.id===key)?.label)).filter(Boolean).join('、');
            if(code==='custom_schema_revision_conflict'){await custom.reload();setCompanySchemaRefresh(n=>n+1);}
            if(status===400||status===404||status===409){setUnknown(false);pending.current=null;}else if(status!==401&&status!==403&&pending.current)setUnknown(true);
            setError(code?.includes('custom')?customErrorMessage(cause,custom.schema??undefined):code==='company_name_conflict'?'企业名称已有档案，请核对真实主体并选择已有企业；系统不会凭名称自动合并。':!pending.current&&!status&&cause instanceof Error?cause.message:status === 403 ? "当前账号没有新建项目权限。" : status === 401 ? "登录已过期，请重新登录后重试。" : status === 400 ? `项目字段不符合要求，请核对${failedLabels||'输入长度和内容'}。` : status === 404 ? "所属基金已不存在，请重新选择。" : status === 409 ? "保存请求与已有记录冲突，请修改信息后重试。" : "项目保存未确认，请检查系统连接后重试。重复提交不会重复建档。");
          } finally { working.current=false;setBusy(false); }
        }}>
        <div className="flex items-center justify-between border-b border-[#2b3139] px-5 py-4">
          <div><p className="text-xs font-semibold text-gold">项目建档</p><h2 id="project-create-title" className="mt-1 text-xl font-semibold">新建项目 / 企业</h2></div>
          <button data-ui="secondary" type="button" disabled={busy} onClick={()=>void close()} className="rounded-md border border-[#2b3139] p-2 text-[#929aa5] hover:text-gold" aria-label="关闭新建项目抽屉"><X size={18} /></button>
        </div>
        <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-5">
          <div className="grid gap-4 md:grid-cols-2">
            {fields.map(([label, key, required, limit]) => <label key={key} className="space-y-2"><span className="text-xs font-semibold text-[#929aa5]">{label}{required ? " *" : ""}</span>
              <input id={`project-create-${key}`} required={required} maxLength={limit} disabled={busy||unknown} value={draft[key]} onChange={(event) => update(key, event.target.value)} aria-invalid={Boolean(error && (errorFields.includes(key)||required && !draft[key].trim()))} aria-describedby={error ? "project-create-error" : undefined} className="h-10 w-full rounded-md border border-[#2b3139] bg-[#11161d] px-3 text-sm outline-none focus:border-gold" />
            </label>)}
            <label className="space-y-2"><span className="text-xs font-semibold text-[#929aa5]">所属基金 *</span><select required disabled={busy||unknown} aria-invalid={Boolean(error && !draft.fundId)} aria-describedby={error ? "project-create-error" : undefined} value={draft.fundId} onChange={(event) => update("fundId", event.target.value)} className="h-10 w-full rounded-md border border-[#2b3139] bg-[#11161d] px-3 text-sm"><option value="">请选择基金</option>{funds.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}</select></label>
            <p className="text-sm text-[#929aa5]">建档状态：拟投 / 初筛</p>
          </div>
          <label className="block space-y-2"><span className="text-xs font-semibold text-[#929aa5]">初始备注</span><textarea disabled={busy||unknown} maxLength={20000} value={draft.description} onChange={(event) => update("description", event.target.value)} className="min-h-24 w-full rounded-md border border-[#2b3139] bg-[#11161d] px-3 py-3 text-sm leading-6 outline-none focus:border-gold" /></label>
<label className="block text-sm">建档时的业务阶段<select className="mt-2 block w-full rounded-lg border border-[var(--line)] bg-[var(--inset)] p-2" disabled={busy||unknown} value={initialStage} onChange={e=>{setInitialStage(e.target.value as typeof initialStage);pending.current=null;}}>{['初筛','立项','尽调','投决','投后','退出'].map(value=><option key={value}>{value}</option>)}</select><span className="mt-2 block text-xs text-[var(--secondary)]">记录实际业务阶段，不代表审批已通过、投资已确认或资金已到账。</span></label>
          <BusinessIntakePanel prepareRef={intakePrepare} formState={{requestId:draft.requestId,fundId:draft.fundId,manager:draft.manager,collaborators:draft.collaborators,sourceChannel:draft.sourceChannel,initialStage,binding}} onRestoreFormState={state=>{setDraft(current=>({...current,...Object.fromEntries(['fundId','manager','collaborators','sourceChannel'].filter(key=>typeof state[key]==='string').map(key=>[key,state[key]])),...(typeof state.requestId==='string'&&/^[-a-f0-9]{36}$/i.test(state.requestId)?{requestId:state.requestId}:{})}));if(['初筛','立项','尽调','投决','投后','退出'].includes(String(state.initialStage)))setInitialStage(state.initialStage as typeof initialStage);if(state.binding&&typeof state.binding==='object'&&['unbound','existing','new'].includes(String((state.binding as {mode?:unknown}).mode)))setBinding(state.binding as typeof binding);pending.current=null;}} stage={initialStage} customValues={custom.values} customSchema={custom.schema??undefined} onRestoreCustom={custom.setValues} objectType="project" fields={{name:draft.name,shortName:draft.shortName,industry:draft.industry,description:draft.description}} onDraft={id=>{intakeDraftRef.current=id;setIntakeDraftId(id);}} disabled={busy||unknown} onApply={values=>{setDraft(current=>({...current,...values}));pending.current=null;}}/>
          <CustomFieldForm state={custom} disabled={busy||unknown} onChange={()=>{pending.current=null;setDraft(d=>({...d,requestId:crypto.randomUUID()}));setError(null);}}/>
          <CompanyBindingFields refreshKey={companySchemaRefresh} value={binding} disabled={busy||unknown} onChange={value=>{setBinding(value);pending.current=null;setDraft(current=>({...current,requestId:crypto.randomUUID()}));setError(null);}}/>
          {unknown?<p className="text-sm text-[var(--secondary)]">保存结果未确认，填写已锁定。请原样重试同一请求，或关闭后先核对项目列表。</p>:null}
          <p className="text-sm text-[#929aa5]">项目保存后，可在资料库关联材料。</p>
          {error ? <p id="project-create-error" role="alert" className="text-sm text-red-400">{error}<NoticeHelp message={error}/></p> : null}
          {busy ? <p role="status">正在保存项目，请稍候…</p> : null}
        </div>
        <div className="flex justify-end gap-3 border-t border-[#2b3139] p-5">
          <button data-ui="secondary" type="button" disabled={busy} onClick={()=>void close()} className="rounded-md border border-[#2b3139] px-4 py-2">取消</button>
          <button data-ui="primary" type="submit" disabled={busy || funds.length === 0||(!unknown&&(custom.loading||!custom.schema||!!custom.error))} className="rounded-md bg-gold px-4 py-2 font-semibold text-[#181a20]">{busy ? "正在保存…" : unknown?'原样重试本次保存':"保存并进入详情"}</button>
        </div>
        {funds.length === 0 ? <p role="status" className="px-5 pb-4 text-sm">当前无可用基金，暂不能新建项目。<button type="button" data-ui="info" onClick={async()=>{if(await close())navigate('/funds?create=1');}}>建立基金主档</button></p> : null}
      </form>
    </div>
  );
}

function ProjectsPage({
  currentRole,
  funds,
  onCreate,
  projects,
  tasksByProject,
  onProjectTaskUpdate,
}: {
  currentRole?:string;
  funds: Fund[];
  onCreate: (input: ApiProjectCreateInput) => Promise<Project>;
  projects: Project[];
  tasksByProject: Record<string, ProjectTask[]>;
  onProjectTaskUpdate: (projectId: string, taskId: string, patch: Partial<Omit<ProjectTask, "id">>) => Promise<ProjectTask | undefined>;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(()=>{const open=()=>{const query=new URLSearchParams(window.location.search);if(query.get('create')==='1'&&canEditProjectMaster(currentRole)){setDrawerOpen(true);query.delete('create');window.history.replaceState({},'',window.location.pathname+'?'+query);}};open();window.addEventListener('popstate',open);return()=>window.removeEventListener('popstate',open);},[currentRole]);
  const labels=useCustomFields('project');
  const [labelFilter,setLabelFilter]=useState('');
  const [query, setQuery] = useState("");
  const [risk, setRisk] = useState<"全部" | RiskLevel>("全部");
  const [stageFilter,setStageFilter]=useState("");
  const [status, setStatus] = useState("全部");
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const riskOptions = ["全部", "高", "中", "低"] as const;
  const statusOptions = ["全部", ...projectBoard.map((column) => column.label),"退出中"] as const;
  const filtered = useMemo(
    () =>
      projects.filter((project) => {
        const matchesQuery = project.name.includes(query) || project.shortName.includes(query) || Boolean(project.assetClaimText?.includes(query));
        const matchesRisk = risk === "全部" || project.risk === risk;
        const matchesStatus = matchesProjectAssetCategory(project,status)&&(!stageFilter||(project.stage.trim()||'未登记阶段')===stageFilter);
        return matchesQuery && matchesRisk && matchesStatus && matchesLifecycleLabel(project,labelFilter);
      }),
    [projects, query, risk, status,stageFilter,labelFilter],
  );
  const [requestedPage,setRequestedPage]=useState(0);
  const page=Math.min(requestedPage,Math.max(0,Math.ceil(filtered.length/15)-1));
  useEffect(()=>setRequestedPage(0),[query,risk,status,stageFilter,labelFilter]);

  return (
    <div className="projects-workspace">
      <SectionHeader title="项目账本" eyebrow="项目 / 投资 / 投后 / 退出" action={<div className="flex flex-wrap gap-3"><DeletedRecordsButton kind="project"/><DeletedRecordsButton kind="company"/>{canEditProjectMaster(currentRole)?<PrimaryButton creation onClick={() => setDrawerOpen(true)}>新建项目</PrimaryButton>:null}</div>} />
      <ProjectStageChart projects={projects} selected={stageFilter} onSelect={stage=>{setStageFilter(stage);setStatus("全部");setRisk("全部");setQuery("");if(!stage)setLabelFilter("");}}/>
      <ProjectCreateDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} funds={funds} onSave={onCreate} />
      <Card className="project-register p-5">
        <header className="project-ledger-register-heading"><div><h2>项目清单</h2><p>查阅项目档案、跟进投资阶段与待办事项</p></div></header>
        <div className="project-ledger-filterbar">
          <label className="project-search">
            <Search size={16} aria-hidden="true" />
            <input aria-label="搜索企业名称或简称" placeholder="搜索企业名称或简称" value={query} onChange={event=>setQuery(event.target.value)} />
          </label>
          <select aria-label="项目状态" value={status} onChange={event=>setStatus(event.target.value)}>
            {statusOptions.map(option=><option key={option} value={option}>{option==='全部'?'项目状态：全部':option}</option>)}
          </select>
          <div className="project-ledger-label-filter">
            {labels.loading?<span role="status">正在读取标签…</span>:labels.error?<span role="alert">{labels.error}<button data-ui="secondary" onClick={()=>void labels.reload()}>重试标签</button></span>:<LifecycleLabelFilter hideLabel schema={labels.schema??undefined} value={labelFilter} onChange={setLabelFilter}/>}
          </div>
          <select aria-label="风险等级" value={risk} onChange={event=>setRisk(event.target.value as "全部" | RiskLevel)}>
            {riskOptions.map(option=><option key={option} value={option}>{option==='全部'?'风险等级：全部':option+'风险'}</option>)}
          </select>
        </div>
        <div className="project-table-viewport" role="region" tabIndex={0} aria-label="项目清单，可横向滚动查看完整字段">
        <Table headers={["企业名称", "数据来源", "所属基金", "行业", "项目状态", "投资阶段", "负责人", "投资金额", "风险等级", "最新进展", "操作", "待办数量"]}>
          {!filtered.length?<tr><td colSpan={12} className="px-4 py-8 text-center text-sm text-[var(--secondary)]">当前筛选条件下没有项目，可调整名称、风险等级或项目状态。</td></tr>:null}
          {filtered.slice(page*15,(page+1)*15).map((project) => {
            const projectTasks = tasksByProject[project.id] ?? [];
            const openTasks = projectTasks.filter(isOpenTask);
            const activeTask = openTasks.find((task) => task.id === activeTaskId) ?? null;
            const isExpanded = expandedProjectId === project.id;

            return (
              <Fragment key={project.id}>
                <tr className={isExpanded ? "bg-[#11161d]" : "hover:bg-slate-50"}>
                  <td className="whitespace-nowrap px-4 py-4">
                    <div className="project-identity">
                    <button
                      onClick={() => navigate(`/projects/${project.id}`)}
                      className="font-semibold text-navy hover:text-gold"
                    >
                      {project.name}
                    </button>
                    <p className="business-update-information mt-1 text-xs">{project.updatedAt}</p>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4"><DataOriginBadge origin={project.dataOrigin} purpose={project.dataPurpose} /></td>
                  <td className="whitespace-nowrap px-4 py-4 text-slate-600">{project.fund}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-slate-600">{project.industry}</td>
                  <td className="whitespace-nowrap px-4 py-4"><StatusBadge status={projectLifecycleLabel(project)} /></td>
                  <td className="whitespace-nowrap px-4 py-4 text-slate-600">{project.stage}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-slate-600">{project.manager}</td>
                  <td className="number-font whitespace-nowrap px-4 py-4 font-medium text-slate-800">{project.amount}</td>
                  <td className="whitespace-nowrap px-4 py-4"><RiskBadge level={project.risk} /></td>
                  <td className="min-w-72 px-4 py-4 text-slate-600">{project.latest}</td>
                  <td className="project-row-actions px-4 py-4"><DeleteRecordButton kind="project" id={project.id} title={project.name}/></td>
                  <td className="whitespace-nowrap px-4 py-4">
                    <button data-ui="secondary"
                      type="button"
                      data-expand-entry
                      data-pending-count={openTasks.length}
                      aria-label={`${isExpanded ? '收起' : '展开'}${project.name}的${openTasks.length}项待办`}
                      aria-expanded={isExpanded}
                      aria-controls={`project-tasks-${project.id}`}
                      onClick={() => {
                        setExpandedProjectId((current) => (current === project.id ? null : project.id));
                        setActiveTaskId(null);
                      }}
                      className="number-font inline-flex h-8 items-center gap-1 rounded border border-[#2b3139] px-2 font-semibold text-gold transition hover:border-gold hover:bg-[#11161d]"
                    >
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      {openTasks.length}
                    </button>
                  </td>
                </tr>
                {isExpanded ? (
                  <tr id={`project-tasks-${project.id}`} className="bg-[#11161d]">
                    <td colSpan={12} className="px-4 pb-5 pt-0">
                      <ProjectTaskDrilldown
                        projectId={project.id}
                        tasks={openTasks}
                        activeTask={activeTask}
                        onSelectTask={setActiveTaskId}
                        onCompleteTask={async (taskId) => {
                          const updatedTask = await onProjectTaskUpdate(project.id, taskId, { status: "已完成" });
                          if (updatedTask) setActiveTaskId(null);
                        }}
                      />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </Table>
        </div>
        <LedgerPagination total={filtered.length} page={page} onChange={setRequestedPage} label="项目清单分页"/>
      </Card>
    </div>
  );
}

function ProjectTaskDrilldown({
  projectId,
  tasks,
  activeTask,
  onSelectTask,
  onCompleteTask,
}: {
  projectId: string;
  tasks: ProjectTask[];
  activeTask: ProjectTask | null;
  onSelectTask: (taskId: string) => void;
  onCompleteTask: (taskId: string) => Promise<void>;
}) {
  return (
    <div className="rounded-lg border border-[#2b3139] bg-[#1e2329] p-4">
      {tasks.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
          <div className="space-y-2">
            {tasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => onSelectTask(task.id)}
                className={`w-full rounded-md border p-3 text-left transition ${
                  activeTask?.id === task.id ? "border-gold bg-[#11161d]" : "border-[#2b3139] hover:border-gold"
                }`}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="font-semibold text-[#eaecef]">{task.name}</p>
                    <p className="mt-1 text-xs text-[#707a8a]">
                      {task.type} · {task.stage} · {task.owner}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <StatusBadge status={task.status} />
                    <StatusBadge status={task.priority} />
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-xs text-[#929aa5] md:grid-cols-[120px_1fr]">
                  <span className="number-font">截止：{task.dueDate}</span>
                  <span>{task.relation}</span>
                </div>
              </button>
            ))}
          </div>
          <div className="rounded-md border border-[#2b3139] bg-[#11161d] p-4">
            {activeTask ? (
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-gold">待办操作</p>
                    <h3 className="mt-1 font-semibold text-[#eaecef]">{activeTask.name}</h3>
                  </div>
                  <StatusBadge status={activeTask.status} />
                </div>
                <div className="mt-4 space-y-3 text-sm text-[#929aa5]">
                  <p>{activeTask.note}</p>
                  <div className="grid grid-cols-[72px_1fr] gap-2 text-xs">
                    <span className="text-[#707a8a]">负责人</span>
                    <span>{activeTask.owner}</span>
                    <span className="text-[#707a8a]">截止时间</span>
                    <span className="number-font">{activeTask.dueDate}</span>
                    <span className="text-[#707a8a]">关联事项</span>
                    <span>{activeTask.relation}</span>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button data-ui="primary"
                    type="button"
                    onClick={() => onCompleteTask(activeTask.id)}
                    className="inline-flex h-9 items-center gap-2 rounded-md bg-gold px-3 text-sm font-semibold text-[#181a20]"
                  >
                    <CheckCircle2 size={16} />
                    标记完成
                  </button>
                  <button data-ui="info"
                    type="button"
                    onClick={() => navigate(`/projects/${projectId}`)}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-[#2b3139] px-3 text-sm font-semibold text-[#eaecef] hover:border-gold hover:text-gold"
                  >
                    <ArrowUpRight size={15} />
                    查看完整任务
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-48 flex-col justify-between">
                <div>
                  <p className="text-xs font-semibold text-gold">待办操作</p>
                  <p className="mt-2 text-sm leading-6 text-[#929aa5]">选择左侧待办后，可查看备注、关联事项，并直接标记完成。</p>
                </div>
                <button data-ui="secondary"
                  type="button"
                  onClick={() => navigate(`/projects/${projectId}`)}
                  className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border border-[#2b3139] px-3 text-sm font-semibold text-[#eaecef] hover:border-gold hover:text-gold"
                >
                  <ArrowUpRight size={15} />
                  进入项目任务
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#2b3139] bg-[#11161d] p-4">
          <p className="text-sm text-[#929aa5]">当前没有未完成待办。</p>
          <button
            type="button"
            onClick={() => navigate(`/projects/${projectId}`)}
            className="text-sm font-semibold text-gold"
          >
            查看项目详情
          </button>
        </div>
      )}
    </div>
  );
}

function FilterButtonGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex flex-wrap items-center gap-1.5 rounded-md border border-[#2b3139] bg-[#11161d] px-1.5 py-2 text-sm xl:flex-nowrap xl:shrink-0"
    >
      <span className="flex h-8 shrink-0 items-center gap-1 px-1.5 text-xs font-semibold text-[#929aa5]">
        <Filter size={14} />
        {label}
      </span>
      {options.map((option) => {
        const selected = value === option;

        return (
          <button data-ui={selected?'primary':'secondary'}
            key={option}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option)}
            className={`h-8 rounded px-2 text-sm font-semibold transition ${
              selected
                ? "bg-gold text-[#181a20]"
                : "text-[#929aa5] hover:bg-[#1e2329] hover:text-gold"
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

function DataOriginBadge({ origin,purpose }: { origin?: string | null;purpose?:string|null }) {
  const normalized = normalizeDataOrigin(origin);
  const tone = normalized === "seed_demo" ? "orange" : normalized === "source_pdf_ocr" ? "green" : normalized === "source_file" ? "gold" : "navy";

  return (
    <span title={dataOriginDescription(origin)+' · '+dataPurposeLabel(purpose)}>
      <Badge tone={tone}>{dataOriginLabel(origin)}</Badge>{purpose==='engineering_fixture'?<Badge tone="orange">工程测试</Badge>:null}
    </span>
  );
}

function DataOriginNotice({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mb-4 rounded-lg border border-[#8a6d1d] bg-[#221d0f] px-4 py-3 text-sm text-[#f1c21b]">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-xs leading-5 text-[#c7aa46]">{detail}</p>
    </div>
  );
}

function FundsPage({ funds: fundRecords,currentRole,onChanged }: { funds: Fund[];currentRole?:string;onChanged:()=>Promise<void> }) {
  const workspace=useAgentWorkspace();
  const labels=useCustomFields('fund');
  const [labelFilter,setLabelFilter]=useState('');
  const hideDemo=useHideSeedDemo();
  const [creating,setCreating]=useState(false);
  useEffect(()=>{const query=new URLSearchParams(window.location.search);if(query.get('create')==='1'&&canManageFunds(currentRole)){setCreating(true);query.delete('create');window.history.replaceState({},'',window.location.pathname+(query.size?'?'+query:''));}},[currentRole]);
  const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const [stage, setStage] = useState(()=>fundStageFromSearch(window.location.search));
  useEffect(()=>{const sync=()=>setStage(fundStageFromSearch(window.location.search));window.addEventListener('popstate',sync);return()=>window.removeEventListener('popstate',sync);},[]);
  const selectFundStage=(value:string)=>{setStage(value);const query=new URLSearchParams(window.location.search);if(value==='全部阶段')query.delete('stage');else query.set('stage',value);window.history.replaceState({},'',window.location.pathname+(query.size?'?'+query:''));};
  const stageOptions = ["全部阶段", "募集期", "投资期", "投后管理", "退出期"];
  const visibleFunds = fundRecords.filter(fund=>(stage === "全部阶段"||fund.stage===stage)&&matchesLifecycleLabel(fund,labelFilter));
  const [requestedPage,setRequestedPage]=useState(0);
  const page=Math.min(requestedPage,Math.max(0,Math.ceil(visibleFunds.length/15)-1));
  useEffect(()=>setRequestedPage(0),[stage,labelFilter]);

  return (
    <div className="funds-workspace">
      <SectionHeader
        title="基金账本"
        eyebrow="募集 / 投资 / 投后 / 资金"
        action={<div className="flex flex-wrap gap-2">{canManageFunds(currentRole)&&fundRecords.every(f=>Number.isInteger(f.revision))?<PrimaryButton creation onClick={()=>setCreating(true)}>新建基金</PrimaryButton>:null}</div>}
      />
      <FundRelations workspace={workspace} funds={fundRecords} localMoney={isLocalBusinessStateMode()} onShowAll={()=>selectFundStage("全部阶段")} onStage={selectFundStage} onReviewFund={(id,tab)=>navigate(`/funds/${encodeURIComponent(id)}?tab=${encodeURIComponent(tab)}${tab==='概览'?'&editFund=1':''}`)} onTasks={()=>navigate("/tasks?fund=__visible_funds__")}/>
      <Card className="fund-register p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="fund-register-heading">
            <h2 className="text-lg font-semibold text-[#eaecef]">基金主数据</h2>
            <p className="mt-1 text-sm text-[#707a8a]">以基金为一级账本，统一查看募集、项目、资金、资料和风险条款。</p>
          </div>
          {labels.loading?<p role="status">正在读取标签…</p>:labels.error?<p role="alert">{labels.error}<button data-ui="secondary" onClick={()=>void labels.reload()}>重试标签</button></p>:<LifecycleLabelFilter schema={labels.schema??undefined} value={labelFilter} onChange={setLabelFilter}/>}<FilterButtonGroup label="基金阶段" value={stage} options={stageOptions} onChange={selectFundStage} />
        </div>
        <p className="fund-register-hint">左右滑动查看完整基金字段</p>
        <div className="fund-table-viewport" role="region" tabIndex={0} aria-label="基金清单，可横向滚动查看完整字段">
        <Table headers={["基金名称", "数据来源", "阶段", "负责人", "基金规模", isLocalBusinessStateMode()?"实缴规模":"实缴（元）", "已投金额", "账户余额", "项目", "投资者", "待办", "下一步", "操作"]}>
          {visibleFunds.length===0?<tr><td colSpan={13} className="px-4 py-8 text-sm text-[var(--secondary)]">{fundRecords.length?'当前阶段没有基金。':'尚未录入基金，可先建立基金主档。'}</td></tr>:null}
          {visibleFunds.slice(page*15,(page+1)*15).map((fund) => (
            <tr key={fund.id} className="hover:bg-slate-50">
              <td className="whitespace-nowrap px-4 py-4">
                <div className="fund-identity">
                <button onClick={() => navigate(`/funds/${fund.id}`)} className="font-semibold text-navy hover:text-gold">
                  {fund.name}
                </button>
                <p className="business-update-information mt-1 text-xs">{fund.updatedAt}</p>
                </div>
              </td>
              <td className="whitespace-nowrap px-4 py-4"><DataOriginBadge origin={fund.dataOrigin} purpose={fund.dataPurpose} /></td>
              <td className="px-4 py-4"><StatusBadge status={fund.stage} /></td>
              <td className="whitespace-nowrap px-4 py-4 text-slate-600">{fund.manager}</td>
              <td className="number-font whitespace-nowrap px-4 py-4 font-semibold text-slate-900">{fund.scale||'待登记'}</td>
              <td className="number-font whitespace-nowrap px-4 py-4 text-slate-600">{isLocalBusinessStateMode()?fund.paidIn:fund.registeredTotalsIncludeDemo===!hideDemo?formatLpMoney(fund.registeredTotals?.paidIn):'待核对'}</td>
              <td className="number-font whitespace-nowrap px-4 py-4 text-slate-600">{fund.invested}</td>
              <td className="number-font whitespace-nowrap px-4 py-4 text-slate-600">{fund.balance}</td>
              <td className="number-font px-4 py-4 text-gold">{fund.projectCount}</td>
              <td className="number-font px-4 py-4 text-slate-600">{fund.registeredTotalsIncludeDemo===!hideDemo?fund.registeredTotals?.investorCount??'—':'—'}</td>
              <td className="number-font px-4 py-4 text-gold">{workspace.state&&!workspace.error?<button type="button" data-ui="info" onClick={()=>navigate('/tasks?fund='+encodeURIComponent(fund.id))}>{workspace.state.tasks.filter(task=>isOpenWorkspaceTask(task)&&matchesTaskFund(task,fund.id,[])).length}</button>:<span title={workspace.error?'统一待办读取失败，请在上方重试':'正在读取统一待办'}>—</span>}</td>
              <td className="min-w-72 px-4 py-4 text-slate-600">{fund.nextAction}</td>
              <td className="fund-row-actions px-4 py-4"><DeleteRecordButton kind="fund" id={fund.id} title={fund.name}/></td>
            </tr>
          ))}
        </Table>
        </div>
        <LedgerPagination total={visibleFunds.length} page={page} onChange={setRequestedPage} label="基金清单分页"/>
      </Card>
      {creating?<FundMasterEditor onClose={()=>setCreating(false)} onSaved={async result=>{await onChanged();if(!mounted.current)return;setCreating(false);navigate(`/funds/${result.fund.id}`);}}/>:null}
    </div>
  );
}

function FundDetailPage({
  onAssetChanged,
  onMasterChanged,
  currentRole,
  fundRecords,
  investors,
  documents,
  auditEvents,
  capitalRecords,
  reports,
  projects,
  onInvestorSignatureConfirm,
  onFundFeeConfirm,
  onClauseReminderCreate,
}: {
  onAssetChanged:()=>Promise<void>;
  onMasterChanged:()=>Promise<void>;
  currentRole?:string;
  fundRecords: Fund[];
  investors: typeof fundInvestors;
  documents: FundDocument[];
  auditEvents: AuditEvent[];
  capitalRecords: CapitalItem[];
  reports: ReportRecord[];
  projects: Project[];
  onInvestorSignatureConfirm: (investor: (typeof fundInvestors)[number]) => void;
  onFundFeeConfirm: (record: CapitalItem) => void;
  onClauseReminderCreate: (clause: FundClauseMonitor, fund: Fund) => void;
}) {
  const fundId = window.location.pathname.split("/").filter(Boolean)[1];
  const fund = fundRecords.find((item) => item.id === fundId);
  const hideDemo=useHideSeedDemo();
  const requestedTab=()=>fundDossierTab(new URLSearchParams(window.location.search));
  const [tab,setTab]=useState(requestedTab);
  useEffect(()=>{setTab(requestedTab());const select=()=>setTab(requestedTab());window.addEventListener("popstate",select);return()=>window.removeEventListener("popstate",select);},[fundId]);
  const selectFundTab=(value:string)=>{setTab(value);const url=new URL(window.location.href);url.searchParams.set('tab',value);window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash);};
  const [editing,setEditing]=useState<{id:string;token:string}|null>(null);
  useEffect(()=>{
    const url=new URL(window.location.href);
    if(url.searchParams.get('editFund')!=='1'||!fund||!canManageFunds(currentRole)||!Number.isInteger(fund.revision))return;
    setEditing({id:fund.id,token:crypto.randomUUID()});
    url.searchParams.delete('editFund');window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash);
  },[fundId,fund?.revision,currentRole]);
  useEffect(()=>{if(new URLSearchParams(window.location.search).get('tab')==='文档模板'&&currentRole==='admin')navigate('/settings?section='+encodeURIComponent('业务模板管理')+'&templateFund='+encodeURIComponent(fundId));},[fundId,currentRole]);
  const [createdClauseTitles, setCreatedClauseTitles] = useState<string[]>([]);
  if (!fund) return <Card className="space-y-4 p-5"><h2 className="text-lg font-semibold">基金暂未显示</h2><p role="status" className="max-w-[70ch] text-sm leading-6 text-[var(--secondary)]">{hideDemo?"当前已隐藏模拟与工程测试记录。可以关闭顶部隐藏开关后重试，或返回列表查找。":"请返回基金账本核对记录。若刚新建，可刷新页面后重试。"}</p><SecondaryButton onClick={()=>navigate("/funds")}>返回基金账本</SecondaryButton></Card>;
  const fundProjects = projects.filter((project) => project.fundId === fund.id || (isLocalBusinessStateMode() && !project.fundId && project.fund === fund.name));
  const fundInvestorRows = investors.filter((investor) => investor.fundId === fund.id);
  const fundDocumentRows = documents.filter((doc) => doc.fundId === fund.id);
  const fundClauseRows = fundClauseMonitors.filter((clause) => clause.fundId === fund.id);
  const fundLogRows = filterAuditEvents(auditEvents, { targetId: fund.id });
  const fundCapitalLedger = deriveCapitalLedger(capitalRecords, { fund: fund.name, fundId:fund.id, allowLegacyName:isLocalBusinessStateMode() });
  const fundFeeRows = deriveFundFeeRows(capitalRecords, fund.name, fund.id, isLocalBusinessStateMode());
  const fundReportRows = deriveFundReportRows(fund, reports, isLocalBusinessStateMode());

  return (
    <div>
      <FundDossier fund={fund} projects={fundProjects} tab={tab} onOpen={selectFundTab}
        source={<DataOriginBadge origin={fund.dataOrigin} purpose={fund.dataPurpose}/>}
        paidIn={isLocalBusinessStateMode()?fund.paidIn:fund.registeredTotalsIncludeDemo===!hideDemo?formatLpMoney(fund.registeredTotals?.paidIn):'待核对'}
        onEdit={canManageFunds(currentRole)&&Number.isInteger(fund.revision)?()=>setEditing({id:fund.id,token:crypto.randomUUID()}):undefined}
        onBack={()=>navigate('/funds')} onTasks={()=>navigate('/tasks?fund='+encodeURIComponent(fundId))}
        onTemplates={currentRole==='admin'?()=>navigate('/settings?section='+encodeURIComponent('业务模板管理')+'&templateFund='+encodeURIComponent(fundId)):undefined}
        fields={<CustomFieldDetails data={fund}/>}
      >
          {tab === "概览" ? null : tab === "资料档案" ? <ScopedMaterialsWorkspace fund={fund} projects={projects} onChanged={onMasterChanged}/> : tab === "条款监控" ? <FundClauseWorkspace fund={fund} projects={projects} onChanged={onMasterChanged}/> : tab === "投后报告" ? <ScopedReportsWorkspace target={{id:fund.id,name:fund.name,type:'fund'}} projects={projects} onChanged={onMasterChanged}/> : tab === "基金事务" ? <FundLifecyclePanel key={fundId} section="affairs" fundId={fundId} currentRole={currentRole} onChanged={onAssetChanged}/> : tab === "投资项目" ? <FundInvestmentWorkspace fund={fund} funds={fundRecords} projects={projects} onChanged={onMasterChanged}/> : renderFundTab(
            tab,
            fund,
            fundProjects,
            fundInvestorRows,
            fundDocumentRows,
            fundClauseRows,
            fundLogRows,
            fundCapitalLedger,
            fundFeeRows,
            fundReportRows,
            onInvestorSignatureConfirm,
            onFundFeeConfirm,
            (clause) => {
              onClauseReminderCreate(clause, fund);
              setCreatedClauseTitles((current) => (current.includes(clause.title) ? current : [...current, clause.title]));
            },
            createdClauseTitles,
            onAssetChanged,
            currentRole,
            onMasterChanged,
          )}
      </FundDossier>
      {editing?.id===fund.id?<FundMasterEditor key={editing.token} fund={fund} onClose={()=>setEditing(current=>current===editing?null:current)} onSaved={async()=>{await onMasterChanged();setEditing(current=>current===editing?null:current);}}/>:null}
    </div>
  );
}

function renderFundTab(
  tab: string,
  fund: Fund,
  fundProjects: Project[],
  fundInvestorRows: typeof fundInvestors,
  fundDocumentRows: FundDocument[],
  fundClauseRows: typeof fundClauseMonitors,
  fundLogRows: AuditEvent[],
  fundCapitalLedger: ReturnType<typeof deriveCapitalLedger>,
  fundFeeRows: ReturnType<typeof deriveFundFeeRows>,
  fundReportRows: ReportRecord[],
  onInvestorSignatureConfirm: (investor: (typeof fundInvestors)[number]) => void,
  onFundFeeConfirm: (record: CapitalItem) => void,
  onClauseReminderCreate: (clause: FundClauseMonitor) => void,
  createdClauseTitles: string[],
  onAssetChanged:()=>Promise<void>,
  currentRole?:string,
  onFundLedgerChanged:()=>Promise<void> = onAssetChanged,
) {
  if (tab === "募集档案") {
    if(!isLocalBusinessStateMode())return <DossierSections key={`${fund.id}:raising`} label="募集档案目录" items={[{id:"investors",label:"投资者与缴款",content:<LpLedgerPanel key={`${fund.id}-${currentRole}`} fundName={fund.name} fundId={fund.id} currentRole={currentRole} onChanged={onFundLedgerChanged}/>},{id:"documents",label:"生成缴款通知与基金文档",content:<DocumentTemplatesPanel key={fund.id} mode="generate" fundId={fund.id} role={currentRole}/>}]} />;
    const fundraisingRows = deriveFundraisingRows(fundInvestorRows);
    return (
      <section aria-label="投资者募集档案" className="lp-register-table space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">投资者明细</h3>{isLocalBusinessStateMode()?<Badge tone="slate">匿名演示</Badge>:!canViewFullLp(currentRole)?<Badge tone="slate">LP 信息已脱敏</Badge>:null}</header>
      <p className="text-sm leading-6 text-[var(--secondary)]">金额待与认缴文件、到账凭证逐笔核对。签署状态不代表实际到账。</p>
      {fundraisingRows.length?<Table headers={["投资者", "数据来源", "类型", "认缴金额", "实缴金额", "适当性", "签署状态", "下一步"]}>
        {fundraisingRows.map((investor,index) => (
          <tr key={investor.id??`${investor.fundId}-legacy-${index}`} className="hover:bg-slate-50">
            <td className="px-4 py-4 font-semibold text-navy">{investor.name}</td>
            <td className="whitespace-nowrap px-4 py-4"><DataOriginBadge origin={investor.dataOrigin} purpose={investor.dataPurpose} /></td>
            <td className="px-4 py-4 text-slate-600">{investor.type}</td>
            <td className="number-font px-4 py-4 text-slate-600">{investor.commitment}</td>
            <td className="number-font px-4 py-4 text-slate-600">{investor.paidIn}</td>
            <td className="px-4 py-4"><StatusBadge status={investor.suitabilityStatus} /></td>
            <td className="px-4 py-4"><StatusBadge status={investor.signStatus} /></td>
            <td className="px-4 py-4">
              {canConfirmLpSignature(currentRole,isLocalBusinessStateMode())?<button data-ui="primary"
                type="button"
                onClick={() => onInvestorSignatureConfirm(investor)}
                disabled={investor.closed}
                className="rounded bg-gold px-3 py-2 text-sm font-semibold text-[#181a20] disabled:cursor-not-allowed disabled:bg-[#2b3139] disabled:text-[#707a8a]"
              >
                {investor.closed ? "已完成" : investor.nextAction}
              </button>:<span className="text-sm text-[var(--secondary)]">只读</span>}
            </td>
          </tr>
        ))}
      </Table>:<p className="py-3 text-sm text-[var(--secondary)]">暂无可查看的投资者记录。</p>}
      </section>
    );
  }

  if (tab === "投资项目") {
    return (
      <Table headers={["项目", "数据来源", "行业", "阶段", "负责人", "投资金额", "风险", "最新进展"]}>
        {fundProjects.map((project) => (
          <tr key={project.id} className="hover:bg-slate-50">
            <td className="px-4 py-4">
              <button onClick={() => navigate(`/projects/${project.id}`)} className="font-semibold text-navy hover:text-gold">
                {project.name}
              </button>
            </td>
            <td className="whitespace-nowrap px-4 py-4"><DataOriginBadge origin={project.dataOrigin} purpose={project.dataPurpose} /></td>
            <td className="px-4 py-4 text-slate-600">{project.industry}</td>
            <td className="px-4 py-4 text-slate-600">{project.stage}</td>
            <td className="px-4 py-4 text-slate-600">{project.manager}</td>
            <td className="number-font px-4 py-4 text-slate-600">{project.amount}</td>
            <td className="px-4 py-4"><RiskBadge level={project.risk} /></td>
            <td className="min-w-72 px-4 py-4 text-slate-600">{project.latest}</td>
          </tr>
        ))}
      </Table>
    );
  }

  if (tab === "账户资金") {
    return <DossierSections key={`${fund.id}:accounts`} label="账户资金目录" queryKey="accountView" initial={new URLSearchParams(window.location.search).has('lifecycleAction')?'accounts':'summary'} items={[
      {id:'summary',label:'资金概况',content:<><FundAccountMetrics fund={fund} receivable={fundCapitalLedger.totalReceivableLabel} pendingCount={fundCapitalLedger.pendingCount} localDemo={isLocalBusinessStateMode()}/><FundLifecyclePanel section="accounts" summaryOnly fundId={fund.id} currentRole={currentRole} onChanged={onAssetChanged}/></>},
      {id:'accounts',label:'账户、回单与额度',content:<FundLifecyclePanel section="accounts" fundId={fund.id} currentRole={currentRole} onChanged={onAssetChanged}/>},
      {id:'payments',label:'投资付款',content:<InvestmentCashflowLedgerPanel key={`payments-${fund.id}`} fundId={fund.id} currentRole={currentRole} onChanged={onAssetChanged}/>},
      {id:'returns',label:'退出回款',content:<ExitSettlementLedgerPanel key={`receipts-${fund.id}`} fundId={fund.id} onChanged={onAssetChanged}/>},
      {id:'items',label:'资金事项',content:<><div className="dossier-business-actions">{['admin','finance'].includes(currentRole??'')?<button data-action="create" data-ui="primary" onClick={()=>navigate(`/capital?fundId=${encodeURIComponent(fund.id)}&create=1`)}>新增本基金资金事项</button>:null}<button data-ui="secondary" onClick={()=>navigate(`/capital?fundId=${encodeURIComponent(fund.id)}#capital-items`)}>管理本基金资金事项</button></div>
        <Table headers={["企业名称", "到账金额", "到账日期", "管理费规则", "应收金额", "应收日期", "状态", "来源", "动作"]}>
          {fundCapitalLedger.rows.map((item, index) => (
            <tr key={`${item.company}-${item.date}-${index}`} className="hover:bg-slate-50">
              <td className="px-4 py-4 font-semibold text-navy">{item.company}</td>
              <td className="number-font px-4 py-4 text-slate-600">{item.received}</td>
              <td className="number-font px-4 py-4 text-slate-600">{item.date||'尚未到账'}</td>
              <td className="px-4 py-4 text-slate-600">{item.rule}</td>
              <td className="number-font px-4 py-4 font-semibold text-slate-900">{item.receivable}</td>
              <td className="number-font px-4 py-4 text-slate-600">{item.dueDate}</td>
              <td className="px-4 py-4"><StatusBadge status={item.status} /></td>
              <td className="px-4 py-4 text-slate-600">{item.source ?? "规则计算"}</td>
              <td className="px-4 py-4">
                <button data-ui="primary"
                  type="button"
                  onClick={() => item.date&&/[1-9]/.test(item.received)?onFundFeeConfirm(item):navigate('/capital?fundId='+encodeURIComponent(fund.id)+'#capital-items')}
                  disabled={Boolean(item.confirmationStatus?.includes('已确认'))}
                  className="rounded bg-gold px-3 py-2 text-sm font-semibold text-[#181a20] disabled:cursor-not-allowed disabled:bg-[#2b3139] disabled:text-[#707a8a]"
                >
                  {item.confirmationStatus?.includes('已确认') ? "已确认" : item.date&&/[1-9]/.test(item.received)?"确认到账":"补录实际到账"}
                </button>
              </td>
            </tr>
          ))}
        </Table></>},
    ]}/>;
  }

  if (tab === "费用流水") {
    return (
      <DossierSections key={`${fund.id}:fees`} label="费用流水目录" queryKey="feeView" initial={fundFeeSection} items={[{id:"ledger",label:"费用明细",content:<FundFeeRegister fundId={fund.id}/>},{id:"fees",label:"费用办理与规则",content:<FundLifecyclePanel section="fees" fundId={fund.id} currentRole={currentRole} onChanged={onAssetChanged}/>},{id:"legacy",label:"既有资金事项",content:<div className="space-y-4"><p className="dossier-business-note">独立登记，不计入费用核销合计。</p>
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="既有资金事项" value={String(fundFeeRows.length)} tone="navy" />
          <StatCard label="未收齐事项" value={String(fundFeeRows.filter((row) => row.status !== "已收").length)} tone="orange" />
          <StatCard label="已收齐事项" value={String(fundFeeRows.filter((row) => row.status === "已收").length)} tone="green" />
        </div>
        <Table headers={["企业", "费用规则", "应收金额", "应收日期", "状态", "确认动作"]}>
          {fundFeeRows.map((row, index) => (
            <tr key={`${row.company}-${row.date}-${index}`} className="hover:bg-slate-50">
              <td className="px-4 py-4 font-semibold text-navy">{row.company}</td>
              <td className="px-4 py-4 text-slate-600">{row.rule}</td>
              <td className="number-font px-4 py-4 text-slate-600">{row.receivable}</td>
              <td className="number-font px-4 py-4 text-slate-600">{row.dueDate}</td>
              <td className="px-4 py-4"><StatusBadge status={row.status} /></td>
              <td className="px-4 py-4">
                <button data-ui="primary"
                  type="button"
                  onClick={() => onFundFeeConfirm(row)}
                  disabled={row.status === "已收"}
                  className="rounded bg-gold px-3 py-2 text-sm font-semibold text-[#181a20] disabled:cursor-not-allowed disabled:bg-[#2b3139] disabled:text-[#707a8a]"
                >
                  {row.nextAction}
                </button>
              </td>
            </tr>
          ))}
        </Table>
        </div>}]} />
    );
  }

  if (tab === "操作日志") {
    return <FundAuditJournal key={fund.id} events={fundLogRows}/>;
  }

  return <FundOverviewMetrics fund={fund} projects={fundProjects}/>;
}

function AiInboxPage({
  pendingCount,
  fundRecords,
  items,
  projects,
  onArchive,
  onUpdate,
  onReject,
  onCreated,materials,api,canWrite,onMaterialsRefresh,onTasksRefresh,
}: {
  pendingCount:number;
  fundRecords:Fund[];
  items: AiIntakeItem[];
  projects: Project[];
  onArchive: (item: AiIntakeItem) => Promise<AiIntakeItem | undefined>;
  onUpdate: (id: string, patch: Pick<AiIntakeItem, "suggestedFund" | "suggestedFundId" | "suggestedProject" | "suggestedPath">) => Promise<AiIntakeItem | undefined>;
  onReject: (id: string, reviewNote: string) => Promise<AiIntakeItem | undefined>;
  onCreated:(result:Awaited<ReturnType<ApiClient['createAiIntakeFromMaterial']>>)=>void;
  materials:ApiMaterial[];api:ApiClient;canWrite:boolean;onMaterialsRefresh:()=>Promise<void>;onTasksRefresh:()=>Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState(() => new URLSearchParams(window.location.search).get("itemId") ?? items.find(item=>item.status==='待确认')?.id ?? items[0]?.id ?? "");
  useEffect(() => { const select = () => { const id = new URLSearchParams(window.location.search).get("itemId"); if(id) setSelectedId(id); }; window.addEventListener("popstate", select); return () => window.removeEventListener("popstate", select); }, []);
  const [statusFilter,setStatusFilter]=useState<'全部'|AiIntakeItem['status']>('全部');
  const [busyAction,setBusyAction]=useState<string|null>(null);
  const visibleItems=intakeQueue(items,statusFilter);
  const selected = visibleItems.find(item=>item.id===selectedId) ?? visibleItems[0];
  const [suggestionDraft, setSuggestionDraft] = useState({
    suggestedFund: selected?.suggestedFund ?? "",
    suggestedFundId:selected?.suggestedFundId??'', 
    suggestedProject: selected?.suggestedProject ?? "",
    suggestedPath: selected?.suggestedPath ?? "",
  });
  const [draftItemId,setDraftItemId]=useState(selected?.id??'');
  const [reviewNote, setReviewNote] = useState("项目归属或目录路径需要重新识别。");
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!selected) return;
    setSuggestionDraft({
      suggestedFund: selected.suggestedFund,
      suggestedFundId:selected.suggestedFundId??'', 
      suggestedProject: selected.suggestedProject,
      suggestedPath: selected.suggestedPath,
    });
    setDraftItemId(selected.id);
    setReviewNote(selected.reviewNote ?? "项目归属或目录路径需要重新识别。");
  }, [selected?.id, selected?.suggestedFund, selected?.suggestedFundId, selected?.suggestedProject, selected?.suggestedPath, selected?.reviewNote]);

  const confirmArchive = async (id: string) => {
    const itemToArchive = items.find((item) => item.id === id);
    if (!itemToArchive || itemToArchive.status === "已归档") return;
    if(draftItemId!==id){setActionNotice('正在切换收件项，请稍后核对归属再保存。');return;}

    const patch=selectedIntakeFund(suggestionDraft,fundRecords);
    if(!patch){setActionNotice('请明确选择可用基金，未能唯一核对的归属不能保存或归档。');return;}
    const archivedItem = await onArchive({ ...itemToArchive, ...patch });
    if (!archivedItem) {
      setActionNotice("AI 收件箱归档未写入系统，请检查系统连接后重试。");
      return;
    }
    setActionNotice(null);
  };
  const saveSuggestion = async () => {
    if (!selected || selected.status !== "待确认") return;
    if(draftItemId!==selected.id){setActionNotice('正在切换收件项，请稍后核对归属再保存。');return;}
    const patch=selectedIntakeFund(suggestionDraft,fundRecords);
    if(!patch){setActionNotice('请明确选择可用基金，未能唯一核对的归属不能保存或归档。');return;}
    const updatedItem = await onUpdate(selected.id, patch);
    if (!updatedItem) {
      setActionNotice("归档建议修改未写入系统，请检查系统连接后重试。");
      return;
    }
    setActionNotice(null);
  };
  const rejectSuggestion = async () => {
    if (!selected || selected.status !== "待确认") return;
    if(draftItemId!==selected.id){setActionNotice('正在切换收件项，请稍后核对归属再保存。');return;}
    const rejectedItem = await onReject(selected.id, reviewNote);
    if (!rejectedItem) {
      setActionNotice("退回操作未写入系统，请检查系统连接后重试。");
      return;
    }
    setActionNotice(null);
  };
  const [taskSeed,setTaskSeed]=useState<{name:string;projectId?:string;relation:string}|null>(null);
  const [uploadType,setUploadType]=useState<AiIntakeItem['inputType']|null>(null);
  const [leaveDraft,setLeaveDraft]=useState<{next:()=>void}|null>(null);
  const draftChanged=selected?.status==='待确认' && (suggestionDraft.suggestedFund!==selected.suggestedFund || (suggestionDraft.suggestedFundId??'')!==(selected.suggestedFundId??'') || suggestionDraft.suggestedProject!==selected.suggestedProject || suggestionDraft.suggestedPath!==selected.suggestedPath || reviewNote!==(selected.reviewNote??'项目归属或目录路径需要重新识别。'));
  function beforeLeavingDraft(next:()=>void) {
    if(draftChanged) setLeaveDraft({next}); else next();
  }
  function selectIntake(item: AiIntakeItem) {
    setSelectedId(item.id); setDraftItemId(item.id);
    setSuggestionDraft({suggestedFund:item.suggestedFund,suggestedFundId:item.suggestedFundId??'',suggestedProject:item.suggestedProject,suggestedPath:item.suggestedPath});
    setReviewNote(item.reviewNote??'项目归属或目录路径需要重新识别。');setActionNotice(null);
    if (window.matchMedia('(max-width: 767px)').matches) {
      document.getElementById('inbox-detail')?.focus({preventScroll:true});
      document.getElementById('inbox-detail')?.scrollIntoView({block:'start',behavior:'instant'});
    }
  }
  function openIntakeFund(item:AiIntakeItem) {
    const id=resolveIntakeFundId(item,fundRecords);
    if(id) navigate(`/funds/${id}`); else setActionNotice('未取得唯一基金关联，请先核对归属。');
  }
  async function performAction(name:string, action:()=>Promise<void>) {
    if(busyAction) return;
    setBusyAction(name);
    try { await action(); } catch { setActionNotice('操作未完成，请检查连接后重试。'); }
    finally {setBusyAction(null);}
  }
  return (
    <div className="inbox-workspace inbox-c">
      <SectionHeader title="AI 收件箱" eyebrow="资料识别 / 核对 / 归档" action={<DeletedRecordsButton kind="intake" />} />
      <section className="inbox-processing-entry" aria-label="资料处理入口">
        <div><h2>资料处理入口</h2><p>支持会议纪要、投资协议、财务报表进入资料处理队列。</p></div>
        {canWrite?<div>{(['会议纪要','投资协议','财务报表'] as AiIntakeItem['inputType'][]).map(inputType => <button key={inputType} data-ui="secondary" disabled={Boolean(busyAction)} onClick={()=>beforeLeavingDraft(()=>setUploadType(inputType))}>上传{inputType}<Plus size={16} /></button>)}</div>:<p>当前账号可查看收件，上传和归档由资料经办人办理。</p>}
      </section>
      <div className="inbox-review-layout">
        <section className="inbox-queue" aria-label="收件队列">
          <div className="inbox-status-filters" role="group" aria-label="收件状态">{(['全部','待确认','已归档','已退回'] as const).map(status => <button key={status} aria-pressed={statusFilter===status} disabled={Boolean(busyAction)} onClick={()=>{if(status!==statusFilter)beforeLeavingDraft(()=>{setStatusFilter(status);setActionNotice(null);});}}><span>{status}</span>{status==='待确认'?(pendingCount>0?<span className="aw-bell-count inbox-pending-badge">{pendingCount}</span>:null):<strong>{status==='全部'?items.length:items.filter(item=>item.status===status).length}</strong>}</button>)}</div>
          <div className="inbox-queue-scroll">{visibleItems.map(item => <article key={item.id} className="inbox-queue-item" data-selected={selected?.id===item.id}>
            <button className="inbox-select-item" disabled={Boolean(busyAction)} aria-pressed={selected?.id===item.id} aria-controls="inbox-detail" onClick={()=>{if(item.id!==selected?.id)beforeLeavingDraft(()=>selectIntake(item));else if(window.matchMedia('(max-width:767px)').matches){document.getElementById('inbox-detail')?.focus({preventScroll:true});document.getElementById('inbox-detail')?.scrollIntoView({block:'start'});}}}>
              <div><strong>{item.title}</strong><StatusBadge status={item.status}/></div>
              <p className="inbox-item-meta">{item.inputType}{selected?.id===item.id && item.source ? ` · ${item.source}` : ''}{selected?.id===item.id && item.submittedBy ? ` · ${item.submittedBy}` : ''}<time>{item.submittedAt}</time></p>
              <p className="inbox-item-summary">{item.summary}</p>
            </button>
            {item.status==='已归档'?<button className="inbox-fund-link" data-ui="secondary" disabled={Boolean(busyAction)} onClick={()=>beforeLeavingDraft(()=>openIntakeFund(item))}>查看基金账本<ChevronRight size={14}/></button>:null}
          </article>)}
          {!visibleItems.length?<div className="inbox-empty"><Archive size={28}/><h3>{items.length?'当前状态暂无收件':'暂无收件记录'}</h3><p>{items.length?'可切换其他状态查看。':'上传原件后，识别结果会在这里等待确认。'}</p>{items.length?<button data-ui="secondary" onClick={()=>setStatusFilter('全部')}>查看全部</button>:null}</div>:null}</div>
        </section>
        <InboxSourcePane material={materials.find(m=>m.id===selected?.sourceMaterialId)} sourceVersionId={selected?.sourceVersionId} title={selected?.title} extracted={selected?.extracted??[]}/>
        <section id="inbox-detail" className="inbox-detail" aria-label="收件详情与归档确认" tabIndex={-1}>
          {selected ? <>
            <div className="inbox-detail-body">
              <header className="inbox-detail-heading"><div><Badge tone="gold">{selected.inputType}</Badge><Badge tone="slate">{selected.confidence.includes('%')?`置信度 ${selected.confidence}`:selected.confidence}</Badge><span className="sr-only">置信度为当前记录提示，不代表经核验的准确率。</span><StatusBadge status={selected.status}/></div><h2>{selected.title}</h2><p>{selected.summary}</p>{selected.sourceMaterialId?<a data-ui="info" href={`/materials?materialId=${encodeURIComponent(selected.sourceMaterialId)}`} onClick={e=>{e.preventDefault();beforeLeavingDraft(()=>navigate(`/materials?materialId=${encodeURIComponent(selected.sourceMaterialId!)}`));}}>查看来源原件</a>:null}</header>
              {actionNotice?<div role="alert" className="inbox-action-notice">{actionNotice}<NoticeHelp message={actionNotice}/></div>:null}
              <section className="inbox-ownership" aria-label="归属与归档设置"><h3>归属与归档设置</h3>
                {canWrite&&selected.status==='待确认'?<div className="inbox-ownership-fields">
                  <label><span>基金</span><select disabled={Boolean(busyAction)} value={suggestionDraft.suggestedFundId||resolveIntakeFundId(suggestionDraft,fundRecords)} onChange={event=>{const fund=fundRecords.find(f=>f.id===event.target.value);setSuggestionDraft(current=>({...current,suggestedFund:fund?.name??'',suggestedFundId:fund?.id??''}));}}><option value="">请选择基金</option>{fundRecords.map(fund=><option key={fund.id} value={fund.id}>{fund.name}</option>)}</select></label>
                  <label><span>项目</span><select disabled={Boolean(busyAction)} title={suggestionDraft.suggestedProject} value={suggestionDraft.suggestedProject} onChange={event=>setSuggestionDraft(current=>({...current,suggestedProject:event.target.value}))}>{[selected.suggestedProject,...projects.map(project=>project.name)].filter((value,index,array)=>value&&array.indexOf(value)===index).map(name=><option key={name}>{name}</option>)}</select></label>
                  <label><span>目录路径</span><input disabled={Boolean(busyAction)} title={suggestionDraft.suggestedPath} value={suggestionDraft.suggestedPath} onChange={event=>setSuggestionDraft(current=>({...current,suggestedPath:event.target.value}))}/></label>
                </div>:<dl className="inbox-ownership-fields"><div><dt>基金</dt><dd>{selected.suggestedFund}</dd></div><div><dt>项目</dt><dd>{selected.suggestedProject}</dd></div><div><dt>目录路径</dt><dd>{selected.suggestedPath}</dd></div></dl>}
              </section>
              <div className="inbox-signals"><section><h3>提取信息 <small>（AI 识别整理）</small></h3><ol>{selected.extracted.map((text,index)=><li key={`${text}-${index}`}><span>{index+1}</span><p>{text}</p></li>)}</ol>{!selected.extracted.length?<p className="inbox-no-suggestions">暂无提取信息</p>:null}</section><section><h3>建议任务 <small>（AI 建议，核对后创建任务）</small></h3><ul>{selected.generatedTasks.map((task,index)=><li key={`${task}-${index}`}><Circle size={15} aria-hidden="true"/><p>{task}</p>{canWrite&&selected.status==='已归档'?<button data-ui="secondary" className="shrink-0 whitespace-nowrap px-2 py-1 text-xs" type="button" onClick={()=>setTaskSeed({name:task,projectId:projects.find(p=>p.name===selected.suggestedProject||p.shortName===selected.suggestedProject)?.id,relation:`AI收件：${selected.title} / ${selected.id}`})}>创建任务</button>:null}</li>)}</ul>{!selected.generatedTasks.length?<p className="inbox-no-suggestions">暂无建议任务</p>:null}</section></div>
              {canWrite&&selected.status==='待确认'?<label className="inbox-return-reason"><span>退回原因</span><textarea disabled={Boolean(busyAction)} value={reviewNote} onChange={event=>setReviewNote(event.target.value)}/></label>:selected.reviewNote?<section className="inbox-review-note"><h3>审核备注</h3><p>{selected.reviewNote}</p></section>:null}
            </div>
            <footer className="inbox-detail-footer"><p><Info size={16} aria-hidden="true"/><span><strong>处理说明：</strong>AI 根据原件整理建议。确认归档更新收件与资料档案；建议任务需核对负责人和截止日后另行创建。</span></p><div>
              {busyAction?<span role="status" className="inbox-busy">{busyAction}中…</span>:null}
              {canWrite&&selected.status==='待确认'?<><button data-ui="secondary" disabled={Boolean(busyAction)} onClick={()=>void performAction('保存修改',saveSuggestion)}>保存修改</button><button data-ui="danger" disabled={Boolean(busyAction)} onClick={()=>void performAction('退回重试',rejectSuggestion)}>退回重试</button><button data-ui="primary" disabled={Boolean(busyAction)} onClick={()=>void performAction('确认归档',()=>confirmArchive(selected.id))}>确认归档<ChevronRight size={16}/></button></>:selected.status==='已归档'?<button data-ui="secondary" disabled={Boolean(busyAction)} onClick={()=>openIntakeFund(selected)}>查看基金账本<ChevronRight size={16}/></button>:<button data-ui="secondary" onClick={()=>navigate(selected.sourceMaterialId?`/materials?materialId=${encodeURIComponent(selected.sourceMaterialId)}`:'/materials')}>更新原件后重新识别</button>}
              {!busyAction?<DeleteRecordButton kind="intake" id={selected.id} title={selected.title}/>:null}
            </div></footer>
          </>:<div className="inbox-empty inbox-detail-empty"><FileText size={28}/><h2>暂无可查看的收件</h2><p>选择队列中的资料，核对归属、提取信息与建议任务。</p></div>}
        </section>
      </div>
      {taskSeed?<WorkflowTaskDialog projects={projects} projectId={taskSeed.projectId} seed={{name:taskSeed.name,relation:taskSeed.relation,dueDate:''}} onClose={()=>setTaskSeed(null)} onSaved={async()=>{await onTasksRefresh();setTaskSeed(null);setActionNotice('任务已保存，可在任务中心查看。');}}/>:null}
      {uploadType?<IntakeUploadDialog api={api} projects={projects} funds={fundRecords} materials={materials} initialType={uploadType} onClose={()=>setUploadType(null)} onCreated={result=>{onCreated(result);setStatusFilter('全部');selectIntake(result.item);void onMaterialsRefresh().catch(()=>setActionNotice('收件已生成，资料列表暂未刷新，请在资料库重新读取。'));}}/>:null}
      {leaveDraft?<WorkflowDialog title="保留未保存的修改" busy={false} onClose={()=>setLeaveDraft(null)}><p>当前收件的归属或退回原因尚未保存。继续切换会放弃这些修改。</p><div className="mt-5 flex flex-wrap gap-3"><button data-ui="primary" onClick={()=>setLeaveDraft(null)}>继续编辑</button><button data-ui="secondary" onClick={()=>{const next=leaveDraft.next;setLeaveDraft(null);next();}}>放弃修改并切换</button></div></WorkflowDialog>:null}
    </div>
  );
}

function Select({
  value,
  ariaLabel,
  onChange,
  options,
}: {
  value: string;
  ariaLabel?: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-600">
      <Filter size={15} />
      <select aria-label={ariaLabel} className="w-full bg-transparent outline-none" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function ProjectDetailPage({
  projectId,
  funds,
  onMasterChanged,
  currentRole,
  onWorkflowRefresh,
  materialApiRecords,
  materials,
  projects,
  tasksByProject,
  onProjectTaskCreate,
  onProjectTaskUpdate,
  reports,
  meetings,
  capitalRecords,
  auditEvents,
  onMeetingConfirm,
  onAuditEventCreate,
  onProjectStageUpdate,
}: {
  projectId:string;
  funds:Fund[];
  onMasterChanged:()=>Promise<void>;
  currentRole?:ApiSessionUser['role'];
  onWorkflowRefresh: () => Promise<void>;
  materials: MaterialRecord[];
  materialApiRecords: ApiMaterialRecord[];
  projects: Project[];
  tasksByProject: Record<string, ProjectTask[]>;
  onProjectTaskCreate: (projectId: string, task: ProjectTask) => Promise<ProjectTask | undefined>;
  onProjectTaskUpdate: (projectId: string, taskId: string, patch: Partial<Omit<ProjectTask, "id">>) => Promise<ProjectTask | undefined>;
  reports: ReportRecord[];
  meetings: MeetingRecord[];
  capitalRecords: CapitalItem[];
  auditEvents: AuditEvent[];
  onMeetingConfirm: (meeting: MeetingRecord) => Promise<MeetingRecord | undefined>;
  onAuditEventCreate: (event: AuditEvent) => void;
  onProjectStageUpdate: (projectId: string, nextStage: string, previousStage: string) => Promise<AuditEvent | undefined>;
}) {
  const project = projects.find((item) => item.id === projectId);
  const [tab,setCurrentTab]=useState(()=>projectView(new URLSearchParams(window.location.search).get('tab')));
  const [routeContext,setRouteContext]=useState(()=>window.location.search+window.location.hash);
  const [auditOpen,setAuditOpen]=useState(()=>new URLSearchParams(window.location.search).get('tab')==='审计日志');
  const archiveEditing=useRef({dirty:false,busy:false});
  const trackArchiveEditing=useCallback((value:{dirty:boolean;busy:boolean})=>{archiveEditing.current=value;},[]);
  const [navigationNotice,setNavigationNotice]=useState('');
  const canLeave=async()=>{if(archiveEditing.current.busy){setNavigationNotice('当前表单正在提交，请等待完成后切换。');return false;}return !archiveEditing.current.dirty||await confirmAction('当前表单有未保存内容，是否放弃修改并切换？');};
  const [prepareDiligence,setPrepareDiligence]=useState<string|null>(null);
  const setTab=async(value:string,prepare=false)=>{
    if(value==='审计日志'){setAuditOpen(true);return;}
    const next=projectView(value);if(next===tab||!await canLeave())return;setPrepareDiligence(prepare?projectId:null);setNavigationNotice('');setCurrentTab(next);
    const query=new URLSearchParams(window.location.search);query.set('tab',next);
    window.history.pushState({},'',window.location.pathname+'?'+query.toString());setRouteContext(window.location.search+window.location.hash);
  };
  useEffect(()=>registerRouteGuard({allow:canLeave,restoreUrl:()=>`/projects/${encodeURIComponent(projectId)}`+routeContext}),[projectId,routeContext]);
  useEffect(()=>{
    const sync=()=>{if(window.location.pathname!==`/projects/${encodeURIComponent(projectId)}`)return;const value=new URLSearchParams(window.location.search).get('tab');setCurrentTab(projectView(value));setRouteContext(window.location.search+window.location.hash);setAuditOpen(value==='审计日志');setNavigationNotice('');};
    window.addEventListener(routeCommittedEvent,sync);return()=>window.removeEventListener(routeCommittedEvent,sync);
  },[projectId]);

  const [reviewRefresh,setReviewRefresh]=useState(0);
  const refreshProjectWorkflow=async()=>{try{await onWorkflowRefresh();}finally{setReviewRefresh(value=>value+1);}};
  const [stage, setStage] = useState(project?.stage ?? "初筛");
  const [editingMaster,setEditingMaster]=useState<{id:string;token:string}|null>(null),[companyOpen,setCompanyOpen]=useState<string|null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [taskModal, setTaskModal] = useState<Partial<ProjectTask> | null>(null);
  const tasks = project ? tasksByProject[project.id] ?? [] : [];

  useEffect(() => {
    if (project) setStage(project.stage);
  }, [project?.id, project?.stage]);

  if (!project) return <Card className="p-5"><p role="status">未找到该项目，或系统尚未返回项目资料。</p></Card>;

  const addTask = async (task: ProjectTask) => {
    const createdTask = await onProjectTaskCreate(project.id, task);
    if (!createdTask) return;

    setTaskModal(null);
    setTab("任务待办");
  };

  return (
    <div className="project-archive-workspace">
      <SectionHeader
        title="项目档案"
        action={<div className="project-archive-page-actions">{canEditProjectMaster(currentRole)&&Number.isInteger(project.masterRevision)?<button type="button" data-ui="secondary" onClick={()=>setEditingMaster({id:project.id,token:crypto.randomUUID()})}><PenLine size={15}/>编辑项目资料</button>:null}<button type="button" data-ui="primary" onClick={() => navigate("/projects")}><ArrowLeft size={16}/>返回项目账本</button></div>}
      />
      {companyOpen===project.companyId&&project.companyId?<CompanyRecordDialog key={project.companyId} companyId={project.companyId} currentRole={currentRole} onClose={()=>setCompanyOpen(current=>current===project.companyId?null:current)} onChanged={onMasterChanged}/>:null}
      <Card className="iteration-b-project-shell project-detail-shell mb-6 overflow-hidden">
        <ProjectReviewStrip projectId={project.id} revision={project.masterRevision} refreshToken={reviewRefresh}/>
        <ProjectHeaderA onCompanyOpen={Number.isInteger(project.masterRevision)&&project.companyId?()=>setCompanyOpen(project.companyId??null):undefined} companyAction={Number.isInteger(project.masterRevision)&&project.companyId?<button type="button" data-ui="secondary" onClick={()=>setCompanyOpen(project.companyId??null)}><Link2 size={15}/>关联企业档案</button>:null} project={project} stage={stage} stages={stages} onOpen={setTab} logs={logs} badges={<><Badge tone="gold">{projectLifecycleLabel(project)}·{stage}</Badge><RiskBadge level={project.risk}/></>}/>
        <ProjectModuleNavigation view={tab} onOpen={setTab}/>
        <ProjectArchiveSummary projectId={project.id} view={tab} revision={project.masterRevision} refreshToken={reviewRefresh} onOpen={setTab}/>
        {navigationNotice?<p role="status" className="text-sm text-[var(--danger)]">{navigationNotice}</p>:null}
        <div className="project-module-content" data-project-view={tab} key={`${project.id}-${tab}-${routeContext}`}>
          {tab === "决策支持" ? <ScopedReportsWorkspace target={{id:project.id,name:project.name,type:'project'}} decision projects={projects} onChanged={onMasterChanged}/> : tab === "风险监控" ? <ManualRiskWorkspace projects={[project]} onChanged={onMasterChanged}/> : tab === "资料文件" ? <ScopedMaterialsWorkspace project={project} projects={projects} onChanged={async()=>{try{await onMasterChanged();}finally{setReviewRefresh(value=>value+1);}}}/> : tab === "AI 助手" ? <div className="space-y-4"><p>基于当前项目原件与业务记录进行分析，写入前核对办理确认卡。</p><button data-ui="primary" onClick={()=>navigate('/ai-assistant?prompt='+encodeURIComponent(`请处理项目“${project.name}”（ID：${project.id}），先查阅已归档原件和业务状态，列出缺件及下一步可办理事项。`))}>进入当前项目 AI 对话</button></div> : ["投后经营", "走访记录", "期间档案", "履约预警", "报告记录"].includes(tab) ? <><PostInvestmentWorkspace funds={funds} key={`${project.id}-${tab}`} project={project} view={tab} onChanged={refreshProjectWorkflow} />{tab==="报告记录"?<details className="project-support-details"><summary>通用报告与投决报告</summary><section aria-label="既有通用报告"><ScopedReportsWorkspace target={{id:project.id,name:project.name,type:'project'}} projects={projects} onChanged={onMasterChanged}/></section></details>:null}</> : ["投资信息", "协议条款"].includes(tab) ? <DealPanel key={project.id} project={project} currentRole={currentRole} onChanged={refreshProjectWorkflow} /> : tab === "三会审批" ? <ProjectApprovalPanel project={project} onEditingChange={trackArchiveEditing} onChanged={refreshProjectWorkflow} /> : tab === "尽调分析" ? <DiligencePanel key={project.id} project={project} prepareOnOpen={prepareDiligence===project.id} onEditingChange={trackArchiveEditing} onChanged={refreshProjectWorkflow} /> : tab === "任务待办" ? <WorkflowTaskBoard projects={projects} projectId={project.id} onChanged={refreshProjectWorkflow} /> : renderProjectTab(tab, project, {
            openProjectTab:setTab,
            nextAction:<ProjectNextAction projectId={project.id} masterNote={project.nextAction} tasks={tasks} currentRole={currentRole} onOpenTab={setTab}/>,
            stage,
            currentRole,
            projects,
            materials: selectProjectMaterialRecords(project, materials, materialApiRecords,isLocalBusinessStateMode()),
            materialApiRecords,
            tasks,
            reports,
            meetings,
            capitalRecords,
            auditEvents,
            onTaskCreate: onProjectTaskCreate,
            onTaskUpdate: onProjectTaskUpdate,
            openTaskModal: setTaskModal,
            onMeetingConfirm,
            onAuditEventCreate,
          })}
        </div>
      </Card>
      {editingMaster?.id===project.id?<ProjectMasterEditor key={editingMaster.token} project={project} onClose={()=>setEditingMaster(current=>current===editingMaster?null:current)} onSaved={async()=>{await onMasterChanged();setEditingMaster(current=>current===editingMaster?null:current);}}/>:null}
      {auditOpen?<WorkflowDialog title="项目操作记录" busy={false} onClose={()=>setAuditOpen(false)}><ProjectAuditWorkspace project={project} auditEvents={auditEvents}/></WorkflowDialog>:null}
      <TaskModal
        seed={taskModal}
        onClose={() => setTaskModal(null)}
        onSave={addTask}
      />
    </div>
  );
}

function renderProjectTab(
  tab: string,
  project: Project,
  context: {
    nextAction:React.ReactNode;
    openProjectTab:(tab:string)=>void;
    stage: string;
    currentRole?:string;
    projects: Project[];
    materials: MaterialRecord[];
    materialApiRecords: ApiMaterialRecord[];
    tasks: ProjectTask[];
    reports: ReportRecord[];
    meetings: MeetingRecord[];
    capitalRecords: CapitalItem[];
    auditEvents: AuditEvent[];
    onTaskCreate: (projectId: string, task: ProjectTask) => Promise<ProjectTask | undefined>;
    onTaskUpdate: (projectId: string, taskId: string, patch: Partial<Omit<ProjectTask, "id">>) => Promise<ProjectTask | undefined>;
    openTaskModal: (seed: Partial<ProjectTask>) => void;
    onMeetingConfirm: (meeting: MeetingRecord) => Promise<MeetingRecord | undefined>;
    onAuditEventCreate: (event: AuditEvent) => void;
  },
) {
  if (project.dataOrigin === "user_input" && ["投资信息", "协议条款", "尽调分析", "决策支持", "AI 助手"].includes(tab)) return <p role="status">该项目尚无已确认的{tab}记录。</p>;
  if (tab === "项目概览") {
    return <ProjectOverviewA project={project} onOpen={context.openProjectTab} nextAction={context.nextAction} fields={<><CustomFieldDetails data={project}/>{project.dataOrigin === "user_input"?<DetailGrid rows={[["项目负责人",project.manager],["协同人员",project.collaborators||"未填写"],["项目来源",project.sourceChannel||"未填写"]]}/>:null}</>}/>;
  }
  if (tab === "投资信息") {
    const rows = [
      ["总投资金额", "1 亿元"],
      ["已投金额", "3000 万"],
      ["剩余金额", "7000 万"],
      ["持股比例", "8.5%"],
      ["投资日期", "2026-04-27"],
      ["管理费规则", "年化 2%，按日计费"],
    ];
    return <DetailGrid rows={rows} />;
  }
  if (tab === "资料目录") {
    return <ProjectMaterialDirectory project={project} materials={context.materials} apiMaterials={isLocalBusinessStateMode()?undefined:context.materialApiRecords} projects={context.projects} />;
  }
  if (tab === "协议条款") {
    return (
      <ProjectClauseWorkspace
        project={project}
        projects={context.projects}
        onTaskCreate={context.onTaskCreate}
        onAuditEventCreate={context.onAuditEventCreate}
      />
    );
  }
  if (tab === "资料文件") {
    return <MaterialWorkspace projectId={project.id} materialApiRecords={context.materialApiRecords.filter((material) => material.projectId === project.id || material.relationships?.projects.some((relation) => relation.id === project.id))} projectName={project.name} projects={context.projects} openTaskModal={context.openTaskModal} />;
  }
  if (tab === "任务待办") {
    return <TaskWorkspace projectId={project.id} tasks={context.tasks} onTaskUpdate={context.onTaskUpdate} openTaskModal={context.openTaskModal} />;
  }
  if (tab === "报告记录") {
    return <MiniReportList project={project} reports={context.reports} />;
  }
  if (tab === "风险监控") {
    return (
      <ProjectRiskWorkspace
        project={project}
        projects={context.projects}
        onTaskCreate={context.onTaskCreate}
        onAuditEventCreate={context.onAuditEventCreate}
      />
    );
  }
  if (tab === "会议纪要") {
    return <div className="space-y-4"><div className="project-inline-actions">{['admin','post_investment'].includes(context.currentRole??'')?<button data-action="create" data-ui="primary" onClick={()=>navigate('/meetings?projectId='+encodeURIComponent(project.id)+'&create=1')}>创建本项目会议纪要</button>:null}<button data-ui="secondary" onClick={()=>navigate('/meetings?projectId='+encodeURIComponent(project.id))}>管理纪要 / 删除恢复</button></div><ProjectMeetingWorkspace
        project={project}
        meetings={context.meetings}
        onConfirm={context.onMeetingConfirm}
      /></div>;
  }
  if (tab === "资金事项") {
    return <div className="space-y-4"><div className="project-inline-actions">{['admin','finance'].includes(context.currentRole??'')?<button data-action="create" data-ui="primary" onClick={()=>navigate('/capital?projectId='+encodeURIComponent(project.id)+'&create=1')}>创建本项目资金事项</button>:null}<button data-ui="secondary" onClick={()=>navigate('/capital?projectId='+encodeURIComponent(project.id))}>管理资金事项</button></div><CapitalSummary project={project} capitalRecords={context.capitalRecords} /></div>;
  }
  if (tab === "审计日志") {
    return <ProjectAuditWorkspace project={project} auditEvents={context.auditEvents} />;
  }
  return (
    <div className="space-y-4">
      <ContextBar task="项目问答" />
      <div className="rounded-lg border border-gold/20 bg-gold/10 p-5">
      <p className="mb-3 text-sm font-semibold text-gold">用户：总结一下这个项目当前状态</p>
      <p className="leading-7 text-slate-700">
        项目已完成首笔 3000 万投资，目前处于投后管理阶段。当前主要关注点包括行业增速放缓、知识产权变更和后续管理费计收。
        建议下一步确认企业二季度经营数据，并生成月度监控报告。
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Badge tone="gold">来源：项目档案</Badge>
        <Badge tone="gold">来源：风险监控</Badge>
        <Badge tone="gold">来源：资金事项</Badge>
      </div>
      </div>
    </div>
  );
}

function InfoBlock({ title, content, className = "" }: { title: string; content: string; className?: string }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-slate-50 p-4 ${className}`}>
      <p className="mb-2 text-sm font-semibold text-navy">{title}</p>
      <p className="text-sm leading-7 text-slate-600">{content}</p>
    </div>
  );
}

function DetailGrid({ rows }: { rows: string[][] }) {
  return (
    <dl className="detail-grid">
      {rows.map(([label, value]) => (
        <div key={label} className={value.length > 18 ? "detail-field detail-field-prose" : "detail-field"}>
          <dt>{label}</dt>
          <dd>{value || "未填写"}</dd>
        </div>
      ))}
    </dl>
  );
}

function FileList({ items }: { items: string[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {items.map((item) => (
        <div key={item} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <FolderOpen className="text-gold" size={20} />
            <span className="font-medium text-slate-700">{item}</span>
          </div>
          <Badge tone="slate">已归档</Badge>
        </div>
      ))}
    </div>
  );
}

function MaterialWorkspace({
  projectId,
  materialApiRecords,
  projectName,
  projects,
  openTaskModal,
}: {
  projectId: string;
  projectName: string;
  materialApiRecords: ApiMaterialRecord[];
  projects: Project[];
  openTaskModal: (seed: Partial<ProjectTask>) => void;
}) {
  const [selectedCategory, setSelectedCategory] = useState("全部资料");
  const [closedGaps, setClosedGaps] = useState<string[]>([]);
  const categoryOptions = ["全部资料", ...new Set([...materialCategories, ...materialApiRecords.map(material => material.type).filter(Boolean)])];
  const currentProject = projects.find((project) => project.id === projectId);
  const confirmedGaps = currentProject?.dataOrigin === "user_input" ? [] : materialGaps;
  const visibleMaterials =
    selectedCategory === "全部资料"
      ? materialApiRecords
      : materialApiRecords.filter(material => material.type === selectedCategory);
  const materialListEstimate = useMemo(
    () =>
      estimateVirtualListHeights(
        visibleMaterials.map(({name, type, uploader, time, source, status}) => `${name} ${type} ${uploader} ${time} ${source} ${status}`),
        {
          font: TEXT_LAYOUT_FONTS.body,
          maxWidth: 360,
          lineHeight: 24,
          rowChrome: 48,
        },
      ),
    [visibleMaterials],
  );

  return (
    <div className="grid gap-5 xl:grid-cols-[220px_1fr_320px]">
      <div className="rounded-xl border border-[#2b3139] bg-[#11161d] p-4">
        <p className="mb-3 text-sm font-semibold text-[#eaecef]">资料分类</p>
        <div className="space-y-2">
          {categoryOptions.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`w-full rounded-md px-3 py-2 text-left text-sm transition ${
                selectedCategory === category ? "bg-gold text-[#181a20]" : "text-[#929aa5] hover:bg-[#1e2329] hover:text-gold"
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-[#2b3139] bg-[#11161d] p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-[#eaecef]">已上传资料</p>
          <SecondaryButton onClick={() => navigate("/materials")}>上传 / 管理版本</SecondaryButton>
        </div>
        <ul className="mb-3 space-y-2">{materialApiRecords.filter((material) => material.originalFilePath).map((material) => <li key={material.id} className="text-sm"><a data-ui="info" href={`/${material.originalFilePath}`} target="_blank" rel="noreferrer" className="text-gold">下载原件：{material.name}{material.currentVersion ? `（V${material.currentVersion}）` : ""}</a></li>)}</ul>
        <Table headers={["文件名称", "资料类型", "上传人", "上传时间", "来源", "AI 摘要状态", "引用次数"]}>
          {visibleMaterials.map(({id, name, type, uploader, time, source, status, quotes}, index) => (
            <tr
              key={id}
              style={{ height: Math.ceil(materialListEstimate.itemHeights[index] ?? 72) }}
              data-pretext-estimated-row-height={Math.ceil(materialListEstimate.itemHeights[index] ?? 72)}
            >
              <td className="px-4 py-4 font-semibold text-navy">{name}</td>
              <td className="px-4 py-4 text-slate-600">{type}</td>
              <td className="px-4 py-4 text-slate-600">{uploader}</td>
              <td className="number-font px-4 py-4 text-slate-500">{time}</td>
              <td className="px-4 py-4 text-slate-600">{source}</td>
              <td className="px-4 py-4"><StatusBadge status={status} /></td>
              <td className="number-font px-4 py-4 text-gold">{quotes}</td>
            </tr>
          ))}
        </Table>
        {visibleMaterials.length === 0 ? (
          <div className="rounded-b-xl border-x border-b border-[#2b3139] bg-[#1e2329] px-4 py-8 text-center text-sm text-[#707a8a]">
            当前项目没有该类型资料。
          </div>
        ) : null}
      </div>
      <div className="rounded-xl border border-[#2b3139] bg-[#11161d] p-4">
        <p className="mb-3 text-sm font-semibold text-[#eaecef]">资料缺口 / 补充任务</p>
        {confirmedGaps.length === 0 ? <p className="text-sm text-[#929aa5]">该项目暂无已确认的资料缺口任务。</p> : null}
        <div className="space-y-3">
          {confirmedGaps.map((gap) => {
            const done = closedGaps.includes(gap);
            return (
              <div key={gap} className="rounded-lg border border-[#2b3139] bg-[#1e2329] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[#eaecef]">{gap}</p>
                    <p className="mt-1 text-xs text-[#707a8a]">关联项目：{projectName}</p>
                  </div>
                  <StatusBadge status={done ? "已完成" : "待补充"} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button data-ui="primary"
                    onClick={() => {
                      const project = currentProject;
                      if (!project) return;
                      openTaskModal(createMaterialGapTask(gap, project, shanghaiCalendarDate()));
                    }}
                    className="rounded bg-gold px-2.5 py-1.5 text-xs font-semibold text-[#181a20]"
                  >
                    生成补资料任务
                  </button>

                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type MaterialReviewState = {
  relationConfirmed?: boolean;
  archived?: boolean;
};

type MaterialRowContext = {
  row: MaterialDirectoryRow;
  key: string;
  material?: ApiMaterialRecord;
  record?: MaterialRecord;
  entry?: MaterialKnowledgeEntry;
  source: "database" | "source-material";
};

function MaterialsPage({
  initialCategory = "全部资料",
  projects,
  materials,
  materialApiRecords,
  onMaterialsRefresh,
  onMaterialArchiveConfirm,
}: {
  initialCategory?: string;
  projects: Project[];
  materials: MaterialRecord[];
  materialApiRecords: ApiMaterialRecord[];
  onMaterialsRefresh: () => Promise<void>;
  onMaterialArchiveConfirm: (payload: MaterialArchivePayload) => Promise<ApiMaterialRecord | undefined>;
}) {
  const { entries: sourceMaterialKnowledgeEntries } = useMaterialKnowledge();
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [selectedMaterialKey,setSelectedMaterialKey]=useState(''),[materialPage,setMaterialPage]=useState(0),[materialPageSize,setMaterialPageSize]=useState(15);
  const [selectedFund, setSelectedFund] = useState("全部基金");
  const [selectedStage, setSelectedStage] = useState("全部阶段");
  const [relationScope, setRelationScope] = useState<MaterialRelationScope>("全部关系");
  const [projectQuery, setProjectQuery] = useState("");
  const [viewMode, setViewMode] = useState<"文件列表" | "目录树">("文件列表");
  useEffect(()=>setMaterialPage(0),[selectedCategory,selectedFund,selectedStage,relationScope,projectQuery,materialPageSize]);
  const [extractionSummaries,setExtractionSummaries] = useState<Record<string,string>>({});
  const onExtractionSummary = useCallback((id:string,summary:string) => {
    setExtractionSummaries(current => current[id] === summary ? current : {...current,[id]:summary});
  },[]);
  const [uploadOpen, setUploadOpen] = useState(()=>new URLSearchParams(window.location.search).get('upload')==='1');
  const [uploadProjectId,setUploadProjectId]=useState(()=>new URLSearchParams(window.location.search).get('projectId')??'');
  const closeUpload=()=>{setUploadOpen(false);const url=new URL(window.location.href);url.searchParams.delete('upload');url.searchParams.delete('projectId');window.history.replaceState({},'',url.pathname+url.search);};
  useEffect(()=>{const open=()=>{const query=new URLSearchParams(window.location.search);if(query.get('upload')==='1'){setUploadProjectId(query.get('projectId')??'');setUploadOpen(true);}};window.addEventListener('popstate',open);return()=>window.removeEventListener('popstate',open);},[]);
  const [versionMaterial, setVersionMaterial] = useState<ApiMaterialRecord | null>(null);
  useEffect(()=>{const select=()=>{const id=new URLSearchParams(window.location.search).get('materialId');if(!id)return;const record=materialApiRecords.find(m=>m.id===id);if(record){setSelectedMaterialKey(record.id);setVersionMaterial(record);setSelectedCategory('全部资料');setProjectQuery('');}};select();window.addEventListener('popstate',select);return()=>window.removeEventListener('popstate',select);},[materialApiRecords]);

  const [uploadNotice, setUploadNotice] = useState<{ tone: "success" | "error"; message: string; materials?:ApiMaterialRecord[] } | null>(null);
  const [reviewContext, setReviewContext] = useState<MaterialRowContext | null>(null);
  const [reviewDraft, setReviewDraft] = useState<MaterialReviewDraft | null>(null);
  const [materialReviewStates, setMaterialReviewStates] = useState<Record<string, MaterialReviewState>>({});
  const categories = ["全部资料", ...materialCategories];
  const apiFundOptions = Array.from(
    new Set(materialApiRecords.flatMap((material) => material.relationships?.funds.map((fund) => fund.name) ?? [])),
  );
  const fundOptions = ["全部基金", ...Array.from(new Set([...apiFundOptions, ...funds.map((fund) => fund.name)]))];
  const stageOptions = ["全部阶段", ...Array.from(new Set(projects.map((project) => project.stage)))];
  const relationScopeOptions: MaterialRelationScope[] = ["全部关系", "基金", "项目", "被投公司", "投资人"];
  const materialKnowledgeByRecordKey = useMemo(
    () =>
      new Map(
        sourceMaterialKnowledgeEntries.map((entry) => [
          createMaterialRecordEvidenceKey(entry.materialRecord),
          entry,
        ]),
      ),
    [sourceMaterialKnowledgeEntries],
  );
  const materialKnowledgeById = useMemo(
    () => new Map(sourceMaterialKnowledgeEntries.map((entry) => [entry.id, entry])),
    [sourceMaterialKnowledgeEntries],
  );
  const materialKnowledgeByFileName = useMemo(
    () => new Map(sourceMaterialKnowledgeEntries.map((entry) => [entry.fileName, entry])),
    [sourceMaterialKnowledgeEntries],
  );
  const visibleApiMaterials = filterApiMaterials(
    materialApiRecords,
    {
      category: selectedCategory,
      projectQuery,
      fundName: selectedFund,
      stage: selectedStage,
      relationScope,
    },
    projects,
  );
  const visibleMaterials = filterMaterials(
    materials,
    {
      category: selectedCategory,
      projectQuery,
      fundName: selectedFund,
      stage: selectedStage,
      relationScope,
    },
    projects,
  );
  const archivedSourceMaterialIds = new Set(materialApiRecords.map((material) => material.sourceMaterialId).filter(Boolean));
  const archivedMaterialNames = new Set(materialApiRecords.map((material) => material.name));
  const visibleSourceMaterials = visibleMaterials.filter((record) => {
    const entry = materialKnowledgeByRecordKey.get(createMaterialRecordEvidenceKey(record));
    if (entry?.id && archivedSourceMaterialIds.has(entry.id)) return false;
    return !archivedMaterialNames.has(record[0]);
  });
  const apiRows = createApiMaterialDirectoryRows(visibleApiMaterials, projects);
  const sourceRows = createMaterialDirectoryRows(visibleSourceMaterials, projects);
  const materialRowContexts: MaterialRowContext[] = [
    ...apiRows.map((row, index) => {
      const material = visibleApiMaterials[index];
      const entry = material.currentVersion ? undefined : materialKnowledgeById.get(material.sourceMaterialId ?? "") ?? materialKnowledgeByFileName.get(material.name);
      return {
        row,
        key: material.sourceMaterialId ?? material.id,
        material,
        entry,
        source: "database" as const,
      };
    }),
    ...sourceRows.map((row, index) => {
      const record = visibleSourceMaterials[index];
      const entry = materialKnowledgeByRecordKey.get(createMaterialRecordEvidenceKey(record));
      return {
        row,
        key: entry?.id ?? createMaterialRecordEvidenceKey(record),
        record,
        entry,
        source: "source-material" as const,
      };
    }),
  ];
  const directoryRows = materialRowContexts.map(context => ({...context.row,recordKey:context.material?.id ?? context.key,relationships:context.material?.relationships}));
  const selectedContext=materialRowContexts.find(context=>context.key===selectedMaterialKey||context.material?.id===selectedMaterialKey)??materialRowContexts[0];
  const currentMaterialPage=Math.min(materialPage,Math.max(0,Math.ceil(materialRowContexts.length/materialPageSize)-1));
  const selectedEvidence=selectedContext?createMaterialPreviewEvidenceLinks(selectedContext.entry,selectedContext.material,selectedContext.row):[];
  const visibleMaterialCount = materialRowContexts.length;
  const openMaterialPreview = (context: MaterialRowContext) => {
    setReviewContext(context);
    setReviewDraft(createMaterialReviewDraft({ row: context.row, entry: context.entry, material: context.material, funds, projects }));
    setUploadNotice(null);
  };
  const updateReviewDraft = (patch: Partial<MaterialReviewDraft>) => {
    setReviewDraft((current) => (current ? { ...current, ...patch } : current));
  };
  const confirmReviewOwnership = () => {
    if (!reviewContext) return;
    setMaterialReviewStates((current) => ({
      ...current,
      [reviewContext.key]: { ...current[reviewContext.key], relationConfirmed: true },
    }));
  };
  const confirmReviewArchive = async () => {
    if (!reviewContext || !reviewDraft) return;
    const payload = createMaterialArchivePayload({
      row: reviewContext.row,
      entry: reviewContext.entry,
      material: reviewContext.material,
      draft: reviewDraft,
    });
    const material = await onMaterialArchiveConfirm(payload);
    if (!material) {
      setUploadNotice({ tone: "error", message: "资料未写入系统，请检查系统状态后重试。" });
      return;
    }

    setMaterialReviewStates((current) => ({
      ...current,
      [reviewContext.key]: { relationConfirmed: true, archived: true },
    }));
    setReviewContext(null);
    setReviewDraft(null);
    setUploadNotice({ tone: "success", message: `资料已确认入库：${material.name}` });
  };
  return (
    <div className="materials-workspace materials-c">
      <SectionHeader title="资料库" eyebrow="归档 / 检索" action={<div className="material-header-actions"><DeletedRecordsButton kind="material" /><PrimaryButton creation onClick={() => { setUploadNotice(null); setUploadOpen(true); }}><Upload size={16} />上传</PrimaryButton></div>} />
      <div className="material-c-filters" aria-label="资料筛选">
        <label className="material-library-search"><Search size={16} aria-hidden="true"/><input value={projectQuery} onChange={event=>setProjectQuery(event.target.value)} aria-label="按项目、文件或归档路径搜索资料" placeholder="搜索项目、文件或路径"/></label>
        <Select ariaLabel="资料类型" value={selectedCategory} onChange={setSelectedCategory} options={categories}/>
        <Select ariaLabel="筛选基金" value={selectedFund} onChange={setSelectedFund} options={fundOptions}/>
        <Select ariaLabel="筛选阶段" value={selectedStage} onChange={setSelectedStage} options={stageOptions}/>
        <Select ariaLabel="资料关联范围" value={relationScope} onChange={value=>setRelationScope(value as MaterialRelationScope)} options={relationScopeOptions}/>
      </div>
      <MaterialReviewTicker materials={visibleApiMaterials} unreviewed={materialRowContexts.filter(c=>!c.material).map(c=>({materialId:c.key,name:c.row.name}))} onOpen={id=>{const context=materialRowContexts.find(c=>c.material?.id===id||c.key===id);if(context){setSelectedMaterialKey(context.key);setMaterialPage(Math.floor(materialRowContexts.indexOf(context)/materialPageSize));if(context.material)setVersionMaterial(context.material);else openMaterialPreview(context);}}}/>
      <div className="material-c-body">
        <section className="material-register" aria-label="资料列表">
          <div className="material-register-views"><div role="group" aria-label="资料视图">{(['文件列表','目录树'] as const).map(mode=><button key={mode} className={viewMode===mode?'ui-primary h-10':'ui-secondary h-10'} data-ui={viewMode===mode?'primary':'secondary'} aria-pressed={viewMode===mode} onClick={()=>setViewMode(mode)}>{mode}</button>)}</div></div>
          {uploadNotice ? <p role="status" className="material-upload-notice" data-tone={uploadNotice.tone}>{uploadNotice.message}{uploadNotice.materials?.map(material=><span key={material.id} className="ml-3 inline-flex flex-wrap items-center gap-2">{!directoryRows.some(row=>row.recordKey===material.id)?<span>当前筛选不包含此原件。</span>:null}<button type="button" data-ui="info" onClick={()=>setVersionMaterial(material)}>查看已上传原件：{material.name}</button></span>)}</p> : null}
          <div className="material-register-content">
          {viewMode === '文件列表' ? <Table headers={['文件','关联对象','状态 / 正文','选择']}>
            {materialRowContexts.slice(currentMaterialPage*materialPageSize,(currentMaterialPage+1)*materialPageSize).map((context,index) => {
              const archived = context.source === 'database' || materialReviewStates[context.key]?.archived;
              const relationConfirmed = archived || materialReviewStates[context.key]?.relationConfirmed;
              return <tr key={`${context.key}-${index}`} data-selected={selectedContext?.key===context.key} onClick={event=>{if (!(event.target as HTMLElement).closest('button,a,input,select') && !window.getSelection()?.toString()) setSelectedMaterialKey(context.key);}}>
                <td><div className="material-file-entry"><MaterialFileIcon name={context.row.name} /><div className="material-file-copy">
                  <button className="material-file-name" onClick={() => setSelectedMaterialKey(context.key)} aria-pressed={selectedContext?.key===context.key} aria-label={`查看资料详情：${context.row.name}`}>{context.row.name}</button>
                  <p className="material-file-source">{context.row.source} · {context.row.uploader} · {context.row.time}</p>
                  <div className="material-file-badges"><Badge tone="navy">{context.row.type}</Badge><DataOriginBadge origin={context.row.dataOrigin} purpose={context.row.dataPurpose} /></div>{context.material && extractionSummaries[context.material.id] ? <p className="material-file-extraction">{extractionSummaries[context.material.id]}</p> : null}
                </div></div></td>
                <td><div className="material-ownership"><Badge tone="gold">{context.row.relationScope ?? '待确认'}</Badge><button onClick={() => navigate(context.material?.projectId ? `/projects/${context.material.projectId}` : getProjectPath(context.row.project,projects))}>{context.row.project}</button><p className="material-relation-summary">{context.row.relationSummary ?? context.row.fund}</p><p className="material-archive-path">{context.row.path}</p></div></td>
                <td><div className="material-record-status"><StatusBadge status={context.row.status} /><p>引用 {context.row.quotes} 次</p><Badge tone={archived ? 'green' : relationConfirmed ? 'gold' : 'orange'}>{archived ? '已入库' : relationConfirmed ? '已确认' : '待确认'}</Badge></div></td>
                <td><button className="material-detail-trigger ui-primary h-10" data-ui="primary" type="button" aria-pressed={selectedContext?.key===context.key} aria-label={`选中资料：${context.row.name}`} onClick={()=>setSelectedMaterialKey(context.key)}><span>详情</span><ChevronRight size={14}/></button></td>
              </tr>;
            })}
          </Table> : <MaterialDirectoryTree rows={directoryRows} projects={projects} selectedKey={selectedContext?.material?.id ?? selectedContext?.key} onSelect={setSelectedMaterialKey} />}
          {directoryRows.length === 0 ? <div className="material-library-empty"><FolderOpen size={28} /><h3>未找到匹配的资料</h3><p>可调整分类、归属、基金、阶段或搜索关键词。</p><button data-ui="secondary" onClick={() => {setSelectedCategory('全部资料');setSelectedFund('全部基金');setSelectedStage('全部阶段');setRelationScope('全部关系');setProjectQuery('');}}>重置筛选</button></div> : null}
          </div>
          {viewMode==='文件列表'?<nav className="material-c-pagination" aria-label="资料分页"><span>共 {visibleMaterialCount} 份 · 第 {currentMaterialPage+1} / {Math.max(1,Math.ceil(visibleMaterialCount/materialPageSize))} 页</span><div><button data-ui="secondary" type="button" disabled={!currentMaterialPage} onClick={()=>setMaterialPage(currentMaterialPage-1)}>上一页</button><button data-ui="secondary" type="button" disabled={(currentMaterialPage+1)*materialPageSize>=visibleMaterialCount} onClick={()=>setMaterialPage(currentMaterialPage+1)}>下一页</button><select aria-label="每页资料数" value={materialPageSize} onChange={event=>setMaterialPageSize(Number(event.target.value))}>{[15,20,50].map(size=><option key={size} value={size}>{size}份/页</option>)}</select></div></nav>:null}
        </section>
        {selectedContext?<MaterialDetailPane key={selectedContext.key} row={selectedContext.row} material={selectedContext.material} excerpt={selectedContext.entry?.summary} originalHref={selectedEvidence.find(link=>link.kind==='original_document')?.href} onVersions={selectedContext.material?()=>setVersionMaterial(selectedContext.material!):undefined} onReview={()=>openMaterialPreview(selectedContext)} actions={selectedContext.material?<DeleteRecordButton kind="material" id={selectedContext.material.id} title={selectedContext.row.name}/>:null}/>:<aside className="material-c-detail"><h2>资料详情</h2><p className="material-c-note">当前筛选没有资料，可调整筛选或上传原件。</p></aside>}
      </div>
      {uploadOpen ? (
        <MaterialUploadDialog initialProjectId={projects.some(p=>p.id===uploadProjectId)?uploadProjectId:undefined} categories={materialCategories} projects={projects} onClose={closeUpload} onUploaded={materials=>setUploadNotice({tone:"success",message:"✓ 原件及项目关联已保存，现有筛选保留。",materials})} onSaved={async () => { await onMaterialsRefresh(); closeUpload(); }} />
      ) : null}
      {versionMaterial ? (
        <MaterialVersionDialog material={versionMaterial} projects={projects} onClose={() => {setVersionMaterial(null);const url=new URL(window.location.href);url.searchParams.delete('materialId');window.history.replaceState({},'',url.pathname+url.search);}} onSaved={onMaterialsRefresh} />
      ) : null}
      {reviewContext && reviewDraft ? (
        <MaterialReviewModal
          context={reviewContext}
          draft={reviewDraft}
          projects={projects}
          onDraftChange={updateReviewDraft}
          onClose={() => {
            setReviewContext(null);
            setReviewDraft(null);
          }}
          onConfirmOwnership={confirmReviewOwnership}
          onConfirmArchive={confirmReviewArchive}
          state={materialReviewStates[reviewContext.key]}
        />
      ) : null}
    </div>
  );
}

function MaterialReviewActions({
  context,
  state,
  onReview,
}: {
  context: MaterialRowContext;
  state?: MaterialReviewState;
  onReview: () => void;
}) {
  const archived = context.source === "database" || state?.archived;
  const primaryPreviewLink = createMaterialPrimaryPreviewLink({
    entry: context.entry,
    material: context.material,
    row: context.row,
  });

  return (
    <div className="material-preview-actions">
      <div className="material-preview-links">
        {context.material?.generatedDocumentHref?<a data-ui="secondary" href={context.material.generatedDocumentHref} target="_blank" rel="noreferrer" aria-label={`下载生成副本：${context.row.name}`}>下载生成副本</a>:null}
        {context.material?.currentVersion && context.material.originalFilePath && /\.(png|jpe?g)$/i.test(context.material.name) ? <MaterialOriginalImageButton name={context.material.name} path={context.material.originalFilePath}/> : null}
        <a data-ui="secondary"
          href={context.material?.currentVersion && context.material.originalFilePath ? `/${context.material.originalFilePath}` : primaryPreviewLink.href}
          target="_blank"
          rel="noreferrer"
          aria-label={`${context.material?.currentVersion ? "下载原件" : "新窗口预览资料"}：${context.row.name}`}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-[#2b3139] bg-[#11161d] px-2.5 text-xs font-semibold text-gold hover:border-gold"
        >
          <FileText size={14} />
          {context.material?.currentVersion ? "下载原件" : "预览"}
        </a>
        {!archived ? (
          <button data-ui="primary"
            type="button"
            onClick={onReview}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-gold bg-gold px-2.5 text-xs font-semibold text-[#181a20]"
          >
            <Archive size={14} />
            入库
          </button>
        ) : null}
      </div>
    </div>
  );
}

function MaterialReviewModal({
  context,
  draft,
  projects,
  state,
  onDraftChange,
  onClose,
  onConfirmOwnership,
  onConfirmArchive,
}: {
  context: MaterialRowContext;
  draft: MaterialReviewDraft;
  projects: Project[];
  state?: MaterialReviewState;
  onDraftChange: (patch: Partial<MaterialReviewDraft>) => void;
  onClose: () => void;
  onConfirmOwnership: () => void;
  onConfirmArchive: () => void | Promise<void>;
}) {
  const dismiss=useBackdropDismiss(onClose);
  const archived = context.source === "database" || state?.archived;
  const relationConfirmed = archived || state?.relationConfirmed;
  const scopeOptions: MaterialReviewPrimaryScope[] = ["fund", "project", "company", "investor", "unassigned"];
  const evidenceLinks = createMaterialPreviewEvidenceLinks(context.entry, context.material, context.row);
  const recognizedLink = evidenceLinks.find((link) => link.kind === "recognized_text");
  const originalLink = evidenceLinks.find((link) => link.kind === "original_document");
  const previewText = context.entry?.summary ?? context.row.rule;

  return (
    <div {...dismiss} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div role="dialog" aria-modal="true" aria-label="资料归属与入库" className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-xl border border-[#2b3139] bg-[#1e2329] p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gold">归属入库</p>
            <h3 className="mt-1 break-words text-xl font-semibold text-[#eaecef]">{context.row.name}</h3>
          </div>
          <button data-ui="secondary" onClick={onClose} className="rounded-md border border-[#2b3139] p-2 text-[#929aa5] hover:text-gold" aria-label="关闭归属入库弹窗" title="关闭">
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-lg border border-[#2b3139] bg-[#11161d] p-4">
            <p className="mb-3 text-sm font-semibold text-[#eaecef]">摘要</p>
            {recognizedLink ? (
              <div className="space-y-3">
                <p className="break-words text-sm leading-6 text-[#d1d5db]">{previewText}</p>
                <a data-ui="secondary"
                  href={recognizedLink.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-fit items-center gap-1 rounded-md border border-[#2b3139] px-2.5 py-1.5 text-xs font-semibold text-gold hover:border-gold"
                >
                  <FileText size={14} />
                  识别文本
                </a>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="break-words text-sm leading-6 text-[#d1d5db]">{previewText}</p>
                <p className="rounded-md border border-[#2b3139] bg-[#1e2329] px-3 py-2 text-xs leading-5 text-[#929aa5]">
                  暂无识别文本。
                </p>
              </div>
            )}
          </div>
          <div className="rounded-lg border border-[#2b3139] bg-[#11161d] p-4">
            <p className="mb-3 text-sm font-semibold text-[#eaecef]">原文 / 识别</p>
            <MaterialEvidenceActions entry={context.entry} material={context.material} row={context.row} />
            {originalLink ? (
              null
            ) : (
              <p className="mt-3 rounded-md border border-[#2b3139] bg-[#1e2329] px-3 py-2 text-xs leading-5 text-[#929aa5]">
                暂无原件路径。
              </p>
            )}
          </div>
          <div className="rounded-lg border border-[#2b3139] bg-[#11161d] p-4 xl:col-span-2">
            <p className="text-sm font-semibold text-[#eaecef]">状态</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone={relationConfirmed ? "green" : "orange"}>{relationConfirmed ? "归属已确认" : "待确认归属"}</Badge>
              <Badge tone={archived ? "green" : "orange"}>{archived ? "已入库" : "待入库"}</Badge>
              <DataOriginBadge origin={context.row.dataOrigin} purpose={context.row.dataPurpose} />
            </div>
            <div className="mt-4 grid gap-3 text-xs text-[#929aa5] sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="font-semibold text-[#707a8a]">资料类型</p>
                <p className="mt-1 break-words text-[#eaecef]">{context.row.type}</p>
              </div>
              <div>
                <p className="font-semibold text-[#707a8a]">来源</p>
                <p className="mt-1 break-words text-[#eaecef]">{context.row.source}</p>
              </div>
              <div>
                <p className="font-semibold text-[#707a8a]">上传人</p>
                <p className="mt-1 break-words text-[#eaecef]">{context.row.uploader}</p>
              </div>
              <div>
                <p className="font-semibold text-[#707a8a]">上传时间</p>
                <p className="mt-1 break-words text-[#eaecef]">{context.row.time}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-semibold text-[#929aa5]">
            基金
            <select
              className="mt-2 h-10 w-full rounded-md border border-[#2b3139] bg-[#11161d] px-3 text-sm text-[#eaecef] outline-none focus:border-gold"
              value={draft.fundId ?? ""}
              onChange={(event) => {
                const fund = funds.find((item) => item.id === event.target.value);
                onDraftChange({ fundId: fund?.id, fundName: fund?.name ?? "" });
              }}
            >
              <option value="">不挂基金</option>
              {funds.map((fund) => (
                <option key={fund.id} value={fund.id}>{fund.name}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold text-[#929aa5]">
            项目
            <select
              className="mt-2 h-10 w-full rounded-md border border-[#2b3139] bg-[#11161d] px-3 text-sm text-[#eaecef] outline-none focus:border-gold"
              value={draft.projectId ?? ""}
              onChange={(event) => {
                const project = projects.find((item) => item.id === event.target.value);
                onDraftChange({ projectId: project?.id, projectName: project?.name ?? "" });
              }}
            >
              <option value="">不挂项目</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold text-[#929aa5]">
            主关系
            <select
              className="mt-2 h-10 w-full rounded-md border border-[#2b3139] bg-[#11161d] px-3 text-sm text-[#eaecef] outline-none focus:border-gold"
              value={draft.primaryScope}
              onChange={(event) => onDraftChange({ primaryScope: event.target.value as MaterialReviewPrimaryScope })}
            >
              {scopeOptions.map((scope) => (
                <option key={scope} value={scope}>{materialScopeLabel(scope)}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold text-[#929aa5]">
            建议归档路径
            <input
              className="mt-2 h-10 w-full rounded-md border border-[#2b3139] bg-[#11161d] px-3 text-sm text-[#eaecef] outline-none focus:border-gold"
              value={draft.archivePath}
              onChange={(event) => onDraftChange({ archivePath: event.target.value })}
            />
          </label>
          <label className="block text-sm font-semibold text-[#929aa5]">
            被投公司
            <input
              className="mt-2 h-10 w-full rounded-md border border-[#2b3139] bg-[#11161d] px-3 text-sm text-[#eaecef] outline-none focus:border-gold"
              value={draft.companyName}
              onChange={(event) => onDraftChange({ companyName: event.target.value })}
              placeholder="可选"
            />
          </label>
          <label className="block text-sm font-semibold text-[#929aa5]">
            投资人
            <input
              className="mt-2 h-10 w-full rounded-md border border-[#2b3139] bg-[#11161d] px-3 text-sm text-[#eaecef] outline-none focus:border-gold"
              value={draft.investorName}
              onChange={(event) => onDraftChange({ investorName: event.target.value })}
              placeholder="可选"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-col gap-2 border-t border-[#2b3139] pt-4 sm:flex-row sm:justify-end">
          <SecondaryButton onClick={onClose}>取消</SecondaryButton>
          <button data-ui="primary"
            type="button"
            onClick={onConfirmOwnership}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-gold bg-[#11161d] px-4 text-sm font-semibold text-gold hover:bg-gold/10"
          >
            <Check size={16} />
            保存归属
          </button>
          <button data-ui={!archived?'primary':'secondary'}
            type="button"
            onClick={onConfirmArchive}
            disabled={archived}
            className={`inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold ${
              !archived
                ? "bg-gold text-[#181a20] hover:bg-[#f0b90b]"
                : "cursor-not-allowed border border-[#2b3139] bg-[#11161d] text-[#707a8a]"
            }`}
          >
            <Archive size={16} />
            {archived ? "已入库" : "确认入库"}
          </button>
        </div>
      </div>
    </div>
  );
}

function materialScopeLabel(scope: MaterialReviewPrimaryScope) {
  if (scope === "fund") return "基金";
  if (scope === "project") return "项目";
  if (scope === "company") return "被投公司";
  if (scope === "investor") return "投资人";
  return "不指定";
}

function MaterialEvidenceActions({
  entry,
  material,
  row,
}: {
  entry?: MaterialKnowledgeEntry;
  material?: ApiMaterialRecord;
  row: MaterialDirectoryRow;
}) {
  const links = createMaterialPreviewEvidenceLinks(entry, material, row);
  if (links.length === 0) {
    return <span className="text-xs font-semibold text-[#707a8a]">无链接</span>;
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {links.map((link) => (
        <a data-ui="secondary"
          key={link.kind}
          href={link.href}
          target="_blank"
          rel="noreferrer"
          aria-label={`${link.label}：${entry?.fileName ?? material?.name ?? "资料"}`}
          className="inline-flex w-fit items-center gap-1 rounded-md border border-[#2b3139] bg-[#11161d] px-2.5 py-1.5 text-xs font-semibold text-gold hover:border-gold"
        >
          {link.kind === "recognized_text" || link.kind === "recognized_html" ? (
            <FileText size={14} />
          ) : link.kind === "original_page_images" ? (
            <Image size={14} />
          ) : link.kind === "original_document" ? (
            <Download size={14} />
          ) : (
            <FolderOpen size={14} />
          )}
          {shortMaterialEvidenceLabel(link.kind, link.label)}
        </a>
      ))}
    </div>
  );
}

function shortMaterialEvidenceLabel(kind: string, label: string) {
  if (kind === "recognized_text" || kind === "recognized_html") return "识别";
  if (kind === "original_page_images") return "页图";
  if (kind === "preview_document") return "预览";
  if (kind === "original_document") return "原件";
  return label.replace(/^查看/, "").replace(/^下载/, "");
}

function createMaterialRecordEvidenceKey(record: MaterialRecord | string[]) {
  return record.join("\u0000");
}


function getProjectPath(projectName: string, projects: Project[]) {
  const project = projects.find((item) => item.name === projectName || item.shortName === projectName);
  return project ? `/projects/${project.id}` : "/projects";
}

function ProjectMaterialDirectory({project,materials,apiMaterials,projects}:{project:Project;materials:MaterialRecord[];apiMaterials?:ApiMaterialRecord[];projects:Project[]}){
 const rows=deriveProjectMaterialDirectoryRows(project,materials,projects,apiMaterials);
 const [directory,setDirectory]=useState<string|null>(null);
 const paths=[...new Set(rows.map(row=>row.path))];
 const visible=directory&&paths.includes(directory)?rows.filter(row=>row.path===directory):rows;
 const open=(materialId?:string)=>navigate(`/projects/${encodeURIComponent(project.id)}?tab=${encodeURIComponent('资料文件')}${materialId?'&materialId='+encodeURIComponent(materialId):''}`);
 return <section className="archive-document-directory"><header><h3>资料目录</h3><button data-action="create" data-ui="primary" onClick={()=>open()}>上传资料 / 管理原件</button></header><div className="archive-directory-layout"><nav aria-label="项目资料分类"><button aria-current={directory===null?'page':undefined} onClick={()=>setDirectory(null)}>全部资料 <span>{rows.length}</span></button>{paths.map(path=><button key={path} aria-current={directory===path?'page':undefined} onClick={()=>setDirectory(path)}><FolderOpen size={16}/><span>{path}</span><small>{rows.filter(row=>row.path===path).length}</small></button>)}</nav><div><Table headers={['文件名称','类型','归档目录','状态','操作']}>{visible.map((row,index)=><tr key={row.materialId??`${row.name}-${index}`}><td>{row.materialId?<button data-ui="navigation" onClick={()=>open(row.materialId)}>{row.name}</button>:row.name}<details><summary>归档依据</summary><p>{row.rule} · 置信度{row.confidence}</p><p>{row.source}</p></details></td><td>{row.type}</td><td>{row.path}</td><td><StatusBadge status={row.status}/></td><td><button data-ui="secondary" onClick={()=>open(row.materialId)}>{row.materialId?'查阅原件':'管理资料'}</button></td></tr>)}{!visible.length?<tr><td colSpan={5}>当前项目暂无关联资料。可上传原件或维护已有原件的项目关联。</td></tr>:null}</Table></div></div></section>;
}

function ProjectClauseWorkspace({
  project,
  projects,
  onTaskCreate,
  onAuditEventCreate,
}: {
  project: Project;
  projects: Project[];
  onTaskCreate: (projectId: string, task: ProjectTask) => Promise<ProjectTask | undefined>;
  onAuditEventCreate: (event: AuditEvent) => void;
}) {
  const [createdClauseTitles, setCreatedClauseTitles] = useState<string[]>([]);
  const rows = deriveProjectClauseRows(project, funds, fundClauseMonitors,isLocalBusinessStateMode());
  const fund = funds.find((item) => item.name === project.fund);

  const createProjectClauseTask = async (title: string) => {
    if (!fund) return;
    const clause = fundClauseMonitors.find((item) => item.fundId === fund.id && item.title === title);
    if (!clause) return;
    const result = createClauseReminderTask({ clause, fund, projects, createdAt: DEMO_TODAY });
    if (result.projectId !== project.id) return;
    const createdTask = await onTaskCreate(project.id, result.task);
    if (!createdTask) return;
    onAuditEventCreate(createClauseReminderAuditEvent({ clause, fund, actor: project.manager, createdAt: DEMO_NOW }));
    setCreatedClauseTitles((current) => (current.includes(title) ? current : [...current, title]));
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard label="项目条款" value={String(rows.filter((row) => row.scope === "项目条款").length)} tone="gold" />
        <StatCard label="基金条款" value={String(rows.filter((row) => row.scope === "基金条款").length)} tone="navy" />
        <StatCard label="待处理" value={String(rows.filter((row) => row.status.includes("待") || row.status.includes("跟踪")).length)} tone="orange" />
      </div>
      <Table headers={["条款", "范围", "来源", "触发条件", "责任人", "状态", "下一步"]}>
        {rows.map((row) => {
          const created = createdClauseTitles.includes(row.title);
          return (
            <tr key={`${row.fundId}-${row.title}`}>
              <td className="px-4 py-4 font-semibold text-navy">{row.title}</td>
              <td className="px-4 py-4"><Badge tone={row.scope === "项目条款" ? "gold" : "slate"}>{row.scope}</Badge></td>
              <td className="px-4 py-4 text-slate-600">{row.source}</td>
              <td className="min-w-64 px-4 py-4 text-slate-600">{row.trigger}</td>
              <td className="px-4 py-4 text-slate-600">{row.owner}</td>
              <td className="px-4 py-4"><StatusBadge status={row.status} /></td>
              <td className="px-4 py-4">
                {row.scope === "项目条款" ? (
                  <button data-ui="primary"
                    type="button"
                    onClick={() => createProjectClauseTask(row.title)}
                    className="rounded bg-gold px-3 py-2 text-sm font-semibold text-[#181a20]"
                  >
                    {created ? "已生成提醒任务" : "生成提醒任务"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => navigate(`/funds/${row.fundId}`)}
                    className="text-sm font-semibold text-gold"
                  >
                    查看基金条款
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}

function ProjectRiskWorkspace({
  project,
  projects,
  onTaskCreate,
  onAuditEventCreate,
}: {
  project: Project;
  projects: Project[];
  onTaskCreate: (projectId: string, task: ProjectTask) => Promise<ProjectTask | undefined>;
  onAuditEventCreate: (event: AuditEvent) => void;
}) {
  const [createdRiskTitles, setCreatedRiskTitles] = useState<string[]>([]);
  const localDemo=isLocalBusinessStateMode();
  const evidence=useProjectEvidence(project.id,!localDemo,project.masterRevision);
  const rows = deriveProjectRiskRows(project,localDemo?risks:evidence.data?.risks??[],localDemo);
  const createRiskTask = async (title: string) => {
    const risk = rows.find((row) => row.title === title);
    if (!risk) return;
    const task = createRiskFollowUpTask(risk, projects, localDemo?DEMO_TODAY:shanghaiCalendarDate());
    if (!task) return;
    const createdTask = await onTaskCreate(project.id, task);
    if (!createdTask) return;
    onAuditEventCreate(
      createAuditEvent({
        module: "风险监控",
        action: "创建风险任务",
        targetType: "项目",
        targetId: project.id,
        targetName: project.name,
        actor: project.manager,
        time: DEMO_NOW,
        detail: `由项目详情风险“${risk.title}”生成跟进任务：${task.name}。`,
        source: risk.source,
      }),
    );
    setCreatedRiskTitles((current) => (current.includes(title) ? current : [...current, title]));
  };

  if(!localDemo&&(evidence.loading||evidence.error))return <div className="space-y-3"><p role={evidence.error?'alert':'status'}>{evidence.error||'正在读取项目风险记录…'}</p>{evidence.error?<button data-ui="info" className="min-h-10 rounded border border-[var(--line)] px-3" onClick={evidence.retry}>重新读取风险记录</button>:null}</div>;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard label="风险来源" value={String(rows.length)} tone="gold" />
        <StatCard label="中高风险" value={String(rows.filter((row) => row.level !== "低").length)} tone="orange" />
        <StatCard label="已建任务" value={String(createdRiskTitles.length)} tone="green" />
      </div>
      <Table headers={["风险事项", "来源", "时间", "级别", "影响摘要", "动作"]}>
        {rows.map((row) => {
          const created = createdRiskTitles.includes(row.title);
          return (
            <tr key={row.title}>
              <td className="px-4 py-4 font-semibold text-navy">{row.title}</td>
              <td className="px-4 py-4 text-slate-600">{row.sourceLabel}</td>
              <td className="number-font px-4 py-4 text-slate-500">{row.time}</td>
              <td className="px-4 py-4"><RiskBadge level={row.level} /></td>
              <td className="min-w-72 px-4 py-4 text-slate-600">{row.summary}</td>
              <td className="px-4 py-4">
                <button data-ui="primary"
                  type="button"
                  onClick={() => createRiskTask(row.title)}
                  className="rounded bg-gold px-3 py-2 text-sm font-semibold text-[#181a20]"
                >
                  {created ? "已创建任务" : row.actionLabel}
                </button>
              </td>
            </tr>
          );
        })}
      </Table>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-[#2b3139] bg-[#11161d] p-6 text-center text-sm text-[#707a8a]">
          当前项目暂无风险监控记录。
        </div>
      ) : null}
    </div>
  );
}

function ProjectMeetingWorkspace({
  project,
  meetings,
  onConfirm,
}: {
  project: Project;
  meetings: MeetingRecord[];
  onConfirm: (meeting: MeetingRecord) => Promise<MeetingRecord | undefined>;
}) {
  const rows = deriveProjectMeetingRows(project, meetings,isLocalBusinessStateMode());
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const confirmProjectMeeting = async (meeting: MeetingRecord) => {
    const confirmedMeeting = await onConfirm(meeting);
    if (!confirmedMeeting) {
      setActionNotice("会议纪要确认未写入系统，请检查系统连接后重试。");
      return;
    }
    setActionNotice(null);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard label="会议记录" value={String(rows.length)} tone="gold" />
        <StatCard label="待确认" value={String(rows.filter((row) => row.status !== "已归档").length)} tone="orange" />
        <StatCard label="提取待办" value={String(rows.reduce((sum, row) => sum + row.todos, 0))} tone="navy" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {rows.map((meeting) => (
          <div key={meeting.title} className="rounded-xl border border-[#2b3139] bg-[#11161d] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-[#eaecef]">{meeting.title}</p>
                <p className="mt-1 text-xs text-[#707a8a]">{meeting.date} · {meeting.attendees}</p>
              </div>
              <StatusBadge status={meeting.status} />
            </div>
            <p className="text-sm leading-6 text-[#929aa5]">{meeting.summary}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone="gold">{meeting.taskSummary}</Badge>
              <Badge tone="slate">归档项目：{meeting.project}</Badge>
            </div>
            <div className="mt-4">
              <PrimaryButton onClick={() => confirmProjectMeeting(meeting)}>
                {meeting.status === "已归档" ? "重新同步任务" : "确认纪要并生成任务"}
              </PrimaryButton>
            </div>
          </div>
        ))}
      </div>
      {actionNotice ? (
        <div role="alert" className="rounded-lg border border-[#8a3800] bg-[#2a1b08] p-3 text-sm font-semibold text-[#f1c21b]">
          {actionNotice}
        <NoticeHelp message={actionNotice} projectId={project.id}/></div>
      ) : null}
      {rows.length === 0 ? (
        <div className="rounded-xl border border-[#2b3139] bg-[#11161d] p-6 text-center text-sm text-[#707a8a]">
          当前项目暂无会议纪要。
        </div>
      ) : null}
    </div>
  );
}

function TaskWorkspace({
  projectId,
  tasks,
  onTaskUpdate,
  openTaskModal,
}: {
  projectId: string;
  tasks: ProjectTask[];
  onTaskUpdate: (projectId: string, taskId: string, patch: Partial<Omit<ProjectTask, "id">>) => Promise<ProjectTask | undefined>;
  openTaskModal: (seed: Partial<ProjectTask>) => void;
}) {
  const [filter, setFilter] = useState<"全部" | TaskStatus>("全部");
  const visibleTasks = filter === "全部" ? tasks : tasks.filter((task) => task.status === filter);
  const stats = [
    ["全部任务", tasks.length],
    ["进行中", tasks.filter((task) => task.status === "进行中").length],
    ["已逾期", tasks.filter((task) => task.status === "已逾期").length],
    ["已完成", tasks.filter((task) => task.status === "已完成").length],
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        {stats.map(([label, value]) => (
          <StatCard key={label as string} label={label as string} value={String(value)} tone={label === "已逾期" ? "red" : "gold"} />
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {["全部", "未开始", "进行中", "待确认", "已完成", "已逾期"].map((status) => (
            <button data-ui={filter === status?'primary':'secondary'}
              key={status}
              onClick={() => setFilter(status as "全部" | TaskStatus)}
              className={`rounded-md border px-3 py-2 text-sm ${filter === status ? "border-gold bg-gold text-[#181a20]" : "border-[#2b3139] text-[#929aa5]"}`}
            >
              {status}
            </button>
          ))}
        </div>
        <PrimaryButton creation onClick={() => openTaskModal({ type: "资料补充", owner: "演示投资经理", dueDate: "2026-05-01", stage: "尽调", status: "未开始", priority: "中" })}>
          新建任务
        </PrimaryButton>
      </div>
      <Table headers={["任务名称", "任务类型", "关联阶段", "负责人", "截止时间", "状态", "优先级", "关联资料 / 风险 / 报告", "备注", "操作"]}>
        {visibleTasks.map((task) => (
          <tr key={task.id} className={task.status === "已逾期" ? "bg-red-500/5" : ""}>
            <td className="px-4 py-4 font-semibold text-navy">{task.name}</td>
            <td className="px-4 py-4 text-slate-600">{task.type}</td>
            <td className="px-4 py-4 text-slate-600">{task.stage}</td>
            <td className="px-4 py-4 text-slate-600">{task.owner}</td>
            <td className="number-font px-4 py-4 text-slate-500">{task.dueDate}</td>
            <td className="px-4 py-4"><StatusBadge status={task.status} /></td>
            <td className="px-4 py-4"><StatusBadge status={task.priority} /></td>
            <td className="px-4 py-4 text-slate-600">{task.relation}</td>
            <td className="min-w-56 px-4 py-4 text-slate-600">{task.note}</td>
            <td className="px-4 py-4">
              <button
                onClick={() => onTaskUpdate(projectId, task.id, { status: "已完成" })}
                className="text-sm font-semibold text-gold"
              >
                标记完成
              </button>
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

function TaskModal({
  seed,
  onClose,
  onSave,
}: {
  seed: Partial<ProjectTask> | null;
  onClose: () => void;
  onSave: (task: ProjectTask) => void | Promise<void>;
}) {
  const dismiss=useBackdropDismiss(onClose);
  const [draft, setDraft] = useState<Partial<ProjectTask>>({});

  useEffect(() => {
    if (seed) setDraft(seed);
  }, [seed]);

  if (!seed) return null;

  const update = (key: keyof ProjectTask, value: string) => setDraft((current) => ({ ...current, [key]: value }));

  return (
    <div {...dismiss} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-[#2b3139] bg-[#1e2329] text-[#eaecef] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#2b3139] px-5 py-4">
          <div>
            <p className="text-xs font-semibold text-gold">任务创建</p>
            <h2 className="mt-1 text-xl font-semibold">新建任务</h2>
          </div>
          <button data-ui="secondary" onClick={onClose} className="rounded-md border border-[#2b3139] p-2 text-[#929aa5] hover:text-gold" aria-label="关闭新建任务弹窗" title="关闭">
            <X size={18} />
          </button>
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <Field label="任务名称" value={draft.name ?? ""} onChange={(value) => update("name", value)} />
          <Field label="任务类型" value={draft.type ?? "资料补充"} onChange={(value) => update("type", value)} />
          <Field label="关联阶段" value={draft.stage ?? "尽调"} onChange={(value) => update("stage", value)} />
          <Field label="负责人" value={draft.owner ?? "演示投资经理"} onChange={(value) => update("owner", value)} />
          <Field label="截止时间" value={draft.dueDate ?? "2026-05-01"} onChange={(value) => update("dueDate", value)} />
          <Field label="状态" value={draft.status ?? "未开始"} onChange={(value) => update("status", value as TaskStatus)} />
          <Field label="优先级" value={draft.priority ?? "中"} onChange={(value) => update("priority", value as TaskPriority)} />
          <Field label="关联资料 / 风险 / 报告" value={draft.relation ?? "当前项目"} onChange={(value) => update("relation", value)} />
          <label className="space-y-2 md:col-span-2">
            <span className="text-xs font-semibold text-[#929aa5]">备注</span>
            <textarea
              value={draft.note ?? ""}
              onChange={(event) => update("note", event.target.value)}
              className="min-h-20 w-full rounded-md border border-[#2b3139] bg-[#11161d] px-3 py-2 text-sm outline-none focus:border-gold"
            />
          </label>
        </div>
        <div className="flex justify-end gap-3 border-t border-[#2b3139] p-5">
          <SecondaryButton onClick={onClose}>取消</SecondaryButton>
          <PrimaryButton
            onClick={() =>
              onSave({
                id: `task-${Date.now()}`,
                name: draft.name || "补充资料",
                type: draft.type || "资料补充",
                stage: draft.stage || "尽调",
                owner: draft.owner || "演示投资经理",
                dueDate: draft.dueDate || "2026-05-01",
                status: (draft.status as TaskStatus) || "未开始",
                priority: (draft.priority as TaskPriority) || "中",
                relation: draft.relation || "当前项目",
                note: draft.note || "由经办人创建。",
              })
            }
          >
            保存任务
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-semibold text-[#929aa5]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-[#2b3139] bg-[#11161d] px-3 text-sm outline-none focus:border-gold"
      />
    </label>
  );
}


function ContextBar({ task = "无" }: { task?: string }) {
  return (
    <div className="rounded-xl border border-[#2b3139] bg-[#11161d] px-4 py-3 text-sm text-[#929aa5]">
      当前上下文：<span className="text-gold">演示智能设备有限公司</span> · 投后管理 · 演示投资经理 · 当前任务：{task} · 数据范围：当前项目
    </div>
  );
}

function MiniReportList({
  project,
  reports,
}: {
  project: Project;
  reports: ReportRecord[];
}) {
  const relatedReports = reports.filter(
    (report) =>
      report.projectId === project.id || isLocalBusinessStateMode() && !report.projectId && (
        report.target === project.name || report.target === project.shortName || report.target === project.fund),
  );

  return (
    <Table headers={["报告名称", "类型", "状态", "更新时间"]}>
      {relatedReports.map((report) => (
        <tr key={report.id ?? report.name}>
          <td className="px-4 py-4 font-medium text-navy">{report.name}</td>
          <td className="px-4 py-4 text-slate-600">{report.type}</td>
          <td className="px-4 py-4"><StatusBadge status={report.status} /></td>
          <td className="business-update-information number-font px-4 py-4">{report.updatedAt.slice(0,10)}</td>
        </tr>
      ))}
      {relatedReports.length === 0 ? (
        <tr>
          <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
            当前项目暂无相关报告。
          </td>
        </tr>
      ) : null}
    </Table>
  );
}

function ProjectAuditWorkspace({
  project,
  auditEvents,
}: {
  project: Project;
  auditEvents: AuditEvent[];
}) {
  const localDemo=isLocalBusinessStateMode();
  const evidence=useProjectEvidence(project.id,!localDemo,project.masterRevision);
  const rows = localDemo?deriveProjectAuditRows(project, auditEvents):evidence.data?.auditEvents??[];

  if(!localDemo&&(evidence.loading||evidence.error))return <div className="space-y-3"><p role={evidence.error?'alert':'status'}>{evidence.error||'正在读取项目审计记录…'}</p>{evidence.error?<button data-ui="info" className="min-h-10 rounded border border-[var(--line)] px-3" onClick={evidence.retry}>重新读取审计记录</button>:null}</div>;
  return <ProjectAuditHistory events={rows}/>;
}

function MeetingSummary({ compact = false }: { compact?: boolean }) {
  const meeting = meetings[0];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <InfoBlock title="会议摘要" content={meeting.summary} className={compact ? "lg:col-span-2" : ""} />
      <InfoList title="关键结论" items={meeting.conclusions} />
      <InfoList title="待办事项" items={meeting.todoItems} />
      <InfoList title="风险点" items={meeting.riskItems} />
      <InfoBlock title="归档项目" content={meeting.project} />
    </div>
  );
}

function InfoList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="mb-3 text-sm font-semibold text-navy">{title}</p>
      <ul className="space-y-2 text-sm text-slate-600">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <CheckCircle2 className="mt-0.5 shrink-0 text-gold" size={15} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CapitalSummary({
  project,
  capitalRecords,
}: {
  project: Project;
  capitalRecords: CapitalItem[];
}) {
  const projectLedger = deriveCapitalLedger(capitalRecords, { projectId:project.id, company: project.name, allowLegacyName:isLocalBusinessStateMode() });

  return (
    <div className="project-capital-summary">
      <div className="space-y-4">
        <div className="project-capital-facts">
          <StatCard label="资金记录" value={String(projectLedger.totalRecords)} tone="navy" />
          <StatCard label="待收金额" value={projectLedger.totalReceivableLabel} tone="orange" />
          <StatCard label="待处理笔数" value={String(projectLedger.pendingCount)} tone="gold" />
        </div>
        <Table headers={["到账金额", "到账日期", "管理费规则", "应收金额", "收款状态", "来源"]}>
          {projectLedger.rows.map((item, index) => (
            <tr key={`${item.company}-${item.date}-${index}`}>
              <td className="number-font px-4 py-4 font-semibold text-navy">{item.received}</td>
              <td className="number-font px-4 py-4 text-slate-600">{item.date}</td>
              <td className="px-4 py-4 text-slate-600">{item.rule}</td>
              <td className="number-font px-4 py-4 font-semibold text-slate-900">{item.receivable}</td>
              <td className="px-4 py-4"><StatusBadge status={item.status} /></td>
              <td className="px-4 py-4 text-slate-600">{item.source ?? "规则计算"}</td>
            </tr>
          ))}
          {projectLedger.rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                当前项目暂无资金记录。
              </td>
            </tr>
          ) : null}
        </Table>
      </div>
    </div>
  );
}

function ReportsPage({
  projects,funds,
  onChanged,currentRole,serverBacked,
  reports,
  exportRecords,
  onApprove,
  onExport,
  lastDownloadNotice,
}: {
  projects:Project[];funds:Fund[];
  onChanged:()=>Promise<void>;currentRole?:string;serverBacked:boolean;
  reports: ReportRecord[];
  exportRecords: ReportExportRecord[];
  onApprove: (report: ReportRecord) => Promise<ReportRecord | undefined>;
  onExport: (report: ReportRecord,format?:"PDF"|"DOCX") => Promise<ReportExportRecord | undefined>;
  lastDownloadNotice: DownloadNotice | null;
}) {
  const [typeFilter, setTypeFilter] = useState("全部报告类型");
  const [nameQuery, setNameQuery] = useState("");
  const requestedReportId = new URLSearchParams(window.location.search).get("reportId");
  const [selectedReportId, setSelectedReportId] = useState(requestedReportId ?? reports[0]?.id ?? reports[0]?.name ?? "");
  useEffect(() => { const select = () => { const id = new URLSearchParams(window.location.search).get("reportId"); if(id){setSelectedReportId(id);setTypeFilter("全部报告类型");setNameQuery("");} }; window.addEventListener("popstate", select); return () => window.removeEventListener("popstate", select); }, []);
  const [reportBusy,setReportBusy]=useState(false);
  const canReview=['admin','investment_manager'].includes(currentRole??'');
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const filteredReports = useMemo(
    () =>
      reports.filter((report) => {
        const typeMatches = typeFilter === "全部报告类型" || report.type === typeFilter;
        const nameMatches = [report.name,report.target].join(" ").toLowerCase().includes(nameQuery.trim().toLowerCase());
        return typeMatches && nameMatches;
      }),
    [nameQuery, reports, typeFilter],
  );
  const [creatingType,setCreatingType]=useState<string|null>(null);
  const [resumeGeneration,setResumeGeneration]=useState<ReportGeneration|undefined>();
  const [detailOpen,setDetailOpen]=useState(Boolean(requestedReportId));
  const [detailDirty,setDetailDirty]=useState(false),[detailEditorBusy,setDetailEditorBusy]=useState(false);
  useEffect(()=>{if(requestedReportId)setDetailOpen(true);},[requestedReportId]);
  const selectedReport =
    reports.find((report) => (report.id ?? report.name) === selectedReportId) ?? (requestedReportId ? null : filteredReports[0] ?? reports[0] ?? null);
  const selectedExport = selectedReport
    ? exportRecords.find((record) => selectedReport.id ? record.reportId === selectedReport.id : record.reportName === selectedReport.name) ?? null
    : null;
  const visibleDownloadNotice =
    selectedReport && lastDownloadNotice && (selectedReport.id ? lastDownloadNotice.targetId === selectedReport.id : lastDownloadNotice.targetName === selectedReport.name) ? lastDownloadNotice.summary : null;
  const approveSelectedReport = async (report: ReportRecord) => {
    if(reportBusy)return;setReportBusy(true);try{const updatedReport = await onApprove(report);
      if (!updatedReport) {setActionNotice("报告审核未写入系统，请检查系统连接后重试。");return;}
      setActionNotice(null);
    }catch(error){const issue=error as {code?:string;fields?:string[]};setActionNotice(issue.fields?.length?issue.fields.join('；'):issue.code==='report_revision_conflict'?'报告正文已有变化，本次未审核。请刷新并核对最新正文后重新审核。':issue.code==='report_content_required'?'报告正文尚未填写，请编辑正文并保存。':'报告审核未写入系统，请检查系统连接后重试。');}finally{setReportBusy(false);}
  };
  const exportSelectedReport = async (report:ReportRecord,format:"PDF"|"DOCX"="PDF") => {
    if(reportBusy)return;setReportBusy(true);setActionNotice(null);try{const exportedReport = await onExport(report,format);if (!exportedReport)setActionNotice('导出未确认，请保留当前报告并重试。');}catch(error){const issue=error as {code?:string;fields?:string[]};setActionNotice(issue.fields?.length?issue.fields.join('；'):issue.code==='report_not_approved'?'当前正文尚未审核，请核对并通过审核后导出。':'导出未完成，请核对当前审核版本与下载权限后重试。');}finally{setReportBusy(false);}
  };

  return <>
    <ReportCatalogue reports={reports} filteredReports={filteredReports} typeFilter={typeFilter} onTypeFilter={setTypeFilter} nameQuery={nameQuery} onNameQuery={setNameQuery} canCreate={canReview} generationTasks={<ReportGenerationTasks onOpen={task=>{setResumeGeneration(task);setCreatingType(task.type);}}/>} onCreate={type=>{setResumeGeneration(undefined);setCreatingType(type);}} onView={id=>{setSelectedReportId(id);setDetailOpen(true);}}/>
    {creatingType?<ReportCreationDialog resume={resumeGeneration} type={creatingType} funds={funds} projects={projects} onClose={()=>setCreatingType(null)} onSaved={async report=>{setSelectedReportId(report.id??report.name);setTypeFilter('全部报告类型');setNameQuery('');await onChanged();setCreatingType(null);setDetailOpen(true);}}/>:null}
    {detailOpen?<WorkflowDialog title="报告审核与导出" busy={reportBusy||detailEditorBusy} className="report-detail-dialog" onClose={async()=>{if(reportBusy||detailEditorBusy)return;if(detailDirty&&!await confirmAction('报告正文有未保存修改，确认放弃修改并关闭？'))return;setDetailOpen(false);}}><section className="report-review-panel" aria-label="报告审核与导出">
          {selectedReport&&!filteredReports.some(report=>(report.id??report.name)===(selectedReport.id??selectedReport.name))?<p role="status" className="report-filter-selection-note">当前预览不在筛选结果中。<button data-ui="info" onClick={()=>{setTypeFilter('全部报告类型');setNameQuery('');requestAnimationFrame(()=>document.querySelector('.report-register-row[data-selected=true]')?.scrollIntoView({block:'nearest'}));}}>在列表中定位</button></p>:null}
          {selectedReport?<>
            <header className="report-a-detail-heading"><div><h2>{selectedReport.name}</h2><p>{selectedReport.type} · {selectedReport.target} · {selectedReport.owner}</p></div><StatusBadge status={selectedReport.status}/></header>
            <p className="report-a-meta">更新 {selectedReport.updatedAt} <DataOriginBadge origin={selectedReport.dataOrigin} purpose={selectedReport.dataPurpose}/></p>
            <ReportContentEditor readFirst report={selectedReport} canEdit={canReview} onDirtyChange={setDetailDirty} onBusyChange={setDetailEditorBusy} onSaved={async()=>onChanged()}/>
            <footer className="report-a-review-actions"><div className="flex flex-wrap gap-2"><button data-ui="success" disabled={reportBusy||detailDirty||detailEditorBusy||!canReview||selectedReport.status==='已完成'||!selectedReport.sections?.length} onClick={()=>approveSelectedReport(selectedReport)}>{selectedReport.status==='已完成'?'已审核通过':'通过审核'}</button><button data-ui="secondary" disabled={reportBusy||detailDirty||detailEditorBusy||!canReview||selectedReport.status!=='已完成'} onClick={()=>exportSelectedReport(selectedReport,'DOCX')}>下载 Word</button><button data-ui="secondary" disabled={reportBusy||detailDirty||detailEditorBusy||!canReview||selectedReport.status!=='已完成'} onClick={()=>exportSelectedReport(selectedReport,'PDF')}>下载 PDF</button></div>
              <p role="status">{detailDirty?'正文有未保存修改，请先保存后再审核或导出。':!canReview?'当前账号可查看报告，审核与导出需要报告办理权限。':!selectedReport.sections?.length?'当前报告尚无已保存正文，请先编辑并保存。':selectedReport.status!=='已完成'?'保存正文后须人工审核，通过后可导出 Word / PDF。':'当前已保存正文已审核，可导出 Word / PDF；修改后须重新审核。'}</p>
            </footer>
            {selectedExport?<details className="report-a-export-history"><summary>历史已导出文件 · {selectedExport.format}</summary><p>{selectedExport.fileName}</p><p>正式文件：{selectedExport.downloadFileName}</p><p>{selectedExport.watermark}</p>{serverBacked&&selectedExport.reportId===selectedReport.id?<a data-ui="info" href={`/api/reports/exports/${encodeURIComponent(selectedExport.id)}/file`} target="_blank" rel="noreferrer">下载此历史文件</a>:null}</details>:null}
          </>:<div className="report-a-empty"><FileText size={28}/><h2>{requestedReportId?'当前报告不可读取':'选择一份报告'}</h2><p>{requestedReportId?'请核对报告是否仍存在及当前账号权限。':'从左侧台账查看正文、审核状态与导出记录。'}</p></div>}
          <div className="report-a-feedback" aria-label="报告操作反馈">{actionNotice?<p role="alert">{actionNotice}{!/变量|必填章节|正文尚未|正文未填写/.test(actionNotice)?<NoticeHelp message={actionNotice}/>:null}{/变量|必填章节|正文尚未|正文未填写/.test(actionNotice)?<button type="button" data-ui="secondary" onClick={()=>{const target=document.getElementById('report-content-editor');target?.scrollIntoView({block:'center'});target?.focus({preventScroll:true});}}>定位报告正文</button>:null}</p>:visibleDownloadNotice?<p role="status">{visibleDownloadNotice}</p>:reportBusy?<p role="status">正在处理当前报告，请稍候…</p>:null}</div>
        </section></WorkflowDialog>:null}
  </>;

}

function ReportCreatePage({projects,funds,onChanged}:{projects:Project[];funds:Fund[];onChanged:()=>Promise<void>}){
 const [preset]=useState(()=>{try{return JSON.parse(window.sessionStorage.getItem('reportPreset')??'null') as {type?:string;target?:string;targetId?:string;targetType?:'project'|'fund'}|null;}catch{return null;}});
 return <ReportCreationDialog type={preset?.type??'基金季度报告'} funds={funds} projects={projects} preset={preset??undefined} onClose={()=>navigate('/reports')} onSaved={async r=>{await onChanged();navigate('/reports?reportId='+encodeURIComponent(r.id??''));}}/>;
}

function TaskCenterPage({
  projects,
  tasksByProject,
  onProjectTaskUpdate,
}: {
  projects: Project[];
  tasksByProject: Record<string, ProjectTask[]>;
  onProjectTaskUpdate: (projectId: string, taskId: string, patch: Partial<Omit<ProjectTask, "id">>) => Promise<ProjectTask | undefined>;
}) {
  const rows = createTaskCenterRows(tasksByProject, projects);
  const summary = summarizeTaskCenter(rows);
  const [ownerFilter, setOwnerFilter] = useState("全部负责人");
  const [statusFilter, setStatusFilter] = useState<"全部状态" | TaskStatus>("全部状态");
  const [priorityFilter, setPriorityFilter] = useState<"全部优先级" | TaskPriority>("全部优先级");
  const [query, setQuery] = useState("");
  const ownerOptions = ["全部负责人", ...Array.from(new Set(rows.map((row) => row.owner)))];
  const visibleRows = filterTaskCenterRows(rows, {
    owner: ownerFilter,
    status: statusFilter,
    priority: priorityFilter,
    query,
  });

  const markComplete = async (projectId: string, taskId: string) => {
    const row = rows.find((item) => item.projectId === projectId && item.id === taskId);
    if (!row) return;
    await onProjectTaskUpdate(projectId, taskId, { status: "已完成" });
  };

  return (
    <div>
      <SectionHeader title="任务中心" eyebrow="跨项目风险、资料、报告和会议待办" />
      <div className="mb-5 grid gap-3 md:grid-cols-4">
        <StatCard label="全部任务" value={String(summary.total)} tone="navy" />
        <StatCard label="未完成" value={String(summary.open)} tone="gold" />
        <StatCard label="已逾期" value={String(summary.overdue)} tone="red" />
        <StatCard label="高优先级" value={String(summary.highPriority)} tone="orange" />
      </div>
      <Card className="p-5">
        <div className="mb-4 grid gap-3 lg:grid-cols-[180px_180px_180px_1fr]">
          <Select value={ownerFilter} onChange={setOwnerFilter} options={ownerOptions} />
          <Select
            value={statusFilter}
            onChange={(value) => setStatusFilter(value as "全部状态" | TaskStatus)}
            options={["全部状态", "未开始", "进行中", "待确认", "已完成", "已逾期"]}
          />
          <Select
            value={priorityFilter}
            onChange={(value) => setPriorityFilter(value as "全部优先级" | TaskPriority)}
            options={["全部优先级", "高", "中", "低"]}
          />
          <label className="flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-600">
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索任务、项目、基金、来源"
              aria-label="搜索任务"
              className="w-full bg-transparent outline-none"
            />
          </label>
        </div>
        <Table headers={["任务名称", "项目 / 基金", "负责人", "截止", "状态", "优先级", "来源", "动作"]}>
          {visibleRows.map((row) => (
            <tr key={`${row.projectId}-${row.id}`}>
              <td className="px-4 py-4">
                <p className="font-semibold text-navy">{row.name}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{row.type} · {row.stage}</p>
              </td>
              <td className="px-4 py-4">
                <button onClick={() => navigate(row.projectPath)} className="font-semibold text-gold">
                  {row.projectName}
                </button>
                <p className="mt-1 text-xs text-slate-500">{row.fundName}</p>
              </td>
              <td className="px-4 py-4 text-slate-600">{row.owner}</td>
              <td className="number-font px-4 py-4 text-slate-500">{row.dueDate}</td>
              <td className="px-4 py-4"><StatusBadge status={row.status} /></td>
              <td className="px-4 py-4"><StatusBadge status={`${row.priority}优先级`} /></td>
              <td className="min-w-64 px-4 py-4 text-slate-600">
                <p>{row.relation}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{row.note}</p>
              </td>
              <td className="px-4 py-4">
                <button data-ui="primary"
                  type="button"
                  onClick={() => markComplete(row.projectId, row.id)}
                  className="rounded bg-gold px-3 py-2 text-sm font-semibold text-[#181a20] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={row.status === "已完成"}
                >
                  {row.status === "已完成" ? "已完成" : "标记完成"}
                </button>
              </td>
            </tr>
          ))}
        </Table>
        {visibleRows.length === 0 ? (
          <div className="rounded-b-xl border-x border-b border-[#2b3139] bg-[#11161d] px-4 py-8 text-center text-sm text-[#707a8a]">
            当前筛选条件下没有任务。
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function MonitoringPage({ projects, onTaskCreate, onRiskHandle, onChanged }: {
  onChanged: () => Promise<void>;
  projects: Project[];
  onTaskCreate: (projectId: string, task: ProjectTask) => Promise<ProjectTask | undefined>;
  onRiskHandle: (risk: (typeof risks)[number]) => Promise<AuditEvent | undefined>;
}) {
  return <UnifiedRiskWorkspace projects={projects} onChanged={onChanged} onTaskCreate={onTaskCreate} onRiskHandle={onRiskHandle}/>;
}

const defaultManualCapitalDraft: ManualCapitalDraft = {
  company: "演示智能设备有限公司",
  fund: "示例成长一期基金",
  received: "3000 万元",
  date: "2026-05-02",
  rule: "年化 2%，按日计费",
  receivable: "407,671 元",
  dueDate: "2026-05-10",
  status: "未收",
};

function CapitalPage({ items,funds,projects,currentRole,onCreate,onChanged }: { items: CapitalItem[];projects:Project[];funds:Fund[];currentRole?:string; onCreate: (record: CapitalItem) => Promise<void>;onChanged:()=>Promise<void> }) {
  const {onChanged:refreshRecords}=useRecordManagement();
  const [paymentBusy,setPaymentBusy]=useState(false),[settlementBusy,setSettlementBusy]=useState(false),[overviewRevision,setOverviewRevision]=useState(0);
  const refreshCapital=async()=>{try{await onChanged();}finally{setOverviewRevision(value=>value+1);}};
  const [capitalSearch,setCapitalSearch]=useState(window.location.search);
  useEffect(()=>{const sync=()=>setCapitalSearch(window.location.search);window.addEventListener('popstate',sync);return()=>window.removeEventListener('popstate',sync);},[]);
  const scopeQuery=new URLSearchParams(capitalSearch),scopeFundId=scopeQuery.get('fundId')||undefined,scopeProjectId=scopeQuery.get('projectId')||undefined;
  const [editing,setEditing]=useState<CapitalItem|null>(null);
  const [createOpen, setCreateOpen] = useState(()=>new URLSearchParams(window.location.search).get('create')==='1'&&['admin','finance'].includes(currentRole??''));
  const requestedProject=projects.find(p=>p.id===new URLSearchParams(window.location.search).get('projectId'));
  const requestedFund=funds.find(f=>f.id===new URLSearchParams(window.location.search).get('fundId'));
  const scopeDraft=requestedProject?{id:`capital-${crypto.randomUUID()}`,company:requestedProject.name,projectId:requestedProject.id,...capitalScopeFund(requestedProject,requestedFund),received:'',date:'',rule:'',receivable:'',dueDate:'',status:'未收' as const}:requestedFund?{id:`capital-${crypto.randomUUID()}`,company:requestedFund.name,projectId:null,fundId:requestedFund.id,fund:requestedFund.name,received:'',date:'',rule:'',receivable:'',dueDate:'',status:'未收' as const}:undefined;
  const scopedCapital=filterCapitalRecords(items,{fundId:scopeFundId,projectId:scopeProjectId});
  const [ageFilter,setAgeFilter]=useState("");
  
  const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});

  const visibleCapital=ageFilter?scopedCapital.filter(item=>capitalAgeBucket(item,today)===ageFilter):scopedCapital;
  if(scopeFundId&&!requestedFund||scopeProjectId&&!requestedProject)return <div role="alert" className="p-5">当前对象未在可见列表中，请核对权限或等待列表加载。<button data-ui="secondary" type="button" onClick={()=>navigate('/capital')}>查看全部可见资金事项</button></div>;
  return (
    <div className="capital-redesign">
      <CapitalPortfolio detailWorkspace={<CapitalDetailWorkspace locked={createOpen||paymentBusy||settlementBusy} tools={<><DeletedRecordsButton kind="capital"/>{['admin','finance'].includes(currentRole??'')?<button data-action="create" data-ui="primary" onClick={()=>{setEditing(null);setCreateOpen(true);}}><Plus size={14}/>创建资金事项</button>:null}</>}>
      <section id="capital-investment-ledger" className="capital-detail-panel"><InvestmentLedgerPanel embedded scope={scopeProjectId?{type:'project',id:scopeProjectId}:scopeFundId?{type:'fund',id:scopeFundId}:{type:'all'}} fundId={scopeFundId} projectId={scopeProjectId} primaryProjectCount={projects.filter(p=>(!scopeFundId||p.fundId===scopeFundId)&&(!scopeProjectId||p.id===scopeProjectId)).length} refreshToken={overviewRevision}/></section>

      <section id="capital-payments" className="capital-detail-panel"><InvestmentCashflowLedgerPanel compact fundId={requestedFund?.id} currentRole={currentRole} projectId={scopeProjectId} onInteractionChange={setPaymentBusy} onChanged={refreshCapital}/></section>
      <section id="capital-funds" className="capital-detail-panel">{scopeProjectId?<p className="text-sm text-[var(--secondary)]">此区按基金展示运营费用，未按项目拆分；项目实际费用付款在“付款与凭证”中核对。</p>:null}<FundOperationsSummary compact mode="capital" fundId={requestedFund?.id} capitalOnly/></section>
      <section id="capital-returns" className="capital-detail-panel"><ExitSettlementLedgerPanel compact fundId={requestedFund?.id} projectId={scopeProjectId} onInteractionChange={setSettlementBusy} onChanged={refreshCapital}/></section>
      <section id="capital-matters" className="capital-detail-panel">
      <ReceivableAging compact items={scopedCapital} today={today} selected={ageFilter} onSelect={setAgeFilter}/>
<div id="capital-items" className="business-section-title"><h2>资金事项</h2><p>独立登记的资金事项，保留原记录；不与合同费用分期自动合并。</p></div>
      {ageFilter?<div className="chart-filter-notice"><span>已按账龄筛选 · {visibleCapital.length} 笔</span><button data-ui="secondary" type="button" onClick={()=>setAgeFilter("")}>查看全部资金事项</button></div>:null}
      <div className="grid min-w-0 gap-6">
        <Card className="min-w-0 p-5">
          <Table headers={["企业 / 基金", "到账 / 应收", "规则 / 日期", "状态 / 来源"]}>
            {!visibleCapital.length?<tr><td colSpan={4} className="p-6 text-center text-sm text-[var(--secondary)]">当前账龄范围没有资金事项。</td></tr>:null}
            {visibleCapital.map((item, index) => (
              <tr id={item.id?`capital-record-${item.id}`:undefined} key={`${item.company}-${item.date}-${item.received}-${index}`} className="hover:bg-slate-50">
                <td className="px-4 py-4">
                  <div className="min-w-0 space-y-1">
                    <p className="break-words font-semibold text-navy">{item.company}</p><div className="mt-2 flex flex-wrap gap-2">{['admin','finance'].includes(currentRole??'')?<button data-ui="info" type="button" onClick={()=>{setEditing(item);setCreateOpen(true);}}>编辑</button>:null}<DeleteRecordButton kind="capital" id={item.id} title={`${item.company} · ${item.date}`}/></div>
                    <p className="break-words text-sm text-slate-600">{item.fund}</p>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="min-w-0 space-y-1">
                    <p className="capital-money number-font font-semibold text-slate-900"><span>到账</span> {item.received}</p>
                    <p className="capital-money number-font text-sm text-slate-600"><span>应收</span> {item.receivable}</p>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="min-w-0 space-y-1">
                    <p className="break-words text-sm text-slate-600">{item.rule}</p>
                    <p className="number-font text-xs text-slate-500">
                      {item.date?'到账 '+item.date:'尚未到账'} · 应收 {item.dueDate}
                    </p>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="min-w-0 space-y-2">
                    <StatusBadge status={item.status} />
                    <p className="break-words text-sm font-semibold text-navy">{item.source ?? "规则计算"}</p>
                    {item.confirmationStatus ? <Badge tone="green">{item.confirmationStatus}</Badge> : null}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
      </section>
      </CapitalDetailWorkspace>} onRefresh={async()=>{await refreshRecords();setOverviewRevision(v=>v+1);}} currentRole={currentRole} funds={funds} projects={projects} items={items} fundId={scopeFundId} projectId={scopeProjectId} revision={overviewRevision} locked={createOpen||paymentBusy||settlementBusy} onFundChange={id=>{const query=new URLSearchParams(window.location.search);if(id)query.set('fundId',id);else query.delete('fundId');query.delete('create');navigate('/capital'+(query.size?'?'+query.toString():'')+window.location.hash);}}/>
      {requestedFund?<p className="portfolio-scope-note">当前基金：{requestedFund.name} · <a href={'/funds/'+encodeURIComponent(requestedFund.id)+'?tab='+encodeURIComponent('账户资金')}>返回本基金账户资金</a></p>:null}

      {createOpen ? (
        <CapitalCreateModal isEditing={Boolean(editing)} initial={editing??scopeDraft}
          projects={projects}
          funds={funds}
          onClose={() => setCreateOpen(false)}
          onSave={async (draft) => {
            if(editing?.id){const keys=['company','fund','fundId','projectId','received','date','rule','receivable','dueDate','status'] as const;await createApiClient().updateCapitalRecord(editing.id,{...Object.fromEntries(keys.map(k=>[k,draft[k]??null])),expectedUpdatedAt:editing.updatedAt});await refreshRecords();}else await onCreate(createManualCapitalRecord(draft));
            setOverviewRevision(value=>value+1);setCreateOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function CapitalCreateModal({
  initial,
  isEditing=false,
  projects,
  funds,
  onClose,
  onSave,
}: {
  initial?:CapitalItem;
  isEditing?:boolean;
  funds:Fund[];
  projects:Project[];
  onClose: () => void;
  onSave: (draft: ManualCapitalDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ManualCapitalDraft>(()=>initial??(isLocalBusinessStateMode()?defaultManualCapitalDraft:{id:`capital-${crypto.randomUUID()}`,company:'',fund:'',fundId:'',projectId:null,received:'',date:'',rule:'',receivable:'',dueDate:'',status:'未收'}));
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[unknown,setUnknown]=useState(false);
  const [relationConfirmed,setRelationConfirmed]=useState(false);
  const relationProject=projects.find(project=>project.id===draft.projectId),relationFund=funds.find(fund=>fund.id===draft.fundId);
  const needsRelationConfirmation=capitalRelationNeedsConfirmation(relationProject,draft.fundId)&&(!isEditing||draft.projectId!==initial?.projectId||draft.fundId!==initial?.fundId);
  const working=useRef(false);
  const initialFingerprint=useRef(JSON.stringify(initial??draft));
  const close=async ()=>{if(busy||unknown)return;if(JSON.stringify(draft)!==initialFingerprint.current&&!await confirmAction('资金事项尚未保存，确认放弃本次修改？'))return;onClose();};
  const save=async()=>{
    if(working.current)return;
    if(draft.projectId&&!relationProject){setError('关联项目已不在可见列表中，请重新选择项目。');return;}
    if(needsRelationConfirmation&&!relationConfirmed){setError('请核对并确认所选基金与项目确属本资金事项，或修改基金/项目。');return;}
    if(!draft.fundId||!funds.some(f=>f.id===draft.fundId)||!draft.company.trim()||!draft.received.trim()||!draft.rule.trim()||!draft.receivable.trim()||(!draft.date&&(!['未收','逾期'].includes(draft.status)||!/^0+(?:\.0+)?\s*(?:元|万元|万)?$/.test(draft.received.trim())))||!draft.dueDate){setError('请填写基金、事项、金额、规则与应收日；未收可填0并留空到账日期，有收款须填写实际到账日。');return;}
    working.current=true;setBusy(true);setError('');
    try{await onSave(draft);}catch(e){const status=(e as {status?:number}).status,code=(e as {code?:string}).code;setUnknown(!status||status>=500);setError(code==='invalid_capital_amount'?'金额请填写数字，可带元或万元；不要用计划文字、负数或模糊说明代替实际金额。':code==='positive_capital_receipt_required'?'已收或部分收必须有实际正收款金额；尚未到账请保留未收状态。':code==='capital_receipt_date_required'?'有收款须填写实际到账日期；未收且金额为0可留空。':status===401?'登录已失效，请重新登录后核对结果。':status===403?'当前账号没有资金维护权限。':status===409?'资金事项或基金存在冲突，请核对记录；本次内容保留。':status===400?'未保存，请核对填写内容。':'未能确认保存结果，请保留本次内容原样重试，或关闭后先核对资金列表。');}finally{working.current=false;setBusy(false);}
  };
  const update = (key: keyof ManualCapitalDraft, value: string) =>
    setDraft((current) => ({ ...current, [key]: key === "status" ? (value as ManualCapitalDraft["status"]) : value }));

  return (
    <WorkflowDialog title={isEditing?'编辑资金事项':'创建资金事项'} busy={busy||unknown} onClose={close}>
        <fieldset disabled={busy||unknown} className="grid gap-4 p-5 md:grid-cols-2">
          <label className="space-y-2"><span className="text-xs font-semibold text-[#929aa5]">关联项目（选填）</span><select className="h-10 w-full rounded-md border border-[#2b3139] bg-[#11161d] px-3 text-sm" value={draft.projectId??''} onChange={e=>{const project=projects.find(p=>p.id===e.target.value);setRelationConfirmed(false);setDraft(d=>({...d,projectId:project?.id??null,company:project?.name??d.company}));}}><option value="">不关联项目（保留未核实）</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <Field label="企业 / 事项名称" value={draft.company} onChange={(value) => update("company", value)} />
          <label className="space-y-2"><span className="text-xs font-semibold text-[#929aa5]">所属基金</span><select className="h-10 w-full rounded-md border border-[#2b3139] bg-[#11161d] px-3 text-sm" value={draft.fundId??''} onChange={e=>{const fund=funds.find(f=>f.id===e.target.value);setRelationConfirmed(false);setDraft(d=>({...d,fundId:fund?.id??'',fund:fund?.name??''}));}}><option value="">请选择基金</option>{funds.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
          {needsRelationConfirmation&&relationProject&&relationFund?<CapitalRelationNotice project={relationProject} fund={relationFund} confirmed={relationConfirmed} onConfirm={setRelationConfirmed}/>:null}
          <Field label="已到账金额（未收填0）" value={draft.received} onChange={(value) => update("received", value)} />
          <Field label="实际到账日期（未收可留空）" value={draft.date} onChange={(value) => update("date", value)} />
          <Field label="管理费规则" value={draft.rule} onChange={(value) => update("rule", value)} />
          <Field label="应收金额" value={draft.receivable} onChange={(value) => update("receivable", value)} />
          <Field label="应收日期" value={draft.dueDate} onChange={(value) => update("dueDate", value)} />
          <label className="space-y-2">
            <span className="text-xs font-semibold text-[#929aa5]">收款状态</span>
            <select
              value={draft.status}
              onChange={(event) => update("status", event.target.value)}
              className="h-10 w-full rounded-md border border-[#2b3139] bg-[#11161d] px-3 text-sm outline-none focus:border-gold"
            >
              {["未收", "部分收", "已收", "逾期"].map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
        {error?<p role="alert" className="px-5 pb-4 text-sm">{error}<NoticeHelp message={error}/></p>:null}
        <div className="flex justify-end gap-3 border-t border-[#2b3139] p-5">
          <button data-ui="secondary" disabled={busy||unknown} onClick={close} className="rounded border border-[var(--line)] px-3 py-2">取消</button>
          <button data-ui="primary" disabled={busy} onClick={()=>void save()} className="rounded bg-gold px-3 py-2 font-semibold text-[#181a20] disabled:opacity-50">{busy?'保存中…':unknown?'原样重试本次保存':'保存资金事项'}</button>
        </div>
    </WorkflowDialog>
  );
}

function MeetingsPage({meetings,projects,api,onChanged,currentRole,onConfirm}:{projects:Project[];api:ApiClient;onChanged:()=>Promise<void>;currentRole?:string;meetings:MeetingRecord[];onConfirm:(meeting:MeetingRecord)=>Promise<MeetingRecord|undefined>}){
  const canWrite=['admin','post_investment'].includes(currentRole??'');
  const [arranging,setArranging]=useState<MeetingRecord|null>(null);
  const [editing,setEditing]=useState<MeetingRecord|undefined>(undefined);
  const requestedProjectId=new URLSearchParams(window.location.search).get('projectId');
  const [creating,setCreating]=useState(()=>new URLSearchParams(window.location.search).get('create')==='1'&&canWrite),[deletedOnly,setDeletedOnly]=useState(false),[deletedMeetings,setDeletedMeetings]=useState<MeetingRecord[]>([]),[loadingDeleted,setLoadingDeleted]=useState(false),[notice,setNotice]=useState(''),[pageError,setPageError]=useState('');
  const [upcomingOnly,setUpcomingOnly]=useState(()=>new URLSearchParams(window.location.search).get('scope')==='upcoming'),[scopeNow,setScopeNow]=useState(()=>new Date());
  useEffect(()=>{if(!upcomingOnly)return;const tick=()=>setScopeNow(new Date());const timer=window.setInterval(tick,30000);document.addEventListener('visibilitychange',tick);return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',tick);};},[upcomingOnly]);
  const [requestedMeeting,setRequestedMeeting]=useState(()=>new URLSearchParams(window.location.search).get('meetingId')),[selected,setSelected]=useState<string|null>(null),[detailId,setDetailId]=useState<string|null>(()=>new URLSearchParams(window.location.search).get('meetingId'));
  const [query,setQuery]=useState(''),[statusFilter,setStatusFilter]=useState('全部');
  const [removal,setRemoval]=useState<{meeting:MeetingRecord;deleted:boolean;requestId:string}|null>(null),[busy,setBusy]=useState(false),[actionError,setActionError]=useState('');const removalCommitted=useRef(false);
  useEffect(()=>{const select=()=>{const id=new URLSearchParams(window.location.search).get('meetingId');if(id){setQuery('');setStatusFilter('全部');}setRequestedMeeting(id);setDetailId(id);setUpcomingOnly(new URLSearchParams(window.location.search).get('scope')==='upcoming');};window.addEventListener('popstate',select);return()=>window.removeEventListener('popstate',select);},[]);
  useEffect(()=>{if(!deletedOnly)return;let active=true;setDeletedMeetings([]);setLoadingDeleted(true);setPageError('');api.getMeetings(true).then(r=>{if(active)setDeletedMeetings(r.meetings);}).catch(()=>{if(active)setPageError('最近删除的纪要暂未读取成功，请重新打开本视图。');}).finally(()=>{if(active)setLoadingDeleted(false);});return()=>{active=false;};},[deletedOnly,meetings,api,currentRole]);
  const scoped=(deletedOnly?deletedMeetings:upcomingOnly?getUpcomingMeetings(meetings,scopeNow):meetings).filter(m=>!requestedProjectId||m.projectId===requestedProjectId);
  const shown=scoped.filter(m=>(statusFilter==='全部'||m.status===statusFilter)&&[m.title,m.project,m.attendees].some(value=>value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
  const selectedMeeting=requestedMeeting?shown.find(m=>(m.id??m.title)===requestedMeeting):shown.find(m=>(m.id??m.title)===selected)??shown[0],detail=scoped.find(m=>(m.id??m.title)===detailId);
  const clearUpcoming=()=>{setUpcomingOnly(false);setRequestedMeeting(null);setDetailId(null);setSelected(null);const url=new URL(window.location.href);url.searchParams.delete('scope');url.searchParams.delete('meetingId');window.history.replaceState(null,'',url.pathname+url.search+url.hash);};
  const selectMeeting=(meeting:MeetingRecord)=>{setRequestedMeeting(null);setSelected(meeting.id??meeting.title);};
  const clearFilters=()=>{setQuery('');setStatusFilter('全部');setRequestedMeeting(null);};
  const beginRemoval=(meeting:MeetingRecord,deleted:boolean)=>{removalCommitted.current=false;setActionError('');setRemoval({meeting,deleted,requestId:crypto.randomUUID()});};
  const applyRemoval=async()=>{if(!removal?.meeting.id||busy)return;setBusy(true);setActionError('');try{if(!removalCommitted.current){await api.setMeetingDeleted(removal.meeting.id,removal.deleted,{requestId:removal.requestId,expectedRevision:removal.meeting.revision??1});removalCommitted.current=true;}await onChanged();if(deletedOnly)setDeletedMeetings((await api.getMeetings(true)).meetings);setNotice(removal.deleted?'已从当前列表移除。关联任务、资料和历史记录已保留。':'会议纪要已恢复，关联任务和资料不会重复生成。');setRequestedMeeting(null);setSelected(null);setDetailId(null);setRemoval(null);}catch(e){const status=(e as {status?:number}).status;setActionError(removalCommitted.current?'操作已保存，但列表刷新未完成。请点击下方按钮重新读取，不会重复操作。':status===409?'纪要已被其他操作更新，请关闭此窗口，刷新列表后重新核对。':status===403?'当前账号没有删除或恢复会议纪要的权限。':'本次操作结果未确认，原记录未从页面移除，请保留本窗口重试。');}finally{setBusy(false);}};
  const actions=<div className="flex flex-wrap gap-3">{canWrite?<PrimaryButton creation onClick={()=>{setEditing(undefined);setCreating(true);}}>新建会议纪要</PrimaryButton>:null}</div>;
  return <div className="meetings-workspace"><SectionHeader title="会议纪要" eyebrow="会议整理 / 行动项 / 归档" action={actions}/>{upcomingOnly&&!deletedOnly?<p role="status" className="meeting-management-notice">{upcomingMeetingScope}<button type="button" data-ui="info" onClick={clearUpcoming}>查看全部会议记录</button></p>:null}
    {requestedMeeting&&!loadingDeleted&&!selectedMeeting?<p role="status" className="meeting-management-notice">指定纪要不在当前可见列表中，可能已删除或访问范围已变化。点击其他会议可查看对应内容。</p>:null}{notice?<p role="status" className="meeting-management-notice">{notice}</p>:null}{pageError?<p role="alert">{pageError}<NoticeHelp message={pageError}/></p>:null}
    {arranging?.id?<MeetingScheduleDialog meeting={{...arranging,id:arranging.id}} api={api} onClose={()=>setArranging(null)} onSaved={async()=>{await onChanged();setArranging(null);}}/>:null}
    {creating?<MeetingCreateDialog initial={editing} projects={requestedProjectId?projects.filter(p=>p.id===requestedProjectId):projects} api={api} onClose={()=>setCreating(false)} onSaved={async id=>{await onChanged();clearUpcoming();clearFilters();setDeletedOnly(false);setRequestedMeeting(id);setDetailId(id);setCreating(false);}}/>:null}
    <div className="meeting-selected-layout">
      <Card className="meeting-directory" aria-label="会议记录">
        <header><h2>会议记录</h2><span>{scoped.length} 条</span></header>
        <label className="meeting-search"><Search size={16} aria-hidden="true"/><span className="sr-only">搜索会议主题、项目或参会人</span><input type="search" placeholder="搜索主题、项目或参会人" value={query} onChange={e=>{setQuery(e.target.value);setRequestedMeeting(null);}}/></label>
        <label className="meeting-filters"><span>会议状态</span><select aria-label="纪要状态筛选" value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);setRequestedMeeting(null);}}>{['全部','待确认','已归档','需补充'].map(status=><option key={status} value={status}>{status==='全部'?'全部状态':status}</option>)}</select></label>
        <div className="meeting-directory-list">
          {groupMeetingsByMonth(shown).map(group=><section className="meeting-month-group" key={group.month}><h3>{group.label}<span>（{group.meetings.length}）</span></h3>{group.meetings.map((meeting,index)=><button key={meeting.id??index} type="button" className="meeting-directory-entry" aria-current={selectedMeeting===meeting?'true':undefined} onClick={()=>selectMeeting(meeting)}>
            <time className="meeting-date-block" dateTime={group.month?meeting.date:undefined} aria-label={meeting.date}>{group.month?<><span>{meeting.date.slice(5,7)}月</span><strong>{meeting.date.slice(8)}日</strong></>:<><span>日期</span><strong>待核</strong></>}</time>
            <span className="meeting-entry-content"><strong>{meeting.title}</strong><span className="meeting-entry-project">{meeting.project||'关联项目未填写'}</span><span className="meeting-entry-source">{dataOriginLabel(meeting.dataOrigin)}</span></span><StatusBadge status={meeting.deletedAt?'已删除':meeting.status}/>
          </button>)}</section>)}
          {!shown.length?<p className="meeting-directory-empty">{scoped.length?'没有匹配的会议记录。':'当前范围暂无会议记录。'}</p>:null}
        </div>
        <footer aria-live="polite">显示 {shown.length} / {scoped.length} 条{query||statusFilter!=='全部'?<button data-ui="info" type="button" onClick={clearFilters}>清除筛选</button>:null}</footer>
      </Card>
      {selectedMeeting?<Card className="meeting-reading-panel">
        <header className="meeting-document-heading"><div className="meeting-document-title"><h2>{selectedMeeting.title}</h2><StatusBadge status={selectedMeeting.deletedAt?'已删除':selectedMeeting.status}/></div>
          <p className="meeting-document-project"><Building2 size={15} aria-hidden="true"/>{selectedMeeting.projectId?<a href={`/projects/${encodeURIComponent(selectedMeeting.projectId)}`}>{selectedMeeting.project}</a>:selectedMeeting.project||'关联项目未填写'}</p>
          <div className="meeting-document-source"><DataOriginBadge origin={selectedMeeting.dataOrigin} purpose={selectedMeeting.dataPurpose}/><span>{dataPurposeLabel(selectedMeeting.dataPurpose)}</span></div>
          <dl className="meeting-document-meta"><div><dt><Calendar size={16} aria-hidden="true"/>会议日期</dt><dd>{selectedMeeting.date||'未填写'}</dd></div><div><dt><Users size={16} aria-hidden="true"/>参会人</dt><dd>{selectedMeeting.attendees||'未填写'}</dd></div><div><dt><Clock3 size={16} aria-hidden="true"/>会议安排</dt><dd>{meetingScheduleLabels[selectedMeeting.scheduleStatus??'unknown']}{selectedMeeting.startsAt?<span>{meetingLocalTime(selectedMeeting.startsAt).replace('T',' ')}</span>:null}{selectedMeeting.endsAt?<span>至 {meetingLocalTime(selectedMeeting.endsAt).replace('T',' ')}</span>:null}</dd></div></dl>
        </header>
        <div className="meeting-reading-body">
          <section className="meeting-summary-section"><h3><FileText size={19} aria-hidden="true"/>会议摘要</h3><p className="meeting-summary-text">{selectedMeeting.summary||'尚未填写会议摘要。'}</p></section>
          <div className="meeting-dossier-columns"><section className="meeting-main-copy">
            <section><h3><CheckCircle2 size={19} aria-hidden="true"/>会议结论</h3>{selectedMeeting.conclusions.length?<ul className="meeting-conclusion-list">{selectedMeeting.conclusions.map((item,i)=><li key={i}>{item}</li>)}</ul>:<p className="meeting-copy-empty">尚未记录关键结论。</p>}</section>
            <section className="meeting-risk-section"><h3><AlertTriangle size={19} aria-hidden="true"/>主要风险 <span>（{selectedMeeting.riskItems.length}）</span></h3>{selectedMeeting.riskItems.length?<ul>{selectedMeeting.riskItems.map((item,i)=><li key={i}>{item}</li>)}</ul>:<p className="meeting-copy-empty">尚未记录风险点。</p>}</section>
          </section><aside className="meeting-action-copy"><section><h3><ClipboardCheck size={19} aria-hidden="true"/>行动项 <span>（{selectedMeeting.todoItems.length}）</span></h3>{selectedMeeting.taskDueDate?<p className="meeting-task-deadline">统一截止：{selectedMeeting.taskDueDate}</p>:null}{selectedMeeting.todoItems.length?<table className="meeting-action-table"><thead><tr><th scope="col">序号</th><th scope="col">待办事项</th></tr></thead><tbody>{selectedMeeting.todoItems.map((item,i)=><tr key={i}><td>{i+1}</td><td>{item}</td></tr>)}</tbody></table>:<p className="meeting-copy-empty">尚未记录待办事项。</p>}</section></aside></div>
        </div>
        <footer className="meeting-reading-footer">{selectedMeeting.id&&selectedMeeting.status==='已归档'?<a data-ui="secondary" href={`/api/meetings/${encodeURIComponent(selectedMeeting.id)}/document`} target="_blank" rel="noreferrer"><Download size={15}/>下载纪要文件</a>:null}{canWrite&&selectedMeeting.id&&!selectedMeeting.deletedAt?<button data-ui="info" onClick={()=>setArranging(selectedMeeting)}>调整会议安排</button>:null}<button data-ui="primary" type="button" onClick={()=>setDetailId(selectedMeeting.id??selectedMeeting.title)}>查看完整纪要</button>{canWrite&&!selectedMeeting.deletedAt?<><button data-ui="secondary" type="button" onClick={()=>setDetailId(selectedMeeting.id??selectedMeeting.title)}>{selectedMeeting.status==='已归档'?'重新同步任务':'确认纪要并生成任务'}</button><button data-ui="secondary" type="button" onClick={()=>{setEditing(selectedMeeting.status==='已归档'?{...selectedMeeting,id:undefined}:selectedMeeting);setCreating(true);}}>{selectedMeeting.status==='已归档'?'复制为新稿':'编辑纪要'}</button></>:null}{canWrite&&selectedMeeting.id?<button data-ui={deletedOnly?'secondary':'danger'} type="button" onClick={()=>beginRemoval(selectedMeeting,!deletedOnly)}>{deletedOnly?'恢复会议纪要':'删除会议纪要'}</button>:null}</footer>
      </Card>:<Card className="meeting-empty meeting-empty-reading"><MessageSquareText size={30}/><h2>{requestedMeeting?'指定纪要不在当前可见范围':'当前视图暂无会议记录'}</h2><p>{scoped.length?'选择左侧其他纪要，或清除筛选后查看。':'可通过右上方新建纪要，填写内容、粘贴原文或整理录音。'}</p>{scoped.length?<button type="button" data-ui="secondary" onClick={clearFilters}>查看全部纪要</button>:null}</Card>}
    </div>


    {detail?<WorkflowDialog title="会议纪要详情" busy={busy} onClose={()=>setDetailId(null)}><div className="space-y-4"><h3 className="text-xl font-semibold">{detail.title}</h3>{detail.deletedAt?<p className="text-sm text-[var(--secondary)]">已移入最近删除；恢复后回到会议列表。原状态：{detail.status}。</p>:null}<div className="meeting-detail-meta"><InfoBlock title="关联项目" content={detail.project}/><InfoBlock title="纪要日期" content={detail.date}/><InfoBlock title="会议安排" content={meetingScheduleLabels[detail.scheduleStatus??'unknown']+(detail.startsAt?' · '+meetingLocalTime(detail.startsAt).replace('T',' '):'')}/><InfoBlock title="参会人" content={detail.attendees||'未填写'}/>{detail.taskDueDate?<InfoBlock title="待办截止日期" content={detail.taskDueDate}/>:null}</div><MeetingSummaryCard key={detail.id??detail.title} meeting={detail} onConfirm={onConfirm} canConfirm={canWrite&&!Boolean(detail.deletedAt)}/>{canWrite&&detail.id?<div className="meeting-detail-footer">{detail.id&&detail.status==='已归档'?<a data-ui="secondary" href={`/api/meetings/${encodeURIComponent(detail.id)}/document`} target="_blank" rel="noreferrer">下载纪要文件</a>:null}{!detail.deletedAt?<button data-ui="info" onClick={()=>{setDetailId(null);setArranging(detail);}}>调整会议安排</button>:null}{!detail.deletedAt?<button data-ui="info" type="button" onClick={()=>{setEditing(detail.status==='已归档'?{...detail,id:undefined}:detail);setCreating(true);setDetailId(null);}}>{detail.status==='已归档'?'复制为新稿':'编辑纪要'}</button>:null}<button data-ui={detail.deletedAt?'secondary':'danger'} type="button" onClick={()=>beginRemoval(detail,!detail.deletedAt)}>{detail.deletedAt?'恢复会议纪要':'删除会议纪要'}</button><button data-ui="secondary" type="button" onClick={()=>setDetailId(null)}>关闭详情</button></div>:null}</div></WorkflowDialog>:null}
    {removal?<WorkflowDialog title={removal.deleted?'删除会议纪要':'恢复会议纪要'} busy={busy} onClose={()=>{if(!busy)setRemoval(null);}}><div className="space-y-4"><p>确认{removal.deleted?'删除':'恢复'}“{removal.meeting.title}”？</p><p className="text-sm text-[var(--secondary)]">{removal.deleted?'纪要将从当前列表移除。已经生成的任务、原录音、归档资料和操作记录会保留，不会一并删除。':'恢复原纪要内容和状态，不会重复生成任务或资料。'}</p>{actionError?<p role="alert" className="text-sm text-[var(--action-danger-ink)]">{actionError}</p>:null}<div className="flex flex-wrap gap-3"><button data-ui={removal.deleted?'danger':'primary'} type="button" disabled={busy} onClick={()=>void applyRemoval()}>{busy?'处理中…':removalCommitted.current?'重新读取操作结果':removal.deleted?'确认删除':'确认恢复'}</button><button data-ui="secondary" type="button" disabled={busy} onClick={()=>setRemoval(null)}>取消</button></div></div></WorkflowDialog>:null}
  </div>;
}

function MeetingSummaryCard({
  meeting,
  onConfirm,
  canConfirm=true,
}: {
  meeting: MeetingRecord;
  canConfirm?:boolean;
  onConfirm: (meeting: MeetingRecord) => Promise<MeetingRecord | undefined>;
}) {
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const confirmSelectedMeeting = async () => {
    const confirmedMeeting = await onConfirm(meeting);
    if (!confirmedMeeting) {
      setActionNotice("会议纪要确认未写入系统，请检查系统连接后重试。");
      return;
    }
    setActionNotice(null);
  };

  return (
    <div className="space-y-4">
      <InfoBlock title="会议摘要" content={meeting.summary} />
      <InfoList title="关键结论" items={meeting.conclusions} />
      <InfoList title="待办事项" items={meeting.todoItems} />
      <InfoList title="风险点" items={meeting.riskItems} />
      <InfoBlock title="归档项目" content={meeting.project} />
      <div className="rounded-xl border border-[#2b3139] bg-[#11161d] p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#eaecef]">确认结果</p>
            <p className="mt-1 text-sm leading-6 text-[#929aa5]">
              确认后写入资料库，并把会议待办同步到项目任务池。
            </p>
          </div>
          <StatusBadge status={meeting.status} />
        </div>
        {actionNotice ? (
          <div role="alert" className="mt-4 rounded-lg border border-[#8a3800] bg-[#2a1b08] p-3 text-sm font-semibold text-[#f1c21b]">
            {actionNotice}
          <NoticeHelp message={actionNotice}/></div>
        ) : null}
        {canConfirm?<div className="mt-4">
          <PrimaryButton onClick={confirmSelectedMeeting}>
            {meeting.status === "已归档" ? "重新同步任务" : "确认纪要并生成任务"}
          </PrimaryButton>
        </div>:null}
      </div>
    </div>
  );
}

function AiPlainMessageContent({ content, streaming }: { content: string; streaming: boolean }) {
  const paragraphs = createReadableAiParagraphs(content);
  return (
    <div className="space-y-2 text-sm leading-7">
      {paragraphs.map((paragraph, index) => (
        <p key={`${paragraph}-${index}`}>
          {paragraph}
          {streaming && index === paragraphs.length - 1 ? "｜" : ""}
        </p>
      ))}
    </div>
  );
}

function StructuredAiReply({ reply }: { reply: NonNullable<ChatMessage["structured"]> }) {
  return (
    <div className="space-y-4 text-sm leading-6">
      <div>
        <p className="text-base font-semibold leading-7 text-[#eaecef]">{reply.title}</p>
        <p className="mt-2 text-[#c8ced6]">{reply.summary}</p>
      </div>

      {reply.metrics?.length ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {reply.metrics.map((metric) => (
            <div key={metric.label} className="rounded-md border border-[#2b3139] bg-[#11161d] px-3 py-2">
              <p className="text-xs font-semibold text-[#929aa5]">{metric.label}</p>
              <p className="number-font mt-1 text-lg font-semibold text-gold">{metric.value}</p>
              {metric.detail ? <p className="mt-1 text-xs leading-5 text-[#707a8a]">{metric.detail}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      {reply.evidence?.length ? (
        <div className="rounded-md border border-[#2b3139] bg-[#11161d]">
          <div className="border-b border-[#2b3139] px-3 py-2">
            <p className="text-xs font-semibold text-[#929aa5]">引用证据</p>
          </div>
          <div className="divide-y divide-[#2b3139]">
            {reply.evidence.map((item, evidenceIndex) => (
              <div key={`${item.fileName}-${item.page}-${evidenceIndex}`} className="px-3 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <p className="break-words font-semibold leading-6 text-[#eaecef]">{item.title}</p>
                  <Badge tone="gold">第 {item.page} 页</Badge>
                </div>
                <blockquote className="mt-2 border-l-2 border-gold/60 pl-3 text-sm leading-6 text-[#c8ced6]">
                  {item.excerpt}
                </blockquote>
                {item.links?.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.links.map((link) => (
                      <a data-ui="primary"
                        key={`${item.title}-${evidenceIndex}-${link.label}`}
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-gold/30 bg-gold/10 px-2.5 text-xs font-semibold text-gold transition hover:border-gold"
                      >
                        {link.label}
                        <ArrowUpRight size={13} />
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {reply.items?.length ? (
        <div className="divide-y divide-[#2b3139] rounded-md border border-[#2b3139]">
          {reply.items.map((item, itemIndex) => (
            <div key={`${item.title}-${item.meta ?? ""}-${itemIndex}`} className="px-3 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="break-words font-semibold leading-6 text-[#eaecef]">{item.title}</p>
                  {item.meta ? <p className="mt-1 text-xs leading-5 text-[#929aa5]">{item.meta}</p> : null}
                </div>
                {item.status ? <Badge tone="green">{item.status}</Badge> : null}
              </div>
              {item.description ? <p className="mt-2 text-xs leading-5 text-[#929aa5]">{item.description}</p> : null}
              {item.links?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.links.map((link) => (
                    <a data-ui="primary"
                      key={`${item.title}-${itemIndex}-${link.label}`}
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-gold/30 bg-gold/10 px-2.5 text-xs font-semibold text-gold transition hover:border-gold"
                    >
                      {link.label}
                      <ArrowUpRight size={13} />
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {reply.nextActions?.length ? (
        <div>
          <p className="text-xs font-semibold text-[#929aa5]">下一步</p>
          <ul className="mt-2 space-y-1 text-[#c8ced6]">
            {reply.nextActions.map((action) => (
              <li key={action} className="flex gap-2">
                <CheckCircle2 className="mt-1 shrink-0 text-gold" size={14} />
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function createReadableAiParagraphs(content: string) {
  const normalized = content
    .replace(/\*\*/g, "")
    .replace(/\s+(?=\d+\.\s)/g, "\n")
    .replace(/\s+(?=(结论|依据|下一步|注|风险|建议)：)/g, "\n");
  const paragraphs = normalized
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  return paragraphs.length > 0 ? paragraphs : [content];
}

function ActionCard({
  action,
  confirmed = false,
  onConfirm,
}: {
  action: { title: string; rows: Array<{ label: string; value: string }>; button: string };
  confirmed?: boolean;
  onConfirm?: () => void;
}) {
  return (
    <div className="ai-action-card mt-4 rounded-lg border border-gold/20 bg-gold/10 p-4">
      <p className="mb-3 font-semibold text-navy">{action.title}</p>
      <div className="space-y-2">
        {action.rows.map((row) => (
          <div key={row.label} className="flex justify-between gap-4 text-sm">
            <span className="text-slate-500">{row.label}</span>
            <span className="font-semibold text-slate-900">{row.value}</span>
          </div>
        ))}
      </div>
      <button data-ui="secondary"
        type="button"
        className="ai-action-button mt-4 h-9 rounded-md bg-navy px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        onClick={onConfirm}
        disabled={confirmed || !onConfirm}
      >
        {confirmed ? "已创建" : onConfirm ? action.button : "需到对应模块确认"}
      </button>
    </div>
  );
}

function SettingsPage({
  funds,
  currentRole,
  onAccountsChanged,
  auditEvents,
  onAuditExport,
  auditDownloadSummary,
  businessStateMode,
  businessStateNotice,
}: {
  funds:Fund[];
  currentRole?:string;
  onAccountsChanged:()=>Promise<void>;
  auditEvents: AuditEvent[];
  onAuditExport: () => void;
  auditDownloadSummary: string | null;
  businessStateMode: BusinessStateMode;
  businessStateNotice: string | null;
}) {
  const [requestedAuditPage,setAuditPage]=useState(1);
  const auditPage=Math.max(1,Math.min(requestedAuditPage,Math.ceil(auditEvents.length/8)));
  const [aiServiceStatus,setAiServiceStatus]=useState<AiServiceStatus|null>(null);
  const [aiServiceError,setAiServiceError]=useState(false);
  useEffect(()=>{let active=true;fetchAiServiceStatus().then(value=>{if(active)setAiServiceStatus(value);}).catch(()=>{if(active)setAiServiceError(true);});return()=>{active=false;};},[]);
  const tabs=['设置总览','账号与登录管理',...(currentRole==='admin'?['基金与项目可见范围']:[]),'自定义业务字段','业务模板管理','AI 数字员工','操作记录'];
  const requestedSection=()=>{const requested=new URLSearchParams(window.location.search).get('section');return requested&&tabs.includes(requested)?requested:window.location.hash==='#accounts'?'账号与登录管理':'设置总览';};
  const [tab,setTab]=useState(requestedSection);
  const readDocumentMode=()=>{const query=new URLSearchParams(window.location.search);return query.has('templateView')?query.get('templateView')==='documents':query.has('templateFund');};
  const [documentMode,setDocumentMode]=useState(readDocumentMode);
  useEffect(()=>{const nav=document.querySelector<HTMLElement>('.settings-tab-links');if(!nav)return;const reveal=()=>{const selected=nav.querySelector<HTMLElement>('[aria-pressed="true"]');if(selected&&nav.scrollWidth>nav.clientWidth)nav.scrollLeft=Math.max(0,selected.offsetLeft-nav.offsetLeft-6);};const observer=new ResizeObserver(reveal);observer.observe(nav);reveal();return()=>observer.disconnect();},[tab]);
  const chooseTemplateView=(documents:boolean)=>{setDocumentMode(documents);const url=new URL(window.location.href);url.searchParams.set('templateView',documents?'documents':'business');window.history.replaceState(history.state,'',url.pathname+url.search);};
  useEffect(()=>{const select=()=>{setTab(requestedSection());setDocumentMode(readDocumentMode());};window.addEventListener('popstate',select);window.addEventListener('hashchange',select);return()=>{window.removeEventListener('popstate',select);window.removeEventListener('hashchange',select);};},[currentRole]);
  const openTab=(label:string)=>{if(!tabs.includes(label))return;setTab(label);const query=new URLSearchParams(window.location.search);query.set('section',label);window.history.replaceState({},'',window.location.pathname+'?'+query);};
  const [ownAccount,setOwnAccount]=useState<AccountUser|null>(null);
  useEffect(()=>{let active=true;createApiClient().getOwnAccount().then(r=>{if(active)setOwnAccount(r.user);}).catch(()=>{});return()=>{active=false;};},[]);
  return <div className="settings-workspace" data-section={tab}>
    <SectionHeader title="系统设置" eyebrow="账号 / 权限 / 业务配置" action={tab!=='设置总览'?<button type="button" data-ui="secondary" onClick={()=>openTab('设置总览')}><ArrowLeft size={16} aria-hidden="true"/>返回设置首页</button>:undefined}/>
    <nav hidden={tab==='设置总览'} className="settings-tabs" aria-label="设置领域"><div className="settings-tab-links">{tabs.slice(1).map(label=><button type="button" key={label} data-ui={tab===label?'primary':'secondary'} aria-pressed={tab===label} onClick={()=>openTab(label)}>{label}</button>)}</div></nav>
    <div className="settings-detail-panel" hidden={tab!=='业务模板管理'}>{currentRole==='admin'?<nav aria-label="模板配置类型" className="mb-5 flex flex-wrap gap-3"><button type="button" data-ui={!documentMode?'primary':'secondary'} aria-pressed={!documentMode} onClick={()=>chooseTemplateView(false)}>业务建档模板</button><button type="button" data-ui={documentMode?'primary':'secondary'} aria-pressed={documentMode} onClick={()=>chooseTemplateView(true)}>基金文档模板</button></nav>:null}{documentMode&&currentRole==='admin'?tab==='业务模板管理'?<DocumentTemplateSettings funds={funds} role={currentRole} loading={businessStateMode==='loading'} unavailable={businessStateMode==='degraded'}/>:null:<AgentTemplateWorkspace role={currentRole}/>}</div>
    <div hidden={tab!=='设置总览'}><SettingsOverview role={currentRole} account={ownAccount} accountRoleLabel={ownAccount?accountRoleLabels[ownAccount.role]:undefined} auditCount={businessStateMode==='loading'||businessStateMode==='degraded'?undefined:auditEvents.length} onOpen={openTab} onAuditExport={onAuditExport} onRevoke={()=>{openTab('账号与登录管理');requestAnimationFrame(()=>{const section=document.querySelector('#accounts');const button=section?.querySelector<HTMLButtonElement>('button[data-action="revoke-own-sessions"]');(button??section)?.scrollIntoView({block:'center'});button?.focus({preventScroll:true});});}} reminders={<AgentReminderPreferences/>}/></div>
    <div className="settings-detail-panel" hidden={tab!=='基金与项目可见范围'}>{currentRole==='admin'?<Card className="p-5"><ObjectAccessPanel/></Card>:null}</div>
    <div className="settings-detail-panel" hidden={tab!=='账号与登录管理'}><Card className="p-5"><AccountSettingsPanel onChanged={onAccountsChanged}/></Card></div>
    <div className="settings-detail-panel" hidden={tab!=='自定义业务字段'}><CustomFieldSettings currentRole={currentRole}/></div>
    <div className="settings-detail-panel" hidden={tab!=='AI 数字员工'}><Card className="p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">AI 数字员工</h2><Badge tone={aiServiceStatus?.apiKeyConfigured&&!aiServiceError?'green':'orange'}>{aiServiceError?'暂不可用':!aiServiceStatus?'正在检查':aiServiceStatus.apiKeyConfigured?'已启用':'暂未启用'}</Badge></div><p className="mt-3 text-sm leading-7 text-[var(--secondary)]">{aiServiceError?'暂时无法读取服务状态，请稍后重试。':aiServiceStatus&&!aiServiceStatus.apiKeyConfigured?'暂时无法使用，请联系管理员。':'在数字员工中管理对话、能力与执行安排；关键业务请核对原件。'}</p><button type="button" data-ui="primary" className="mt-5" onClick={()=>navigate('/ai-assistant')}>进入数字员工<ArrowUpRight size={16} aria-hidden="true"/></button></Card></div>
    <div className="settings-detail-panel" hidden={tab!=='操作记录'}><Card className="p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">操作记录</h2><SecondaryButton onClick={onAuditExport}>导出操作记录</SecondaryButton></div><p className="mt-3 text-sm text-[var(--secondary)]" role="status">{businessStateMode==='loading'?'正在读取操作记录…':businessStateMode==='degraded'?'操作记录暂未读取成功。':`当前已加载 ${auditEvents.length} 条记录`}</p>{auditDownloadSummary?<p role="status" className="mt-3 text-sm">{auditDownloadSummary}</p>:null}<div className="settings-audit-list mt-4 space-y-3">{auditEvents.slice((auditPage-1)*8,auditPage*8).map(event=><div key={event.id} className="border-t border-[var(--line)] pt-3"><p className="text-sm">{event.time} · {event.actor} · {auditActionLabel(event.action)}</p><p className="mt-1 text-sm text-[var(--secondary)]">{event.module}</p></div>)}</div><LedgerPagination total={auditEvents.length} page={auditPage} onChange={setAuditPage} pageSize={8} label="操作记录分页" statusText={businessStateMode==='loading'?'正在读取记录…':businessStateMode==='degraded'?'记录暂不可用':undefined}/></Card></div>
  </div>;
}

export default App;
