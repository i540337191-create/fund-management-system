import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeSchemaDraft,schemaDraftSignature} from '../src/lib/customSchemaDraft.ts';
import type {CustomField,CustomSchema} from '../src/lib/customFields.ts';
const field:CustomField={id:'category',label:'分类',type:'singleChoice',order:0,required:false,enabled:true,options:[{id:'one',label:'甲',enabled:true}]};
test('schema conflict preserves actual edits while adopting unrelated remote changes and additions',()=>{
 const base:CustomSchema={schemaRevision:1,fields:[structuredClone(field)]};
 const draft=[{...structuredClone(field),label:'本次分类',options:[{id:'one',label:'甲修订',enabled:true},{id:'local',label:'乙',enabled:true}]}];
 const latest:CustomSchema={schemaRevision:2,fields:[{...structuredClone(field),required:true,options:[{id:'one',label:'甲',enabled:false},{id:'remote',label:'丙',enabled:true}]},{...structuredClone(field),id:'remote_field',label:'远端新增',order:1}]};
 const merged=mergeSchemaDraft(base,draft,latest);
 assert.equal(merged[0].label,'本次分类');assert.equal(merged[0].required,true);
 assert.deepEqual(merged[0].options,[{id:'one',label:'甲修订',enabled:false},{id:'remote',label:'丙',enabled:true},{id:'local',label:'乙',enabled:true}]);
 assert.equal(merged[1].id,'remote_field');
 assert.equal(base.fields[0].label,'分类');assert.equal(latest.fields[0].label,'分类');
});
test('new local fields remain and property ordering does not falsely mark a schema dirty',()=>{
 const base:CustomSchema={schemaRevision:1,fields:[structuredClone(field)]};
 const local={...structuredClone(field),id:'new_field',order:1};
 assert.deepEqual(mergeSchemaDraft(base,[structuredClone(field),local],base),[field,local]);
 const reordered={options:field.options,enabled:field.enabled,required:field.required,order:field.order,type:field.type,label:field.label,id:field.id};
 assert.equal(schemaDraftSignature([field]),schemaDraftSignature([reordered]));
});
