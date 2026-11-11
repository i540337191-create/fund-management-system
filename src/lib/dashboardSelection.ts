import type {RiskItem} from '../data/risks';
import type {DashboardDecisionItem} from './workbenchLogic';
import {creationOrder} from './creationOrder.ts';
import {dashboardTaskAction} from './dashboardTaskPresentation.ts';
export type DashboardPriorityTask={id:string;projectId?:string;fundId?:string;dueAt?:string;createdAt?:string;status?:string;sourceUnavailable?:boolean;ownerId?:string};
type ObjectRecord={id:string;name:string;shortName?:string;createdAt?:string;fundId?:string};
export const openDashboardTask=(t:DashboardPriorityTask)=>!t.sourceUnavailable&&!['complete','cancelled','已完成','已取消'].includes(t.status??'');
export const activeDashboardRisk=(r:RiskItem)=>!r.deletedAt&&r.status!=='已处理';
const riskLevel=(r:RiskItem)=>({高:0,中:1,低:2}[r.level]??3);
const due=(t:DashboardPriorityTask)=>Number.isFinite(Date.parse(t.dueAt??''))?Date.parse(t.dueAt!):Infinity;
export function dashboardRiskDue(r:RiskItem&{dueAt?:string},tasks:readonly DashboardPriorityTask[]){
 const explicit=Date.parse(r.dueAt??'');if(Number.isFinite(explicit))return explicit;
 return Math.min(Infinity,...tasks.filter(t=>openDashboardTask(t)&&Boolean(r.projectId)&&t.projectId===r.projectId).map(due));
}
export function dashboardRiskOrder(risks:readonly RiskItem[],tasks:readonly DashboardPriorityTask[]=[]){
 return risks.filter(activeDashboardRisk).slice().sort((a,b)=>riskLevel(a)-riskLevel(b)||dashboardRiskDue(a,tasks)-dashboardRiskDue(b,tasks)||(a.id??a.title).localeCompare(b.id??b.title));
}
export function dashboardRiskAttention(risks:readonly RiskItem[],tasks:readonly DashboardPriorityTask[],projects:readonly ObjectRecord[],excluded:readonly string[]=[],now=Date.now()):DashboardDecisionItem[]{
 const skip=new Set(excluded);
 return dashboardRiskOrder(risks,tasks).filter(r=>!skip.has('risk:'+(r.id??r.title))).map(r=>{
  const when=dashboardRiskDue(r,tasks),bucket=dashboardTaskAction({id:r.id??r.title,dueAt:Number.isFinite(when)?new Date(when).toISOString():undefined},now);
  const action=r.level==='高'||bucket==='现在处理'?'现在处理':bucket==='今日跟进'?'今日跟进':bucket==='本周处理'?'本周推进':'持续观察';
  const p=projects.find(p=>p.id===r.projectId);
  return {project:p?.shortName||p?.name||r.target,signal:r.title,importance:r.level==='高'?'高重要':'中重要',urgency:action==='现在处理'?'高紧急':action==='今日跟进'?'中紧急':'低紧急',action,reason:r.summary,path:p?'/projects/'+encodeURIComponent(p.id)+'?tab='+encodeURIComponent('风险监控'):'/monitoring',tone:r.level==='高'?'red':r.level==='中'?'gold':'green'};
 });
}
export function dashboardObjectOrder<T extends ObjectRecord>(objects:readonly T[],kind:'fund'|'project',projects:readonly ObjectRecord[],tasks:readonly DashboardPriorityTask[],risks:readonly RiskItem[],now=Date.now()):T[]{
 const linkedProject=(id:string|null|undefined,object:T)=>kind==='project'?id===object.id:projects.some(p=>p.id===id&&p.fundId===object.id);
 const score=(object:T)=>{
  const linkedRisks=risks.filter(r=>activeDashboardRisk(r)&&(linkedProject(r.projectId,object)||kind==='fund'&&(r as RiskItem&{fundId?:string}).fundId===object.id));
  const linkedTasks=tasks.filter(t=>openDashboardTask(t)&&(linkedProject(t.projectId,object)||kind==='fund'&&t.fundId===object.id));
  const taskRanks=linkedTasks.map(t=>({现在处理:1,今日跟进:3,本周处理:4,持续观察:6}[dashboardTaskAction(t,now)]));
  const rank=Math.min(6,...linkedRisks.map(r=>r.level==='高'?0:r.level==='中'?2:5),...taskRanks);
  return {rank,due:Math.min(Infinity,...linkedTasks.map(due))};
 };
 const scores=new Map(objects.map(o=>[o.id,score(o)]));
 return creationOrder(objects).sort((a,b)=>{const x=scores.get(a.id)!,y=scores.get(b.id)!;return x.rank-y.rank||(x.rank<6?x.due-y.due:0);});
}
export function dashboardPersonalSchedule<T extends DashboardPriorityTask>(tasks:readonly T[],ownerId:string|undefined,now=Date.now()){
 const personal=tasks.filter(t=>Boolean(ownerId)&&t.ownerId===ownerId&&openDashboardTask(t)&&Number.isFinite(due(t)));
 const ordered=creationOrder(personal).sort((a,b)=>due(a)-due(b));
 return {schedule:ordered.filter(t=>due(t)>=now&&due(t)<now+7*86400000),overdue:ordered.filter(t=>due(t)<now)};
}
// Exit period is still managed; only an explicit terminal state removes a fund.
export function isManagedDashboardFund(fund:{stage:string;status?:string}){
 return ![fund.status,fund.stage].some(state=>['已退出','已完成退出','清算完成'].includes(state??''));
}
