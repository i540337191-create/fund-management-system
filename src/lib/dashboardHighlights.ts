import type {RiskItem} from '../data/risks';
import {dashboardTaskOrder,dashboardTaskAction,type DashboardAction} from './dashboardTaskPresentation.ts';
import {dashboardRiskOrder,openDashboardTask} from './dashboardSelection.ts';
type ObjectRecord={id:string;name:string;shortName?:string};
type Task={id:string;item:string;status:string;action:DashboardAction;projectId?:string;fundId?:string;dueAt?:string;createdAt?:string;priority?:string;sourceUnavailable?:boolean};
export type DashboardHighlight={id:string;subject:string;detail:string;action:'处理'|'查看';taskId?:string;path?:string};
export function dashboardHighlights(tasks:Task[],risks:RiskItem[],projects:ObjectRecord[],funds:ObjectRecord[],now=Date.now()):DashboardHighlight[]{
 const subject=(id:string|undefined,objects:ObjectRecord[])=>{const row=objects.find(o=>o.id===id);return row?.shortName||row?.name;};
 const candidates:(DashboardHighlight&{rank:number;object:string})[]=[];
 for(const risk of dashboardRiskOrder(risks,tasks).filter(r=>r.level==='高')){
  const concern=risk as RiskItem&{path?:string;taskId?:string;fundId?:string};
  const name=risk.projectId?subject(risk.projectId,projects):subject(concern.fundId,funds)||risk.target;
  if(!name)continue;
  candidates.push({id:'risk:'+(risk.id??risk.title),subject:name,detail:risk.title,action:'处理',taskId:concern.taskId,path:concern.path||(risk.projectId?'/projects/'+encodeURIComponent(risk.projectId)+'?tab='+encodeURIComponent('风险监控'):'/monitoring'),rank:0,object:risk.projectId?'project:'+risk.projectId:concern.fundId?'fund:'+concern.fundId:'risk:'+(risk.id??risk.title)});
 }
 for(const task of dashboardTaskOrder(tasks,now)){
  const action=dashboardTaskAction(task,now);
  if(!openDashboardTask(task)||action==='持续观察')continue;
  const name=task.projectId?subject(task.projectId,projects):subject(task.fundId,funds);
  if(!name)continue;
  candidates.push({id:'task:'+task.id,taskId:task.id,subject:name,detail:task.item,action:action==='现在处理'?'处理':'查看',rank:action==='现在处理'?1:action==='今日跟进'?2:3,object:task.projectId?'project:'+task.projectId:'fund:'+task.fundId});
 }
 const seen=new Set<string>();
 return candidates.sort((a,b)=>a.rank-b.rank).filter(item=>{if(seen.has(item.object))return false;seen.add(item.object);return true;}).slice(0,2).map(({rank:_rank,object:_object,...item})=>item);
}
