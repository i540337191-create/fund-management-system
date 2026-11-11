import {creationOrder} from './creationOrder.ts';
import {displayedDealTerms,type DealBatch} from './dealTypes.ts';

export const dashboardActions=['现在处理','今日跟进','本周处理','持续观察'] as const;
export type DashboardAction=typeof dashboardActions[number];
export const dashboardActionTone={'现在处理':'red','今日跟进':'blue','本周处理':'green','持续观察':'yellow'} as const;
type Task={id:string;dueAt?:string;createdAt?:string;priority?:string;status?:string};
export function dashboardTaskAction(task:Task,now=Date.now()):DashboardAction{
 const due=Date.parse(task.dueAt??'');
 if(['逾期','已逾期'].includes(task.status??'')||due<now)return '现在处理';
 const beijing=new Date(now+8*3600000),endOfToday=Date.UTC(beijing.getUTCFullYear(),beijing.getUTCMonth(),beijing.getUTCDate()+1)-8*3600000;
 if(due<endOfToday)return '今日跟进';
 const endOfWeek=endOfToday+((7-beijing.getUTCDay())%7)*86400000;
 return due<endOfWeek?'本周处理':'持续观察';
}
export function dashboardTaskOrder<T extends Task>(tasks:readonly T[],now=Date.now()):T[]{
 const due=(task:Task)=>Number.isFinite(Date.parse(task.dueAt??''))?Date.parse(task.dueAt!):Infinity;
 return creationOrder(tasks).sort((a,b)=>dashboardActions.indexOf(dashboardTaskAction(a,now))-dashboardActions.indexOf(dashboardTaskAction(b,now))||due(a)-due(b));
}
export function dashboardTaskRelation(row:{projectId?:string;fundId?:string},project:{id:string;name:string;fundId?:string;fund?:string}|undefined,funds:readonly {id:string;name:string}[],deals?:DealBatch[]){
 const fundName=(id:string)=>funds.find(f=>f.id===id)?.name??'关联基金待核验';
 if(!project)return row.projectId?'关联项目待核验':row.fundId?'基金：'+fundName(row.fundId):'个人 / 跨对象事项（未绑定基金或项目）';
 const closedIds=[...new Set((deals??[]).filter(d=>d.status==='closed').flatMap(d=>displayedDealTerms(d)?.allocations.map(a=>a.fundId)??[]))];
 return `主归属基金：${project.fundId?fundName(project.fundId):project.fund||'未登记'} → 项目：${project.name}`+(deals===undefined?' · 交割出资关系待核验':closedIds.length?' · 交割出资基金：'+closedIds.map(fundName).join('、'):'')+(row.fundId&&row.fundId!==project.fundId?' · 任务指定基金：'+fundName(row.fundId):'');
}
