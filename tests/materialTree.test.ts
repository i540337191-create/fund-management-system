import assert from 'node:assert/strict';
import test from 'node:test';
import {groupMaterialTree,type MaterialTreeFile} from '../src/lib/materialTree.ts';
const relations={funds:[{id:'f',name:'基金甲'}],projects:[{id:'p',name:'项目甲'}],companies:[],investors:[]};
const file:MaterialTreeFile={recordKey:'a',name:'原件.wav',fund:'旧值',project:'旧值',relationships:relations};
test('groups actual fund/project relationships and keeps every file selectable',()=>{
 const tree=groupMaterialTree([file,{...file,recordKey:'b'}],[]);
 assert.equal(tree[0].name,'基金甲');assert.equal(tree[0].groups[0].name,'项目甲');assert.deepEqual(tree[0].groups[0].files.map(f=>f.recordKey),['a','b']);
});
test('keeps fund-level and unassigned files without inventing a project',()=>{
 const tree=groupMaterialTree([{...file,relationships:{...relations,projects:[]}},{...file,recordKey:'b',relationships:{...relations,funds:[],projects:[]}}],[]);
 assert.deepEqual(tree.map(f=>[f.name,f.groups[0].name]),[['基金甲',''],['未关联基金','']]);
});
test('multiple funds do not falsely attach each project to every fund',()=>{
 const tree=groupMaterialTree([{...file,relationships:{...relations,funds:[...relations.funds,{id:'f2',name:'基金乙'}]}}],[{name:'项目甲',shortName:'甲',fund:'基金甲'}]);
 assert.equal(tree[0].groups[0].name,'项目甲');assert.equal(tree[1].name,'基金乙');assert.equal(tree[1].groups[0].name,'');
 const unknown=groupMaterialTree([{...file,relationships:{...relations,funds:[...relations.funds,{id:'f2',name:'基金乙'}]}}],[]);
 assert.equal(unknown[0].name,'未明确基金归属');
});
test('legacy fund files stay directly under their fund; empty input stays empty',()=>{
 assert.deepEqual(groupMaterialTree([],[]),[]);
 assert.equal(groupMaterialTree([{...file,relationships:undefined,fund:'基金甲',relationScope:'基金'}],[])[0].groups[0].name,'');
});
