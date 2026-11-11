import {sameTemplateStage} from './template-stage.ts';
import {randomUUID} from 'node:crypto';
import type {AuditEvent,LedgerStore} from './store.ts';
export type ObjectType='company'|'project'|'fund';
export type CustomValue=string|boolean|null;
export type CustomData={schemaRevision?:number;customFields?:Record<string,CustomValue>};
export type Field={requiredStages?:string[];id:string;label:string;type:'text'|'number'|'date'|'boolean'|'singleChoice';order:number;required:boolean;enabled:boolean;options:{id:string;label:string;enabled:boolean}[]};
export type Schema={schemaRevision:number;fields:Field[]};
export type Schemas=Record<ObjectType,Schema>;
export const emptySchemas=():Schemas=>({company:{schemaRevision:0,fields:[]},project:{schemaRevision:0,fields:[]},fund:{schemaRevision:0,fields:[]}});
export class CustomFieldError extends Error {code:string;status:number;fields:string[];latest?:Schema; constructor(code:string,status=400,fields:string[]=[],latest?:Schema){super(code);this.code=code;this.status=status;this.fields=fields;this.latest=latest;} }
const fail=(code:string,fields:string[]=[])=>{throw new CustomFieldError(code,400,fields);};
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))return fail('invalid_custom_fields');return v as Record<string,unknown>;}
const safeId=(v:unknown)=>typeof v==='string'&&/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(v)&&!['constructor','prototype','__proto__'].includes(v);
function label(v:unknown){return typeof v==='string'&&v.trim().length>0&&v.length<=200&&!v.includes('\0');}
export function customInput(v:Record<string,unknown>):CustomData {return {...(Object.hasOwn(v,'schemaRevision')?{schemaRevision:v.schemaRevision as number}:{}),...(Object.hasOwn(v,'customFields')?{customFields:v.customFields as CustomData['customFields']}: {})};}
const ownValue=(values:Record<string,CustomValue>|undefined,id:string)=>values&&Object.hasOwn(values,id)?values[id]:undefined;
const missing=(value:unknown)=>value===undefined||value===null||(typeof value==='string'&&value.trim()==='');
export function validateCustom(schema:Schema,input:CustomData,previous?:CustomData,stage=''):CustomData {
 if(input.schemaRevision!==schema.schemaRevision&&(schema.schemaRevision>0||input.schemaRevision!==undefined))throw new CustomFieldError('custom_schema_revision_conflict',409,[],schema);
 const values={...(previous?.customFields??{})};
 if(input.customFields!==undefined)for(const [id,raw] of Object.entries(object(input.customFields))){
  const field=schema.fields.find(f=>f.id===id);if(!safeId(id)||!field)fail('unknown_custom_field',[id]);
  if(!field!.enabled)fail('disabled_custom_field',[id]);
  let value=raw;
  if(value!==null){
   if(field!.type==='boolean'){if(typeof value!=='boolean')fail('invalid_custom_value',[id]);}
   else if(field!.type==='number'){
    if(typeof value==='number'){if(!Number.isFinite(value)||(!Number.isSafeInteger(value)&&Number.isInteger(value)))fail('invalid_custom_value',[id]);value=String(value);}
    if(typeof value!=='string'||value.length>100||!/^[-+]?\d+(\.\d+)?$/.test(value))fail('invalid_custom_value',[id]);
    let [whole,fraction='']=String(value).replace(/^\+/,'').split('.');const negative=whole.startsWith('-');whole=whole.replace(/^-/,'').replace(/^0+(?=\d)/,'');fraction=fraction.replace(/0+$/,'');value=(negative&&(whole!=='0'||fraction)?'-':'')+whole+(fraction?'.'+fraction:'');
   } else {
    if(typeof value!=='string'||value.length>(field!.type==='text'?10000:200)||value.includes('\0'))fail('invalid_custom_value',[id]);
    if(field!.type==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(String(value))||!Number.isFinite(Date.parse(String(value)))||new Date(String(value)).toISOString().slice(0,10)!==value))fail('invalid_custom_value',[id]);
    if(field!.type==='singleChoice'&&!field!.options.some(o=>o.id===value&&o.enabled))fail('invalid_custom_option',[id]);
   }
  }
  values[id]=value as CustomValue;
 }
 for(const f of schema.fields)if(f.enabled&&(f.required||f.requiredStages?.some(s=>sameTemplateStage(s,stage)))&&missing(ownValue(values,f.id))&&(!previous||!missing(ownValue(previous.customFields,f.id))))fail('required_custom_field',[f.id]);
 return {schemaRevision:schema.schemaRevision,customFields:values};
}
export function customView(schema:Schema,data:CustomData){return {...data,customFields:data.customFields??{},customFieldSchema:schema,missingCustomFields:schema.fields.filter(f=>f.enabled&&(f.required||f.requiredStages?.some(s=>sameTemplateStage(s,(data as {stage?:string}).stage)))&&missing(ownValue(data.customFields,f.id))).map(f=>f.id)};}
export function writeSchema(store:LedgerStore,kind:ObjectType,value:unknown,actor:{id:string;name:string;role?:string}){
 if(actor.role!=='admin')throw new CustomFieldError('forbidden',403);
 const b=object(value);if(typeof b.requestId!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.requestId))fail('invalid_schema_payload');
 b.requestId=(b.requestId as string).toLowerCase();
 return store.masterTransaction(s=>{
  const fingerprint=JSON.stringify({actorId:actor.id,kind,schema:b});const receipt=s.receipts[b.requestId as string];
  if(receipt){if(receipt.fingerprint!==fingerprint)throw new CustomFieldError('schema_request_conflict',409);return receipt.result as unknown as {schema:Schema};}
  const current=s.schemas[kind];if(b.expectedRevision!==current.schemaRevision)throw new CustomFieldError('custom_schema_revision_conflict',409,[],current);
  if(!Array.isArray(b.fields)||b.fields.length>100||Object.keys(b).some(k=>!['requestId','expectedRevision','fields'].includes(k)))fail('invalid_schema_payload');
  const fields=b.fields as Field[];const ids=new Set<string>();
  for(const f of fields){if(!f||!safeId(f.id)||ids.has(f.id)||!label(f.label)||!['text','number','date','boolean','singleChoice'].includes(f.type)||!Number.isSafeInteger(f.order)||typeof f.required!=='boolean'||typeof f.enabled!=='boolean'||!Array.isArray(f.options)||f.options.length>100||Object.keys(f).some(k=>!['id','label','type','order','required','enabled','options','requiredStages'].includes(k)))fail('invalid_schema_payload');ids.add(f.id);
   if(f.requiredStages!==undefined&&(!Array.isArray(f.requiredStages)||f.requiredStages.length>100||f.requiredStages.some(v=>typeof v!=='string'||!v.trim()||v.length>60)))fail('invalid_schema_payload',[f.id]);
   if(f.id==='lifecycle_label'&&f.type!=='singleChoice')fail('invalid_schema_payload',[f.id]);
   const old=current.fields.find(x=>x.id===f.id);if(old&&old.type!==f.type)fail('custom_field_type_immutable',[f.id]);
   const options=new Set<string>();for(const o of f.options){if(!o||!safeId(o.id)||options.has(o.id)||!label(o.label)||typeof o.enabled!=='boolean'||Object.keys(o).some(k=>!['id','label','enabled'].includes(k)))fail('invalid_schema_payload');options.add(o.id);}
   if(f.type==='singleChoice'&&f.enabled&&!f.options.some(o=>o.enabled))fail('unfillable_custom_choice',[f.id]);
   if(f.type!=='singleChoice'&&f.options.length)fail('invalid_schema_payload');
   if(old?.options.some(o=>!options.has(o.id)))fail('custom_option_delete_forbidden',[f.id]);
  }
  if(current.fields.some(f=>!ids.has(f.id)))fail('custom_field_delete_forbidden');
  const schema={schemaRevision:current.schemaRevision+1,fields:structuredClone(fields)};s.schemas[kind]=schema;
  const auditEvent:AuditEvent={id:randomUUID(),module:'系统设置',action:'修改自定义字段',targetType:kind,targetId:kind,targetName:kind,actor:actor.name,time:new Date().toISOString(),detail:JSON.stringify({actorId:actor.id,before:current,after:schema}),dataOrigin:'user_input'};s.auditEvents.push(auditEvent);
  const result={schema};s.receipts[b.requestId as string]={fingerprint,result:result as never};return result;
 });
}
