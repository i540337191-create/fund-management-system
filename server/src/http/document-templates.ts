import {investorProfileKind} from '../ledger/lp-profile.ts';
import type {FastifyInstance} from 'fastify';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import type {LedgerStore} from '../ledger/store.ts';
import type {AuthConfigInput} from '../auth/session.ts';
import {resolveRequestUser} from '../auth/authorize.ts';
import {canReadLp} from '../ledger/lp-privacy.ts';
import {fundraisingTemplates} from '../ledger/fundraising-templates.ts';
import {WorkflowError,fail,object,string,date} from '../ledger/workflow.ts';
import {generateDocument,documentMime} from '../ledger/document-output.ts';
export function registerDocumentTemplateRoutes(server:FastifyInstance,store:LedgerStore,options:{auth?:AuthConfigInput;projectRoot:string}){
 server.post('/api/funds/:fundId/investors/:id/fundraising/templates/:templateId/:format',async(r,reply)=>{
  try{
   const actor=resolveRequestUser(r,options.auth);if(!actor)fail('unauthorized',401);if(!canReadLp(actor))fail('forbidden',403);
   const params=r.params as {fundId:string;id:string;templateId:string;format:string};
   const template=fundraisingTemplates.find(t=>t.id===params.templateId);if(!template)fail('template_not_found',404);
   const b=object(r.body,['variables']),variables=object(b.variables,['fundName','investorName','date']);
   const fundName=string(variables.fundName,true,300),investorName=string(variables.investorName,true,300),day=date(variables.date);
   const scope=await store.lpTransaction(s=>{const fund=s.funds.find(f=>f.id===params.fundId),investor=s.investors.find(i=>i.id===params.id&&i.fundId===params.fundId);if(!fund||!investor)fail('investor_not_found',404);return {fundName:fund.name,investorName:investor.name,kind:investorProfileKind(investor)};});
   if(scope.fundName!==fundName||scope.investorName!==investorName)fail('template_variable_scope_mismatch',409);
   if([fundName,investorName].some(v=>/\{\{|\}\}|\$\{/.test(v)))fail('unresolved_template_variable');
   if(!scope.kind)fail('lp_profile_type_required');
   const materials=template.materials.filter(m=>m.applicableTo.includes(scope.kind!));
   const source=await readFile(resolve(options.projectRoot,'docs/source-materials/2026-06-10-fund-ops-templates/originals',template.source));
   if(createHash('sha256').update(source).digest('hex')!==template.sha256)fail('template_integrity_mismatch',409);
   const bytes=await generateDocument({title:template.name,subtitle:`${fundName} · ${investorName} · ${day}`,sections:[{title:'使用范围',text:'本清单根据已提供的资料清单整理，用于收集与人工复核。并非整套签署文件，也不代表已获监管认可或法律审定。'},...(['signed','base'] as const).map(category=>({title:category==='signed'?'签署文件清单':'基础证明材料清单',text:materials.filter(m=>m.category===category).map((m,i)=>`${i+1}. ${m.name}${m.copies?' · '+m.copies+'份':''} · ${m.required?'必需':'按条件适用'}\n${m.instructions}${m.condition?'；'+m.condition:''}\n收取情况：待核对`).join('\n\n')||(scope.kind==='product'?'源表未列明产品专属附件要求，请由经办人核对适用清单。':'本类别无附加项目')})),{title:'签署与复核',keepTogether:true,text:`基金名称：${fundName}\n投资者名称：${investorName}\n整理日期：${day}\n经办人：\n复核人：`},{title:'依据文件',text:template.source.split('/').at(-1)!}]},params.format);
   reply.header('Cache-Control','private, no-store').header('X-Content-Type-Options','nosniff').header('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(template.name+'.'+params.format)}`);
   return reply.type(documentMime[params.format as keyof typeof documentMime]).send(bytes);
  }catch(e){if(e instanceof WorkflowError)return reply.code(e.status).send({error:e.code});r.log.error(e);return reply.code(503).send({error:'document_generation_unavailable'});}
 });
}
