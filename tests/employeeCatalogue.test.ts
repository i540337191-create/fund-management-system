import test from 'node:test';
import assert from 'node:assert/strict';
import {employeeCategory,groupEmployeeRecords,businessEmployeeGroups,employeeSearchText} from '../src/lib/employeeCatalogue.ts';
const base={id:'a',title:'资料核对',instructions:'逐页核对',scope:'personal',ownerId:'a',enabled:false,version:1,tools:['knowledge'],pluginIds:[],status:'draft'};
test('identical configurations share one entry while every original record and order remain recoverable',()=>{
 const rows=[base,{...base,id:'b',createdAt:'2026-11-10'},{...base,id:'c',instructions:'只核对摘要'}];
 const before=JSON.stringify(rows),groups=groupEmployeeRecords(rows);
 assert.equal(groups.length,2);assert.equal(groups[0].record,rows[0]);assert.deepEqual(groups[0].duplicates,[rows[1]]);assert.equal(JSON.stringify(rows),before);
 assert.deepEqual(groups.flatMap(g=>[g.record,...g.duplicates]).map(r=>r.id).sort(),['a','b','c']);
});
test('related business purposes share a clear entry without merging switches or losing original configurations',()=>{
 const rows=[{...base,id:'skill-knowledge',builtin:true},{...base,id:'skill-intake',builtin:true,enabled:true},{...base,id:'skill-materials',builtin:true},{...base,id:'custom-copy',builtin:false,title:'资料查找'}];
 const before=JSON.stringify(rows),groups=businessEmployeeGroups(rows,'skills');
 assert.equal(groups.length,2);assert.equal(groups[0].title,'资料查阅与整理');assert.equal(groups[0].members.length,3);
 assert.deepEqual(groups[0].members.map(m=>m.record.enabled),[false,true,false]);assert.equal(groups[1].record.id,'custom-copy');assert.equal(JSON.stringify(rows),before);
 assert(employeeSearchText(rows[0],'skills').includes('资料查阅与整理'));
 assert.equal(businessEmployeeGroups([{...base,kind:'business'},{...base,id:'p2',kind:'local-library'}],'plugins').length,2);
});
test('ownership, sharing, review, sources, dependencies and execution switches prevent unsafe grouping',()=>{
 for(const patch of [{scope:'organization'},{ownerId:'other'},{status:'submitted'},{enabled:true},{version:2},{pluginIds:['other']},{materialIds:['source']},{instructions:'另一套指令'},{available:false},{endpoint:'https://different.example'}]){
  assert.equal(groupEmployeeRecords([base,{...base,...patch,id:'b'}]).length,2,JSON.stringify(patch));
 }
});
test('classification preserves separate built-in functions and does not mistake a custom title for a built-in',()=>{
 assert.equal(employeeCategory({...base,builtin:true,id:'skill-intake'},'skills'),'资料与知识');
 assert.equal(employeeCategory({...base,builtin:false,title:'材料识别与归档'},'skills'),'自定义能力');
 assert.equal(employeeCategory({...base,kind:'business'},'plugins'),'业务系统');
});
