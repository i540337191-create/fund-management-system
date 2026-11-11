import type { CapitalItem } from "../data/capital";
import type { Project, RiskLevel } from "../data/projects";
import type { ReportRecord } from "../data/reports";
import type { RiskItem } from "../data/risks";
import {isManagedProject,isHistoricalFollowup} from './projectAssetHistory.ts';

export type TaskStatus = "未开始" | "进行中" | "待确认" | "已完成" | "已逾期" | "已取消";
export type TaskPriority = "高" | "中" | "低";

export type ProjectTask = {
  ownerId?: string | null;
  kind?: string;
  approvalRoundId?: string | null;
  revision?: number;
  completedAt?: string | null;
  id: string;
  name: string;
  type: string;
  stage: string;
  owner: string;
  dueDate: string;
  status: TaskStatus;
  priority: TaskPriority;
  relation: string;
  note: string;
  dataOrigin?: string;
};

export type DashboardDecisionItem = {
  project: string;
  signal: string;
  importance: "高重要" | "中重要" | "低重要";
  urgency: "高紧急" | "中紧急" | "低紧急";
  action: "现在处理" | "今日跟进" | "本周推进" | "持续观察";
  reason: string;
  path: string;
  tone: "red" | "gold" | "green" | "slate";
};

export type DashboardTodoItem = {
  sourceId?: string;
  taskId?: string;
  item: string;
  module: string;
  due: string;
  importance: "高重要" | "中重要" | "低重要";
  urgency: "高紧急" | "中紧急" | "低紧急";
  action: "现在处理" | "今日跟进" | "本周推进" | "持续观察";
  path: string;
  tone: "red" | "gold" | "green" | "slate";
};

export function isActiveDashboardReport(report:ReportRecord,projects:Project[]){
  const p=projects.find(p=>report.projectId===p.id||(report.targetType==='project'&&report.targetId===p.id)||report.target===p.name||report.target===p.shortName);
  return !p||isManagedProject(p)||isHistoricalFollowup(report.type+' '+report.name);
}

