import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarToday,nextCalendarDayDelay} from '../src/lib/calendarToday.ts';
import {calendarWeek} from '../src/lib/calendarWeek.ts';
const date=(d:Date)=>[d.getFullYear(),d.getMonth()+1,d.getDate()];
test('Beijing midnight advances date, month, leap day and year independently of browser timezone',()=>{
 for(const [instant,before,after] of [
  ['2026-11-07T15:59:59.999Z',[2026,11,7],[2026,11,8]],
  ['2026-12-31T15:59:59.999Z',[2026,12,31],[2027,1,1]],
  ['2024-02-28T15:59:59.999Z',[2024,2,28],[2024,2,29]],
  ['2024-02-29T15:59:59.999Z',[2024,2,29],[2024,3,1]],
 ] as const){
  const now=new Date(instant);
  assert.deepEqual(date(calendarToday(now)),before);
  assert.deepEqual(date(calendarToday(new Date(now.getTime()+1))),after);
  assert.equal(nextCalendarDayDelay(now),26);
 }
});
test('day timer schedules the next Beijing midnight; weekly navigation still works',()=>{
 const now=new Date('2026-11-07T00:00:00Z');
 assert.equal(nextCalendarDayDelay(now),16*3600000+25);
 const day=calendarToday(now);
 assert.deepEqual(date(day),[2026,11,7]);
 assert.deepEqual(date(calendarWeek(day)[0]),[2026,11,2]);
 assert.deepEqual(date(calendarWeek(day,1)[0]),[2026,11,9]);
});
