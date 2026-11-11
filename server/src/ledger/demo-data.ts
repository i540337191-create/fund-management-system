import { createMemoryLedgerStore, createSeedLedgerState, type LedgerState } from './store.ts';

/** Fictional, linked data for the opt-in local demo; never imports a customer database. */
export function createDemoLedgerState(now = new Date()): LedgerState {
  const state = createSeedLedgerState();
  const day = (offset: number) => new Date(now.getTime() + offset * 86400000 + 8 * 3600000).toISOString().slice(0, 10);
  const stamp = now.toISOString();
  const origin = { dataOrigin: 'seed_demo' as const, createdAt: stamp, updatedAt: day(0) };
  const fundNames = ['示例成长一期基金', '示例创新基金', '示例制造基金', '示例价值基金'];
  const stages = ['投后管理', '投资期', '募集期', '退出期'];
  const fundIds = fundNames.map((_, i) => `demo-fund-${i + 1}`);
  const companies = ['演示智能设备', '演示清洁能源', '演示医疗科技', '演示先进材料', '演示供应链', '演示数字基础设施'];
  const industries = ['智能制造', '清洁能源', '医疗科技', '先进材料', '物流科技', '数字基础设施'];
  const fundIndexes = [0, 1, 2, 0, 1, 3];
  const projectStages = ['投后', '尽调', '初筛', '投后', '投决', '退出'];
  const projectIds = companies.map((_, i) => `demo-project-${i + 1}`);
  const taskNames = ['补充季度经营报告', '核对投资协议附件', '确认尽调访谈安排', '审核投后跟踪报告', '复核投资人资料', '准备投决会议材料', '跟进退出交割安排', '更新项目运营指标', '核验财务报表版本', '确认下一期出资计划'];
  const offsets = [-2, -1, 0, 0, 1, 2, 3, 5, 6, 10];
  const taskProjects = [0, 1, 1, 3, 2, 4, 5, 0, 1, 3];
  state.tasks = taskNames.map((name, i) => ({ ...origin, id: `demo-task-${i + 1}`, projectId: projectIds[taskProjects[i]], name, type: i % 3 === 0 ? '投后任务' : i % 3 === 1 ? '资料补充' : '个人安排', stage: projectStages[taskProjects[i]], owner: '管理员', ownerId: 'user-admin', dueDate: day(offsets[i]), status: i < 2 ? '已逾期' : i % 3 === 0 ? '待审核' : '待确认', priority: i < 3 ? '高' : '中', relation: '虚构演示资料', note: '此事项及关联组织、人员、金额均为虚构，仅用于演示。' }));
  state.projects = companies.map((shortName, i) => ({ ...origin, id: projectIds[i], companyId: `demo-company-${i + 1}`, name: `${shortName}有限公司`, shortName, fundId: fundIds[fundIndexes[i]], fund: fundNames[fundIndexes[i]], industry: industries[i], status: i === 0 || i === 3 ? '已投' : i === 5 ? '退出中' : '拟投', stage: projectStages[i], manager: '演示投资经理', amount: i === 0 || i === 3 ? '2,500 万元' : '1,000 万元', risk: i === 0 ? '高' : i < 3 ? '中' : '低', latest: i === 0 ? '季度经营报告待补充' : i === 1 ? '投资协议附件待核对' : '按计划推进', todoCount: state.tasks.filter(t => t.projectId === projectIds[i]).length, description: `虚构${industries[i]}项目，用于展示基金与项目之间的业务关联。`, thesis: '仅为功能演示，不构成投资建议。', nextAction: state.tasks.find(t => t.projectId === projectIds[i])?.name ?? '持续跟踪项目进展' }));
  state.companies = state.projects.map((p, i) => ({ ...origin, id: `demo-company-${i + 1}`, name: p.name, shortName: p.shortName, industry: p.industry, revision: 1 }));
  state.funds = fundNames.map((name, i) => ({ ...origin, id: fundIds[i], name, shortName: name.replace('基金', ''), stage: stages[i], manager: '管理员', managerId: 'user-admin', scale: '1.00 亿', paidIn: i === 2 ? '0 元' : '8,000 万元', invested: i === 0 ? '5,000 万元' : i === 1 ? '0 元' : i === 3 ? '1,000 万元' : '0 元', balance: i === 0 ? '3,000 万元' : i === 1 ? '8,000 万元' : i === 3 ? '7,000 万元' : '0 元', projectCount: state.projects.filter(p => p.fundId === fundIds[i]).length, investorCount: 2, openTasks: state.tasks.filter(t => state.projects.some(p => p.id === t.projectId && p.fundId === fundIds[i])).length, riskCount: i < 2 ? 1 : 0, nextAction: ['收集季度经营报告', '复核待投项目资料', '确认投资人适当性资料', '跟进退出交割安排'][i] }));
  state.investors = fundIds.flatMap((fundId, i) => [0, 1].map(j => ({ ...origin, id: `demo-investor-${i + 1}-${j + 1}`, fundId, name: `演示机构投资人${i * 2 + j + 1}`, type: '机构投资者', commitment: '5,000 万元', paidIn: i === 2 ? '0 元' : '4,000 万元', suitabilityStatus: i === 2 ? '待补资料' : '已完成', signStatus: i === 2 ? '待签署' : '已签署' })));
  state.documents = [];
  state.materials = [];
  state.clauses = fundIds.map((fundId, i) => ({ ...origin, id: `demo-clause-${i + 1}`, fundId, title: '季度运营报告提交', source: '虚构演示条款', trigger: '季度结束后收集经营数据', owner: '管理员', status: '待收集数据' }));
  state.risks = [
    { projectId: projectIds[0], target: companies[0], title: '季度经营报告逾期', type: '资料风险', level: '高', summary: '演示情景：经营报告尚待补充，需核对版本。' },
    { projectId: projectIds[1], target: companies[1], title: '投资协议附件待核验', type: '协议风险', level: '中', summary: '演示情景：协议附件待法务复核。' },
    { projectId: null, target: fundNames[2], title: '投资人资料待补充', type: '募集风险', level: '中', summary: '演示情景：募集资料完整性尚待确认。' },
  ].map((r, i) => ({ ...origin, ...r, fundId: r.projectId ? state.projects.find(p => p.id === r.projectId)!.fundId : fundIds[2], id: `demo-risk-${i + 1}`, source: '虚构演示数据', time: day(-i), status: '待处理' }));
  for (const fund of state.funds) fund.riskCount = state.risks.filter(r => r.projectId ? state.projects.some(p => p.id === r.projectId && p.fundId === fund.id) : r.target === fund.name).length;
  state.reports = fundIds.slice(0, 2).map((fundId, i) => ({ ...origin, id: `demo-report-${i + 1}`, fundId, projectId: null, name: `${fundNames[i]}季度运营报告（演示）`, target: fundNames[i], type: '基金季度报告', status: '草稿', owner: '管理员', sections: [{ title: '运营概况', text: '全部组织、人员、指标和金额均为虚构。本报告仅展示系统流程。' }, { title: '本周进展', text: '已整理项目资料，下一步复核经营报告及投资协议附件。' }] }));
  state.reportExports = [];
  state.capitalRecords = state.projects.filter(p => p.status === '已投').map((p, i) => ({ ...origin, id: `demo-capital-${i + 1}`, fundId: p.fundId, projectId: p.id, company: p.name, fund: p.fund, received: '2,500 万元', date: day(-15), rule: '演示规则：年化 2%', receivable: '20,548 元', dueDate: day(i + 1), status: '未收' }));
  state.meetings = state.projects.slice(0, 2).map((p, i) => ({ ...origin, id: `demo-meeting-${i + 1}`, projectId: p.id, project: p.name, title: `${p.shortName}项目进展会议`, date: day(i + 1), attendees: '管理员 / 演示投资经理', status: '已归档', summary: '虚构会议，讨论资料收集、项目进度及下一步安排。', todos: 1, risks: 0, conclusions: ['按计划推进资料核验'], todoItems: ['补充季度经营报告'], riskItems: [] }));
  state.aiIntakeItems = [];
  state.auditEvents = [];
  return state;
}

export function createDemoLedgerStore() {
  const store = createMemoryLedgerStore(createDemoLedgerState());
  store.insertUser({id: 'user-admin', name: '管理员', email: 'admin@example.invalid', role: 'admin', passwordHash: null, enabled: true});
  return store;
}