export const isActiveRisk=(risk:{status?:string;deletedAt?:string})=>!risk.deletedAt&&risk.status!=='已处理';
export function deriveDashboardDecisions({
  projects,
  risks,
  reports,
  capitalItems,
  tasksByProject,
}: {
  projects: Project[];
  risks: RiskItem[];
  reports: ReportRecord[];
  capitalItems: CapitalItem[];
  tasksByProject: Record<string, ProjectTask[]>;
}) {
  const projectHealth = projects.filter(p=>isManagedProject(p)||(p.assetOpenClaims??0)>0||(tasksByProject[p.id]??[]).some(t=>!['已完成','已取消'].includes(t.status)&&isHistoricalFollowup(t.type+' '+t.name)))
    .map((project) => {
      const projectRisks = risks.filter(isActiveRisk).filter((risk) => risk.projectId ? risk.projectId === project.id : Boolean(risk.target && ((project.name && risk.target.includes(project.name)) || (project.shortName && risk.target.includes(project.shortName)))));
      const highestRisk = projectRisks.sort((a, b) => riskScore(b.level) - riskScore(a.level))[0];
      const openTasks = (tasksByProject[project.id] ?? []).filter((task) => task.status !== "已完成" && task.status !== "已取消" && (isManagedProject(project)||isHistoricalFollowup(task.type+' '+task.name)));
      const overdueTask = openTasks.find((task) => task.status === "已逾期");
      if(!isManagedProject(project))return {project:displayProjectName(project),signal:overdueTask?.name??openTasks[0]?.name??`${project.assetOpenClaims??0}项历史追索待处理`,importance:'高重要',urgency:overdueTask?'高紧急':'中紧急',action:overdueTask?'现在处理':'今日跟进',reason:'历史资产的追索、收益核验、补充归档或复盘事项',path:`/projects/${project.id}?tab=${encodeURIComponent('投资信息')}#asset-history`,tone:overdueTask?'red':'gold',score:overdueTask?100:75} as const;
      const score = riskScore(highestRisk?.level ?? project.risk) * 10 + (overdueTask ? 8 : 0) + openTasks.length;
      const urgency = highestRisk?.level === "高" || overdueTask ? "高紧急" : project.risk === "中" ? "中紧急" : "低紧急";
      const importance = project.risk === "高" || highestRisk?.level === "高" ? "高重要" : project.status === "已投" ? "高重要" : "中重要";

      return {
        project: displayProjectName(project),
        signal: highestRisk?.title ?? overdueTask?.name ?? project.latest,
        importance,
        urgency,
        action: actionFor(importance, urgency),
        reason: highestRisk ? `${highestRisk.type}已触发` : overdueTask ? "存在逾期待办" : project.nextAction,
        path: highestRisk ? `/projects/${project.id}?tab=${encodeURIComponent("风险监控")}` : `/projects/${project.id}`,
        tone: toneFor(importance, urgency),
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ score: _score, ...item }) => item);

  const taskTodos = Object.entries(tasksByProject).flatMap(([projectId, tasks]) =>
    tasks
      .filter((task) => task.status !== "已完成" && task.status !== "已取消" && (!projects.some(p=>p.id===projectId)||projects.some(p=>p.id===projectId&&isManagedProject(p))||isHistoricalFollowup(task.type+' '+task.name)))
      .map((task) => ({
        sourceId: `task:${projectId}:${task.id}`,
        taskId: task.id,
        item: task.name,
        module: task.type,
        due: task.dueDate,
        importance: task.priority === "高" ? "高重要" : "中重要",
        urgency: task.status === "已逾期" ? "高紧急" : task.status === "待确认" ? "中紧急" : "低紧急",
        action: actionFor(task.priority === "高" ? "高重要" : "中重要", task.status === "已逾期" ? "高紧急" : "低紧急"),
        path: `/projects/${projectId}`,
        tone: task.status === "已逾期" ? ("red" as const) : task.priority === "高" ? ("gold" as const) : ("green" as const),
        score: task.status === "已逾期" ? 100 : task.priority === "高" ? 70 : 40,
      })),
  );

  const reportTodos = reports
    .filter(report=>isActiveDashboardReport(report,projects))
    .filter((report) => report.status === "待审核" || report.status === "生成中")
    .map((report) => ({
      sourceId: `report:${report.id ?? `${report.name}:${report.target}`}`,
      item: `${report.name}${report.status === "待审核" ? "待审核" : "生成中"}`,
      module: "报告中心",
      due: "本周",
      importance: "高重要" as const,
      urgency: report.status === "待审核" ? ("中紧急" as const) : ("低紧急" as const),
      action: report.status === "待审核" ? ("今日跟进" as const) : ("本周推进" as const),
      path: "/reports",
      tone: "gold" as const,
      score: report.status === "待审核" ? 65 : 45,
    }));

  const capitalTodos = capitalItems
    .filter((item) => item.status === "逾期" || item.status === "未收")
    .map((item) => ({
      sourceId: `capital:${item.id ?? `${item.company}:${item.fund}:${item.date}:${item.dueDate}`}`,
      item: `${item.company}管理费待收`,
      module: "资金事项",
      due: item.dueDate,
      importance: "高重要" as const,
      urgency: item.status === "逾期" ? ("高紧急" as const) : ("中紧急" as const),
      action: item.status === "逾期" ? ("现在处理" as const) : ("今日跟进" as const),
      path: "/capital",
      tone: item.status === "逾期" ? ("red" as const) : ("green" as const),
      score: item.status === "逾期" ? 95 : 60,
    }));

  const claimTodos=projects.filter(p=>(p.assetOpenClaims??0)>0).map(p=>({sourceId:`exit-claims:${p.id}`,item:`${p.shortName}历史追索待处理（${p.assetOpenClaims}项）`,module:'历史资产追索',due:'待核对',importance:'高重要' as const,urgency:'中紧急' as const,action:'今日跟进' as const,path:`/projects/${p.id}?tab=${encodeURIComponent('投资信息')}#asset-history`,tone:'gold' as const,score:75}));
  const operationTodos = [...taskTodos, ...reportTodos, ...capitalTodos,...claimTodos]
    .sort((a, b) => b.score - a.score)
    .map(({ score: _score, ...item }) => item);

  return {
    projectHealth,
    operationTodos,
  };
}

