export type ChatMessage = {
  assetStatusNote?: string;
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  structured?: {
    title: string;
    summary: string;
    metrics?: Array<{ label: string; value: string; detail?: string }>;
    items?: Array<{
      title: string;
      meta?: string;
      status?: string;
      description?: string;
      links?: Array<{ label: string; href: string }>;
    }>;
    evidence?: Array<{
      title: string;
      fileName: string;
      page: number;
      excerpt: string;
      links?: Array<{ label: string; href: string }>;
    }>;
    nextActions?: string[];
  };
  action?: {
    href?: string;
    title: string;
    rows: Array<{ label: string; value: string }>;
    button: string;
  };
};

export const aiMessages: ChatMessage[] = [
  {
    role: "user",
    content: "查一下演示智能设备有限公司最新情况",
  },
  {
    role: "assistant",
    content:
      "该企业目前处于投后管理阶段，已完成首笔 3000 万投资。最近 7 天新增 3 条动态：1 条政策利好、1 条知识产权变更、1 条行业增速下调。建议关注二季度经营数据和后续管理费计收。",
    sources: ["项目档案 / 投资信息", "风险监控 / 2026-04-22 至 2026-04-27", "资金事项 / 到账记录"],
  },
  {
    role: "user",
    content: "演示智能设备今天到账 3000 万，帮我记录",
  },
  {
    role: "assistant",
    content: "我已识别到账信息，确认后将生成到账记录、更新已投金额，并创建管理费提醒。",
    action: {
      title: "到账记录确认",
      rows: [
        { label: "识别企业", value: "演示智能设备有限公司" },
        { label: "到账金额", value: "3000 万" },
        { label: "到账日期", value: "2026-04-27" },
        { label: "关联基金", value: "示例成长一期基金" },
      ],
      button: "确认记录",
    },
    sources: ["用户指令", "项目主数据", "资金事项规则"],
  },
  {
    role: "user",
    content: "生成示例成长一期基金一季度运营报告",
  },
  {
    role: "assistant",
    content:
      "已选择模板：基金季度运营报告模板。已匹配资料：财务数据、企业反馈、风险监控、会议纪要。下一步可以生成草稿，并标注缺失字段供人工补充。",
    sources: ["报告模板库", "基金运营数据", "会议纪要归档"],
  },
  {
    role: "user",
    content: "下周有哪些管理费要收？",
  },
  {
    role: "assistant",
    content: "下周共有 4 笔管理费待收，其中 1 笔金额较大。合计应收：127.6 万元。",
    sources: ["资金事项 / 应收提醒", "管理费规则配置"],
  },
  {
    role: "user",
    content: "把今天和演示智能设备的会议纪要归档到项目里",
  },
  {
    role: "assistant",
    content: "我已识别会议纪要内容，确认后将归档到项目，并同步生成待办和风险记录。",
    action: {
      title: "会议纪要归档确认",
      rows: [
        { label: "识别项目", value: "演示智能设备有限公司" },
        { label: "会议时间", value: "2026-04-28" },
        { label: "纪要类型", value: "投后沟通会议" },
        { label: "提取待办", value: "3 项" },
        { label: "提取风险", value: "1 项" },
      ],
      button: "确认归档",
    },
    sources: ["会议纪要原文", "项目主数据", "任务规则"],
  },
  {
    role: "user",
    content: "下周一提醒我跟进演示智能设备二季度经营数据",
  },
  {
    role: "assistant",
    content: "已识别为资料补充提醒任务，确认后将加入项目任务待办，并在企业微信同步提醒。",
    action: {
      title: "提醒任务创建确认",
      rows: [
        { label: "任务名称", value: "跟进演示智能设备二季度经营数据" },
        { label: "关联项目", value: "演示智能设备有限公司" },
        { label: "负责人", value: "演示投资经理" },
        { label: "提醒时间", value: "2026-05-04 09:00" },
        { label: "任务类型", value: "资料补充" },
      ],
      button: "确认创建",
    },
    sources: ["用户指令", "项目任务规则", "用户日程"],
  },
];
