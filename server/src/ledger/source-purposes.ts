import type { DataPurpose } from './source-policy.ts';
export type SourcePurposeEntry = { recordType:string; recordId:string; projectId?:string; dataPurpose:'engineering_fixture'; evidence:Record<string,unknown>; classifiedBy:string; classifiedAt:string; revision:number };
export type SourcePurposeLookup = Map<string, DataPurpose>;
export const purposeKey=(type:string,id:string,projectId='')=>JSON.stringify([type,projectId,id]);
export function purposeLookup(entries:Pick<SourcePurposeEntry,'recordType'|'recordId'|'projectId'|'dataPurpose'>[]):SourcePurposeLookup {
 return new Map(entries.map(e=>[purposeKey(e.recordType,e.recordId,e.projectId),e.dataPurpose]));
}
export function recordPurpose(lookup:SourcePurposeLookup,type:string,id:unknown,projectId=''):DataPurpose {
 return lookup.get(purposeKey(type,String(id),projectId))??'unknown';
}
const collections:Record<string,string>={funds:'fund',companies:'company',projects:'project',tasks:'task',materials:'material',versions:'material_version',reports:'report',reportExports:'report_export',exportRecords:'report_export',capitalRecords:'capital',meetings:'meeting',aiIntakeItems:'intake',investors:'investor',documents:'document',clauses:'clause',risks:'risk',auditEvents:'audit',rounds:'approval_round',deals:'deal_batch',terms:'deal_terms',agreements:'deal_agreement',financials:'financial',visits:'visit',archives:'post_archive',investmentCashflows:'investment_cashflow',exitExecutions:'exit_execution',exitPayments:'exit_payment',exitPreparations:'exit_preparation',exitArchives:'exit_archive',exitClaims:'exit_claim',diligence:'diligence',returnBases:'return_basis',returnSamples:'return_sample',cashflowReviews:'cashflow_review',postInvestment:'post_investment'};
const globalTypes=new Set(['lp_commitment','lp_receipt','fund','company','project','task','material','material_version','report','report_export','capital','meeting','intake','investor','document','clause','risk','audit']);
// Classification attaches to each record identity, never to its parent or unrelated children.
export function applySourcePurposes<T>(value:T,lookup:SourcePurposeLookup,type?:string,projectId=''):T {
 if(!value||typeof value!=='object')return value;
 if(Array.isArray(value)){for(const child of value)applySourcePurposes(child,lookup,type,projectId);return value;}
 const record=value as Record<string,unknown>;
 const namespace=typeof record.projectId==='string'?record.projectId:typeof (record.project as {id?:unknown}|undefined)?.id==='string'?(record.project as {id:string}).id:projectId;
 if(type&&typeof record.id==='string'&&(globalTypes.has(type)||namespace!==''))record.dataPurpose=recordPurpose(lookup,type,record.id,globalTypes.has(type)?'':namespace);
 // Bare historical IDs cannot establish a record type or project namespace.
 if(Array.isArray(record.sourceBasis))for(const basis of record.sourceBasis){if(!basis||typeof basis!=='object')continue;const b=basis as Record<string,unknown>;if(typeof b.recordType!=='string'||typeof b.projectId!=='string'||typeof b.id!=='string')continue;if(recordPurpose(lookup,b.recordType,b.id,b.projectId)==='engineering_fixture')b.dataPurpose='engineering_fixture';}
 if(type==='material'&&typeof record.id==='string')record.currentVersionPurpose=record.currentVersionId?recordPurpose(lookup,'material_version',record.currentVersionId):'unknown';
 for(const [key,child] of Object.entries(record)){
  if(key==='customFields'||key==='relationships'||key==='sourceBasis'||key==='evidence'||key==='receipts'||key==='snapshot')continue;
  const childType=({post_investment:{clauses:'post_clause',reports:'post_report'},diligence:{items:'diligence_item',findings:'diligence_finding',reports:'diligence_report'},diligence_item:{submissions:'diligence_submission'}} as Record<string,Record<string,string>>)[type??'']?.[key]??collections[key]??({project:'project',fund:'fund',company:'company',material:'material',task:'task',report:'report',capitalRecord:'capital',meeting:'meeting',item:'intake',exportRecord:'report_export',auditEvent:'audit',diligence:'diligence'} as Record<string,string>)[key];
  applySourcePurposes(child,lookup,childType,namespace);
 }
 return value;
}

// Archived records retain their stored metadata when unrelated workflow changes persist the surrounding JSON.
export function restoreArchivedPurposeMetadata(next:import('./post-investment.ts').PostInvestmentState,prior:import('./post-investment.ts').PostInvestmentState|undefined){
 function restore(value:unknown,original:unknown){
  if(!value||typeof value!=='object'||!original||typeof original!=='object')return;
  const target=value as Record<string,unknown>,source=original as Record<string,unknown>;
  for(const key of ['dataPurpose','currentVersionPurpose']){if(Object.hasOwn(source,key))target[key]=source[key];else delete target[key];}
  for(const [key,child]of Object.entries(target))if(key!=='dataPurpose'&&key!=='currentVersionPurpose')restore(child,source[key]);
 }
 for(const key of ['reports','exitPreparations'] as const)for(const original of prior?.[key]??[]){if(original.status!=='archived')continue;const record=next[key]?.find(v=>v.id===original.id&&v.version===original.version);if(record)restore(record,original);}
}
