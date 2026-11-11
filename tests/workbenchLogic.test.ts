import assert from "node:assert/strict";
import test from "node:test";
import { capitalItems } from "../src/data/capital.ts";
import { projects } from "../src/data/projects.ts";
import { reports } from "../src/data/reports.ts";
import { risks } from "../src/data/risks.ts";
import {
  createMaterialGapTask,
  createRiskFollowUpTask,
  shanghaiCalendarDate,
  deriveDashboardDecisions,
  upsertTaskForProject,
  type ProjectTask,
} from "../src/lib/workbenchLogic.ts";

const tasksByProject: Record<string, ProjectTask[]> = {
  "demo-robotics": [
    {
      id: "overdue-audit",
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
  ],
};

test("derives dashboard decisions from risks, tasks, reports, and capital records", () => {
  const result = deriveDashboardDecisions({
    projects,
    risks,
    reports,
    capitalItems,
    tasksByProject,
  });

  assert.equal(result.projectHealth[0].project, "演示清洁能源");
  assert.equal(result.projectHealth[0].action, "现在处理");
  assert.match(result.projectHealth[0].signal, /新增开庭公告/);
  assert.equal(result.operationTodos[0].item, "补充 2025 年审计报告");
  assert.equal(result.operationTodos[0].action, "现在处理");
  assert.ok(result.operationTodos.some((todo) => todo.item.includes("季度运营报告")));
});

test("creates a project task from a risk item and avoids duplicate upserts", () => {
  const risk = risks.find((item) => item.target === "演示清洁能源有限公司");
  assert.ok(risk);

  const task = createRiskFollowUpTask(risk, projects, "2026-06-10");
  assert.ok(task);
  assert.equal(task.id, "risk-beijing-fundapp-new-energy-2026-04-26");
  assert.equal(task.owner, "演示研究员");
  assert.equal(task.priority, "高");
  assert.match(task.relation, /风险/);

  const once = upsertTaskForProject([], task);
  const twice = upsertTaskForProject(once, task);

  assert.equal(twice.length, 1);
});

test("creates a material gap task for the active project", () => {
  const project = projects.find((item) => item.id === "demo-robotics");
  assert.ok(project);

  const task = createMaterialGapTask("近三个月经营数据", project, "2026-06-10");

  assert.equal(task.id, "material-gap-demo-robotics-jin-san-ge-yue-jing-ying-shu-ju");
  assert.equal(task.owner, "演示投资经理");
  assert.equal(task.status, "未开始");
  assert.equal(task.relation, "资料缺口 / 近三个月经营数据");
});

test("dashboard preserves distinct identities for same-named tasks and reordered rows", () => {
  const first = tasksByProject['demo-robotics'][0];
  const tasks = { 'demo-robotics': [first, { ...first, id: 'another-audit', priority: '低' as const }] };
  const args = { projects, risks: [], reports: [], capitalItems: [], tasksByProject: tasks };
  const initial = deriveDashboardDecisions(args).operationTodos;
  assert.equal(initial.length, 2); assert.notEqual(initial[0].sourceId, initial[1].sourceId);
  assert.deepEqual(new Set(initial.map(item => 'taskId' in item ? item.taskId : undefined)), new Set([first.id, 'another-audit']));
  tasks['demo-robotics'].reverse();
  assert.deepEqual(new Set(deriveDashboardDecisions(args).operationTodos.map(item=>item.sourceId)), new Set(initial.map(item=>item.sourceId)));
});

test('real risk task uses current Shanghai day and explicit project ID even when the historical target label matches another project',()=>{
 const target={...projects[0],id:'target-id',name:'现名'};const other={...projects[0],id:'other-id',name:'旧名'};
 const risk={...risks[0],projectId:target.id,target:'旧名',level:'高' as const,time:'2026-10-30'};
 const day=shanghaiCalendarDate(new Date('2026-10-29T17:30:00Z'));
 assert.equal(day,'2026-10-30');const task=createRiskFollowUpTask(risk,[other,target],day);assert.ok(task);assert.equal(task.dueDate,'2026-10-31');assert.ok(task.id.includes(target.id));
});

 test('overdue tasks and capital keep their actual deadline for calendar filtering',()=>{
 const result=deriveDashboardDecisions({projects,risks:[],reports:[],capitalItems:[{...capitalItems[0],id:'overdue-fee',status:'逾期',dueDate:'2026-05-02'}],tasksByProject});
 assert.equal(result.operationTodos.find(x=>x.sourceId==='task:demo-robotics:overdue-audit')?.due,'2026-05-01');
 assert.equal(result.operationTodos.find(x=>x.sourceId==='capital:overdue-fee')?.due,'2026-05-02');
 });

test('dashboard risk matches stable project ID before legacy names',()=>{
 const target={...projects[0],id:'target-risk',name:'新企业名称',shortName:'新简称',risk:'低' as const};
 const wrong={...projects[0],id:'other-risk',name:'旧企业名称',shortName:'旧简称',risk:'低' as const};
 const risk={...risks[0],projectId:target.id,target:wrong.name,title:'真实风险标识优先',level:'高' as const};
 const rows=deriveDashboardDecisions({projects:[target,wrong],risks:[risk],reports:[],capitalItems:[],tasksByProject:{}}).projectHealth;
 assert.equal(rows.find(r=>r.project===target.name)?.signal,risk.title);
 assert.equal(rows.find(r=>r.project===target.name)?.path,`/projects/${target.id}?tab=${encodeURIComponent('风险监控')}`);
 assert.notEqual(rows.find(r=>r.project===wrong.name)?.signal,risk.title);
});
test('dashboard decisions ignore deleted or resolved risk history but retain active and unknown-status risks',()=>{
 const p={...projects[0],risk:'低' as const,latest:'当前真实进展'},base={...risks[0],projectId:p.id,title:'QA历史风险不应继续关注',level:'高' as const};
 for(const extra of [{deletedAt:'2026-11-06T00:00:00Z'},{status:'已处理'}]){const result=deriveDashboardDecisions({projects:[p],risks:[{...base,...extra}],reports:[],capitalItems:[],tasksByProject:{}});assert.notEqual(result.projectHealth[0].signal,base.title);}
 const active=deriveDashboardDecisions({projects:[p],risks:[base],reports:[],capitalItems:[],tasksByProject:{}});assert.equal(active.projectHealth[0].signal,base.title);
});
