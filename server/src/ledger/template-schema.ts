import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
import type {Field,Schema} from './custom-fields.ts';
import type {Template} from '../agent/model.ts';
import {WorkflowError} from './workflow.ts';
export type TemplateSchemaSource={id:string;basis:Field|null;applied:Field};
const core=new Set(['name','shortName','industry','description','scale','nextAction','managerId','stage']);
const equal=isDeepStrictEqual;
export function templateSchemaPlan(schema:Schema,templates:Template[],target:Template,enabled:boolean){
 const baseId=target.baseId??target.id,old=templates.find(t=>t.id===baseId&&t.status==='published'),sources=target.schemaSources??old?.schemaSources??[];
 const related=templates.filter(t=>t.objectType===target.objectType&&t.status==='published');
 const ids=new Set([...target.fields.filter(f=>!core.has(f.id)).map(f=>f.id),...sources.map(f=>f.id),...(old?.fields??[]).filter(f=>!core.has(f.id)).map(f=>f.id)]);
 const active=[...related.filter(t=>t.id!==baseId&&t.enabled!==false),...(enabled?[target]:[])];
 const fields=structuredClone(schema.fields),nextSources:TemplateSchemaSource[]=[];
 for(const id of ids){
  if(!/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(id))throw new WorkflowError('invalid_template_field_id',400);
  const current=fields.find(f=>f.id===id),known=[...sources,...related.flatMap(t=>t.schemaSources??[])].filter(s=>s.id===id);
  if(!known.length&&related.some(t=>t.fields.some(f=>f.id===id)))throw new WorkflowError('template_field_origin_unknown',409);
  if(known.length&&current&&!known.some(s=>equal(s.applied,current)))throw new WorkflowError('template_field_source_conflict',409);
  const basis=known.length?structuredClone(known[0].basis):current?structuredClone(current):null;
  const overlays=active.flatMap(t=>t.fields.filter(f=>f.id===id&&f.enabled).map(f=>({template:t,field:f})));
  const final=overlays.at(-1)?.field;
  let field:Field;
  if(final){
   if(overlays.some(x=>(x.field.type==='choice'?'singleChoice':x.field.type)!==(final.type==='choice'?'singleChoice':final.type))||basis&&basis.type!==(final.type==='choice'?'singleChoice':final.type))throw new WorkflowError('template_field_rules_conflict',409);
   const choices=(values:string[])=>JSON.stringify([...new Set(values)].sort());
   if(final.type==='choice'&&(overlays.some(x=>choices(x.field.options??[])!==choices(final.options??[]))||basis?.enabled&&choices(basis.options.filter(o=>o.enabled).map(o=>o.label))!==choices(final.options??[])))throw new WorkflowError('template_field_rules_conflict',409);
   const options=final.type==='choice'?(final.options??[]).map((label,i)=>({id:current?.options.find(o=>o.label===label)?.id??'template-'+createHash('sha256').update(label).digest('hex').slice(0,16),label,enabled:true})):[];
   for(const option of current?.options??[])if(!options.some(o=>o.id===option.id))options.push({...option,enabled:false});
   field={id,label:final.label,type:final.type==='choice'?'singleChoice':final.type,order:current?.order??fields.length,enabled:true,required:Boolean(basis?.enabled&&basis.required)||overlays.some(x=>!x.template.stage&&x.field.required),requiredStages:[...new Set([...(basis?.requiredStages??[]),...overlays.filter(x=>x.template.stage&&x.field.required).map(x=>x.template.stage)])],options};
  }else{
   if(!basis&&!current)continue;field=basis?structuredClone(basis):{...current!,enabled:false,required:false};
   field.options=[...field.options,...(current?.options??[]).filter(o=>!field.options.some(v=>v.id===o.id)).map(o=>({...o,enabled:false}))];
  }
  if(current)fields.splice(fields.indexOf(current),1,field);else fields.push(field);
  nextSources.push({id,basis,applied:structuredClone(field)});
 }
 return {fields,sources:nextSources};
}
