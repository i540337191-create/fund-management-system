import test from 'node:test';
import assert from 'node:assert/strict';
import {AgentRepository} from '../src/agent/repository.ts';

test('notification events ignore JSON key order but retain real recipient changes',async()=>{
 const repo=new AgentRepository(),events:string[][]=[];
 await repo.transaction(s=>s.notifications.push({id:'notice',ownerId:'owner-a',scope:'personal',title:'待审核',text:'核对原件',read:false,createdAt:'2026-11-10T00:00:00Z',tone:'red'}));
 repo.subscribe(owners=>events.push(owners));
 await repo.transaction(s=>{s.notifications[0]=Object.fromEntries(Object.entries(s.notifications[0]).reverse()) as typeof s.notifications[number];});
 await repo.transaction(s=>{Object.assign(s.notifications[0],{optional:undefined});});
 assert.deepEqual(events,[]);
 await repo.transaction(s=>{s.notifications[0].read=true;});
 assert.deepEqual(events,[['owner-a']]);
 await repo.transaction(s=>{s.notifications[0].text='原件已补齐';});
 assert.deepEqual(events,[['owner-a'],['owner-a']]);
 await repo.transaction(s=>{s.notifications=[];});
 assert.deepEqual(events,[['owner-a'],['owner-a'],['owner-a']]);
});
