export type CustomObjectType='company'|'project'|'fund';
export type CustomValue=string|boolean|null;
export type CustomValues=Record<string,CustomValue>;
export type CustomField={requiredStages?:string[];id:string;label:string;type:'text'|'number'|'date'|'boolean'|'singleChoice';order:number;required:boolean;enabled:boolean;options:{id:string;label:string;enabled:boolean}[]};
export type CustomSchema={schemaRevision:number;fields:CustomField[]};
export type CustomSchemaWrite={requestId:string;expectedRevision:number;fields:CustomField[]};
export type CustomWrite={schemaRevision?:number;customFields?:CustomValues};
export type CustomData=CustomWrite&{customFieldSchema?:CustomSchema;missingCustomFields?:string[]};
export type CustomExportSnapshot={objectType:CustomObjectType;capturedAt:string;schema:CustomSchema;records:(CustomData&{id:string;name:string;dataOrigin?:string;dataPurpose?:string})[]};
export const customObjectLabels:Record<CustomObjectType,string>={company:'企业',project:'项目',fund:'基金'};
export const customTypeLabels:Record<CustomField['type'],string>={text:'文本',number:'数值',date:'日期',boolean:'是 / 否',singleChoice:'单选'};
export const emptyCustomSchema=():CustomSchema=>({schemaRevision:0,fields:[]});
export function orderedCustomFields(schema:CustomSchema){return [...schema.fields].sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));}
export const getCustomValue=(values:CustomValues|undefined,id:string):CustomValue|undefined=>values&&Object.prototype.hasOwnProperty.call(values,id)?values[id]:undefined;
export const isMissingCustom=(value:CustomValue|undefined)=>value===undefined||value===null||typeof value==='string'&&value.trim()==='';
export function customValueLabel(field:CustomField,value:CustomValue|undefined){
 if(isMissingCustom(value))return '未填写';
 if(typeof value==='boolean')return value?'是':'否';
 if(field.type==='singleChoice'){const option=field.options.find(o=>o.id===value);return option?option.label+(option.enabled?'':'（已停用）'):'选项待核对';}
 return value;
}
export function changedCustomValues(original:CustomValues,draft:CustomValues){
 const values:CustomValues={};
 for(const id of new Set([...Object.keys(original),...Object.keys(draft)])){const before=isMissingCustom(getCustomValue(original,id))?null:getCustomValue(original,id);const value=isMissingCustom(getCustomValue(draft,id))?null:getCustomValue(draft,id);if(!Object.is(before,value))values[id]=value??null;}
 return values;
}
export function unavailableCustomChanges(schema:CustomSchema,original:CustomValues,draft:CustomValues){
 return Object.entries(changedCustomValues(original,draft)).filter(([id,value])=>{const field=schema.fields.find(f=>f.id===id);return !field||!field.enabled||field.type==='singleChoice'&&value!==null&&!field.options.some(o=>o.id===value&&o.enabled);}).map(([id])=>id);
}
export function rebaseCustomValues(original:CustomValues,draft:CustomValues,latest:CustomValues){return {...latest,...changedCustomValues(original,draft)};}
export function customFieldPatch(schema:CustomSchema,original:CustomValues,draft:CustomValues){
 const changes=changedCustomValues(original,draft),values:CustomValues={};
 for(const field of schema.fields)if(field.enabled&&Object.prototype.hasOwnProperty.call(changes,field.id))values[field.id]=getCustomValue(changes,field.id)!;
 return {schemaRevision:schema.schemaRevision,customFields:values};
}
export function customErrorMessage(cause:unknown,schema?:CustomSchema){
 const e=(cause??{}) as {code?:string;status?:number;fields?:string[]};const labels=(e.fields??[]).map(id=>schema?.fields.find(f=>f.id===id)?.label??id).join('、');
 const messages:Record<string,string>={custom_schema_revision_conflict:'字段设置已变化，本次输入已保留，请核对最新设置后再保存。',invalid_custom_fields:'补充信息格式不正确，请核对字段内容。',required_custom_field:'请补充必填内容',invalid_custom_value:'内容格式不符合字段要求',invalid_custom_option:'所选选项已停用或不再可选',disabled_custom_field:'该字段已停用，请保留原值',unknown_custom_field:'字段设置已变化，请核对最新设置',custom_field_type_immutable:'已有字段的类型不能修改，请停用旧字段后新增。',custom_field_delete_forbidden:'已有字段需停用并保留历史，不能删除。',custom_option_delete_forbidden:'已有选项需停用并保留历史，不能删除。',schema_request_conflict:'本次保存标识已对应其他内容，请核对保存结果。',unfillable_custom_choice:'必填单选字段至少需要一个启用选项。',invalid_schema_payload:'请核对字段名称、类型、选项和排序。'};
 return (e.code&&messages[e.code]|| (e.status===403?'当前账号没有修改字段设置的权限。':e.status===401?'登录已失效，请重新登录。':'暂未确认保存结果，请保留输入原样重试。'))+(labels?'：'+labels:'');
}
