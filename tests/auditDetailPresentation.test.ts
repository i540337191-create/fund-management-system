import test from 'node:test';
import assert from 'node:assert/strict';
import {auditDetailPresentation} from '../src/lib/auditDetailPresentation.ts';
test('structured audit snapshots keep every field when formatted',()=>{const value={actorId:'actor',requestId:'id',before:null,after:{name:'项目名称',revision:1}};const result=auditDetailPresentation(JSON.stringify(value));assert.equal(result.structured,true);assert.deepEqual(JSON.parse(result.text),value);assert.ok(result.text.includes('\n'));});
test('plain, invalid and primitive details retain their original text',()=>{for(const value of ['修改了负责人','{invalid','null','"说明"',''])assert.deepEqual(auditDetailPresentation(value),{structured:false,text:value});});
