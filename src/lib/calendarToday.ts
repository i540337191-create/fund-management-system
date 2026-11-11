const shanghaiDate = new Intl.DateTimeFormat('en-CA', {
 timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',
});

// A local-noon calendar date lets existing week arithmetic use Beijing's day in any browser timezone.
export function calendarToday(now=new Date()) {
 const parts=shanghaiDate.formatToParts(now);
 const part=(type:string)=>Number(parts.find(value=>value.type===type)!.value);
 return new Date(part('year'),part('month')-1,part('day'),12);
}

export function nextCalendarDayDelay(now=new Date()) {
 const day=calendarToday(now);
 return Date.UTC(day.getFullYear(),day.getMonth(),day.getDate()+1)-8*3600000-now.getTime()+25;
}
