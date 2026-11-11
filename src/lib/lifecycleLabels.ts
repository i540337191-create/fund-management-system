import {getCustomValue,customValueLabel,type CustomData,type CustomField,type CustomSchema} from './customFields.ts';
// Stable IDs keep labels independent of formal workflow stages and retain historical references.
export const lifecycleLabelFieldId='lifecycle_label';
export function lifecycleLabelPreset(order:number):CustomField{return {id:lifecycleLabelFieldId,label:'生命周期标签',type:'singleChoice',order,enabled:true,required:false,options:[{id:'tracking',label:'持续跟进',enabled:true},{id:'historical',label:'历史资产',enabled:true},{id:'exit_followup',label:'退出跟踪',enabled:true}]};}
export function lifecycleField(schema:CustomSchema|undefined){return schema?.fields.find(f=>f.id===lifecycleLabelFieldId&&f.type==='singleChoice');}
export function lifecycleLabel(data:CustomData){const field=lifecycleField(data.customFieldSchema);return field?customValueLabel(field,getCustomValue(data.customFields,field.id))+(field.enabled?'':'（标签字段已停用）'):'未配置';}
export function matchesLifecycleLabel(data:CustomData,optionId:string){return !optionId||getCustomValue(data.customFields,lifecycleLabelFieldId)===optionId;}
export function lifecycleFilterOptions(schema:CustomSchema|undefined){const field=lifecycleField(schema);return field?.options.map(o=>({value:o.id,label:o.label+(o.enabled?'':'（已停用）')}))??[];}
