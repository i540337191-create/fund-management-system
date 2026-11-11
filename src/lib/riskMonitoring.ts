import type { Project } from '../data/projects';
import type { RiskItem } from '../data/risks';
import { findProjectForTarget } from './workbenchLogic.ts';

export const riskCategories = ['全部对象', '被投企业', '拟投企业', '重点行业', '政府部门', '诉讼信息', '知识产权'];

export function filterMonitoringRisks(records: RiskItem[], projects: Project[], filters: {
  company: string; category: string; type: string; time: string; today: string; start: string; end: string;
}) {
  return records.filter(risk => {
    const project = risk.projectId ? projects.find(p => p.id === risk.projectId) : findProjectForTarget(projects, risk.target);
    const categoryOk = filters.category === '全部对象'
      || (filters.category === '被投企业' && project?.status === '已投')
      || (filters.category === '拟投企业' && project?.status === '拟投')
      || (filters.category === '重点行业' && risk.type === '行业动态')
      || (filters.category === '政府部门' && risk.type === '政府公告')
      || risk.type === filters.category;
    if (!categoryOk || (filters.company !== '全部企业' && risk.target !== filters.company)
      || (filters.type !== '全部类型' && risk.type !== filters.type)) return false;
    if (filters.time === '全部时间'||filters.time === '全部时间（流程示例）') return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(risk.time)) return false;
    if (filters.time === '自定义') return (!filters.start || risk.time >= filters.start) && (!filters.end || risk.time <= filters.end);
    if (risk.time > filters.today) return false;
    if (filters.time === '本季度') {
      const [year, month] = filters.today.split('-');
      return risk.time >= `${year}-${String(Math.floor((Number(month) - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;
    }
    const start = new Date(`${filters.today}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - (filters.time === '近 7 天' ? 6 : 29));
    return risk.time >= start.toISOString().slice(0, 10);
  }).sort((a, b) => ({高: 0, 中: 1, 低: 2}[a.level] - {高: 0, 中: 1, 低: 2}[b.level]));
}
