import test from 'node:test';
import assert from 'node:assert/strict';
import {notificationGroups,notificationTime} from '../src/lib/notificationPresentation.ts';
const now=Date.parse('2026-11-10T08:00:00+08:00');
const records=[
 {id:'older',tone:'red',read:false,createdAt:'2026-11-09T12:00:00+08:00'},
 {id:'newer',tone:'red',read:false,createdAt:'2026-11-10T07:00:00+08:00'},
 {id:'read',tone:'yellow',read:true,createdAt:'2026-11-10T06:00:00+08:00'},
 {id:'later',tone:'yellow',read:false,createdAt:'2026-11-10T06:00:00+08:00',snoozedUntil:'2026-11-10T09:00:00+08:00'},
 {id:'due',tone:'green',read:false,createdAt:'2026-11-10T06:00:00+08:00',snoozedUntil:'2026-11-10T08:00:00+08:00'},
];
test('priority grouping sorts newest first and counts unread without deleting read history',()=>{
 const groups=notificationGroups(records,false,now);
 assert.deepEqual(groups.map(g=>g.unread),[2,0,1]);
 assert.deepEqual(groups[0].items.map(n=>n.id),['newer','older']);
 assert.deepEqual(groups[1].items.map(n=>n.id),['read']);
 assert.equal(records.length,5);
});
test('snoozed notices return exactly at due time',()=>{
 assert.equal(notificationGroups(records,false,now)[1].items.length,1);
 assert.equal(notificationGroups(records,false,now+3600000)[1].items.length,2);
});
test('read updates keep the open unread detail until collapsed',()=>{
 const updated=records.map(n=>n.id==='newer'?{...n,read:true}:n);
 const reading=notificationGroups(updated,true,now,'newer');
 assert.deepEqual(reading[0].items.map(n=>n.id),['newer','older']);
 assert.equal(reading[0].unread,1);
 assert.deepEqual(notificationGroups(updated,true,now)[0].items.map(n=>n.id),['older']);
 assert.equal(notificationGroups(records,true,now)[1].items.length,0);
});
test('empty groups remain explicit and timestamps use Shanghai dates',()=>{
 assert.deepEqual(notificationGroups([],false,now).map(g=>g.items),[[],[],[]]);
 assert.equal(notificationTime('2026-11-09T16:01:00Z',now),'00:01');
 assert.match(notificationTime('2026-11-09T15:59:00Z',now),/11.*09.*23:59/);
 assert.equal(notificationTime('invalid',now),'时间待核对');
});
