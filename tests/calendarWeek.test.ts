import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarWeek} from '../src/lib/calendarWeek.ts';
const dates=(days:Date[])=>days.map(d=>[d.getFullYear(),d.getMonth()+1,d.getDate()]);
test('week starts Monday, includes today and does not mutate the reference date',()=>{
 const reference=new Date(2026,10,4,23,59),saved=reference.getTime(),days=calendarWeek(reference);
 assert.equal(days.length,7);assert.equal(days[0].getDay(),1);assert.equal(days[6].getDay(),0);
 assert.deepEqual(dates(days),[[2026,11,2],[2026,11,3],[2026,11,4],[2026,11,5],[2026,11,6],[2026,11,7],[2026,11,8]]);assert.equal(reference.getTime(),saved);
});
test('week navigation handles Sunday, leap day and year boundaries',()=>{
 assert.deepEqual(dates(calendarWeek(new Date(2026,10,8)))[0],[2026,11,2]);
 assert.deepEqual(dates(calendarWeek(new Date(2027,0,1)))[0],[2026,12,28]);
 assert.deepEqual(dates(calendarWeek(new Date(2027,0,1),1))[0],[2027,1,4]);
 assert.ok(dates(calendarWeek(new Date(2024,1,29))).some(d=>d.join('-')==='2024-2-29'));
 assert.deepEqual(dates(calendarWeek(new Date(2026,10,4),-1))[0],[2026,10,26]);
});
