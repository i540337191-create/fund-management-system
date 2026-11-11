import type { RiskLevel } from "./projects";

export type RiskItem = {
  id?:string;
  fundId?:string;
  projectId?:string|null;
  status?:string;
  deletedAt?:string;
  dataOrigin?:string;
  dataPurpose?:string;
  title: string;
  target: string;
  type: string;
  level: RiskLevel;
  source: string;
  time: string;
  summary: string;
};

export const risks: RiskItem[] = [
  {
    dataOrigin: "seed_demo",
    title: "演示智能设备有限公司新增知识产权变更",
    target: "演示智能设备有限公司",
    type: "知识产权",
    level: "中",
    source: "国家知识产权局",
    time: "2026-04-25",
    summary: "核心控制算法相关专利进入权利人变更流程，需确认是否与融资结构调整相关。",
  },
  {
    dataOrigin: "seed_demo",
    title: "地方政府发布智能装备专项补贴政策",
    target: "演示智能设备有限公司",
    type: "政府公告",
    level: "低",
    source: "西安市工信局",
    time: "2026-04-27",
    summary: "政策覆盖智能产线改造项目，演示智能设备现有产品线可能符合申报条件。",
  },
  {
    dataOrigin: "seed_demo",
    title: "先进制造行业 Q1 增速下调",
    target: "先进制造行业",
    type: "行业动态",
    level: "中",
    source: "行业研究报告",
    time: "2026-04-22",
    summary: "受下游资本开支延后影响，行业机构将全年增速预期从 18% 调整至 13%。",
  },
  {
    dataOrigin: "seed_demo",
    title: "演示清洁能源有限公司新增开庭公告",
    target: "演示清洁能源有限公司",
    type: "诉讼信息",
    level: "高",
    source: "人民法院公告网",
    time: "2026-04-26",
    summary: "涉及供应合同纠纷，争议金额较高，需法务在投决前补充风险意见。",
  },
  {
    dataOrigin: "seed_demo",
    title: "深圳演示供应链核心客户回款周期拉长",
    target: "演示供应链有限公司",
    type: "经营风险",
    level: "中",
    source: "企业反馈",
    time: "2026-04-24",
    summary: "三月应收账款周转天数较上月增加 18 天，需关注现金流压力。",
  },
];

export const riskTimeline = [
  { date: "2026-04-27", title: "新增政府补贴政策", level: "低" as RiskLevel },
  { date: "2026-04-25", title: "新增一条知识产权变更", level: "中" as RiskLevel },
  { date: "2026-04-22", title: "行业报告显示市场增速下调", level: "中" as RiskLevel },
];