export function createRiskFollowUpTask(
  risk: RiskItem,
  projects: Project[],
  createdAt: string,
): ProjectTask | null {
  const project = risk.projectId?projects.find(p=>p.id===risk.projectId):findProjectForTarget(projects, risk.target);
  if (!project) return null;

  return {
    id: `risk-${project.id}-${risk.time}`,
    name: `跟进${risk.title}`,
    type: "风险核查",
    stage: project.stage,
    owner: project.manager,
    dueDate: addDays(createdAt, risk.level === "高" ? 1 : 3),
    status: "未开始",
    priority: risk.level === "低" ? "中" : "高",
    relation: `风险 / ${risk.type}`,
    note: `来源：${risk.source} / ${risk.time}。${risk.summary}`,
  };
}

export function createMaterialGapTask(gap: string, project: Project, createdAt: string): ProjectTask {
  return {
    id: `material-gap-${project.id}-${slugify(gap)}`,
    name: `补充${gap}`,
    type: "资料补充",
    stage: project.stage,
    owner: project.manager,
    dueDate: addDays(createdAt, 3),
    status: "未开始",
    priority: "高",
    relation: `资料缺口 / ${gap}`,
    note: "由项目资料缺口生成，补齐后应回写资料库。",
  };
}

export function upsertTaskForProject(tasks: ProjectTask[], task: ProjectTask) {
  return tasks.some((item) => item.id === task.id) ? tasks : [task, ...tasks];
}

export function findProjectForTarget(projects: Project[], target: string) {
  return projects.find((project) => target.includes(project.name) || target.includes(project.shortName)) ?? null;
}

export function slugify(value: string) {
  const dictionary: Record<string, string> = {
    近: "jin",
    三: "san",
    个: "ge",
    月: "yue",
    经: "jing",
    营: "ying",
    数: "shu",
    据: "ju",
    最: "zui",
    新: "xin",
    审: "shen",
    计: "ji",
    报: "bao",
    告: "gao",
  };

  return value
    .match(/[A-Za-z0-9]+|./g)!
    .map((token) => {
      if (/^[A-Za-z0-9]+$/.test(token)) return token.toLowerCase();
      return dictionary[token] ?? "-";
    })
    .join("-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function displayProjectName(project: Project) {
  return project.name.replace(/(?:有限责任公司|有限公司)$/, "");
}

function riskScore(level: RiskLevel) {
  if (level === "高") return 3;
  if (level === "中") return 2;
  return 1;
}

function actionFor(
  importance: DashboardDecisionItem["importance"],
  urgency: DashboardDecisionItem["urgency"],
): DashboardDecisionItem["action"] {
  if (importance === "高重要" && urgency === "高紧急") return "现在处理";
  if (importance === "高重要" || urgency === "中紧急") return "今日跟进";
  if (importance === "中重要") return "本周推进";
  return "持续观察";
}

function toneFor(
  importance: DashboardDecisionItem["importance"],
  urgency: DashboardDecisionItem["urgency"],
): DashboardDecisionItem["tone"] {
  if (importance === "高重要" && urgency === "高紧急") return "red";
  if (importance === "高重要" || urgency === "中紧急") return "gold";
  if (importance === "中重要") return "green";
  return "slate";
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function shanghaiCalendarDate(now=new Date()){return now.toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});}
