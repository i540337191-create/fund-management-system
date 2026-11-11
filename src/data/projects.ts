import type {CustomData} from "../lib/customFields.ts";
export type RiskLevel = "低" | "中" | "高";
export type ProjectStatus = "拟投" | "已投" | "观察" | "退出" | "已退出";

export type Project = CustomData & {
  assetState?: 'managed'|'exiting'|'exited'|'legacy_exited';
  assetStateLabel?: string;
  assetManaged?: boolean;
  assetLegacyUnverified?: boolean;
  assetOpenClaims?: number;
  assetClaimText?: string;
  ownerId?: string | null;
  companyId?: string | null;
  masterRevision?: number;
  id: string;
  name: string;
  shortName: string;
  fund: string;
  industry: string;
  status: ProjectStatus;
  stage: string;
  manager: string;
  amount: string;
  risk: RiskLevel;
  latest: string;
  todoCount: number;
  updatedAt: string;
  description: string;
  thesis: string;
  nextAction: string;
  dataOrigin?: string;dataPurpose?:string;
  fundId?: string;
  managerLabel?: string;
  collaborators?: string;
  sourceChannel?: string;
};

export const projects: Project[] = [
  {
    id: "demo-robotics",
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
    todoCount: 4,
    updatedAt: "2026-04-27",
    description:
      "公司聚焦工业级智能装备控制系统，为新能源、精密制造产线提供视觉检测、运动控制与设备联网方案。",
    thesis:
      "制造业设备智能化改造需求明确，团队具备核心控制算法与行业交付经验，可形成区域龙头样板。",
    nextAction: "确认二季度订单、复核知识产权变更影响，并生成月度监控报告。",
  },
  {
    id: "beijing-fundapp-new-energy",
    name: "演示清洁能源有限公司",
    shortName: "演示清洁能源",
    fund: "示例创新基金",
    industry: "新能源 / 储能",
    status: "拟投",
    stage: "尽调",
    manager: "演示研究员",
    amount: "8000 万元",
    risk: "高",
    latest: "新增开庭公告，法务需补充核查。",
    todoCount: 6,
    updatedAt: "2026-04-26",
    description: "面向工商业储能场景提供电池管理系统与运维平台。",
    thesis: "工商业储能渗透率提升，客户侧节能收益模型清晰。",
    nextAction: "完成诉讼事项核验，并调整投资委员会材料。",
  },
  {
    id: "hangzhou-digital-health",
    name: "演示医疗科技有限公司",
    shortName: "演示医疗",
    fund: "示例制造基金",
    industry: "医疗科技",
    status: "观察",
    stage: "初筛",
    manager: "演示项目经理",
    amount: "5000 万元",
    risk: "低",
    latest: "已收到新版 BP，等待财务数据。",
    todoCount: 2,
    updatedAt: "2026-04-24",
    description: "提供医院科室经营分析与智能随访工具。",
    thesis: "医疗数字化采购预算恢复，产品可与区域医院场景深度结合。",
    nextAction: "补充三家标杆客户访谈纪要。",
  },
  {
    id: "chengdu-materials",
    name: "演示先进材料有限公司",
    shortName: "演示先进材料",
    fund: "示例成长一期基金",
    industry: "新材料",
    status: "已投",
    stage: "投后管理",
    manager: "演示风控经理",
    amount: "6500 万元",
    risk: "低",
    latest: "政府补贴公示通过，预计五月到账。",
    todoCount: 1,
    updatedAt: "2026-04-23",
    description: "高性能复合材料供应商，服务轨交与新能源零部件客户。",
    thesis: "国产替代空间明确，订单交付能力持续提升。",
    nextAction: "归档补贴文件并更新企业月度看板。",
  },
  {
    id: "shenzhen-hailian",
    name: "演示供应链有限公司",
    shortName: "演示供应链",
    fund: "示例创新基金",
    industry: "供应链科技",
    status: "已投",
    stage: "重点跟进",
    manager: "演示投资经理",
    amount: "7200 万元",
    risk: "中",
    latest: "核心客户回款周期拉长，需关注现金流。",
    todoCount: 3,
    updatedAt: "2026-04-21",
    description: "跨境供应链协同平台，连接工厂、海外仓与渠道商。",
    thesis: "一带一路出口链路数字化需求稳定，平台数据沉淀具备延展价值。",
    nextAction: "收集三月回款明细并更新风险台账。",
  },
  {
    id: "northwest-digital-infra",
    name: "演示数字基础设施有限公司",
    shortName: "西北数基",
    fund: "示例创新基金",
    industry: "数字基础设施",
    status: "已退出",
    stage: "已退出",
    manager: "演示研究员",
    amount: "5400 万元",
    risk: "低",
    latest: "退出款项已完成清算，归档材料待最终复核。",
    todoCount: 1,
    updatedAt: "2026-04-18",
    description: "区域数据中心配套运营服务商，已通过股权转让完成退出。",
    thesis: "项目完成阶段性收益兑现，退出材料用于沉淀后续同类项目复盘。",
    nextAction: "归档退出协议、清算凭证和投后复盘报告。",
  },
];

export const projectBoard = [
  { label: "投后管理", count: 16, accent: "bg-emerald-50 text-emerald-700", items: ["演示智能设备", "演示先进材料"] },
  { label: "风险关注", count: 3, accent: "bg-red-50 text-red-700", items: ["演示清洁能源", "演示供应链"] },
  { label: "已投项目", count: 28, accent: "bg-navy/10 text-navy", items: ["演示智能设备", "演示先进材料", "演示供应链"] },
  { label: "尽调中", count: 5, accent: "bg-gold/15 text-[#8a6918]", items: ["演示清洁能源", "演示物流平台"] },
  { label: "拟投项目", count: 7, accent: "bg-gold/10 text-gold", items: ["演示清洁能源", "演示光伏项目"] },
  { label: "已退出", count: 2, accent: "bg-slate-100 text-slate-700", items: ["西北数基", "中亚物流一期"] },
];
