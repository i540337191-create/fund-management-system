export type ReportStatus = "草稿" | "生成中" | "待审核" | "已完成";

export type ReportRecord = {
  templateSnapshot?:{id:string;title:string;version:number;[key:string]:any};
  sections?:{title:string;text:string}[];
  targetType?: "project" | "fund";
  targetId?: string;
  id?: string;
  fundId?: string | null;
  projectId?: string | null;
  name: string;
  target: string;
  type: string;
  status: ReportStatus;
  owner: string;
  updatedAt: string;
  dataOrigin?: string;dataPurpose?:string;
};

export const reportTypes = [
  "行业研究报告",
  "项目初筛报告",
  "尽调报告",
  "基金季度报告",
  "基金半年度报告",
  "基金年度报告",
  "企业监控报告",
  "会议纪要报告",
];

export const reports: ReportRecord[] = [
  {
    name: "示例成长一期基金 2026 年一季度运营报告",
    target: "示例成长一期基金",
    type: "基金季度报告",
    status: "待审核",
    owner: "基金运营 / 演示财务经理",
    updatedAt: "2026-04-27 17:20",
  },
  {
    name: "演示智能设备有限公司月度监控报告",
    target: "演示智能设备有限公司",
    type: "企业监控报告",
    status: "已完成",
    owner: "演示投资经理",
    updatedAt: "2026-04-26 09:40",
  },
  {
    name: "新能源装备行业研究报告",
    target: "新能源装备行业",
    type: "行业研究报告",
    status: "生成中",
    owner: "演示研究员",
    updatedAt: "2026-04-27 15:08",
  },
  {
    name: "演示医疗科技有限公司尽调报告",
    target: "演示医疗科技有限公司",
    type: "尽调报告",
    status: "草稿",
    owner: "演示项目经理",
    updatedAt: "2026-04-25 11:12",
  },
];

export const reportDraftSections = [
  "一、基金基本情况",
  "二、本季度投资进展",
  "三、被投企业经营情况",
  "四、财务数据概览",
  "五、重大事项说明",
  "六、风险事项",
  "七、下季度工作计划",
];
