import {object,string,date,requestId,fail} from './workflow.ts';
import type {Meeting} from './store.ts';
export function meetingInput(value:unknown):Omit<Meeting,'project'|'dataOrigin'> {
 const b=object(value,['requestId','projectId','title','date','attendees','summary','conclusions','todoItems','riskItems','taskDueDate','scheduleStatus','startsAt','endsAt']);
 const list=(key:string)=>{const v=b[key];if(!Array.isArray(v)||v.length>100)fail('invalid_meeting_items');return (v as unknown[]).map(x=>string(x,true,2000));};
 const todoItems=list('todoItems'),riskItems=list('riskItems');
 const schedule=meetingScheduleInput(b);
 return {...schedule,id:'meeting-'+requestId(b.requestId),projectId:string(b.projectId),title:string(b.title,true,240),date:date(b.date),attendees:string(b.attendees,true,2000),summary:string(b.summary,true,16000),conclusions:list('conclusions'),todoItems,riskItems,todos:todoItems.length,risks:riskItems.length,status:'待确认',...(todoItems.length?{taskDueDate:date(b.taskDueDate)}:{})};
}
export function sameMeeting(a:Meeting,b:Meeting){return ['projectId','title','date','attendees','summary','conclusions','todoItems','riskItems','taskDueDate','scheduleStatus','startsAt','endsAt'].every(k=>JSON.stringify(a[k as keyof Meeting])===JSON.stringify(b[k as keyof Meeting]));}

export function meetingVisibility(meeting:Meeting,deleted:boolean,expectedRevision:number,actor:{id:string;name:string}):Meeting{
 if((meeting.revision??1)!==expectedRevision)fail('meeting_revision_conflict',409);
 if(Boolean(meeting.deletedAt)===deleted)fail(deleted?'meeting_already_deleted':'meeting_not_deleted',409);
 return {...meeting,revision:(meeting.revision??1)+1,deletedAt:deleted?new Date().toISOString():undefined,deletedBy:deleted?actor.id:undefined};
}

export function meetingScheduleInput(b:Record<string,unknown>){
 const scheduleStatus=(b.scheduleStatus??'unknown') as NonNullable<Meeting['scheduleStatus']>;
 if(!['unknown','scheduled','in_progress','ended','cancelled'].includes(scheduleStatus))fail('invalid_meeting_schedule');
 const stamp=(value:unknown)=>{if(value===undefined||value===null||value==='')return undefined;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))return fail('invalid_meeting_schedule');if(Number(value.slice(11,13))>23||Number(value.slice(14,16))>59||value[16]===':'&&Number(value.slice(17,19))>59)fail('invalid_meeting_schedule');const local=value.slice(0,10);date(local);return new Date(value).toISOString();};
 const startsAt=stamp(b.startsAt),endsAt=stamp(b.endsAt);
 if((scheduleStatus==='scheduled'||scheduleStatus==='in_progress')&&!startsAt)fail('meeting_start_required');
 if(endsAt&&(!startsAt||endsAt<=startsAt))fail('meeting_end_before_start');
 return {scheduleStatus,startsAt,endsAt};
}
export function sameMeetingMinutes(a:Meeting,b:Meeting){return ['projectId','title','date','attendees','summary','conclusions','todoItems','riskItems','taskDueDate'].every(k=>JSON.stringify(a[k as keyof Meeting])===JSON.stringify(b[k as keyof Meeting]));}
