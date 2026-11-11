import {useLocale} from "../i18n/locale";
import {useEffect,useState} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {calendarWeek} from '../lib/calendarWeek';
import {calendarToday,nextCalendarDayDelay} from '../lib/calendarToday';
import './DashboardMiniCalendar.css';

const chineseWeekdays=['一','二','三','四','五','六','日'];
const englishWeekdays=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const dateKey=(day:Date)=>`${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;

export function DashboardMiniCalendar(){
 const locale=useLocale(),weekdays=locale==='en'?englishWeekdays:chineseWeekdays;
 const [today,setToday]=useState(()=>calendarToday()),[offset,setOffset]=useState(0);
 useEffect(()=>{
  let timer:ReturnType<typeof setTimeout>;
  const refresh=()=>{
   const now=new Date();
   setToday(current=>{const next=calendarToday(now);return dateKey(current)===dateKey(next)?current:next;});
   clearTimeout(timer);timer=setTimeout(refresh,nextCalendarDayDelay(now));
  };
  const resume=()=>{if(document.visibilityState==='visible')refresh();};
  refresh();window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',resume);
  return()=>{clearTimeout(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',resume);};
 },[]);
 const days=calendarWeek(today,offset),first=days[0],last=days[6];
 const month=locale==='en'?`${first.toLocaleDateString('en-US',{month:'short',year:'numeric'})}${first.getMonth()===last.getMonth()?'':' — '+last.toLocaleDateString('en-US',{month:'short',year:'numeric'})}`:first.getMonth()===last.getMonth()?`${first.getFullYear()}年${first.getMonth()+1}月`:`${first.getFullYear()}年${first.getMonth()+1}月 — ${last.getFullYear()!==first.getFullYear()?last.getFullYear()+'年':''}${last.getMonth()+1}月`;
 return <section className="dashboard-calendar" aria-label="北京时间台历与周历">
  <button type="button" className="dashboard-desk-calendar" onClick={()=>setOffset(0)}><time dateTime={dateKey(today)} aria-label={today.toLocaleDateString(locale==='en'?'en-US':'zh-CN',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}>
   <span className="desk-calendar-month">{locale==='en'?today.toLocaleDateString('en-US',{month:'short'}):`${today.getMonth()+1}月`}</span>
   <strong className="desk-calendar-day">{String(today.getDate()).padStart(2,'0')}</strong>
   <span className="desk-calendar-weekday">{locale==='en'?'':'星期'}{weekdays[(today.getDay()+6)%7]}</span>
  </time></button>
  <div className="dashboard-week-calendar">
   <div className="dashboard-week-heading"><strong aria-live="polite">{month}</strong><div>
    <button type="button" aria-label="上一周" onClick={()=>setOffset(x=>x-1)}><ChevronLeft size={17}/></button>
    <button type="button" className="dashboard-week-reset" onClick={()=>setOffset(0)} aria-label="回到本周">本周</button>
    <button type="button" aria-label="下一周" onClick={()=>setOffset(x=>x+1)}><ChevronRight size={17}/></button>
   </div></div>
   <div className="dashboard-week-days">{days.map((day,i)=>{const isToday=dateKey(day)===dateKey(today);return <div key={dateKey(day)} data-weekend={i>=5}><span>{weekdays[i]}</span><time aria-current={isToday?'date':undefined} dateTime={dateKey(day)}>{day.getDate()}</time></div>;})}</div>
  </div>
 </section>;
}
