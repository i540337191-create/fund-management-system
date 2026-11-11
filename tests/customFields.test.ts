import test from 'node:test';
import assert from 'node:assert/strict';
import {customFieldPatch,customValueLabel,customErrorMessage,type CustomSchema} from '../src/lib/customFields.ts';
const schema:CustomSchema={schemaRevision:3,fields:[
 {id:'quantity',label:'数量',type:'number',order:0,required:true,enabled:true,options:[]},
 {id:'checked',label:'是否确认',type:'boolean',order:1,required:true,enabled:true,options:[]},
 {id:'legacy',label:'旧字段',type:'text',order:2,required:false,enabled:false,options:[]},
 {id:'choice',label:'分类',type:'singleChoice',order:3,required:false,enabled:true,options:[{id:'retired',label:'历史分类',enabled:false}]},
]};
test('zero/false remain explicit and disabled history is not resubmitted',()=>{
 assert.deepEqual(customFieldPatch(schema,{legacy:'留存'},{quantity:'0',checked:false,legacy:'留存'}),{schemaRevision:3,customFields:{quantity:'0',checked:false}});
 assert.equal(customValueLabel(schema.fields[0],'0'),'0');assert.equal(customValueLabel(schema.fields[1],false),'否');
});
test('unchanged values and historical disabled options are omitted, explicit clears remain',()=>{
 const original={quantity:'12',checked:false,choice:'retired',legacy:'留存'};
 assert.deepEqual(customFieldPatch(schema,original,{...original}),{schemaRevision:3,customFields:{}});
 assert.deepEqual(customFieldPatch(schema,original,{...original,quantity:''}),{schemaRevision:3,customFields:{quantity:null}});
 assert.equal(customValueLabel(schema.fields[3],'retired'),'历史分类（已停用）');
});
test('field errors resolve stable identities to labels and never turn false into missing',()=>{
 assert.match(customErrorMessage({code:'required_custom_field',fields:['quantity']},schema),/数量/);
 assert.match(customErrorMessage({code:'custom_schema_revision_conflict'},schema),/输入已保留/);
 assert.equal(customValueLabel(schema.fields[1],null),'未填写');
});

test('required whitespace is missing while zero and false remain values',async()=>{
 const {isMissingCustom}=await import('../src/lib/customFields.ts');
 assert.equal(isMissingCustom(' \n '),true);assert.equal(isMissingCustom('0'),false);assert.equal(isMissingCustom(false),false);
});
test('rebase preserves actual edits, adopts unrelated latest values and exposes disabled edits',async()=>{
 const {rebaseCustomValues,unavailableCustomChanges}=await import('../src/lib/customFields.ts');
 const original={quantity:'12',checked:false,choice:'retired'};
 const rebased=rebaseCustomValues(original,{...original,quantity:'13'},{quantity:'14',checked:true,choice:'retired'});
 assert.deepEqual(rebased,{quantity:'13',checked:true,choice:'retired'});
 assert.deepEqual(unavailableCustomChanges(schema,original,{...original,legacy:'误改历史值'}),['legacy']);
 assert.deepEqual(unavailableCustomChanges(schema,original,original),[]);
});

 test('legal prototype-name IDs require own values and remain writable',async()=>{
 const {getCustomValue,changedCustomValues}=await import('../src/lib/customFields.ts');
 for(const id of ['toString','valueOf','hasOwnProperty']){
 assert.equal(getCustomValue({},id),undefined);
 const value={[id]:'真实值'};assert.equal(getCustomValue(value,id),'真实值');
 assert.deepEqual(changedCustomValues({},value),value);
 const field={...schema.fields[0],id,type:'text' as const};
 assert.deepEqual(customFieldPatch({schemaRevision:1,fields:[field]}, {},value).customFields,value);
 }
});
