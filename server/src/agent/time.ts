// Explicit local calendar times are normalized before they become actionable proposals.
export function requestedShanghaiTime(prompt:string):string|undefined{
 const dates=[...prompt.matchAll(/(20\d{2})\s*(?:年|[-/])\s*(\d{1,2})\s*(?:月|[-/])\s*(\d{1,2})\s*(?:日|号)?\s*(上午|下午|晚上|中午)?\s*(\d{1,2})\s*(?:点|时|:|：)\s*(?:(\d{1,2})\s*分?|半)?/g)];
 if(dates.length!==1)return undefined;const m=dates[0];let hour=Number(m[5]);if(['下午','晚上'].includes(m[4])&&hour<12)hour+=12;if(m[4]==='中午'&&hour<11)hour+=12;const minute=m[0].includes('半')?30:Number(m[6]??0);if(hour>23||minute>59)return undefined;
 const local=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00+08:00`,date=new Date(local);if(!Number.isFinite(date.getTime()))return undefined;
 const check=new Date(date.getTime()+8*3600000);if(check.getUTCMonth()+1!==Number(m[2])||check.getUTCDate()!==Number(m[3]))return undefined;return date.toISOString();
}

// Missed occurrences coalesce to one run; monthly anchors keep the requested day after February.
export function nextScheduleAt(schedule:{nextAt:string;intervalMinutes:number;recurrence?:string;monthlyDay?:number},now:Date):string|undefined{
 const mode=schedule.recurrence??(schedule.intervalMinutes?'interval':'once');if(mode==='once')return undefined;
 const prior=Date.parse(schedule.nextAt);if(mode!=='monthly'){const minutes=mode==='daily'?1440:mode==='weekly'?10080:schedule.intervalMinutes;if(minutes<=0)return undefined;const step=minutes*60000;return new Date(prior+(Math.max(0,Math.floor((now.getTime()-prior)/step))+1)*step).toISOString();}
 const local=new Date(prior+8*3600000),anchor=schedule.monthlyDay??local.getUTCDate(),current=new Date(now.getTime()+8*3600000);
 let months=Math.max(1,(current.getUTCFullYear()-local.getUTCFullYear())*12+current.getUTCMonth()-local.getUTCMonth());
 for(;;months++){const month=new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth()+months,1)),day=Math.min(anchor,new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+1,0)).getUTCDate()),candidate=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth(),day,local.getUTCHours(),local.getUTCMinutes(),local.getUTCSeconds(),local.getUTCMilliseconds())-8*3600000);if(candidate.getTime()>now.getTime())return candidate.toISOString();}
}

export const DEFAULT_REMIND_AHEAD_MINUTES = 48 * 60;
export function businessDueAt(date:string|undefined):string|undefined{
 if(!date||!/^\d{4}-\d{2}-\d{2}$/.test(date))return undefined;
 const day=new Date(date+'T00:00:00.000Z');if(!Number.isFinite(day.getTime())||day.toISOString().slice(0,10)!==date)return undefined;
 return new Date(date+'T23:59:59.999+08:00').toISOString();
}
export function sameBusinessDate(a:string|undefined,b:string|undefined):boolean{
 const first=Date.parse(a??''),second=Date.parse(b??'');
 return Number.isFinite(first)&&Number.isFinite(second)&&new Date(first+8*3600000).toISOString().slice(0,10)===new Date(second+8*3600000).toISOString().slice(0,10);
}
// Preparation is a time dimension; it must never replace approval/waiting status.
export function taskPreparation(task:{dueAt?:string;status:string},now=Date.now()):'unscheduled'|'upcoming'|'preparing'|'overdue'|'inactive'{
 if(['complete','cancelled'].includes(task.status))return 'inactive';
 const due=Date.parse(task.dueAt??'');if(!Number.isFinite(due))return 'unscheduled';
 return due<now?'overdue':due-now<=DEFAULT_REMIND_AHEAD_MINUTES*60000?'preparing':'upcoming';
}
