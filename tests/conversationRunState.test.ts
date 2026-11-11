import test from 'node:test';
import assert from 'node:assert/strict';
import {conversationHistoryRows} from '../src/lib/conversationRunState.ts';
import type {Conversation} from '../src/lib/assistantClient.ts';
const c:Conversation={id:'test',title:'新对话',includeDemo:true,revision:1,createdAt:'2026-11-04',updatedAt:'2026-11-04',messages:[]};
test('first turn appears immediately in history and completion, stop or failure remove local running state',()=>{
 const active={...c,messages:[{id:'u',role:'user' as const,status:'complete' as const,content:'查看未完成任务',createdAt:c.createdAt}]};
 const waiting=conversationHistoryRows([],active,true);assert.equal(waiting.length,1);assert.equal(waiting[0].title,'查看未完成任务');assert.equal(waiting[0].running,true);
 for(const status of ['complete','stopped','error'] as const){const saved={...active,messages:[...active.messages,{id:'a',role:'assistant' as const,status,content:'',createdAt:c.createdAt}]};assert.equal(conversationHistoryRows([],saved,false)[0].running,false);}
 assert.equal(conversationHistoryRows([],{...active,activeRequestId:'pending'},false)[0].running,true);
});
test('server background jobs remain visible and other conversation states are untouched',()=>{
 const rows=[{id:c.id,title:'后台办理',revision:1,updatedAt:c.updatedAt,messageCount:2,running:true},{id:'other',title:'另一个对话',revision:1,updatedAt:c.updatedAt,messageCount:2,running:false}];
 assert.equal(conversationHistoryRows(rows,c,false)[0].running,true);assert.equal(conversationHistoryRows(rows,c,true).length,2);assert.equal(conversationHistoryRows(rows,c,true)[1],rows[1]);assert.equal(conversationHistoryRows(rows,null,false),rows);
 const finished=rows.map(row=>({...row,running:false}));assert.equal(conversationHistoryRows(finished,c,false)[0].running,false);
});
