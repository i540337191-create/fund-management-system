import test from 'node:test';
import assert from 'node:assert/strict';
import {inPageBusinessPath} from '../src/lib/internalNavigation.ts';
const origin='http://127.0.0.1:15218';
test('auxiliary report links open a separate context without closing the report wizard',()=>{
 for(const href of ['/funds/fund-1?tab=资料档案','/materials?materialId=original-1','/settings?section=业务模板管理']){
  assert.equal(inPageBusinessPath(href,origin,'_blank'),null);
  assert.equal(inPageBusinessPath(href,origin,'_BLANK'),null);
  assert.equal(inPageBusinessPath(href,origin,'material-preview'),null);
 }
});
test('same-window navigation still retains object context and uses the close protection',()=>{
 for(const target of [null,'','_self','_parent','_top'])assert.equal(inPageBusinessPath('/funds/fund-1?tab=files#original',origin,target),'/funds/fund-1?tab=files#original');
 for(const href of ['javascript:alert(1)','https://example.com/materials','/api/materials/x/versions/v/file'])assert.equal(inPageBusinessPath(href,origin,'_self'),null);
});
