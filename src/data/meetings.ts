export type MeetingStatus = "待确认" | "已归档" | "需补充";

export type MeetingRecord = {
  scheduleStatus?:'unknown'|'scheduled'|'in_progress'|'ended'|'cancelled';startsAt?:string;endsAt?:string;
  revision?:number;deletedAt?:string;deletedBy?:string;
  taskDueDate?:string;
  id?:string;
  projectId?:string|null;
  title: string;
  project: string;
  date: string;
  attendees: string;
  status: MeetingStatus;
  todos: number;
  risks: number;
  summary: string;
  conclusions: string[];
  todoItems: string[];
  riskItems: string[];
  dataOrigin?: string;dataPurpose?:string;
};

export const meetings: MeetingRecord[] = [
  {
    title: "演示智能设备投后月度沟通会",
    project: "演示智能设备有限公司",
    date: "2026-04-27",
    attendees: "演示投资经理、企业 CFO、技术负责人",
    status: "待确认",
    todos: 3,
    risks: 2,
    summary: "会议确认首笔投资到账后资金使用计划，并讨论二季度订单、政府补贴申报和专利变更事项。",
    conclusions: ["二季度订单仍按计划推进", "补贴申报材料由企业本周内补齐", "专利变更需法务复核"],
    todoItems: ["收集二季度经营数据", "补齐补贴申报资料", "法务确认专利变更文件"],
    riskItems: ["行业增速放缓", "核心专利变更待复核"],
  },
  {
    title: "示例成长一期基金季度报告准备会",
    project: "示例成长一期基金",
    date: "2026-04-24",
    attendees: "演示财务经理、演示投资经理、演示研究员",
    status: "已归档",
    todos: 4,
    risks: 1,
    summary: "运营团队梳理季度报告字段，确认财务数据、企业反馈和重大事项的归集责任人。",
    conclusions: ["沿用协会模板", "本周完成企业反馈收集", "风险事项需引用来源"],
    todoItems: ["财务数据复核", "企业反馈汇总", "报告草稿生成", "管理层审核排期"],
    riskItems: ["部分企业反馈滞后"],
  },
  {
    title: "新能源项目尽调访谈",
    project: "演示清洁能源有限公司",
    date: "2026-04-23",
    attendees: "演示研究员、法务顾问、企业创始人",
    status: "需补充",
    todos: 5,
    risks: 3,
    summary: "访谈覆盖客户结构、储能项目交付、诉讼事项和融资计划，法务要求补充合同材料。",
    conclusions: ["业务增长较快", "诉讼事项需单独披露", "客户集中度需要进一步核验"],
    todoItems: ["补充供应合同", "核验客户回款", "更新尽调清单"],
    riskItems: ["诉讼争议金额较高", "客户集中度偏高", "交付周期存在波动"],
  },
];
