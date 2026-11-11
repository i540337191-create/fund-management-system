import {createHash,randomUUID} from 'node:crypto';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import type {LedgerStore} from '../ledger/store.ts';
import type {AuthConfigInput} from '../auth/session.ts';
import {resolveRequestUser} from '../auth/authorize.ts';
import {accessContext} from '../auth/object-access.ts';
import type {AgentRepository} from '../agent/repository.ts';
import type {Template} from '../agent/model.ts';
import {isLpMaterial} from '../ledger/lp-privacy.ts';
import {canReadMaterial} from './material-files.ts';
import {createFinancialEvidence} from './financial-evidence.ts';
import {requestMaterialExtraction} from '../material-preview/extraction.ts';
import {object,string,requestId,WorkflowError,fail} from '../ledger/workflow.ts';
type Section={fieldId:string;title:string;instructions:string;page:number;quote:string};
type Variable={name:string;sectionId:string;marker:string;required:boolean};
export function importReportChapters(pages:{page:number;text:string}[]){
 const sections:Section[]=[];
 for(const page of pages){
  let title='',lines:string[]=[],quote='';
  const push=()=>{const text=lines.join('\n').trim();if(!text)return;for(let start=0;start<text.length;start+=40000){const part=text.slice(start,start+40000);sections.push({fieldId:'chapter-'+(sections.length+1),title:(title||'全文（待人工拆分）')+(start?' · 续段':''),instructions:part,page:page.page,quote:(quote||part).slice(0,500)});}};
  for(const line of page.text.split(/\r?\n/)){const trimmed=line.trim(),heading=/^(?:#{1,6}\s+|第[一二三四五六七八九十百\d]+[章节篇]\s*|[一二三四五六七八九十]+[、．]|\d+(?:\.\d+)*[、．.]\s*)\S/.test(trimmed)&&trimmed.length<=200;if(heading){push();title=trimmed.replace(/^#{1,6}\s+/,'').slice(0,120);lines=[line];quote=trimmed;}else{lines.push(line);if(!quote&&trimmed)quote=trimmed;}}
  push();
 }
 if(!sections.length||sections.length>60)fail('template_source_sections_limit',422);
 const variables:Variable[]=[];
 for(const section of sections)for(const m of section.instructions.matchAll(/\{\{([\p{L}][\p{L}\p{N}_]{0,59})\}\}/gu))if(!variables.some(v=>v.name===m[1]&&v.sectionId===section.fieldId))variables.push({name:m[1],sectionId:section.fieldId,marker:m[0],required:false});
 if(variables.length>100)fail('template_variables_limit',422);return {sections,variables};
}
export function registerReportTemplateImportRoutes(server:FastifyInstance,store:LedgerStore,options:{auth?:AuthConfigInput;repository:AgentRepository;storageRoot:string}){
 const evidence=createFinancialEvidence(store,options.storageRoot,()=> '');
 const actor=async(r:FastifyRequest)=>{const a=resolveRequestUser(r,options.auth);if(!a)fail('unauthorized',401);if(a.role!=='admin')fail('forbidden',403);const context=accessContext.getStore();if(context?.validate&&!await context.validate())fail('unauthorized',401);await context?.refresh?.();return a;};
 const source=async(r:FastifyRequest,materialId:unknown,versionId:unknown)=>{const a=await actor(r),id=string(materialId,true,240),version=string(versionId,true,240),m=(await store.listMaterials()).find(m=>m.id===id);if(!m||!canReadMaterial(a,m))fail('material_not_found',404);const v=(await store.listMaterialVersions(id)).find(v=>v.id===version);if(!v)fail('material_version_unavailable',409);if(!/\.(docx?|txt|md|pdf|pptx?)$/i.test(v.name))fail('unsupported_report_template_source',415);await evidence.readBytes(v.blobId,v.sha256,v.sizeBytes);const extracted=await requestMaterialExtraction(options.storageRoot,v);if(extracted.status!=='ready')fail(extracted.status==='pending'?'extraction_pending':'extraction_failed',409);if(extracted.pages.reduce((n,p)=>n+p.text.length,0)>200000)fail('template_source_too_long',413);return {a,m,v,pages:extracted.pages};};
 const handle=(fn:(r:any)=>Promise<unknown>)=>async(r:any,reply:any)=>{reply.header('Cache-Control','private, no-store');try{return await fn(r);}catch(e){if(e instanceof WorkflowError)return reply.code(e.status).send({error:e.code});r.log.error({code:'report_template_import_failed'});return reply.code(503).send({error:'report_template_import_failed'});}};
 server.post('/api/report-template-imports/prepare',handle(async r=>{const b=object(r.body,['materialId','versionId']),s=await source(r,b.materialId,b.versionId);return {title:s.v.name.replace(/\.[^.]+$/,''),source:{materialId:s.m.id,versionId:s.v.id,sha256:s.v.sha256,name:s.v.name,lpSensitive:isLpMaterial(s.m)},...importReportChapters(s.pages),pages:s.pages.map(p=>({page:p.page,text:p.text})),notice:'这是从原件正文生成的章节建议，须逐项核对。保留章节/变量映射及原件版本，不承诺复现Word版式。'};}));
 server.post('/api/report-template-imports/confirm',handle(async r=>{
  const b=object(r.body,['requestId','expectedRevision','title','stage','source','sections','variables']),rid=requestId(b.requestId),ref=object(b.source,['materialId','versionId']),s=await source(r,ref.materialId,ref.versionId),title=string(b.title,true,160),stage=string(b.stage??'',false,60);
  if(!Array.isArray(b.sections)||!b.sections.length||b.sections.length>60||!Array.isArray(b.variables)||b.variables.length>100)fail('invalid_report_template_mapping');
  const sections:Section[]=b.sections.map(value=>{const x=object(value,['fieldId','title','instructions','page','quote']),fieldId=string(x.fieldId,true,100),chapter=string(x.title,true,120),instructions=string(x.instructions,false,50000),quote=string(x.quote,true,500);if(!Number.isSafeInteger(x.page)||!s.pages.some(p=>p.page===x.page&&p.text.includes(quote)))fail('template_source_quote_mismatch');return {fieldId,title:chapter,instructions,page:Number(x.page),quote};});
  if(new Set(sections.map(c=>c.fieldId)).size!==sections.length)fail('duplicate_template_field');
  const variables:Variable[]=b.variables.map(value=>{const x=object(value,['name','sectionId','marker','required']),name=string(x.name,true,60),sectionId=string(x.sectionId,true,100),marker=string(x.marker,true,100);if(!/^[\p{L}][\p{L}\p{N}_]{0,59}$/u.test(name)||marker!==`{{${name}}}`||typeof x.required!=='boolean'||!sections.some(c=>c.fieldId===sectionId&&c.instructions.includes(marker)))fail('invalid_report_template_variable');return {name,sectionId,marker,required:x.required};});
  if(new Set(variables.map(v=>v.sectionId+':'+v.name)).size!==variables.length)fail('duplicate_template_variable');for(const section of sections)for(const m of section.instructions.matchAll(/\{\{([\p{L}][\p{L}\p{N}_]{0,59})\}\}/gu))if(!variables.some(v=>v.sectionId===section.fieldId&&v.name===m[1]))fail('template_variable_unmapped');
  const live=await actor(r);const fingerprint=createHash('sha256').update(JSON.stringify({actorId:live.id,...b})).digest('hex');return options.repository.transaction(state=>{const key='template-import:'+live.id+':'+rid,prior=state.receipts[key];if(prior){if(prior.fingerprint!==fingerprint)fail('request_conflict',409);return prior.result;}if(b.expectedRevision!==state.revision)fail('workspace_revision_conflict',409);const template:Template={createdAt:new Date().toISOString(),id:randomUUID(),ownerId:live.id,scope:'personal',title,objectType:'report',stage,fields:sections.map(c=>({id:c.fieldId,label:c.title,type:'text',required:false,enabled:true})),materials:[],version:1,status:'draft',enabled:true,sourceMapping:{materialId:s.m.id,versionId:s.v.id,sha256:s.v.sha256,name:s.v.name,sections,variables,...(isLpMaterial(s.m)?{lpSensitive:true}:{})}};state.templates.push(template);state.revision++;state.audit.push({id:randomUUID(),actorId:live.id,action:'导入报告模板草稿',targetId:template.id,time:new Date().toISOString()});const result={template,revision:state.revision};state.receipts[key]={fingerprint,result};return result;});
 }));
}
