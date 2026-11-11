const day=86400000;
export function isoWeekForDate(value:Date){const d=new Date(Date.UTC(value.getUTCFullYear(),value.getUTCMonth(),value.getUTCDate()));d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));const year=d.getUTCFullYear(),first=new Date(Date.UTC(year,0,1));return `${year}-W${String(Math.ceil(((d.getTime()-first.getTime())/day+1)/7)).padStart(2,'0')}`;}
export function reportWeekRange(week:string){if(!/^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(week))return null;const jan4=new Date(`${week.slice(0,4)}-01-04T00:00:00Z`);const monday=new Date(jan4.getTime()-((jan4.getUTCDay()+6)%7)*day+(Number(week.slice(6))-1)*7*day);if(!Number.isFinite(monday.getTime())||isoWeekForDate(monday)!==week)return null;return {start:monday.toISOString().slice(0,10),end:new Date(monday.getTime()+6*day).toISOString().slice(0,10)};}
export function currentReportWeek(now=new Date()){const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(now);return isoWeekForDate(new Date(date+'T12:00:00Z'));}
export function shiftReportWeek(week:string,offset:number){const range=reportWeekRange(week);return range?isoWeekForDate(new Date(Date.parse(range.start+'T00:00:00Z')+offset*7*day)):week;}

// Bind only one unambiguous user-selected week; comparisons and relative-week changes remain conversational.
export function requestedReportWeek(prompt:string,priorUserPrompts:string[]=[]){
 const compare=/对比|比较|相比|差异|compare/i;
 const weeks=(text:string)=>[...new Set(Array.from(text.matchAll(/\b(\d{4})-W(\d{2})\b|(\d{4})年(?:第)?(\d{1,2})周/gi),m=>`${m[1]??m[3]}-W${String(m[2]??m[4]).padStart(2,'0')}`))];
 const current=weeks(prompt);if(current.length)return current.length===1&&!compare.test(prompt)?current[0]:undefined;
 if(compare.test(prompt)||/(?:本周|这周|上周|下周|当前周|上一周|下一周)(?:的)?周报|(?:改成|改为|换成|改用)(?:本周|这周|上周|下周|当前周|上一周|下一周)/.test(prompt))return undefined;
 const prior=priorUserPrompts[priorUserPrompts.length-1];if(!prior||!/周报|weekly/i.test(prior)||compare.test(prior))return undefined;
 const previous=weeks(prior);return previous.length===1?previous[0]:undefined;
}
