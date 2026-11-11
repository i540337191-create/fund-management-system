import test from 'node:test';
import assert from 'node:assert/strict';
import {materialReferencePresentation as view,hasMaterialReadRestrictions} from '../src/lib/materialReference.ts';
test('restricted LP reference does not revive a stale download URL or disclose its original name',()=>{
 const result=view({name:'合成持有人姓名.pdf',downloadHref:'/api/materials/old/file',readIssue:'lp_privacy_forbidden'});
 assert.equal(result.href,null);assert.match(result.label,/LP资料受限/);assert.doesNotMatch(result.label,/合成持有人/);
});
test('unknown linkage stays distinct from confirmed LP privacy',()=>{
 const result=view({name:'待核对.pdf',readIssue:'material_privacy_unknown'});assert.equal(result.href,null);assert.match(result.label,/关联待核实/);assert.doesNotMatch(result.label,/LP/);
});
test('missing or unreadable ordinary source is not presented as a working download',()=>{
 assert.equal(view({name:'普通资料.pdf'}).href,null);
 assert.equal(view({name:'普通资料.pdf',downloadHref:'/ordinary',readIssue:'material_integrity_mismatch'}).href,null);
});
test('available ordinary source preserves its exact name and link',()=>{
 const result=view({name:'普通资料.pdf',downloadHref:'/api/materials/ordinary/versions/v1/file'});assert.equal(result.label,'普通资料.pdf');assert.equal(result.href,'/api/materials/ordinary/versions/v1/file');
});
test('a restricted display copy is recognized without changing its source data',()=>{
 const source={items:[{evidence:[{name:'已隐藏',readIssue:'lp_privacy_forbidden'}]}]};const before=structuredClone(source);
 assert.equal(hasMaterialReadRestrictions(source),true);assert.deepEqual(source,before);
 assert.equal(hasMaterialReadRestrictions({sections:{summary:'[LP信息已脱敏]'}}),true);
 assert.equal(hasMaterialReadRestrictions({sections:{summary:'普通结论'},source:{id:'source-1'}}),false);
});
