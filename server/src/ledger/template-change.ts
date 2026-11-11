import {templateMaterial} from './template-material.ts';
import {sameTemplateStage} from './template-stage.ts';
import type {Template} from '../agent/model.ts';
import {object,string,WorkflowError} from './workflow.ts';
export function templateChangePreview(input:Record<string,unknown>,templates:Template[]){
 if(input.scope!==undefined&&input.scope!=='organization'||input.enabled===false)throw new WorkflowError('template_change_not_publishable',409);
 if(['fundId','projectId','objectId'].some(key=>input[key]!==undefined&&input[key]!==''))throw new WorkflowError('template_object_scope_unsupported',409);
 const title=string(input.title,true,160),objectType=string(input.objectType,true,30),stage=string(input.stage??'',false,60),id=input.id===undefined?undefined:string(input.id,true,100);
 if(['lp','company'].includes(objectType)&&stage)throw new WorkflowError('template_stage_scope_unsupported',409);
 if(!['company','project','fund','lp','report'].includes(objectType))throw new WorkflowError('invalid_template_type',400);
 const before=id?templates.find(t=>t.id===id&&t.status==='published'):undefined;
 if(id&&(!before||input.version!==before.version))throw new WorkflowError('template_version_conflict',409);
 if(id&&templates.some(t=>t.baseId===id))throw new WorkflowError('template_draft_exists',409);
 if(before&&(before.objectType!==objectType||!sameTemplateStage(before.stage,stage)))throw new WorkflowError('template_scope_change_requires_new',409);
 if(!Array.isArray(input.fields)||input.fields.length>100||!Array.isArray(input.materials)||input.materials.length>100)throw new WorkflowError('invalid_template_fields',400);
 const fields=input.fields.map(value=>{const f=object(value,['id','label','type','required','enabled','options']),type=string(f.type,true,30);if(!['text','number','date','boolean','choice'].includes(type))throw new WorkflowError('invalid_template_field',400);const options=f.options===undefined?undefined:Array.isArray(f.options)?f.options.map(o=>string(o,true,200)):null;if(options===null||type==='choice'&&(!options?.length||new Set(options).size!==options.length))throw new WorkflowError('invalid_template_options',400);return {id:string(f.id,true,100),label:string(f.label,true,120),type:type as Template['fields'][number]['type'],required:f.required===true,enabled:f.enabled!==false,...(options?{options}:{})};});
 if(['company','project','fund'].includes(objectType)&&fields.some(f=>!/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(f.id)))throw new WorkflowError('invalid_template_field_id',400);
 if(new Set(fields.map(f=>f.id)).size!==fields.length)throw new WorkflowError('duplicate_template_field',400);
 const materials=input.materials.map(templateMaterial);
 if(new Set(materials.map(m=>m.id)).size!==materials.length)throw new WorkflowError('duplicate_template_material',400);
 const changes:{kind:string;id:string;before:unknown;after:unknown}[]=[];
 for(const [kind,previous,next] of [['字段',before?.fields??[],fields],['材料',before?.materials??[],materials]] as const){for(const key of new Set([...previous.map(v=>v.id),...next.map(v=>v.id)])){const old=previous.find(v=>v.id===key)??null,value=next.find(v=>v.id===key)??null;if(JSON.stringify(old)!==JSON.stringify(value))changes.push({kind,id:key,before:old,after:value});}}
 if(!changes.length&&before?.title===title)throw new WorkflowError('template_change_empty',400);
 return {data:{...(id?{id,version:before!.version}:{}),title,objectType,stage,fields,materials,isDefault:before?.isDefault??false,enabled:true},preview:{objectType,stage:stage||'全部阶段',previousVersion:before?.version??null,changes,impact:'确认后发布新的生效版本，影响后续业务表单和新生成材料清单；已有业务值、原件和草稿快照保留。不修改金额、审批状态或业务进度。'}};
}
