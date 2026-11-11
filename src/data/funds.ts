import type {CustomData} from "../lib/customFields.ts";
export type FundStage = "募集期" | "投资期" | "投后管理" | "退出期";

export type Fund = CustomData & {
  registeredTotals?:import("../lib/lpLedgerTypes").LpTotals;
  registeredTotalsIncludeDemo?:boolean;
  id: string;
  name: string;
  shortName: string;
  stage: FundStage;
  manager: string;
  managerId?: string | null;
  revision?: number;
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
  dataOrigin?: string;dataPurpose?:string;
};

export type FundInvestor = {
  id?: string;
  revision?: number;
  fundId: string;
  name: string;
  type: string;
  commitment: string;
  paidIn: string;
  suitabilityStatus: string;
  signStatus: string;
  updatedAt?: string;
  dataOrigin?: string;dataPurpose?:string;
};

export type FundDocument = {
  id?: string;
  fundId: string;
  name: string;
  category: string;
  owner: string;
  archivedAt: string;
  path: string;
  dataOrigin?: string;dataPurpose?:string;
};

export type FundClauseMonitor = {
  fundId: string;
  title: string;
  source: string;
  trigger: string;
  owner: string;
  status: string;
  dataOrigin?: string;dataPurpose?:string;
};

export type AiIntakeItem = {
  sourceMaterialId?: string | null;
  sourceVersionId?: string | null;
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
  status: "待确认" | "已归档" | "已退回";
  reviewNote?: string;
  dataOrigin?: string;dataPurpose?:string;
};

export const funds: Fund[] = [
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
    projectCount: 12,
    investorCount: 18,
    openTasks: 7,
    riskCount: 3,
    nextAction: "二季度投后报告需收集财务与经营数据",
    updatedAt: "2026-06-08",
  },
  {
    id: "fundapp-growth",
    name: "示例创新基金",
    shortName: "成长基金",
    stage: "投资期",
    manager: "演示投后经理",
    scale: "3.20 亿",
    paidIn: "2.86 亿",
    invested: "1.94 亿",
    balance: "0.92 亿",
    projectCount: 9,
    investorCount: 11,
    openTasks: 5,
    riskCount: 2,
    nextAction: "新增项目条款需要法务复核",
    updatedAt: "2026-06-06",
  },
  {
    id: "advanced-manufacturing",
    name: "示例制造基金",
    shortName: "先进制造",
    stage: "募集期",
    manager: "演示财务经理",
    scale: "2.50 亿",
    paidIn: "1.16 亿",
    invested: "0.42 亿",
    balance: "0.74 亿",
    projectCount: 4,
    investorCount: 8,
    openTasks: 9,
    riskCount: 1,
    nextAction: "投资者适当性材料待补 3 份",
    updatedAt: "2026-06-05",
  },
];

export const fundInvestors: FundInvestor[] = [
  { id: "demo-lp-1", dataOrigin: "seed_demo", fundId: "fundapp-growth-i", name: "演示投资者A", type: "机构投资者", commitment: "1.20 亿", paidIn: "1.20 亿", suitabilityStatus: "已完成", signStatus: "已签署" },
  { id: "demo-lp-2", dataOrigin: "seed_demo", fundId: "fundapp-growth-i", name: "演示投资者B", type: "机构投资者", commitment: "0.80 亿", paidIn: "0.72 亿", suitabilityStatus: "已完成", signStatus: "已签署" },
  { id: "demo-lp-3", dataOrigin: "seed_demo", fundId: "advanced-manufacturing", name: "演示投资者C", type: "机构投资者", commitment: "0.50 亿", paidIn: "0.38 亿", suitabilityStatus: "待补资料", signStatus: "待签署" },
  { id: "demo-lp-4", dataOrigin: "seed_demo", fundId: "fundapp-growth", name: "演示投资者D", type: "机构投资者", commitment: "0.60 亿", paidIn: "0.48 亿", suitabilityStatus: "已完成", signStatus: "已签署" },
];

export const fundDocuments: FundDocument[] = [
  { fundId: "fundapp-growth-i", name: "示例成长一期基金合伙协议.pdf", category: "募集文件", owner: "法务", archivedAt: "2026-04-18", path: "基金档案 / 募集 / 协议签署" },
  { fundId: "fundapp-growth-i", name: "2026 Q1 基金运营报告.docx", category: "投后报告", owner: "演示投资经理", archivedAt: "2026-04-30", path: "基金档案 / 投后 / 季度报告" },
  { fundId: "fundapp-growth-i", name: "演示智能设备二季度经营数据.xlsx", category: "项目数据", owner: "演示投后经理", archivedAt: "2026-05-02", path: "基金档案 / 投后 / 演示智能设备" },
  { fundId: "fundapp-growth-i", name: "管理费收取明细表.xlsx", category: "资金费用", owner: "财务", archivedAt: "2026-05-08", path: "基金档案 / 账户资金 / 管理费" },
  { fundId: "fundapp-growth", name: "示例创新新增项目条款清单.xlsx", category: "协议条款", owner: "法务", archivedAt: "2026-06-06", path: "基金档案 / 投资 / 条款复核" },
  { fundId: "advanced-manufacturing", name: "先进制造投资者适当性补充清单.xlsx", category: "募集文件", owner: "演示财务经理", archivedAt: "2026-06-05", path: "基金档案 / 募集 / 适当性资料" },
];

export const fundClauseMonitors: FundClauseMonitor[] = [
  {
    fundId: "fundapp-growth-i",
    title: "演示智能设备业绩承诺监控",
    source: "投资协议第 6.2 条",
    trigger: "2026 年营收低于 1.2 亿需触发专项说明",
    owner: "投后负责人",
    status: "跟踪中",
  },
  {
    fundId: "fundapp-growth-i",
    title: "基金季度报告提交",
    source: "基金运营规则",
    trigger: "每季度结束后 15 个工作日内完成投资人报告",
    owner: "演示投资经理",
    status: "待收集数据",
  },
  {
    fundId: "fundapp-growth-i",
    title: "管理费收取提醒",
    source: "基金合同管理费条款",
    trigger: "每季度首月第 5 个工作日生成收取清单",
    owner: "财务",
    status: "已生成",
  },
  {
    fundId: "fundapp-growth",
    title: "新增项目交割条件复核",
    source: "投资协议签署清单",
    trigger: "交割前需确认工商变更、出资证明和法务意见",
    owner: "法务",
    status: "待复核",
  },
  {
    fundId: "advanced-manufacturing",
    title: "投资者适当性资料补齐",
    source: "募集资料清单",
    trigger: "签署前需补齐风险揭示书和合格投资者承诺",
    owner: "演示财务经理",
    status: "待补资料",
  },
];

export const aiIntakeItems: AiIntakeItem[] = [
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
];
