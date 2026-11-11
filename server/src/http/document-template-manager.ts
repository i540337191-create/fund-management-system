import {randomUUID} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import type {LedgerStore} from '../ledger/store.ts';
import type {LifecycleState} from '../ledger/fund-lifecycle.ts';
import {resolveAuthConfig,type AuthConfigInput,type SessionUser} from '../auth/session.ts';
import {resolveRequestUser} from '../auth/authorize.ts';
import {currentAccountActor} from '../auth/registered-session.ts';
import {canRole} from '../auth/rbac.ts';
import {canReadLp,lpProjection} from '../ledger/lp-privacy.ts';
import {hiddenSource} from '../ledger/source-policy.ts';
import {raisingView} from '../ledger/fundraising.ts';
import {lpReadView} from '../ledger/lp-ledger.ts';
import {units,fixed} from '../ledger/exit-settlement.ts';
import {object,string,requestId,revision,fail,WorkflowError} from '../ledger/workflow.ts';
import {generateDocument,documentMime,type BusinessDocument} from '../ledger/document-output.ts';
export type ManagedDocumentTemplate={id:string;name:string;version:number;sections:{title:string;text:string}[];variables:{name:string;required:boolean}[];createdAt:string;createdBy:string;builtin?:boolean;deletedAt?:string};
type TemplateState=LifecycleState&{data:LifecycleState['data']&{templates?:ManagedDocumentTemplate[]}};
export const documentSystemVariables=['基金名称','投资者名称','缴款计划名称','本期应缴金额','本期已缴金额','本期未缴金额','缴款截止日期','收款账户名称','收款账号','通知日期'] as const;
const paymentVariables=[...documentSystemVariables];
export const paymentNoticeTemplate:ManagedDocumentTemplate={id:'payment-notice-draft',name:'缴款通知草稿',version:1,builtin:true,createdAt:'2026-11-02',createdBy:'系统预置草稿',variables:paymentVariables.map(name=>({name,required:true})),sections:[{title:'缴款事项',text:'{{投资者名称}}：\n请核对{{基金名称}}的{{缴款计划名称}}。本期计划应缴总额为人民币{{本期应缴金额}}元，按已登记分配核对已缴{{本期已缴金额}}元，尚需缴纳{{本期未缴金额}}元。缴款截止日期为{{缴款截止日期}}。'},{title:'收款账户',text:'账户名称：{{收款账户名称}}\n账号：{{收款账号}}\n请在付款前由经办人与投资者核对账户及通知内容。'},{title:'核对与使用',text:'基金：{{基金名称}}\n通知日期：{{通知日期}}\n本草稿依据当前已登记分期计划与到账分配整理，尚须人工核对，不代替真实银行到账确认、法律审定或已完成通知送达。'}]};
function readPermission(a:SessionUser){if(!canRole(a.role,'fund:read')&&!canRole(a.role,'report:read')&&!canRole(a.role,'fund:write')&&!canReadLp(a))fail('forbidden',403);}
const variableName=(v:unknown)=>{const name=string(v,true,60);if(!/^[\p{L}][\p{L}\p{N}_]{0,59}$/u.test(name))fail('invalid_template_variable');return name;};
function markers(text:string){const found=[...text.matchAll(/\{\{([^{}]+)\}\}/g)].map(m=>{const name=variableName(m[1]);if(name!==m[1])fail('invalid_template_variable');return name;});const rest=text.replace(/\{\{[^{}]+\}\}/g,'');if(/\{\{|\}\}|\$\{|«[^»]*»/.test(rest))fail('unresolved_template_bookmark');return found;}
function templateContent(value:Record<string,unknown>){
 const name=string(value.name,true,120);
 if(!Array.isArray(value.sections)||!value.sections.length||value.sections.length>60)fail('invalid_template_sections');
 const sections=value.sections.map(v=>{const s=object(v,['title','text']);return {title:string(s.title,true,200),text:string(s.text,true,50000)};});
 if(JSON.stringify(sections).length>600000)fail('template_content_limit');
 if(!Array.isArray(value.variables)||value.variables.length>40)fail('invalid_template_variables');
 const variables=value.variables.map(v=>{const x=object(v,['name','required']);if(typeof x.required!=='boolean')fail('invalid_template_variable');return {name:variableName(x.name),required:x.required};});
 if(new Set(variables.map(v=>v.name)).size!==variables.length)fail('duplicate_template_variable');
 const used=new Set([name,...sections.flatMap(s=>[s.title,s.text])].flatMap(markers));
 if([...used].some(name=>!variables.some(v=>v.name===name)))fail('unknown_template_variable');
 if(variables.some(v=>!used.has(v.name)))fail('unused_template_variable');
 return {name,sections,variables};
}
const allTemplates=(s:TemplateState,includeDeleted=false)=>[paymentNoticeTemplate,...(s.data.templates??[])].filter(t=>includeDeleted||!t.deletedAt);
const latest=(s:TemplateState,id:string)=>allTemplates(s).filter(t=>t.id===id).sort((a,b)=>b.version-a.version)[0];
const safe=(text:string)=>{if(/\{\{|\}\}|\$\{|«[^»]*»/.test(text))fail('unresolved_template_bookmark');return text;};
export function registerDocumentTemplateManagerRoutes(server:FastifyInstance,store:LedgerStore,options:{auth?:AuthConfigInput;onProjectedDocument?:(request:object)=>void}={}){
 const auth=resolveAuthConfig(options.auth),base='/api/funds/:fundId/document-templates';
 const handler=(fn:(r:any,p:any)=>Promise<unknown>)=>async(r:any,p:any)=>{try{return await fn(r,p);}catch(e){if(e instanceof WorkflowError)return p.code(e.status).send({error:e.code});if(typeof (e as any)?.statusCode==='number')return p.code((e as any).statusCode).send({error:(e as any).code??'forbidden'});r.log.error({code:'template_operation_failed'});return p.code(500).send({error:'template_operation_failed'});}};
 function actor(r:any){const a=resolveRequestUser(r,auth);if(!a)fail('unauthorized',401);return a;}
 const live=(s:LifecycleState,r:any)=>{const a=currentAccountActor(s,r,auth);readPermission(a);return a;};
 server.get(base,handler(async r=>{const a=actor(r);readPermission(a);const deleted=(r.query as {deleted?:string}).deleted;if(deleted!==undefined&&!['true','false'].includes(deleted))fail('invalid_deleted_filter');const result=await store.lifecycleTransaction(r.params.fundId,async s=>{live(s,r);return {templates:deleted==='true'?allTemplates(s,true).filter(t=>t.deletedAt):allTemplates(s),revision:s.data.revision,systemVariables:documentSystemVariables,canWrite:canRole(a.role,'fund:write')};});return canReadLp(a)?result:(await lpProjection(store)).project(result);}));
 server.post(base,handler(async r=>{
  const a=actor(r);if(!canRole(a.role,'fund:write'))fail('forbidden',403);
  const raw=object(r.body,['requestId','expectedRevision','templateId','expectedTemplateVersion','name','sections','variables']),rid=requestId(raw.requestId),expected=revision(raw.expectedRevision),content=templateContent(raw);
  const templateId=raw.templateId===undefined?undefined:string(raw.templateId,true,100),expectedVersion=raw.expectedTemplateVersion===undefined?undefined:revision(raw.expectedTemplateVersion);
  if(templateId===paymentNoticeTemplate.id)fail('builtin_template_readonly',409);if(Boolean(templateId)!==Boolean(expectedVersion))fail('invalid_template_version');
  return store.lifecycleTransaction(r.params.fundId,async s=>{
   const a=live(s,r);if(!canRole(a.role,'fund:write'))fail('forbidden',403);const state=s as TemplateState;
   const fingerprint=JSON.stringify({kind:'document_template_save',fundId:s.fund.id,actorId:a.id,templateId,expectedVersion,expected,...content}),prior=s.data.requests[rid];
   if(prior){if(prior.fingerprint!==fingerprint)fail('template_request_conflict',409);return structuredClone(prior.result);}
   if(s.data.revision!==expected)fail('lifecycle_revision_conflict',409);
   const previous=templateId?latest(state,templateId):undefined;if(templateId&&!previous)fail('template_not_found',404);if(previous&&previous.version!==expectedVersion)fail('template_version_conflict',409);
   if((state.data.templates?.length??0)>=200)fail('template_version_limit',409);
   const now=new Date().toISOString(),template:ManagedDocumentTemplate={id:templateId??randomUUID(),...content,version:(previous?.version??0)+1,createdAt:now,createdBy:a.name};
   (state.data.templates??=[]).push(template);s.data.revision++;
   const auditEvent={id:'audit-'+randomUUID(),module:'基金档案',action:'保存文档模板版本',targetType:'基金',targetId:s.fund.id,targetName:s.fund.name,actor:a.name,time:now,detail:JSON.stringify({actorId:a.id,requestId:rid,templateId:template.id,version:template.version,previous:previous??null,template}),source:'人工维护模板',dataOrigin:'user_input'};
   s.auditEvents.push(auditEvent);s.data.history.push({id:randomUUID(),action:'document_template_save',actor:a.name,actorId:a.id,time:now,body:{templateId:template.id,version:template.version}});
   const result={template,revision:s.data.revision,auditEvent};s.data.requests[rid]={fingerprint,result:structuredClone(result)};return result;
  });
 }));
 for(const operation of ['delete','restore'] as const)server.post(base+'/:templateId/'+operation,handler(async r=>{
  const a=actor(r);if(!canRole(a.role,'fund:write'))fail('forbidden',403);
  const b=object(r.body,['requestId','expectedRevision','expectedTemplateVersion']),rid=requestId(b.requestId),expected=revision(b.expectedRevision),expectedVersion=revision(b.expectedTemplateVersion);
  if(r.params.templateId===paymentNoticeTemplate.id)fail('builtin_template_readonly',409);
  return store.lifecycleTransaction(r.params.fundId,async s=>{
   const a=live(s,r);if(!canRole(a.role,'fund:write'))fail('forbidden',403);
   const fingerprint=JSON.stringify({kind:'document_template_'+operation,id:r.params.templateId,expected,expectedVersion,actorId:a.id}),prior=s.data.requests[rid];
   if(prior){if(prior.fingerprint!==fingerprint)fail('template_request_conflict',409);return prior.result;}
   if(s.data.revision!==expected)fail('lifecycle_revision_conflict',409);
   const templates=(s.data.templates??[]).filter(t=>t.id===r.params.templateId),last=[...templates].sort((a,b)=>b.version-a.version)[0];if(!last)fail('template_not_found',404);
   if(last.version!==expectedVersion||Boolean(last.deletedAt)===(operation==='delete'))fail('template_version_conflict',409);
   const now=new Date().toISOString();for(const template of templates)template.deletedAt=operation==='delete'?now:undefined;s.data.revision++;
   s.auditEvents.push({id:'audit-'+randomUUID(),module:'基金档案',action:operation==='delete'?'删除文档模板':'恢复文档模板',targetType:'基金',targetId:s.fund.id,targetName:last.name,actor:a.name,time:now,detail:'模板与全部历史版本'+(operation==='delete'?'移入最近删除':'恢复')+'，已生成文件保留。',source:'人工维护模板',dataOrigin:'user_input'});
   s.data.history.push({id:randomUUID(),action:'document_template_'+operation,actor:a.name,actorId:a.id,time:now,body:{templateId:last.id}});
   const result={revision:s.data.revision};s.data.requests[rid]={fingerprint,result};return result;
  });
 }));
 async function lpOptions(fundId:string){return store.lpTransaction(s=>{
  if(!s.funds.some(f=>f.id===fundId))fail('fund_not_found',404);
  const view=lpReadView(s,false);
  return view.investors.filter(i=>i.fundId===fundId&&!hiddenSource(i)).map(i=>{const raising=raisingView(view,i.id);return {id:i.id,name:i.name,plans:raising.plans.filter(p=>!p.cancelled&&units(p.remaining)>0n&&!raising.invalidAllocations.some(a=>a.planId===p.id)&&!raising.unallocatedReceipts.some(r=>units(r.remaining)>0n)).map(p=>({id:p.id,name:p.name,amount:p.amount,paid:p.paid,remaining:p.remaining,dueDate:p.dueDate}))};});
 });}
 server.get(base+'/generation-options',handler(async r=>{if(!canReadLp(actor(r)))fail('forbidden',403);return store.withObjectAccessLock(async()=>{const investors=await lpOptions(r.params.fundId);return store.lifecycleTransaction(r.params.fundId,async s=>{if(!canReadLp(live(s,r)))fail('forbidden',403);return {investors,accounts:s.data.accounts.map(a=>({id:a.id,name:a.name,number:a.number,kind:a.kind}))};});});}));
 server.post(base+'/:templateId/generate/:format',handler(async(r,p)=>{
  const a=actor(r);readPermission(a);const format=String(r.params.format);if(!['docx','pdf'].includes(format))fail('invalid_report_format');
  const b=object(r.body,['templateVersion','investorId','planId','accountId','values']),version=revision(b.templateVersion);
  // Custom keys are validated against the chosen version rather than accepted as caller-supplied system facts.
  const rawValues=b.values===undefined?{}:b.values;if(!rawValues||typeof rawValues!=='object'||Array.isArray(rawValues))fail('invalid_template_values');
  const selected={investorId:b.investorId===undefined?undefined:string(b.investorId,true,200),planId:b.planId===undefined?undefined:string(b.planId,true,200),accountId:b.accountId===undefined?undefined:string(b.accountId,true,200)};
  const document=await store.withObjectAccessLock(async()=>{
   const privileged=canReadLp(a),investors=privileged?await lpOptions(r.params.fundId):[];
   return store.lifecycleTransaction(r.params.fundId,async s=>{
    const liveActor=live(s,r),template=allTemplates(s).find(t=>t.id===r.params.templateId&&t.version===version);if(!template)fail('template_not_found',404);
    const needsPrivate=template.variables.some(v=>!['基金名称','通知日期'].includes(v.name)&&documentSystemVariables.includes(v.name as any))||Object.values(selected).some(Boolean);
    if(needsPrivate&&!canReadLp(liveActor))fail('forbidden',403);
    for(const key of Object.keys(rawValues)){if(documentSystemVariables.includes(key as any))fail('system_template_variable_override');if(!template.variables.some(v=>v.name===key))fail('unknown_template_variable');}
    const replacements:Record<string,string>={'基金名称':s.fund.name,'通知日期':new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date())};
    const investor=selected.investorId?investors.find(i=>i.id===selected.investorId):undefined;if(selected.investorId&&!investor)fail('investor_not_found',404);if(investor)replacements['投资者名称']=investor.name;
    const plan=selected.planId?investor?.plans.find(p=>p.id===selected.planId):undefined;if(selected.planId&&!plan)fail('payment_plan_unavailable',409);
    if(plan){Object.assign(replacements,{'缴款计划名称':plan.name,'本期应缴金额':fixed(units(plan.amount)),'本期已缴金额':fixed(units(plan.paid)),'本期未缴金额':fixed(units(plan.remaining)),'缴款截止日期':plan.dueDate});}
    const account=selected.accountId?s.data.accounts.find(a=>a.id===selected.accountId):undefined;if(selected.accountId&&!account)fail('payment_account_unavailable',409);if(account){if(!account.name.trim()||!account.number.trim())fail('payment_account_incomplete',409);replacements['收款账户名称']=account.name;replacements['收款账号']=account.number;}
    for(const variable of template.variables){if(!documentSystemVariables.includes(variable.name as any)){const value=(rawValues as Record<string,unknown>)[variable.name];if(value!==undefined)replacements[variable.name]=safe(string(value,false,5000));}if(variable.required&&!replacements[variable.name]?.trim())fail('required_template_variable_missing',409);}
    const render=(text:string)=>safe(text.replace(/\{\{([^{}]+)\}\}/g,(_token,name:string)=>{if(!template.variables.some(v=>v.name===name))fail('unknown_template_variable');return replacements[name]??'';}));
    const document:BusinessDocument={title:render(template.name),subtitle:s.fund.name+' · 模板 V'+template.version+' · 待人工核对',sections:template.sections.map(section=>({title:render(section.title),text:render(section.text)}))};
    document.sections.push({title:'使用说明',text:'本文件由经办人维护的模板与当前登记内容生成，仍须人工复核；不代表法律审定、银行付款或已向投资者发送。'});return document;
   });
  });
  const visible=canReadLp(a)?document:(await lpProjection(store)).project(document) as BusinessDocument;
  const bytes=await generateDocument(visible,format);
  await store.lifecycleTransaction(r.params.fundId,async s=>{const current=live(s,r);if(Object.values(selected).some(Boolean)&&!canReadLp(current))fail('forbidden',403);return true;});
  options.onProjectedDocument?.(r);
  p.header('Cache-Control','private, no-store').header('X-Content-Type-Options','nosniff').header('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(visible.title+'.'+format)}`);
  return p.type(documentMime[format as 'docx'|'pdf']).send(bytes);
 }));
}
