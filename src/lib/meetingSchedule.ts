import type {MeetingRecord} from '../data/meetings.ts';
export const meetingScheduleLabels={unknown:'安排待核实',scheduled:'计划中',in_progress:'进行中',ended:'已结束',cancelled:'已取消'} as const;
export const upcomingMeetingScope='未来7天内已计划会议及当前进行中的会议（上海时间）；仅当前账号可读项目';
export function getUpcomingMeetings<T extends MeetingRecord>(meetings:T[],now=new Date()):T[]{const start=now.getTime(),end=start+7*86400000;return meetings.filter(m=>{if(m.deletedAt||!m.startsAt)return false;const at=Date.parse(m.startsAt);if(!Number.isFinite(at))return false;if(m.scheduleStatus==='scheduled')return at>=start&&at<end;if(m.scheduleStatus==='in_progress'){const until=m.endsAt?Date.parse(m.endsAt):at+86400000;return at<=start&&until>start;}return false;}).sort((a,b)=>Date.parse(a.startsAt!)-Date.parse(b.startsAt!)||(a.id??'').localeCompare(b.id??''));}
export function meetingLocalTime(stamp:string|undefined){if(!stamp)return '';const time=new Date(stamp);if(!Number.isFinite(time.getTime()))return '';return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(time).replace(' ','T');}
export function meetingScheduleWire(value:string){return value?value+':00+08:00':undefined;}

export function groupMeetingsByMonth<T extends MeetingRecord>(meetings:T[]){
 const groups=new Map<string,T[]>();
 for(const meeting of meetings){
  const month=/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(meeting.date)?meeting.date.slice(0,7):'';
  const rows=groups.get(month)??[];rows.push(meeting);groups.set(month,rows);
 }
 return [...groups].sort(([a],[b])=>b.localeCompare(a)).map(([month,rows])=>({month,label:month?`${month.slice(0,4)}年${Number(month.slice(5))}月`:'日期待核实',meetings:rows}));
}
