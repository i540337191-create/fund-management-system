import {creationOrder} from './creationOrder.ts';
import {currentReportWeek} from './reportWeek.ts';
export function dashboardTaskCounts(tasks:readonly {status:string}[]){
 const counts={review:0,confirm:0,verify:0,other:0};
 for(const task of tasks){if(task.status==='待审核')counts.review++;else if(task.status==='待确认')counts.confirm++;else if(task.status==='待核查')counts.verify++;else counts.other++;}
 return counts;
}
export function dashboardCurrentReport<T extends {id:string;createdAt?:string;week?:string;ownerId?:string;scope?:string}>(reports:readonly T[],userId:string|undefined,now=new Date()){
 if(!userId)return undefined;
 return creationOrder(reports.filter(report=>report.week===currentReportWeek(now)&&(report.ownerId===userId||report.scope==='organization')))[0];
}
export function dashboardTaskBadge(task:{status:string;dueAt?:string},now=Date.now()){
 const overdue=['已逾期','逾期'].includes(task.status)||Boolean(task.dueAt&&Date.parse(task.dueAt)<now);
 return {label:overdue?'逾期':task.status,tone:overdue?'overdue':'normal'};
}
export function dashboardLatestReport<T extends {id:string;createdAt?:string;ownerId?:string;scope?:string}>(reports:readonly T[],userId:string|undefined){
 return userId?creationOrder(reports.filter(r=>r.ownerId===userId||r.scope==='organization'))[0]:undefined;
}
export function dashboardReportHighlights(report:{thisWeek?:string;nextWeek?:string;taskIds?:string[]}){
 const lines=(text:string|undefined)=>String(text??'').split(/\n+|[。；]+/).map(s=>s.trim().replace(/^(?:[-*•]\s+|\d+[.)]\s+|\d+、\s*)/,'' )).filter(Boolean);
 const result=lines(report.thisWeek).map(text=>'本周 · '+text).slice(0,3);
 for(const text of lines(report.nextWeek)){if(result.length===3)break;result.push('计划 · '+text);}
 if(result.length<3)result.push('关联待办 · '+(report.taskIds?.length??0)+' 项');
 return result;
}
