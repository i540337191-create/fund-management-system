import test from 'node:test';
import assert from 'node:assert/strict';
import {compactContext} from '../src/ai/context-memory.ts';
import type {AssistantMessage} from '../src/ai/conversations.ts';
const messages=(n:number):AssistantMessage[]=>Array.from({length:n},(_,i)=>({id:String(i),role:i%2?'assistant':'user',status:'complete',content:'原文'+i,createdAt:'2026-11-03T00:00:00Z'}));
test('compression persists a bounded memory; identical prefix reuses it and extension only summarizes new messages',async()=>{
 let calls:string[]=[];const summarize=async(s:string)=>{calls.push(s);return '目标与约束摘要';};const original=messages(41),first=await compactContext(original,'scope',undefined,summarize);assert(first.memory);assert.equal(first.recent.length,13);assert.equal(first.memory.sourceCount,28);assert.equal(original.length,41);assert.equal(calls.length,3);
 calls=[];const cached=JSON.parse(JSON.stringify(first.memory));await compactContext(original,'scope',cached,summarize);assert.equal(calls.length,0);
 const next=await compactContext(messages(43),'scope',cached,summarize);assert.equal(calls.length,1);assert.equal(JSON.parse(calls[0]).messages.length,2);assert.equal(next.memory?.sourceCount,30);
});
test('changed source, permission-filtered content and scope invalidate memory; short history needs no summary',async()=>{
 let calls=0;const summarize=async()=>{calls++;return '安全摘要';};const first=await compactContext(messages(27),'old',undefined,summarize);calls=0;await compactContext(messages(27),'new',first.memory,summarize);assert(calls>0);
 calls=0;const changed=messages(27);changed[0].content='当前无权核验';await compactContext(changed,'old',first.memory,summarize);assert(calls>0);
 calls=0;const short=await compactContext(messages(3),'old',first.memory,summarize);assert.equal(short.compacted,false);assert.equal(calls,0);
 await assert.rejects(compactContext(messages(27),'old',undefined,async()=>''));
});

test('memory boundary covers every message removed by the recent budget',async()=>{const original=messages(21).map(m=>({...m,content:'长'.repeat(1000)}));const packed=await compactContext(original,'scope',undefined,async()=> '历史摘要');assert(packed.memory);assert.equal(packed.memory.sourceCount+packed.recent.length,original.length);assert(packed.recent.reduce((n,m)=>n+m.content.length,0)<=12000);assert.equal(packed.recent[0].role,'user');});
