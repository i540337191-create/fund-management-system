import {createHash} from 'node:crypto';
import type {Template} from '../agent/model.ts';
import {lpSuitabilityGuidance} from './lp-suitability.ts';
import {investorProfileKind} from './lp-profile.ts';
import {randomUUID} from 'node:crypto';
import type {SessionUser} from '../auth/session.ts';
import {object,string,date,requestId,fail} from './workflow.ts';
import {units,fixed} from './exit-settlement.ts';
import {fundraisingTemplates} from './fundraising-templates.ts';
import {lpTotals,type LpState,type LpProof} from './lp-ledger.ts';
export type RaisingRequirement={id:string;name:string;required:boolean;ownerId:string;dueDate:string;category?:string;instructions?:string;copies?:number;condition?:string;incompleteNote?:string;proofHistory?:LpProof[];cancelled?:boolean;proof?:LpProof;source?:{path:string;sha256:string;templateId?:string;version?:number;materialId?:string;origin?:'custom_template';templateSnapshot?:Pick<Template,'id'|'version'|'title'|'materials'>}};
export type RaisingPlan={id:string;name:string;amount:string;dueDate:string;ownerId:string;cancelled?:boolean};
export type RaisingRecord={reviewerId?:string;submittedById?:string;reviewRound?:number;requirements:RaisingRequirement[];plans:RaisingPlan[];allocations:{planId:string;receiptId:string;amount:string}[];assessment?:{decision:'approve'|'return';note:string;actorId:string;actor:string;createdAt:string};history:{id:string;action:string;actorId:string;actor:string;createdAt:string;payload:Record<string,unknown>}[]};
const empty=():RaisingRecord=>({requirements:[],plans:[],allocations:[],history:[]});
export function raisingData(s:LpState,id:string){return s.data.fundraising?.[id]??empty();}
export const raisingActions=['requirement','import','updateRequirement','cancelRequirement','submit','review','plan','cancelPlan','allocate'] as const;
export function raisingInput(value:unknown){
 const fields=['requestId','expectedRevision','action','itemId','name','required','ownerId','dueDate','templateId','proof','decision','note','amount','planId','receiptId','templateVersion','materialIds','excludedMaterialIds','reviewerId'];const b=object(value,fields);
 requestId(b.requestId);if(!Number.isSafeInteger(b.expectedRevision)||Number(b.expectedRevision)<1)fail('invalid_revision');if(!raisingActions.includes(b.action as any))fail('invalid_action');
 const allowed:Record<string,string[]>={updateRequirement:['itemId','required','ownerId','dueDate','note'],requirement:['name','required','ownerId','dueDate'],import:['templateId','ownerId','dueDate','templateVersion','materialIds','excludedMaterialIds'],cancelRequirement:['itemId','note'],submit:['itemId','proof','reviewerId'],review:['decision','note'],plan:['name','amount','ownerId','dueDate'],cancelPlan:['itemId','note'],allocate:['planId','receiptId','amount']};
 if(Object.keys(b).some(k=>!['requestId','expectedRevision','action',...allowed[String(b.action)]].includes(k)))fail('invalid_payload');
 for(const k of allowed[String(b.action)]){if(k==='templateVersion'){if(b[k]!==undefined&&(!Number.isSafeInteger(b[k])||Number(b[k])<1))fail('invalid_template_version');continue;}if(k==='materialIds'||k==='excludedMaterialIds'){if(b[k]!==undefined&&(!Array.isArray(b[k])||(b[k] as unknown[]).length>100||new Set(b[k] as unknown[]).size!==(b[k] as unknown[]).length))fail('invalid_template_material_selection');if(Array.isArray(b[k]))b[k]=b[k].map(v=>string(v,true,100));continue;}if(k==='proof')continue;if(k==='required'){if(typeof b[k]!=='boolean')fail('invalid_payload');}else if(k==='amount'){b[k]=fixed(units(b[k]));if(units(b[k])===0n)fail('positive_amount_required');}else if(k==='dueDate')b[k]=date(b[k]);else b[k]=string(b[k],!(b.action==='updateRequirement'&&k==='note'),k==='note'?2000:300);}
 if(b.action==='review'&&!['approve','return'].includes(String(b.decision)))fail('invalid_decision');
 return Object.fromEntries(Object.entries(b).sort(([a],[b])=>a.localeCompare(b)));
}
const proofPresent=(s:LpState,p:LpProof|undefined,id:string)=>!!p&&!s.deletedMaterialIds?.includes(p.materialId)&&s.versions.some(v=>v.id===p.versionId&&v.materialId===p.materialId&&v.sha256===p.sha256)&&s.materials.some(m=>m.id===p.materialId&&m.relationships?.investors.some(i=>i.id===id));
export function raisingView(s:LpState,id:string,today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'})){
 const data=raisingData(s,id),investor=s.investors.find(i=>i.id===id);if(!investor)fail('investor_not_found',404);
 const receipts=s.data.entries.filter(r=>r.investorId===id&&r.active!==false&&!s.data.entries.some(x=>x.corrects===r.id));
 const allocations=data.allocations.filter(a=>data.plans.some(p=>p.id===a.planId&&!p.cancelled)&&receipts.some(r=>r.id===a.receiptId));
 const requirements=data.requirements.map(r=>({...r,available:proofPresent(s,r.proof,id)}));
 const approved=data.assessment?.decision==='approve'&&requirements.filter(r=>r.required&&!r.cancelled).every(r=>r.available&&!r.incompleteNote);
 const owner=(ownerId:string)=>ownerId==='user-admin'?'管理员':s.users.find(u=>u.id===ownerId)?.name??'负责人已停用或移除';
 const plans=data.plans.map(p=>{const paid=allocations.filter(a=>a.planId===p.id).reduce((v,a)=>v+units(a.amount),0n),remaining=units(p.amount)-paid;return {...p,paid:fixed(paid),remaining:fixed(remaining),status:p.cancelled?'已取消':remaining===0n?'已到账':paid>0n?'部分到账':'未到账',overdue:!p.cancelled&&remaining>0n&&p.dueDate<today};});
 const tasks=[...requirements.map(r=>({id:'raising-material-'+r.id,name:r.incompleteNote?.trim().slice(0,200)||r.name,note:`材料：${r.name}。${r.incompleteNote??''}`,ownerId:r.ownerId,owner:owner(r.ownerId),dueDate:r.dueDate,status:r.cancelled?'已取消':approved?'已完成':r.dueDate<today?'已逾期':r.available?'待确认':'未开始',kind:'material'})),...plans.map(p=>({id:'raising-plan-'+p.id,name:p.name,note:`缴款计划：${p.name}`,ownerId:p.ownerId,owner:owner(p.ownerId),dueDate:p.dueDate,status:p.cancelled?'已取消':p.remaining==='0.00'?'已完成':p.overdue?'已逾期':p.paid!=='0.00'?'进行中':'未开始',kind:'payment'}))].map(t=>({...t,investorId:id,fundId:investor.fundId,investorName:investor.name,fundName:s.funds.find(f=>f.id===investor.fundId)?.name??'',href:`/funds/${encodeURIComponent(investor.fundId)}?tab=${encodeURIComponent('募集档案')}&lp=${encodeURIComponent(id)}`}));
 return {suitability:lpSuitabilityGuidance(investor,requirements.filter(r=>!r.cancelled)),investorId:id,revision:investor.revision??1,requirements,assessment:data.assessment??null,approved:Boolean(approved),plans,allocations,invalidAllocations:data.allocations.filter(a=>!allocations.includes(a)),unallocatedReceipts:receipts.map(r=>({id:r.id,amount:r.amount,bankDate:r.bankDate,reference:r.reference,remaining:fixed(units(r.amount)-allocations.filter(a=>a.receiptId===r.id).reduce((n,a)=>n+units(a.amount),0n))})),history:data.history,reviewerId:data.reviewerId,tasks,commitment:lpTotals([investor],s.data).commitment};
}
export async function raisingWrite(s:LpState,fundId:string,id:string,b:Record<string,unknown>,actor:SessionUser,proof?:LpProof,templates:Template[]=[]){
 const fingerprint=JSON.stringify({raising:true,actorId:actor.id,fundId,id,b}),rid=requestId(b.requestId),prior=s.data.requests[rid];if(prior){if(prior.fingerprint!==fingerprint)fail('lp_request_conflict',409);return structuredClone(prior.result);}
 const investor=s.investors.find(i=>i.id===id&&i.fundId===fundId);if(!investor)fail('investor_not_found',404);if((investor.revision??1)!==b.expectedRevision)fail('lp_revision_conflict',409);
 let importedTemplateSnapshot:Pick<Template,'id'|'version'|'title'|'materials'>|undefined;
 const data=((s.data.fundraising??={})[id]??=empty()),action=String(b.action),now=new Date().toISOString();
 if(['requirement','import','plan','updateRequirement'].includes(action)&&b.ownerId!=='user-admin'&&!s.users.some(u=>u.id===b.ownerId&&u.enabled!==false))fail('invalid_owner');
 if(action==='requirement'||action==='import'){
  if(data.requirements.filter(r=>!r.cancelled).length>=100)fail('requirement_limit');
  const custom=action==='import'?templates.find(t=>t.id===b.templateId&&t.objectType==='lp'&&t.scope==='organization'&&t.status==='published'&&t.enabled!==false):undefined;
  const template=action==='import'?fundraisingTemplates.find(t=>t.id===b.templateId):null;if(action==='import'&&!template&&!custom)fail('template_not_found',404);
  const kind=investorProfileKind(investor);if((template||custom)&&!kind)fail('lp_profile_type_required');
  if(custom&&b.templateVersion!==custom.version)fail('template_version_conflict',409);
  if(template&&b.templateVersion!==undefined)fail('invalid_payload');
  const eligible=custom?.materials.filter(m=>!m.applicableTo?.length||m.applicableTo.includes(kind!))??template?.materials.filter(m=>m.applicableTo.includes(kind!)).map(m=>({...m,id:m.name,title:m.name}))??[];
  const selected=(b.materialIds??[]) as string[],excluded=(b.excludedMaterialIds??[]) as string[];
  if(selected.some(id=>excluded.includes(id)))fail('invalid_template_material_selection');
  if((custom||template)&&[...selected,...excluded].some(id=>!eligible.some(m=>m.id===id&&(m.condition?.trim()||!m.applicableTo?.length))))fail('invalid_template_material_selection');
  if((custom||template)&&eligible.some(m=>(m.condition?.trim()||!m.applicableTo?.length)&&!selected.includes(m.id)&&!excluded.includes(m.id)&&!data.requirements.some(r=>!r.cancelled&&(custom?r.source?.templateId===custom.id&&r.source.materialId===m.id:r.source?.sha256===template!.sha256&&r.name===m.id))))fail('template_applicability_confirmation_required');
  if(custom)importedTemplateSnapshot=structuredClone({id:custom.id,version:custom.version,title:custom.title,materials:custom.materials});
  const customMaterials=custom?.materials.filter(m=>(!m.applicableTo?.length||m.applicableTo.includes(kind!))&&(!m.condition?.trim()&&Boolean(m.applicableTo?.length)||selected.includes(m.id))&&!data.requirements.some(r=>!r.cancelled&&r.source?.templateId===custom.id&&r.source.materialId===m.id))??[];
  const materials=custom?customMaterials.map(m=>({name:m.title,required:m.required,condition:m.condition,instructions:m.instructions,category:'custom',source:{path:`自定义模板 / ${custom.title} / V${custom.version}`,sha256:createHash('sha256').update(JSON.stringify({id:custom.id,version:custom.version,title:custom.title,materials:custom.materials})).digest('hex'),templateId:custom.id,version:custom.version,materialId:m.id,origin:'custom_template' as const,templateSnapshot:structuredClone({id:custom.id,version:custom.version,title:custom.title,materials:[m]})}})):template?.materials.filter(m=>m.applicableTo.includes(kind!)&&(!m.condition?.trim()||selected.includes(m.name))&&!data.requirements.some(r=>!r.cancelled&&r.source?.sha256===template.sha256&&r.name===m.name)).map(m=>({...m,required:m.condition?.trim()?true:m.required,source:{path:template.source,sha256:template.sha256}}));
  if(custom&&!eligible.length)fail('template_not_applicable',409);
  if(data.requirements.filter(r=>!r.cancelled).length+(materials?.length??1)>100)fail('requirement_limit');
  if((template||custom)&&!materials?.length&&!excluded.length)fail('template_already_imported',409);
  for(const material of materials??[{name:String(b.name),required:Boolean(b.required)}])data.requirements.push({...material,id:randomUUID(),name:material.name,required:material.required,ownerId:String(b.ownerId),dueDate:String(b.dueDate)});delete data.assessment;
 }else if(action==='updateRequirement'){const r=data.requirements.find(r=>r.id===b.itemId&&!r.cancelled);if(!r)fail('requirement_not_found',404);Object.assign(r,{required:b.required,ownerId:b.ownerId,dueDate:b.dueDate,incompleteNote:b.note});delete data.assessment;
 }else if(action==='cancelRequirement'||action==='submit'){
  const r=data.requirements.find(r=>r.id===b.itemId&&!r.cancelled);if(!r)fail('requirement_not_found',404);
  if(action==='submit'){const reviewerId=String(b.reviewerId);if(reviewerId!=='user-admin'&&!s.users.some(u=>u.id===reviewerId&&u.enabled!==false&&Boolean(u.passwordHash)&&['admin','investment_manager'].includes(u.role)))fail('invalid_reviewer');data.reviewerId=reviewerId;data.submittedById=actor.id;data.reviewRound=(data.reviewRound??0)+1;if(!proof||!proofPresent(s,proof,id))fail('proof_required');if(r.proof)(r.proofHistory??=[]).push(structuredClone(r.proof));r.proof=proof;}else r.cancelled=true;delete data.assessment;
 }else if(action==='review'){
  if(data.reviewerId&&data.reviewerId!==actor.id&&actor.role!=='admin')fail('not_lp_reviewer',403);
  const active=data.requirements.filter(r=>!r.cancelled);if(!active.length)fail('requirements_not_configured');
  if(b.decision==='approve'&&active.some(r=>r.required&&(!proofPresent(s,r.proof,id)||Boolean(r.incompleteNote))))fail('required_material_missing',409);
  data.assessment={decision:b.decision as 'approve'|'return',note:String(b.note),actorId:actor.id,actor:actor.name,createdAt:now};
 }else if(action==='plan'){
  if(data.plans.filter(p=>!p.cancelled).length>=100)fail('plan_limit');
  const commitment=lpTotals([investor],s.data).commitment;if(commitment===null)fail('commitment_required',409);
  if(data.plans.filter(p=>!p.cancelled).reduce((v,p)=>v+units(p.amount),units(b.amount))>units(commitment))fail('plan_exceeds_commitment',409);
  data.plans.push({id:randomUUID(),name:String(b.name),amount:String(b.amount),dueDate:String(b.dueDate),ownerId:String(b.ownerId)});
 }else if(action==='cancelPlan'){
  const p=data.plans.find(p=>p.id===b.itemId&&!p.cancelled);if(!p)fail('plan_not_found',404);p.cancelled=true;
 }else if(action==='allocate'){
  const view=raisingView(s,id),p=view.plans.find(p=>p.id===b.planId&&!p.cancelled),r=view.unallocatedReceipts.find(r=>r.id===b.receiptId);if(!p||!r)fail('allocation_scope_invalid',409);
  const previous=view.allocations.find(a=>a.planId===b.planId&&a.receiptId===b.receiptId);const amount=units(b.amount),old=units(previous?.amount??'0.00');
  if(amount>units(r.remaining)+old||amount>units(p.remaining)+old)fail('allocation_exceeds_available',409);
  data.allocations=data.allocations.filter(a=>a.planId!==b.planId||a.receiptId!==b.receiptId);data.allocations.push({planId:String(b.planId),receiptId:String(b.receiptId),amount:String(b.amount)});
 }
 data.history.push({id:randomUUID(),action,actorId:actor.id,actor:actor.name,createdAt:now,payload:structuredClone({...b,...(importedTemplateSnapshot?{templateSnapshot:importedTemplateSnapshot}:{})})});investor.revision=(investor.revision??1)+1;investor.updatedAt=now;
 s.auditEvents.push({id:'audit-'+randomUUID(),module:'基金账本',action:'募集流程 '+action,targetType:'LP',targetId:id,targetName:investor.name,actor:actor.name,time:now,detail:JSON.stringify({actorId:actor.id,requestId:rid,investorId:id,action}),source:'募集流程',dataOrigin:'user_input'});
 const result={...raisingView(s,id),canReview:!data.reviewerId||data.reviewerId===actor.id||actor.role==='admin'};s.data.requests[rid]={fingerprint,result:structuredClone(result)};return result;
}

export function publishedRaisingTemplates(templates:Template[]) {
 return templates.filter(t=>t.objectType==='lp'&&t.scope==='organization'&&t.status==='published'&&t.enabled!==false&&t.materials.length).map(t=>({id:t.id,name:t.title,version:t.version,sourceType:'custom_template' as const,source:`自定义模板 / ${t.title} / V${t.version}`,titles:t.materials.map(m=>m.title),sha256:createHash('sha256').update(JSON.stringify({id:t.id,version:t.version,title:t.title,materials:t.materials})).digest('hex'),materials:t.materials.map(m=>({id:m.id,name:m.title,category:'custom',required:m.required,condition:m.condition??'',instructions:m.instructions??'',applicableTo:m.applicableTo??[]}))}));
}
