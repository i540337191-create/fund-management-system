import test from 'node:test';import assert from 'node:assert/strict';
import {templateSchemaPlan} from '../src/ledger/template-schema.ts';
import type {Template} from '../src/agent/model.ts';
const template=(id='template'):Template=>({id,title:'模板',ownerId:'admin',scope:'organization',objectType:'project',stage:'',version:1,status:'draft',fields:[{id:'extra',label:'模板字段',type:'text',required:true,enabled:true}],materials:[]});
test('publish/disable restores independent required fields and preserves template-only historical field definitions',()=>{
 const t=template(),base={schemaRevision:1,fields:[{id:'independent',label:'独立字段',type:'text' as const,required:true,enabled:true,order:0,options:[]}]};
 const plan=templateSchemaPlan(base,[],t,true);t.schemaSources=plan.sources;t.status='published';const disabled=templateSchemaPlan({schemaRevision:2,fields:plan.fields},[t],t,false);
 assert.deepEqual(disabled.fields[0],base.fields[0]);assert.equal(disabled.fields.find(f=>f.id==='extra')?.enabled,false);assert.equal(disabled.fields.find(f=>f.id==='extra')?.required,false);
 t.fields[0].id='independent';delete t.schemaSources;const overlay=templateSchemaPlan(base,[],t,true);t.schemaSources=overlay.sources;const restored=templateSchemaPlan({schemaRevision:2,fields:overlay.fields},[t],t,false);assert.deepEqual(restored.fields[0],base.fields[0]);
});
test('shared field stays active for another template, manual schema edits and unknown historical origins block safely',()=>{
 const a=template('a'),first=templateSchemaPlan({schemaRevision:0,fields:[]},[],a,true);a.schemaSources=first.sources;a.status='published';const b=template('b');b.fields[0].label='第二模板';const second=templateSchemaPlan({schemaRevision:1,fields:first.fields},[a],b,true);b.schemaSources=second.sources;b.status='published';const disabled=templateSchemaPlan({schemaRevision:2,fields:second.fields},[a,b],a,false);assert.equal(disabled.fields[0].enabled,true);assert.equal(disabled.fields[0].label,'第二模板');
 assert.throws(()=>templateSchemaPlan({schemaRevision:2,fields:[{...second.fields[0],label:'独立编辑'}]},[a,b],a,false),{code:'template_field_source_conflict'});
 const historic=template();historic.status='published';assert.throws(()=>templateSchemaPlan({schemaRevision:1,fields:first.fields},[historic],historic,false),{code:'template_field_origin_unknown'});
});
test('HTTP publication, draft edit, disable and replay preserve independent required rule and historical values',async()=>{
 const {createServer}=await import('../src/index.ts');const {randomUUID}=await import('node:crypto');const server=createServer({auth:{mode:'local-bypass'}});
 const act=async(action:string,data:any,rid=randomUUID())=>{const view=(await server.inject({url:'/api/agent-workspace'})).json();return server.inject({url:'/api/agent-workspace/actions',method:'POST',payload:{requestId:rid,expectedRevision:view.revision,action,data}});};
 try{
  const initial=(await server.inject({url:'/api/custom-field-schemas/project'})).json().schema;
  const baseline={id:'shared_required',label:'独立必填',type:'text',enabled:true,required:true,order:initial.fields.length,options:[]};
  let r=await server.inject({url:'/api/custom-field-schemas/project',method:'PUT',payload:{requestId:randomUUID(),expectedRevision:initial.schemaRevision,fields:[...initial.fields,baseline]}});assert.equal(r.statusCode,200,r.body);
  const data={title:'QA源头模板',objectType:'project',stage:'',fields:[{id:'shared_required',label:'模板覆盖',type:'text',enabled:true,required:false},{id:'template_only',label:'模板必填',type:'text',enabled:true,required:true}],materials:[]};
  r=await act('save_template',data);assert.equal(r.statusCode,200,r.body);const id=r.json().result.id;r=await act('publish_template',{id});assert.equal(r.statusCode,200,r.body);
  r=await act('save_template',{...data,id,title:'尚未发布草稿'});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().templates.find((t:any)=>t.id===id).title,data.title);
  const rid=randomUUID();r=await act('toggle_template',{id,enabled:false},rid);assert.equal(r.statusCode,200,r.body);assert.equal((await act('toggle_template',{id,enabled:false},rid)).statusCode,200);
  const schema=(await server.inject({url:'/api/custom-field-schemas/project'})).json().schema;assert.deepEqual(schema.fields.find((f:any)=>f.id===baseline.id),baseline);assert.equal(schema.fields.find((f:any)=>f.id==='template_only').enabled,false);assert.equal(schema.fields.find((f:any)=>f.id==='template_only').required,false);
  const {validateCustom}=await import('../src/ledger/custom-fields.ts');assert.equal(validateCustom(schema,{schemaRevision:schema.schemaRevision,customFields:{}},{customFields:{shared_required:'历史独立值',template_only:'历史模板值'}}).customFields?.template_only,'历史模板值');
 }finally{await server.close();}
});
test('shared choice rules cannot silently narrow independent choices or replace another active stage rule',()=>{const t=template(),field={id:'extra',label:'独立选项',type:'singleChoice' as const,required:true,enabled:true,order:0,options:[{id:'a',label:'甲',enabled:true},{id:'b',label:'乙',enabled:true}]};t.fields[0]={id:'extra',label:'模板选项',type:'choice',required:false,enabled:true,options:['甲']};assert.throws(()=>templateSchemaPlan({schemaRevision:1,fields:[field]},[],t,true),{code:'template_field_rules_conflict'});t.fields[0].options=['乙','甲'];assert.deepEqual(templateSchemaPlan({schemaRevision:1,fields:[field]},[],t,true).fields[0].options.map(o=>o.id),['b','a']);});
