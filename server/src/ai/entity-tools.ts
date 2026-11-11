import {object,string,fail} from '../ledger/workflow.ts';
import {canRole} from '../auth/rbac.ts';
import {normalizeProjectInput} from '../ledger/store.ts';
import {normalizeFundInput} from '../ledger/fund-master.ts';
import {meetingInput} from '../ledger/meeting-input.ts';
import type {SessionUser} from '../auth/session.ts';
export const entityFields:Record<string,string[]>={
 company_update:['id','name','shortName','industry','schemaRevision','customFields'],
 project_update:['id','name','shortName','industry','description','companyId','newCompany','schemaRevision','customFields'],
 fund_update:['id','name','shortName','managerId','stage','scale','nextAction','schemaRevision','customFields'],
 company_create:['name','shortName','industry','schemaRevision','customFields'],
 project_create:['stage','name','shortName','industry','fundId','manager','collaborators','sourceChannel','description','companyId','newCompany','schemaRevision','customFields'],
 fund_create:['name','shortName','managerId','stage','scale','nextAction','schemaRevision','customFields'],
 meeting_create:['projectId','title','date','attendees','summary','conclusions','todoItems','riskItems','taskDueDate'],
};
export const entityLabels:Record<string,string>={company_update:'修改企业档案',project_update:'修改项目档案',fund_update:'修改基金档案',company_create:'新建企业档案',project_create:'新建项目档案',fund_create:'新建基金档案',meeting_create:'新建会议纪要'};
export function prepareEntity(kind:string,value:unknown,a:SessionUser,id:string,context:{customSchemas?:Record<string,{schemaRevision:number}>;projects:{id:string;name:string;masterRevision?:number;shortName?:string;industry?:string;description?:string;companyId?:string|null}[];funds:{id:string;name:string;revision?:number;shortName?:string;managerId?:string|null;stage?:string;scale?:string;nextAction?:string}[];users:{id:string;name:string;canLogin:boolean}[];companies:{id:string;name:string;revision?:number;shortName?:string;industry?:string}[]}){
 const fields=Object.hasOwn(entityFields,kind)?entityFields[kind]:undefined;if(!fields)fail('action_not_supported');
 const permission=kind==='meeting_create'?'meeting:write':kind.startsWith('fund_')?'fund:write':'project:write';if(!canRole(a.role,permission))fail('forbidden',403);
 const input=object(value,fields);let body:Record<string,unknown>={...input,requestId:id};
 if(kind.endsWith('_update')){
  const targetId=string(input.id),type=kind.split('_')[0],current=type==='project'?context.projects.find(x=>x.id===targetId):type==='fund'?context.funds.find(x=>x.id===targetId):context.companies.find(x=>x.id===targetId);
  if(!current)fail('action_object_unavailable',409);const before=current as unknown as Record<string,unknown>,revision=type==='project'?before.masterRevision??1:before.revision;
  if(!Number.isSafeInteger(revision))fail('action_object_unavailable',409);
  const preserved=Object.fromEntries(fields.filter(k=>!['id','customFields','schemaRevision','newCompany'].includes(k)&&before[k]!==undefined&&before[k]!==null).map(k=>[k,before[k]]));
  body={...preserved,...input,requestId:id,expectedRevision:revision};delete body.id;
  if(input.newCompany!==undefined)delete body.companyId;
  if(context.customSchemas?.[type]&&body.schemaRevision===undefined)body.schemaRevision=context.customSchemas[type].schemaRevision;
  string(body.name,true,200);string(body.shortName,true,100);if(type!=='fund')string(body.industry,type==='project',200);
  if(type==='fund'){delete body.industry;try{normalizeFundInput(body,true);}catch{fail('action_missing_fields');}}
  const path='/api/'+({company:'companies',project:'projects',fund:'funds'} as Record<string,string>)[type]+'/'+encodeURIComponent(targetId);
  return {body,path,method:'PATCH' as const,before};
 }

 if(kind==='company_create'){string(input.name,true,200);string(input.shortName,true,100);string(input.industry,false,200);if(context.companies.some(c=>c.name===String(input.name).trim()))fail('company_name_conflict',409);}
 if(kind==='project_create'){try{normalizeProjectInput(body);}catch{fail('action_missing_fields');}if(!context.funds.some(f=>f.id===input.fundId))fail('action_object_unavailable',409);if(context.projects.some(p=>p.name===String(input.name).trim()))fail('project_name_conflict',409);if(!context.users.some(u=>u.canLogin&&u.name===input.manager))fail('ineligible_user');if(input.companyId&&!context.companies.some(c=>c.id===input.companyId))fail('action_object_unavailable',409);}
 if(kind==='fund_create'){try{normalizeFundInput(body);}catch{fail('action_missing_fields');}if(context.funds.some(f=>f.name===String(input.name).trim()))fail('fund_name_conflict',409);if(!context.users.some(u=>u.canLogin&&u.id===input.managerId))fail('ineligible_user');}
 if(kind==='meeting_create'){meetingInput(body);if(!context.projects.some(p=>p.id===input.projectId))fail('action_object_unavailable',409);}
 return {body,path:({company_create:'/api/companies',project_create:'/api/projects',fund_create:'/api/funds',meeting_create:'/api/meetings'} as Record<string,string>)[kind]};
}
