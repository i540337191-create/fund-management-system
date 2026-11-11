import test from 'node:test';
import assert from 'node:assert/strict';
import {publicAssistantStream,publicAssistantText} from '../src/ai/public-text.ts';
test('split internal identifiers never reach visible output; preserve business amounts/dates and Unicode names',()=>{
 const id='49afeb41-1b4a-41a2-b4b2-8067f764e0d6',name='对话闭环验收经理',filter=publicAssistantStream(new Map([[id,name]]));let visible='';
 for(const part of ['负责人（ID: 49afeb','41-1b4a-41a2-b4b2-','8067f764e0d6）。金额169.86','，截止2026-11-05。']){visible+=filter.push(part);assert(!visible.includes('49afeb'));}
 visible+=filter.finish();assert(visible.includes(name));assert(visible.includes('169.86'));assert(visible.includes('2026-11-05'));
 assert.equal(publicAssistantText('task-secret123'), '所选对象');assert.equal(publicAssistantText('a'.repeat(64)),'校验信息');
});
test('trailing English and partial words are flushed on completion without truncation',()=>{const f=publicAssistantStream();assert.equal(f.push('Hello'),'');assert.equal(f.push(' world!'),'Hello world!');assert.equal(f.finish(),'');const last=publicAssistantStream();last.push('最后一句 completed');assert.equal(last.finish(),'completed');});

test('stopped stream retains a normal trailing word but masks an interrupted UUID',()=>{const normal=publicAssistantStream();normal.push('已读取 READY');assert.equal(normal.finish(),'READY');const id=publicAssistantStream();id.push('49afeb41-1b4a-41a2-');assert.equal(id.finish(),'所选对象');});
test('business links retain exact targets across every stream boundary and history redaction',()=>{
 const id='49afeb41-1b4a-41a2-b4b2-8067f764e0d6',reply=`请补资料：[查看项目](/projects/${id})，或[查看报告](/reports?reportId=report-${id})。记录ID ${id}`;
 const expected=publicAssistantText(reply);assert(expected.includes(`/projects/${id}`));assert(expected.endsWith('记录ID 所选对象'));
 for(let split=0;split<=reply.length;split++){const f=publicAssistantStream();assert.equal(f.push(reply.slice(0,split))+f.push(reply.slice(split))+f.finish(),expected,`split ${split}`);}
 assert(!publicAssistantText(`[记录 ${id}](https://evil.example/${id})`).includes(id));
});
