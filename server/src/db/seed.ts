import { withDbClient } from "./client.ts";
import { isMainModule } from "../runtime/is-main.ts";

type SeedRow = {
  sql: string;
  values: unknown[];
};

const seedRows: SeedRow[] = [
  {
    sql: "insert into users (id, name, email, role) values ($1, $2, $3, $4) on conflict (id) do nothing",
    values: ["user-demo-investment-manager", "演示投资经理", "investment@example.local", "investment_manager"],
  },
  {
    sql: "insert into users (id, name, email, role) values ($1, $2, $3, $4) on conflict (id) do nothing",
    values: ["user-demo-finance-manager", "演示财务经理", "finance@example.local", "finance"],
  },
  {
    sql: "insert into users (id, name, email, role) values ($1, $2, $3, $4) on conflict (id) do nothing",
    values: ["user-demo-portfolio-manager", "演示投后经理", "portfolio@example.local", "post_investment"],
  },
  {
    sql: "insert into funds (id, name, short_name, stage, manager_user_id, scale_label, paid_in_label, invested_label, balance_label, next_action, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict (id) do nothing",
    values: [
      "fundapp-growth-i",
      "示例成长一期基金",
      "示例成长一期",
      "投后管理",
      "user-demo-investment-manager",
      "5.00 亿",
      "4.72 亿",
      "3.67 亿",
      "1.05 亿",
      "二季度投后报告需收集财务与经营数据",
      "2026-06-08T00:00:00+08:00",
    ],
  },
  {
    sql: "insert into projects (id, fund_id, name, short_name, industry, status, stage, manager_user_id, amount_label, risk_level, latest, description, thesis, next_action, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) on conflict (id) do nothing",
    values: [
      "demo-robotics",
      "fundapp-growth-i",
      "演示智能设备有限公司",
      "演示智能设备",
      "智能装备",
      "已投",
      "投后",
      "user-demo-investment-manager",
      "3000 万元",
      "中",
      "二季度经营数据待补充，知识产权变更需复核。",
      "智能装备企业，当前处于投后跟踪阶段。",
      "国产替代和智能制造升级带来中长期机会。",
      "收集二季度经营数据并生成月度监控报告。",
      "2026-04-27T00:00:00+08:00",
    ],
  },
  {
    sql: "insert into portfolio_companies (id, name, short_name, industry, status) values ($1,$2,$3,$4,$5) on conflict (id) do update set name = excluded.name, short_name = excluded.short_name, industry = excluded.industry, status = excluded.status, updated_at = now()",
    values: ["company-demo-robotics", "演示智能设备有限公司", "演示智能设备", "先进制造 / 智能装备", "已投"],
  },
  {
    sql: "update projects set company_id = $1 where id = $2",
    values: ["company-demo-robotics", "demo-robotics"],
  },
  {
    sql: "insert into fund_company_investments (id, fund_id, company_id, project_id, investment_label, stage, status, invested_at) values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (id) do update set fund_id = excluded.fund_id, company_id = excluded.company_id, project_id = excluded.project_id, investment_label = excluded.investment_label, stage = excluded.stage, status = excluded.status, invested_at = excluded.invested_at, updated_at = now()",
    values: ["investment-fundapp-growth-i-demo-robotics", "fundapp-growth-i", "company-demo-robotics", "demo-robotics", "3000 万元", "投后", "已投资", "2026-04-27"],
  },
  {
    sql: "insert into fund_investors (id, fund_id, name, type, commitment_label, paid_in_label, suitability_status, sign_status) values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (id) do nothing",
    values: ["investor-fundapp-growth-i-beijing-fundapp", "fundapp-growth-i", "演示机构投资人A", "机构投资者", "1.20 亿", "1.20 亿", "已完成", "已签署"],
  },
  {
    sql: "insert into fund_documents (id, fund_id, name, category, owner_user_id, archived_at, path) values ($1,$2,$3,$4,$5,$6,$7) on conflict (id) do nothing",
    values: [
      "document-fundapp-growth-i-q1-report",
      "fundapp-growth-i",
      "2026 Q1 基金运营报告.docx",
      "投后报告",
      "user-demo-investment-manager",
      "2026-04-30T00:00:00+08:00",
      "基金档案 / 投后 / 季度报告",
    ],
  },
  {
    sql: "insert into fund_clause_monitors (id, fund_id, title, source, trigger, owner_user_id, status) values ($1,$2,$3,$4,$5,$6,$7) on conflict (id) do nothing",
    values: [
      "clause-fundapp-growth-i-quarterly-report",
      "fundapp-growth-i",
      "基金季度报告提交",
      "基金运营规则",
      "每季度结束后 15 个工作日内完成投资人报告",
      "user-demo-investment-manager",
      "待收集数据",
    ],
  },
  {
    sql: "insert into tasks (id, project_id, name, type, stage, owner_user_id, due_date, status, priority, relation, note) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict (id) do nothing",
    values: ["task-audit-report", "demo-robotics", "补充 2025 年审计报告", "资料补充", "尽调", "user-demo-investment-manager", "2026-05-01", "已逾期", "高", "资料缺口 / 财务资料", "需企业财务负责人确认审计机构版本。"],
  },
  {
    sql: "insert into meetings (id, project_id, raw_project_label, title, date, attendees, status, summary, conclusions, todo_items, risk_items, todos_count, risks_count) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13) on conflict (id) do nothing",
    values: [
      "meeting-demo-robotics-20260608",
      "demo-robotics",
      "演示智能设备有限公司",
      "演示智能设备投后月度沟通会",
      "2026-06-08",
      "演示投资经理 / 企业财务负责人",
      "待确认",
      "跟进二季度经营数据、核心客户回款与知识产权变更。",
      JSON.stringify(["二季度订单仍按计划推进", "补贴申报材料由企业本周内补齐", "专利变更需法务复核"]),
      JSON.stringify(["收集二季度经营数据", "补齐补贴申报资料", "法务确认专利变更文件"]),
      JSON.stringify(["行业增速放缓", "核心专利变更待复核"]),
      3,
      2,
    ],
  },
  {
    sql: "insert into ai_intake_items (id, title, input_type, source, submitted_by_user_id, submitted_at, summary, confidence, suggested_fund_id, suggested_project_id, suggested_project_label, suggested_path, extracted, generated_tasks, status) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15) on conflict (id) do nothing",
    values: [
      "meeting-20260608",
      "基金管理系统 AI Agent 项目会议纪要",
      "会议纪要",
      "语音转写 / 逐字稿",
      "user-demo-investment-manager",
      "2026-06-08T14:21:00+08:00",
      "识别到基金账本、AI 收件箱、资料归集、条款监控、报告协同、私有化部署等升级需求。",
      "92%",
      "fundapp-growth-i",
      null,
      "平台建设项目",
      "项目档案 / 会议纪要 / 需求沟通",
      JSON.stringify(["新增基金账本", "AI 输入归档确认", "资料长期保存", "私有化部署与备份"]),
      JSON.stringify(["补充基金全生命周期脱敏样例", "整理角色职责清单", "确认资料目录模板"]),
      "待确认",
    ],
  },
  {
    sql: "insert into ai_intake_items (id, title, input_type, source, submitted_by_user_id, submitted_at, summary, confidence, suggested_fund_id, suggested_project_id, suggested_project_label, suggested_path, extracted, generated_tasks, status) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15) on conflict (id) do nothing",
    values: [
      "agreement-demo-robotics",
      "演示智能设备投资协议条款识别",
      "投资协议",
      "PDF 上传",
      "user-demo-portfolio-manager",
      "2026-06-07T16:40:00+08:00",
      "识别到业绩承诺、回购触发、季度报告义务和管理费相关条款。",
      "88%",
      "fundapp-growth-i",
      "demo-robotics",
      "演示智能设备有限公司",
      "项目档案 / 协议条款 / 投资协议",
      JSON.stringify(["2026 年营收承诺", "季度经营数据提交", "重大事项通知义务"]),
      JSON.stringify(["创建业绩承诺监控项", "生成季度经营数据收集任务"]),
      "待确认",
    ],
  },
  {
    sql: "insert into ai_intake_items (id, title, input_type, source, submitted_by_user_id, submitted_at, summary, confidence, suggested_fund_id, suggested_project_id, suggested_project_label, suggested_path, extracted, generated_tasks, status) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15) on conflict (id) do nothing",
    values: [
      "financial-q2",
      "二季度基金大表数据归档",
      "财务报表",
      "Excel 上传",
      "user-demo-finance-manager",
      "2026-06-06T10:15:00+08:00",
      "识别到投资金额、到账金额、管理费应收和项目余额字段，可作为季度报告数据来源。",
      "95%",
      "fundapp-growth-i",
      "demo-robotics",
      "演示智能设备有限公司",
      "基金档案 / 账户资金 / 季度大表",
      JSON.stringify(["已投金额 1.73 亿", "待收管理费 127.6 万", "演示智能设备到账 3000 万"]),
      JSON.stringify(["财务确认管理费口径", "投资经理确认项目最新进展"]),
      "已归档",
    ],
  },
  {
    sql: "insert into reports (id, fund_id, name, target, type, status, owner_user_id, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (id) do nothing",
    values: ["report-fundapp-growth-i-q1-2026", "fundapp-growth-i", "示例成长一期基金 2026 年一季度运营报告", "示例成长一期基金", "基金季度报告", "待审核", "user-demo-finance-manager", "2026-04-27T17:20:00+08:00"],
  },
  {
    sql: "insert into capital_records (id, fund_id, project_id, company, received_label, received_date, rule, receivable_label, due_date, status) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (id) do nothing",
    values: ["capital-demo-robotics-20260427", "fundapp-growth-i", "demo-robotics", "演示智能设备有限公司", "3000 万元", "2026-04-27", "年化 2%，按日计费", "407,671 元", "2026-05-06", "未收"],
  },
  {
    sql: "insert into audit_events (id, module, action, target_type, target_id, target_name, actor_user_id, actor_name, event_time, detail, source) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict (id) do nothing",
    values: ["audit-fundapp-growth-i-init", "资金事项", "生成管理费清单", "基金", "fundapp-growth-i", "示例成长一期基金", "user-demo-finance-manager", "财务", "2026-05-08T09:30:00+08:00", "基于到账记录和管理费规则生成应收提醒。", "资金规则"],
  },
];

export async function seedDatabase(databaseUrl = process.env.DATABASE_URL) {
  await withDbClient(async (client) => {
    for (const row of seedRows) {
      await client.query(row.sql, row.values);
    }
  }, databaseUrl);
}

if (isMainModule(import.meta.url)) {
  await seedDatabase();
}
