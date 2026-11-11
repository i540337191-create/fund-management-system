import { retainEvidenceSource, inputSource, sourceOf, parseIncludeDemo, readSourceRows, readSourcePolicy } from '../ledger/source-policy.ts';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { resolveRequestUser } from '../auth/authorize.ts';
import { canRole } from '../auth/rbac.ts';
import { resolveAuthConfig, type AuthConfigInput, type SessionUser } from '../auth/session.ts';
import type { LedgerStore, Material } from '../ledger/store.ts';
import { WorkflowError, fail, object, string, date, revision, requestId, audit, idempotent, type WorkflowState } from '../ledger/workflow.ts';
import { MaterialWriteError } from '../ledger/material-upload.ts';
import { emptyPostInvestment, shanghaiDay } from '../ledger/post-investment.ts';
import { units, fixed, bankIdentity } from '../ledger/exit-settlement.ts';
import type { InvestmentCashflow } from '../ledger/investment-cashflows.ts';
import { createFinancialEvidence } from './financial-evidence.ts';
import { publicDiligence } from './diligence.ts';

export function registerInvestmentCashflowRoutes(server:FastifyInstance,store:LedgerStore,options:{auth?:AuthConfigInput;projectRoot:string;storageRoot?:string;clock?:()=>Date}) {
 const auth=resolveAuthConfig(options.auth),root=resolve(options.storageRoot??process.env.MATERIAL_STORAGE_ROOT??resolve(options.projectRoot,'private-material-storage'));
 const actorOf=(r:any)=>resolveRequestUser(r,auth)!;
 const permission=(a:SessionUser)=>{if(!canRole(a.role,'project:read')&&!canRole(a.role,'fund:read')&&a.role!=='post_investment'&&!canRole(a.role,'capital:write'))fail('forbidden',403);};
 const wrap=(fn:any)=>async(r:any,reply:any)=>{try{return await fn(r,reply);}catch(e){if(e instanceof WorkflowError||e instanceof MaterialWriteError)return reply.code(e.status).send({error:e.code});r.log.error({code:'investment_cashflow_failed'});return reply.code(500).send({error:'investment_cashflow_failed'});}};
 const {readBytes,authorize,verify,snapshots,visible}=createFinancialEvidence(store,root,id=>`/api/projects/${id}/investment-cashflows/files/${randomUUID()}`);
 const evidence=(rows:InvestmentCashflow[])=>rows.flatMap(v=>[...v.evidence,...(v.reversal?.evidence??[])]);
 type ReadState=Pick<WorkflowState,'project'|'deals'|'postInvestment'>;
 const eligibleDeals=(s:ReadState,known:Set<string>)=>(s.deals??[]).flatMap(d=>{
  const terms=d.status==='closed'&&d.closing?d.terms.find(t=>t.id===d.closing!.termsId&&t.status==='approved'):undefined;
  return terms?.allocations.length&&terms.allocations.every(v=>known.has(v.fundId))?[{id:d.id,title:d.title,sourceOrigins:{batch:sourceOf(d),terms:sourceOf(terms)},fundIds:terms.allocations.map(v=>v.fundId)}]:[];
 });
 async function view(s:ReadState,a:SessionUser,materials?:Map<string,Material>,known?:Set<string>,includeDemo=true){
  known??=new Set((await store.listFunds()).map(f=>f.id));
  materials??=new Map((await store.listMaterials()).map(m=>[m.id,m]));
  const rows=readSourceRows(s.postInvestment?.investmentCashflows,includeDemo);
  // Authorize every reference before any snapshot is opened, even on a degraded read.
  for(const ref of evidence(rows)){try{await authorize(s,a,ref.materialId,materials);}catch(e){if(!(e instanceof WorkflowError))throw e;}}
  const out=[];
  for(const v of rows){
   const proofs=await Promise.all(v.evidence.map(ref=>visible(s,a,ref,materials!)));
   const reversal=v.reversal?{type:v.reversal.type,actor:v.reversal.actor,time:v.reversal.time,reason:v.reversal.reason,evidence:await Promise.all(v.reversal.evidence.map(ref=>visible(s,a,ref,materials!)))}:undefined;
   const issue=[...proofs,...(reversal?.evidence??[])].find(ref=>'readIssue' in ref);
   out.push({...sourceOf(v),id:v.id,projectId:v.projectId,dealId:v.dealId,fundId:v.fundId,kind:v.kind,currency:v.currency,amount:v.amount,date:v.date,bankAccount:canRole(a.role,'capital:write')?v.bankAccount:'****'+v.bankAccount.slice(-4),bankReference:canRole(a.role,'capital:write')?v.bankReference:'****'+v.bankReference.slice(-4),note:v.note,actor:v.actor,time:v.time,status:v.status,evidence:proofs,...(reversal?{reversal}:{}),...(issue?{readIssue:(issue as any).readIssue}:{})});
  }
  return publicDiligence({project:{id:s.project.id,name:s.project.name},sourcePolicy:readSourcePolicy(includeDemo),revision:s.postInvestment?.revision??emptyPostInvestment().revision,currentUser:a,mayWrite:canRole(a.role,'capital:write'),rows:out,deals:eligibleDeals(s,known)},[]);
 }
 const base='/api/projects/:id/investment-cashflows';
 server.get(base,wrap(async(r:any)=>{const a=actorOf(r);permission(a);const includeDemo=parseIncludeDemo(r.query.includeDemo);return store.workflowTransaction(r.params.id,s=>view(s,a,undefined,undefined,includeDemo));}));
 server.get('/api/investment-cashflows',wrap(async(r:any)=>{
  const a=actorOf(r);permission(a);const q=object(r.query,['fundId','projectId','includeDemo']),fundId=q.fundId===undefined?undefined:string(q.fundId),projectId=q.projectId===undefined?undefined:string(q.projectId);
  const includeDemo=parseIncludeDemo(q.includeDemo);
  const materials=new Map((await store.listMaterials()).map(m=>[m.id,m])),known=new Set((await store.listFunds()).map(f=>f.id)),rows=[],projects=[];
  for(const s of await store.readExitStates()){
   if(projectId&&s.project.id!==projectId)continue;
   const v=await view(s,a,materials,known,includeDemo);rows.push(...v.rows.filter(v=>!fundId||v.fundId===fundId));
   const deals=v.deals.map(d=>({...d,fundIds:d.fundIds.filter(id=>!fundId||id===fundId)})).filter(d=>d.fundIds.length);
   if(deals.length)projects.push({...v.project,deals});
  }
  return {currentUser:a,sourcePolicy:readSourcePolicy(includeDemo),rows,projects};
 }));
 server.get(base+'/files/:fileId',wrap(async(r:any,reply:any)=>{
  const a=actorOf(r);permission(a);const m=await store.workflowTransaction(r.params.id,async s=>{const ref=evidence(s.postInvestment?.investmentCashflows??[]).find(v=>v.downloadHref===`/api/projects/${s.project.id}/investment-cashflows/files/${r.params.fileId}`);if(!ref)fail('investment_file_not_found',404);await verify(s,a,[ref]);return ref;});
  reply.header('Cache-Control','private, no-store').header('X-Content-Type-Options','nosniff').header('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(m.name)}`);return reply.type('application/octet-stream').send(await readBytes(m.packetBlobId!,m.sha256,m.sizeBytes));
 }));
 server.post(base+'/actions',wrap(async(r:any)=>{
  const a=actorOf(r);permission(a);if(!canRole(a.role,'capital:write'))fail('forbidden',403);
  const b=object(r.body,['requestId','expectedRevision','action','dealId','fundId','kind','currency','amount','date','bankAccount','bankReference','note','evidence','cashflowId','reason']),action=string(b.action),rid=requestId(b.requestId),rev=revision(b.expectedRevision),paths:string[]=[];
  if(!['post','reverse'].includes(action))fail('invalid_investment_cashflow_action');
  object(b,['requestId','expectedRevision','action','evidence',...(action==='post'?['dealId','fundId','kind','currency','amount','date','bankAccount','bankReference','note']:['cashflowId','reason'])]);
  try{return await store.workflowTransaction(r.params.id,async s=>{
   const result=await idempotent(s,rid,a,{resource:'investment-cashflows',...b},async()=>{
    const p=s.postInvestment??=emptyPostInvestment();if(p.revision!==rev)fail('post_revision_conflict',409);const rows=p.investmentCashflows??=[],time=new Date().toISOString();
    if(action==='post'){
     const dealId=string(b.dealId),fundId=string(b.fundId),d=s.deals?.find(d=>d.id===dealId&&d.status==='closed'&&d.closing),terms=d?.terms.find(t=>t.id===d.closing!.termsId&&t.status==='approved');
     if(!terms)fail('closed_approved_deal_required');
     const known=new Set((await store.listFunds()).map(f=>f.id));if(!terms.allocations.length||terms.allocations.some(v=>!known.has(v.fundId))||!terms.allocations.some(v=>v.fundId===fundId))fail('invalid_investment_fund');
     if(!['investment_payment','project_fee','project_tax'].includes(String(b.kind)))fail('invalid_cashflow_kind');if(b.currency!=='CNY')fail('invalid_currency');
     const amount=units(b.amount);if(amount<=0n)fail('invalid_payment_amount');const day=date(b.date);if(day>shanghaiDay(options.clock?.()??new Date()))fail('invalid_payment_date');
     const bankAccount=bankIdentity(b.bankAccount),bankReference=bankIdentity(b.bankReference);if((s.bankEventIdentities??[]).some(v=>v.status==='posted'&&v.fundId===fundId&&bankIdentity(v.bankAccount)===bankAccount&&bankIdentity(v.bankReference)===bankReference))fail('duplicate_bank_receipt',409);
     const note=string(b.note),proofs=await snapshots(b.evidence,s,a,paths);
     rows.push(retainEvidenceSource({...inputSource(),id:randomUUID(),projectId:s.project.id,dealId,fundId,kind:b.kind as InvestmentCashflow['kind'],currency:'CNY',amount:fixed(amount),date:day,bankAccount,bankReference,note,evidence:proofs,actor:a,time,status:'posted'},proofs));
    }else{
     const v=rows.find(v=>v.id===string(b.cashflowId));if(!v)fail('investment_cashflow_not_found',404);if(v.status!=='posted')fail('invalid_payment_transition',409);
     v.reversal={type:'correction_of_registration',actor:a,time,reason:string(b.reason),evidence:await snapshots(b.evidence,s,a,paths)};v.status='reversed';
    }
    p.investmentCashflows=rows;p.revision++;audit(s,a,'实际投资付款登记',{action,revision:p.revision});return {};
   });return {created:result.created,ledger:await view(s,a)};
  },{bankEventIdentities:action==='post'});}catch(e){if((e as any)?.safeToDeleteBlob)await Promise.all(paths.map(p=>unlink(p).catch(()=>{})));throw e;}
 }));
}
