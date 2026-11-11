import {randomUUID,createHash} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import type {LedgerStore} from '../ledger/store.ts';
import {recordKinds,managementRecords,type RecordKind,type DeletedRecord} from '../ledger/record-management.ts';
import {requirePermission,resolveRequestUser} from '../auth/authorize.ts';
import {resolveAuthConfig,type AuthConfigInput} from '../auth/session.ts';
import type {Permission} from '../auth/rbac.ts';
import {object,requestId,string,fail,WorkflowError} from '../ledger/workflow.ts';
const permissions:Record<RecordKind,Permission>={company:'project:write',project:'project:write',fund:'fund:write',material:'material:write',report:'report:write',capital:'capital:write',intake:'material:write',investor:'fund:write'};
const labels={company:'企业',project:'项目',fund:'基金',material:'资料',report:'报告',capital:'资金事项',intake:'AI收件',investor:'投资者草稿'};
function kindOf(value:unknown):RecordKind{if(!recordKinds.includes(value as RecordKind))fail('invalid_record_kind');return value as RecordKind;}
const versionOf=(value:unknown,revision=0)=>createHash('sha256').update(JSON.stringify({value,revision})).digest('hex');
export function registerRecordManagementRoutes(server:FastifyInstance,store:LedgerStore,options:{auth?:AuthConfigInput}){
 const auth=resolveAuthConfig(options.auth);
 const handler=(fn:(r:any,p:any)=>Promise<unknown>)=>async(r:any,p:any)=>{try{return await fn(r,p);}catch(e){if(e instanceof WorkflowError)return p.code(e.status).send({error:e.code});throw e;}};
 server.get('/api/record-management/:kind',handler(async(r,p)=>{
  const kind=kindOf(r.params.kind),denied=requirePermission(r,p,auth,permissions[kind]);if(denied)return denied;
  const data=await store.readRecordManagement(),rows=await managementRecords(store,kind),allowed=new Set(rows.map(v=>v.id));
  return {records:data.entries.filter(e=>e.kind===kind&&e.deletedAt&&!e.nonRestorable&&allowed.has(e.id)),versions:Object.fromEntries(rows.map(v=>[v.id,versionOf(v,data.entries.find(e=>e.kind===kind&&e.id===v.id)?.revision??0)]))};
 }));
 for(const action of ['delete','restore'] as const)server.post(`/api/record-management/:kind/:id/${action}`,handler(async(r,p)=>{
  const kind=kindOf(r.params.kind),denied=requirePermission(r,p,auth,permissions[kind]);if(denied)return denied;
  const irreversible=kind==='project'||kind==='company';
  const body=object(r.body,['requestId','expectedVersion']),rid=requestId(body.requestId),expected=string(body.expectedVersion,true,64),actor=resolveRequestUser(r,auth)!;
  if(!/^[a-f0-9]{64}$/.test(expected))fail('invalid_record_version');
  return store.withObjectAccessLock(async()=>{
   const record=(await managementRecords(store,kind)).find(v=>v.id===r.params.id);if(!record)fail('record_not_found',404);
   const row=record as unknown as Record<string,unknown>;
   if(kind==='investor'&&action==='delete')await store.lpTransaction(s=>{const investor=s.investors.find(i=>i.id===r.params.id)!;if(investor.signStatus==='已签署'||s.data.commitments.some(e=>e.investorId===investor.id)||s.data.entries.some(e=>e.investorId===investor.id)||(s.data.fundraising?.[investor.id]?.plans??[]).some(p=>!p.cancelled))fail('investor_has_business_records',409);});
   return store.recordManagementTransaction(s=>{
    const fingerprint=JSON.stringify({kind,id:r.params.id,action,expected,actorId:actor.id}),prior=s.data.requests[rid];
    if(prior){if(prior.fingerprint!==fingerprint)fail('record_request_conflict',409);return {record:prior.result};}
    const previous=s.data.entries.find(e=>e.kind===kind&&e.id===r.params.id),deleted=action==='delete';
    if(action==='restore'&&previous?.nonRestorable)fail('record_restore_unavailable',409);
    if(versionOf(record,previous?.revision??0)!==expected)fail('record_version_conflict',409);
    if(Boolean(previous?.deletedAt)===deleted)fail(deleted?'record_already_deleted':'record_not_deleted',409);
    const entry:DeletedRecord={id:r.params.id,kind,title:String(row.name??row.title??row.company??r.params.id),deletedAt:deleted?new Date().toISOString():'',deletedBy:actor.id,revision:(previous?.revision??0)+1,...(irreversible&&deleted?{nonRestorable:true}:{}),...(typeof row.fundId==='string'?{fundId:row.fundId}:{}),...(typeof row.projectId==='string'?{projectId:row.projectId}:{})};
    if(previous)s.data.entries[s.data.entries.indexOf(previous)]=entry;else s.data.entries.push(entry);
    s.data.requests[rid]={fingerprint,result:entry};
    s.auditEvents.push({id:'audit-'+randomUUID(),module:labels[kind],action:deleted?'删除'+labels[kind]:'恢复'+labels[kind],targetType:labels[kind],targetId:kind==='project'||kind==='company'?entry.id:entry.projectId??entry.fundId??entry.id,targetName:entry.title,actor:actor.name,time:new Date().toISOString(),detail:irreversible&&deleted?'应用内删除后不可恢复；原件、关联业务与操作历史继续留存，不执行物理擦除或级联清除。':'记录'+(deleted?'移入最近删除':'恢复')+'；原件、关联业务和历史记录保留。',source:'记录管理',dataOrigin:'user_input'});
    return {record:entry};
   });
  });
 }));
}
