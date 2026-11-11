import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFailure } from '../src/lib/writeFailure.ts';

test('failed business action retains its object and exact destination without asserting unsaved data', () => {
 const href='/meetings?meetingId=meeting-a';
 const result=writeFailure('确认纪要','季度沟通会',href,new Error('network lost after commit'));
 assert.equal(result.href,href);
 assert.match(result.message,/确认纪要.*季度沟通会/);
 assert.match(result.message,/未能确认服务器处理结果/);
 assert.doesNotMatch(result.message,/未保存|API|network lost/);
});

test('failed actions explain rejected permissions, invalid input, missing records and revision conflicts', () => {
 for(const [status,reason] of [[400,'校验'],[401,'登录'],[403,'权限'],[404,'未找到'],[409,'版本']] as const){
  const result=writeFailure('审核报告','报告甲','/reports?reportId=a',{status,message:'private database error'});
  assert.match(result.message,new RegExp(reason));
  assert.doesNotMatch(result.message,/private database/);
  assert.equal(result.href,'/reports?reportId=a');
 }
});
