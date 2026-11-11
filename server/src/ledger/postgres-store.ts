import {takeNotices,type BusinessNotice} from '../notifications/outbox.ts';
import {meetingFileTransaction} from './meeting-file.ts';
import {assertReportReady} from './report-readiness.ts';
import {creationMetadata} from './creation-order.ts';
import {requireCapitalReceipt,validateCapitalReceipt,sameCapitalCreate} from './capital-receipt.ts';
import {emptyRecordManagement,type RecordManagementData,type RecordManagementState} from './record-management.ts';
import {sameMeeting,sameMeetingMinutes,meetingVisibility} from './meeting-input.ts';
import {AsyncLocalStorage} from 'node:async_hooks';
import {objectLock} from '../auth/object-lock.ts';
import {emptyLifecycleData,type LifecycleState} from './fund-lifecycle.ts';
import {emptyAccess,type AccessState} from '../auth/object-access.ts';
import type {AssistantState,AssistantConversation} from '../ai/conversations.ts';
import {emptyLpData,type LpState,type LpData} from './lp-ledger.ts';
import {emptySchemas,type Schemas} from './custom-fields.ts';
import type { DataPurpose } from './source-policy.ts';
import { applySourcePurposes, restoreArchivedPurposeMetadata, purposeLookup, recordPurpose, type SourcePurposeLookup } from './source-purposes.ts';
import { sourceBasisOf, normalizeDataOrigin, reportExportSource } from './source-policy.ts';
import { createBoundProject, type Company, type MasterState } from './company-project-master.ts';
import type { FundMasterState } from './fund-master.ts';
import type {AccountState,AuthSession} from './accounts.ts';
import { WorkflowError, type StoredUser, type WorkflowState, type ApprovalRound } from './workflow.ts';
import { MaterialWriteError, uploadFingerprint, projectRelationships, materialProjectRelationships, type MaterialVersion } from './material-upload.ts';
import { createHash, randomUUID } from "node:crypto";
import { withDbClient } from "../db/client.ts";
import { normalizeProjectInput, resolveCapitalProject, projectCreationDetail, ProjectCreationError, resolveReportTarget } from "./store.ts";
import type {
  AiIntakeItem,
  AuditEvent,
  CapitalRecord,
  Fund,
  FundClause,
  FundDocument,
  FundInvestor,
  LedgerStore,
  Material,
  MaterialRelationships,
  MaterialTextChunk,
  MaterialTextSearchRelationType,
  Meeting,
  Project,
  ProjectTask,
  Report,
  ReportExport,
  RiskRecord,
} from "./store.ts";

type QueryResultLike = {
  rows: Record<string, unknown>[];
  rowCount?: number | null;
};

type Queryable = {
  query: (sql: string, values?: unknown[]) => Promise<QueryResultLike>;
};

type DbRunner = <T>(callback: (client: Queryable) => Promise<T>) => Promise<T>;

type PostgresStoreOptions = {
  databaseUrl?: string;
  runWithClient?: DbRunner;
};

const purposeReads=new WeakMap<Queryable,Promise<SourcePurposeLookup>>();
async function querySourcePurposes(client:Queryable):Promise<SourcePurposeLookup> {
 let read=purposeReads.get(client);
 if(!read){read=client.query('select record_type,record_id,project_id,data_purpose from source_record_purposes').then(result=>purposeLookup(result.rows.map(r=>({recordType:String(r.record_type),recordId:String(r.record_id),projectId:String(r.project_id??''),dataPurpose:'engineering_fixture'}))));purposeReads.set(client,read);}
 return read;
}
async function withPurposes<T>(client:Queryable,value:T,type?:string,projectId=''):Promise<T>{return applySourcePurposes(value,await querySourcePurposes(client),type,projectId);}

const DEFAULT_NOW_SQL = "to_char(now() at time zone 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI')";

export function createPostgresLedgerStore(options: PostgresStoreOptions = {}): LedgerStore {
  const runner = options.runWithClient ?? ((callback) => withDbClient((client) => callback(client), options.databaseUrl));
  const guardedClient=new AsyncLocalStorage<Queryable>();
  const guardedRunner:DbRunner=callback=>guardedClient.getStore()?callback(guardedClient.getStore()!):runner(callback);
  const runWithClient:DbRunner=callback=>guardedRunner(async client=>{const scoped:Queryable={query:(sql,values)=>client.query(sql,values)};const result=await callback(scoped);const purposes=purposeReads.get(scoped);return purposes?applySourcePurposes(result,await purposes):result;});

  const localAccessLock=objectLock();
  const withObjectAccessLock:LedgerStore['withObjectAccessLock']=action=>guardedClient.getStore()?action():localAccessLock(()=>runner(async client=>{
    await client.query("select pg_advisory_lock(hashtextextended('object-authorization',0))");
    try{return await guardedClient.run(client,action);}finally{await client.query("select pg_advisory_unlock(hashtextextended('object-authorization',0))");}
  }));

  const masterTransaction:LedgerStore["masterTransaction"] = action=>runWithClient(client=>inTransaction(client,async()=>{
      // Keep shared lock order fixed: workflow, material, fund master, accounts.
      await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))',['workflow']);
      await client.query("select pg_advisory_xact_lock(hashtext('material-upload'))");
      await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))',['fund-master']);
      await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))',['accounts']);
      const companies=await queryCompanies(client),projects=await queryProjects(client),funds=await queryFunds(client);
      const receipts=Object.fromEntries((await client.query('select request_id,fingerprint,result from master_write_requests')).rows.map(r=>[String(r.request_id),{fingerprint:String(r.fingerprint),result:r.result}])) as MasterState['receipts'];
      const oldCompanies=new Map(companies.map(c=>[c.id,JSON.stringify(c)])),oldProjects=new Map(projects.map(p=>[p.id,JSON.stringify(p)])),oldReceipts=new Set(Object.keys(receipts));
      const schemas=await readSchemas(client);const legacyAudits=(await client.query("select a.* from audit_events a where a.action='新增项目'")).rows.map(mapAuditEventRow);const state:MasterState={schemas,legacyAudits,companies,projects,funds,receipts,auditEvents:[]};const result=await action(state);
      for(const c of state.companies){
        if(!oldCompanies.has(c.id))await client.query('insert into portfolio_companies(id,name,short_name,industry,revision,data_origin,owner_actor_id) values($1,$2,$3,$4,$5,$6,$7)',[c.id,c.name,c.shortName,c.industry,c.revision,c.dataOrigin,c.ownerId??null]);
        else if(oldCompanies.get(c.id)!==JSON.stringify(c))await client.query('update portfolio_companies set name=$2,short_name=$3,industry=$4,revision=$5,owner_actor_id=$6,updated_at=now() where id=$1',[c.id,c.name,c.shortName,c.industry,c.revision,c.ownerId??null]);
      }
      for(const p of state.projects){
        if(!oldProjects.has(p.id))await client.query(`insert into projects(id,fund_id,company_id,master_revision,name,short_name,industry,description,manager_label,owner_actor_id,manager_user_id,collaborators,source_channel,status,stage,amount_label,risk_level,latest,thesis,next_action,updated_at,data_origin)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,(select id from users where name=$21 order by id limit 1),$11,$12,$13,$14,$15,$16,$17,$18,$19,now(),$20)`,[p.id,p.fundId,p.companyId??null,p.masterRevision??1,p.name,p.shortName,p.industry,p.description,p.managerLabel??p.manager,p.ownerId??null,p.collaborators??'',p.sourceChannel??'',p.status,p.stage,p.amount,p.risk,p.latest,p.thesis,p.nextAction,p.dataOrigin,p.managerLabel??p.manager]);
        else if(oldProjects.get(p.id)!==JSON.stringify(p))await client.query('update projects set name=$2,short_name=$3,industry=$4,description=$5,company_id=$6,master_revision=$7,updated_at=now() where id=$1',[p.id,p.name,p.shortName,p.industry,p.description,p.companyId??null,p.masterRevision??1]);
      }
      await persistCustom(client,state.schemas,state.companies.filter(c=>oldCompanies.get(c.id)!==JSON.stringify(c)),state.projects.filter(p=>oldProjects.get(p.id)!==JSON.stringify(p)),[]);
      for(const event of state.auditEvents){
        const actorId=JSON.parse(event.detail).actorId;
        const actor=(await client.query('select id from users where id = $1',[actorId])).rows[0];
        await insertAuditEvent(client,{...event,actorUserId:typeof actor?.id==='string'?actor.id:null});
      }
      for(const [id,r] of Object.entries(state.receipts))if(!oldReceipts.has(id))await client.query('insert into master_write_requests(request_id,fingerprint,result) values($1,$2,$3::jsonb)',[id,r.fingerprint,JSON.stringify(r.result)]);
      return result;
    }));
  return {
    readRecordManagement:()=>runWithClient(async client=>(await client.query('select payload from record_management_state where id=true')).rows[0]?.payload as RecordManagementData??emptyRecordManagement()),
    recordManagementTransaction:action=>runWithClient(client=>inTransaction(client,async()=>{await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['record-management']);const row=(await client.query('select payload from record_management_state where id=true for update')).rows[0];const s:RecordManagementState={data:row?.payload as RecordManagementData??emptyRecordManagement(),auditEvents:[]};const result=await action(s);await client.query('update record_management_state set payload=$1::jsonb where id=true',[JSON.stringify(s.data)]);for(const event of s.auditEvents)await insertAuditEvent(client,event);return result;})),
    healthCheck:()=>runWithClient(async client=>{await client.query('select 1');}),
    readObjectAccessSnapshot:()=>runWithClient(async client=>{
      const result=await client.query(`select jsonb_build_object(
        'data',coalesce((select payload from object_access_state where id=true),'{}'::jsonb),
        'funds',coalesce((select jsonb_agg(jsonb_build_object('id',id,'managerId',manager_user_id)) from funds),'[]'::jsonb),
        'projects',coalesce((select jsonb_agg(jsonb_build_object('id',id,'fundId',fund_id,'companyId',company_id,'ownerId',owner_actor_id)) from projects),'[]'::jsonb),
        'materials',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'fundId',m.fund_id,'projectId',m.project_id,'sourceMaterialId',m.source_material_id,'currentVersionId',m.current_version_id,'sourceBasis',m.source_basis,'relationships',jsonb_build_object(
          'projects',coalesce((select jsonb_agg(jsonb_build_object('id',project_id)) from material_project_relations where material_id=m.id),'[]'::jsonb),
          'funds',coalesce((select jsonb_agg(jsonb_build_object('id',fund_id)) from material_fund_relations where material_id=m.id),'[]'::jsonb)))) from materials m),'[]'::jsonb),
        'rows',coalesce((select jsonb_agg(jsonb_build_object('id',id,'objectType','company','ownerId',owner_actor_id)) from portfolio_companies),'[]'::jsonb) || coalesce((select jsonb_agg(jsonb_build_object('id',id,'objectType','scoped','ownerId',owner_id,'fundId',fund_id,'projectId',project_id,'reportId',report_id)) from (
          select id,fund_id,project_id,null::text as report_id,null::text as owner_id from reports
          union all select e.id,r.fund_id,r.project_id,e.report_id,null from report_exports e join reports r on r.id=e.report_id
          union all select id,fund_id,project_id,null,null from capital_records
          union all select id,null,project_id,null,null from meetings
          union all select id,suggested_fund_id,suggested_project_id,null,coalesce(submitted_by_actor_id,submitted_by_user_id) from ai_intake_items
          union all select id,null,project_id,null,null from tasks
          union all select id,fund_id,null,null,null from fund_investors
          union all select id,fund_id,null,null,null from fund_documents
          union all select id,fund_id,null,null,null from fund_clause_monitors
          union all select id,null,project_id,null,null from risks
        ) refs),'[]'::jsonb)
        || coalesce((select jsonb_agg(jsonb_build_object('id',id::text,'materialId',material_id,'objectType','material_version')) from material_versions),'[]'::jsonb)
        || coalesce((select jsonb_agg(jsonb_build_object('id',id,'objectType','scoped','fundId',fund_id,'projectId',project_id,'templateSnapshot',template_snapshot)) from reports),'[]'::jsonb)
        || coalesce((select jsonb_agg(jsonb_build_object('id',id,'objectType','scoped','fundId',suggested_fund_id,'projectId',suggested_project_id,'ownerId',coalesce(submitted_by_actor_id,submitted_by_user_id),'sourceMaterialId',source_material_id,'sourceBasis',source_basis)) from ai_intake_items),'[]'::jsonb)
        || coalesce((select jsonb_agg(jsonb_build_object('id',id,'objectType','scoped','projectId',project_id,'sourceBasis',source_basis)) from tasks),'[]'::jsonb)
        || coalesce((select jsonb_agg(jsonb_build_object('id',id,'objectType','scoped','fundId',fund_id,'sourceBasis',source_basis)) from fund_documents),'[]'::jsonb)
      ) as snapshot`);
      return result.rows[0].snapshot as import('../auth/object-access.ts').ObjectAccessSnapshot;
    }),
    withObjectAccessLock,
    readPendingBusinessNotices:()=>runWithClient(async client=>(await client.query('select payload from business_notification_outbox where delivered_at is null order by sequence limit 200')).rows.map(r=>r.payload as BusinessNotice)),
    acknowledgeBusinessNotices:ids=>runWithClient(async client=>{if(ids.length)await client.query('update business_notification_outbox set delivered_at=now() where id=any($1::uuid[]) and delivered_at is null',[ids]);}),
    lifecycleTransaction:(fundId,action)=>runWithClient(client=>inTransaction(client,async()=>{
      for(const key of ['workflow','fund-master','accounts'])await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
      const fund=(await queryFunds(client)).find(f=>f.id===fundId);if(!fund)throw new WorkflowError('fund_not_found',404);
      const data=(await client.query('select payload from fund_lifecycle_states where fund_id=$1 for update',[fundId])).rows[0]?.payload as LifecycleState['data']??emptyLifecycleData();
      const state:LifecycleState={fund,data,users:(await client.query('select id,name,email,role,password_hash,enabled,revision from users order by id')).rows.map(mapAccountUser),sessions:(await client.query('select session_hash,actor_id,expires_at from auth_sessions')).rows.map(mapAuthSession),materials:await queryMaterials(client),versions:(await client.query('select * from material_versions')).rows.map(mapVersion),investors:await queryInvestors(client,fundId),auditEvents:[]};
      applySourcePurposes(state,await querySourcePurposes(client));
      const before=JSON.stringify(data),result=await action(state);
      if(before!==JSON.stringify(state.data))await client.query('insert into fund_lifecycle_states(fund_id,payload) values($1,$2::jsonb) on conflict(fund_id) do update set payload=excluded.payload',[fundId,JSON.stringify(state.data)]);
      for(const event of state.auditEvents)await insertAuditEvent(client,{...event,actorUserId:null});await persistNotices(client,state);return result;
    })),
    accessTransaction:action=>withObjectAccessLock(()=>runWithClient(client=>inTransaction(client,async()=>{
      await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['accounts']);
      const data=(await client.query('select payload from object_access_state where id=true for update')).rows[0]?.payload as AccessState['data']??emptyAccess();
      const state:AccessState={data,users:(await client.query('select id,name,email,role,password_hash,enabled,revision from users order by id')).rows.map(mapAccountUser),sessions:(await client.query('select session_hash,actor_id,expires_at from auth_sessions')).rows.map(mapAuthSession),auditEvents:[]};
      const before=JSON.stringify(data),result=await action(state);
      if(before!==JSON.stringify(state.data))await client.query('insert into object_access_state(id,payload) values(true,$1::jsonb) on conflict(id) do update set payload=excluded.payload',[JSON.stringify(state.data)]);
      for(const event of state.auditEvents)await insertAuditEvent(client,{...event,actorUserId:null});return result;
    }))),
    readPostInvestmentArchive:(projectId,kind,id,version)=>runWithClient(async client=>{const state=(await client.query('select payload from post_investment_states where project_id=$1',[projectId])).rows[0]?.payload as import('./post-investment.ts').PostInvestmentState|undefined;return (kind==='report'?state?.reports:state?.exitPreparations)?.find(v=>v.id===id&&String(v.version)===version)??null;}),
    listCompanies: () => runWithClient(queryCompanies),
    masterTransaction,
    assistantTransaction:(owner,action)=>runWithClient(client=>inTransaction(client,async()=>{
      await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['accounts']);
      await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['assistant:'+owner]);
      const rows=(await client.query('select id,payload from ai_conversations where owner_id=$1 order by updated_at desc',[owner])).rows;
      const state:AssistantState={users:(await client.query('select id,name,email,role,password_hash,enabled,revision from users order by id')).rows.map(mapAccountUser),sessions:(await client.query('select session_hash,actor_id,expires_at from auth_sessions')).rows.map(mapAuthSession),conversations:rows.map(r=>r.payload as AssistantConversation)};
      const before=new Map(rows.map(r=>[String(r.id),JSON.stringify(r.payload)])),result=await action(state);
      for(const c of state.conversations)if(before.get(c.id)!==JSON.stringify(c))await client.query('insert into ai_conversations(id,owner_id,payload,updated_at) values($1,$2,$3::jsonb,$4) on conflict(id) do update set payload=excluded.payload,updated_at=excluded.updated_at where ai_conversations.owner_id=excluded.owner_id',[c.id,owner,JSON.stringify(c),c.updatedAt]);
      for(const id of before.keys())if(!state.conversations.some(c=>c.id===id))await client.query('delete from ai_conversations where id=$1 and owner_id=$2',[id,owner]);return result;
    })),
    lpTransaction: action=>runWithClient(client=>materialTransaction(client,async()=>{
      await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['workflow']);
      await client.query("select pg_advisory_xact_lock(hashtext('material-upload'))");
      for(const key of ['fund-master','accounts'])await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
      const data=(await client.query('select payload from lp_ledger_state where id=true for update')).rows[0]?.payload as LpData??emptyLpData();
      const investors=(await client.query(`select *, to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as record_created_at from fund_investors order by created_at desc nulls last,id collate "C" asc`)).rows.map(mapInvestorRow);
      const materials=await queryMaterials(client);const versions=(await client.query('select * from material_versions')).rows.map(mapVersion);
      const oldMaterialScopes=new Map(materials.map(m=>[m.id,JSON.stringify({scopeRevision:m.scopeRevision??1,relationships:m.relationships})]));
      const oldMaterials=new Set(materials.map(m=>m.id)),oldVersions=new Set(versions.map(v=>v.id));
      const before=new Map(investors.map(i=>[i.id,JSON.stringify(i)]));
      const users=(await client.query('select id,name,email,role,password_hash,enabled,revision from users order by id')).rows.map(mapAccountUser);const sessions=(await client.query('select session_hash,actor_id,expires_at from auth_sessions')).rows.map(mapAuthSession);
      const management=(await client.query('select payload from record_management_state where id=true')).rows[0]?.payload as RecordManagementData|undefined;
      const state:LpState={users,sessions,purposes:await querySourcePurposes(client),deletedMaterialIds:management?.entries.filter(e=>e.kind==='material'&&e.deletedAt).map(e=>e.id)??[],funds:await queryFunds(client),investors,data,materials,versions,auditEvents:[]};const result=await action(state);
      for(const i of state.investors)if(before.get(i.id)!==JSON.stringify(i))await client.query(`insert into fund_investors(id,fund_id,name,type,commitment_label,paid_in_label,suitability_status,sign_status,updated_at,data_origin,revision,contact_name,contact_phone,contact_email,profile) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) on conflict(id) do update set name=excluded.name,type=excluded.type,sign_status=excluded.sign_status,updated_at=excluded.updated_at,revision=excluded.revision,contact_name=excluded.contact_name,contact_phone=excluded.contact_phone,contact_email=excluded.contact_email,profile=excluded.profile`,[i.id,i.fundId,i.name,i.type,i.commitment,i.paidIn,i.suitabilityStatus,i.signStatus,i.updatedAt,i.dataOrigin,i.revision,i.contactName??'',i.contactPhone??'',i.contactEmail??'',i.profile??null]);
      for(const m of state.materials)if(!oldMaterials.has(m.id)){
        await client.query(`insert into materials(id,fund_id,name,category,archived_at,path,archive_path,source,status,citation_count,primary_scope,data_origin,original_file_path,size_bytes,sha256,file_extension,current_version,current_version_id) values($1,$2,$3,$4,$5,'LP档案','LP档案','用户上传','待复核',0,'investor','user_input',$6,$7,$8,$9,$10,$11)`,[m.id,m.fundId,m.name,m.type,m.time,m.originalFilePath,m.sizeBytes,m.sha256,m.fileExtension,m.currentVersion,m.currentVersionId]);
        await client.query("insert into material_fund_relations(material_id,fund_id,relation_type,is_primary) values($1,$2,'linked',true)",[m.id,m.fundId]);
        for(const i of m.relationships?.investors??[])await client.query("insert into material_investor_relations(material_id,investor_id,relation_type,is_primary) values($1,$2,'linked',true)",[m.id,i.id]);
      }
      for(const m of state.materials)if(oldMaterials.has(m.id)&&state.versions.some(v=>v.materialId===m.id&&!oldVersions.has(v.id)))await client.query('update materials set name=$2,category=$3,archived_at=$4,original_file_path=$5,size_bytes=$6,sha256=$7,file_extension=$8,current_version=$9,current_version_id=$10 where id=$1',[m.id,m.name,m.type,m.time,m.originalFilePath,m.sizeBytes,m.sha256,m.fileExtension,m.currentVersion,m.currentVersionId]);
      for(const m of state.materials)if(oldMaterials.has(m.id)&&oldMaterialScopes.get(m.id)!==JSON.stringify({scopeRevision:m.scopeRevision??1,relationships:m.relationships})){
        await client.query('update materials set project_id=$2,fund_id=$3,raw_project_label=$4,primary_scope=$5,scope_revision=$6 where id=$1',[m.id,m.projectId??null,m.fundId??null,m.project??'',m.primaryScope??null,m.scopeRevision??1]);
        for(const [table,column,relations] of [['material_project_relations','project_id',m.relationships?.projects],['material_fund_relations','fund_id',m.relationships?.funds],['material_investor_relations','investor_id',m.relationships?.investors]] as const){
          await client.query(`delete from ${table} where material_id=$1`,[m.id]);
          for(const rel of relations??[])await client.query(`insert into ${table}(material_id,${column},relation_type,is_primary) values($1,$2,$3,$4)`,[m.id,rel.id,rel.relationType??'linked',rel.isPrimary??false]);
        }
        if(m.lpSensitive)await client.query('insert into lp_material_privacy(material_id) values($1) on conflict do nothing',[m.id]);
      }
      for(const e of state.auditEvents){const actorId=JSON.parse(e.detail).actorId;const actor=(await client.query('select id from users where id=$1',[actorId])).rows[0];await insertAuditEvent(client,{...e,actorUserId:typeof actor?.id==='string'?actor.id:null});}
      for(const v of state.versions)if(!oldVersions.has(v.id))await client.query(`insert into material_versions(id,material_id,version,name,size_bytes,sha256,mime_type,uploaded_by,uploaded_by_id,created_at,blob_id,request_id,fingerprint,audit_event_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,[v.id,v.materialId,v.version,v.name,v.sizeBytes,v.sha256,v.mimeType,v.uploadedBy,v.uploadedById,v.createdAt,v.blobId,v.requestId,v.fingerprint,v.auditEventId]);
      await client.query('update lp_ledger_state set payload=$1::jsonb where id=true',[JSON.stringify(state.data)]);await persistNotices(client,state);return result;
    })),
    fundTransaction: action=>runWithClient(client=>inTransaction(client,async()=>{
      await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))',['fund-master']);
      await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))',['accounts']);
      const funds=await queryFunds(client);
      const users=(await client.query('select id,name,email,role,password_hash,enabled,revision from users order by id')).rows.map(mapAccountUser);
      const receipts=Object.fromEntries((await client.query('select request_id,fingerprint,result from fund_write_requests')).rows.map(r=>[String(r.request_id),{fingerprint:String(r.fingerprint),result:r.result}])) as FundMasterState['receipts'];
      const before=new Map(funds.map(f=>[f.id,JSON.stringify(f)])),beforeReceipts=new Set(Object.keys(receipts));
      const schemas=await readSchemas(client);const state:FundMasterState={schemas,funds,users,receipts,auditEvents:[]};const result=await action(state);
      for(const f of state.funds){
        if(!before.has(f.id))await client.query(`insert into funds(id,name,short_name,manager_user_id,stage,scale_label,paid_in_label,invested_label,balance_label,next_action,revision,updated_at,data_origin) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),$12)`,[f.id,f.name,f.shortName,f.managerId,f.stage,f.scale,f.paidIn,f.invested,f.balance,f.nextAction,f.revision,f.dataOrigin]);
        else if(before.get(f.id)!==JSON.stringify(f))await client.query('update funds set name=$2,short_name=$3,manager_user_id=$4,stage=$5,scale_label=$6,next_action=$7,revision=$8,updated_at=now() where id=$1',[f.id,f.name,f.shortName,f.managerId,f.stage,f.scale,f.nextAction,f.revision]);
      }
      await persistCustom(client,state.schemas,[],[],state.funds.filter(f=>before.get(f.id)!==JSON.stringify(f)));
      for(const e of state.auditEvents){const actorId=JSON.parse(e.detail).actorId;await insertAuditEvent(client,{...e,actorUserId:users.some(u=>u.id===actorId)?actorId:null});}
      for(const [id,r] of Object.entries(state.receipts))if(!beforeReceipts.has(id))await client.query('insert into fund_write_requests(request_id,actor_id,fingerprint,result) values($1,$2,$3,$4::jsonb)',[id,JSON.parse(r.fingerprint).actorId,r.fingerprint,JSON.stringify(r.result)]);
      return result;
    })),
    accountTransaction: action=>withObjectAccessLock(()=>runWithClient(client=>inTransaction(client,async()=>{
      await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))',['accounts']);
      const users=(await client.query('select id,name,email,role,password_hash,enabled,revision from users order by id')).rows.map(mapAccountUser);
      const sessions=(await client.query('select session_hash,actor_id,expires_at from auth_sessions')).rows.map(mapAuthSession);
      const receipts=Object.fromEntries((await client.query('select request_id,actor_id,fingerprint,result from account_requests')).rows.map(r=>[String(r.request_id),{actorId:String(r.actor_id),fingerprint:String(r.fingerprint),result:r.result}]));
      const beforeUsers=new Map(users.map(u=>[u.id,JSON.stringify(u)])),beforeSessions=new Set(sessions.map(s=>s.hash)),beforeReceipts=new Set(Object.keys(receipts));
      const state:AccountState={users,sessions,receipts,auditEvents:[]};const result=await action(state);
      for(const u of state.users){
        if(!beforeUsers.has(u.id))await client.query('insert into users(id,name,email,role,password_hash,enabled,revision) values($1,$2,$3,$4,$5,$6,$7)',[u.id,u.name,u.email,u.role,u.passwordHash,u.enabled!==false,u.revision??1]);
        else if(beforeUsers.get(u.id)!==JSON.stringify(u))await client.query('update users set name=$2,email=$3,role=$4,password_hash=$5,enabled=$6,revision=$7 where id=$1',[u.id,u.name,u.email,u.role,u.passwordHash,u.enabled!==false,u.revision??1]);
      }
      const remaining=new Set(state.sessions.map(s=>s.hash));for(const hash of beforeSessions)if(!remaining.has(hash))await client.query('delete from auth_sessions where session_hash=$1',[hash]);
      for(const session of state.sessions)if(!beforeSessions.has(session.hash))await client.query('insert into auth_sessions(session_hash,actor_id,expires_at) values($1,$2,$3)',[session.hash,session.actorId,session.expiresAt]);
      for(const [id,r] of Object.entries(state.receipts))if(!beforeReceipts.has(id))await client.query('insert into account_requests(request_id,actor_id,fingerprint,result) values($1,$2,$3,$4)',[id,r.actorId,r.fingerprint,r.result]);
      for(const event of state.auditEvents)await insertAuditEvent(client,{...event,actorUserId:state.users.some(u=>u.id===event.actorId)?event.actorId:null});
      return result;
    }))),
    readAuthSession: hash=>runWithClient(async client=>{
      const r=(await client.query('select s.session_hash,s.actor_id,s.expires_at,u.id,u.name,u.email,u.role,u.password_hash,u.enabled,u.revision from auth_sessions s left join users u on u.id=s.actor_id where s.session_hash=$1',[hash])).rows[0];
      return r?{session:mapAuthSession(r),user:r.id?mapAccountUser(r):null}:null;
    }),
    listUsers: () => runWithClient(async (client) => (await client.query('select id,name,email,role,password_hash,enabled,revision from users order by name,id')).rows.map(mapAccountUser)),
    insertUser: user => runWithClient(async (client) => {
        try {
            await client.query('insert into users(id,name,email,role,password_hash,enabled,revision) values($1,$2,$3,$4,$5,$6,$7)', [user.id,user.name,user.email,user.role,user.passwordHash,user.enabled!==false,user.revision??1]);
        }
        catch (e) {
            if ((e as {
                code?: string;
            }).code === '23505')
                throw new WorkflowError('email_exists', 409);
            throw e;
        }
    }),
    listPostInvestmentProjectIds: () => runWithClient(async client=>(await client.query('select project_id from post_investment_states')).rows.map(r=>String(r.project_id))),
    readInvestmentLedgerSnapshot: () => runWithClient(async client => {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      try {
        const capturedAt=new Date().toISOString(), funds=await queryFunds(client), companies=await queryCompanies(client), projects=await queryProjects(client);
        const posts=(await client.query('select project_id,payload from post_investment_states')).rows;
        const deals=(await client.query('select project_id,payload from deal_batches order by id')).rows;
        const snapshot={capturedAt,funds,companies,states:projects.map(project=>({project,deals:deals.filter(d=>d.project_id===project.id).map(d=>d.payload as import('./deal.ts').DealBatch),postInvestment:posts.find(p=>p.project_id===project.id)?.payload as import('./post-investment.ts').PostInvestmentState|undefined}))};
        await withPurposes(client,snapshot);await client.query('COMMIT');return snapshot;
      } catch(error) { await client.query('ROLLBACK');throw error; }
    }),
    readExitStates: () => runWithClient(async client => {
      const posts=(await client.query('select project_id,payload from post_investment_states')).rows;
      const deals=(await client.query("select project_id,payload from deal_batches where project_id in (select project_id from post_investment_states union select project_id from deal_batches)")).rows;
      const projectIds=[...new Set([...posts,...deals].map(r=>String(r.project_id)))];
      if(!projectIds.length)return [];
      const projects=await queryProjects(client,{projectIds});
      return withPurposes(client,projects.map(project=>({project,postInvestment:posts.find(p=>p.project_id===project.id)?.payload as import('./post-investment.ts').PostInvestmentState|undefined,deals:deals.filter(d=>d.project_id===project.id).map(d=>d.payload as import('./deal.ts').DealBatch)})));
    }),
    readApprovals: id => runWithClient(async (client) => withPurposes(client,(await client.query('select payload from approval_rounds where project_id=$1 order by id', [id])).rows.map(r => r.payload as ApprovalRound),'approval_round',id)),
    workflowTransaction: (id, action, options) => runWithClient(client => inTransaction(client, async () => {
        // shortcut: serialize this single workspace; use project and request locks when concurrent project writes grow.
        await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', ['workflow']);
        const project = await queryProjectById(client, id);
        if (!project)
            throw new WorkflowError('project_not_found', 404);
        const tasks = await queryTasks(client, id);
        const rounds = (await client.query('select payload from approval_rounds where project_id=$1 order by id', [id])).rows.map(r => r.payload as ApprovalRound);
        const receipts = Object.fromEntries((await client.query('select request_id,fingerprint,result from workflow_requests')).rows.map(r => [String(r.request_id), { fingerprint: String(r.fingerprint), result: r.result }]));
        const diligence = (await client.query('select payload from diligence_cases where project_id=$1', [id])).rows[0]?.payload as import('./diligence.ts').DiligenceCase | undefined;
        const deals = (await client.query('select payload from deal_batches where project_id=$1', [id])).rows.map(r => r.payload as import('./deal.ts').DealBatch);
        const postInvestment = (await client.query('select payload from post_investment_states where project_id=$1', [id])).rows[0]?.payload as import('./post-investment.ts').PostInvestmentState | undefined;
        const archivedBefore=structuredClone(postInvestment);
        const w: WorkflowState = { project, tasks, rounds, receipts, diligence, deals, postInvestment, auditEvents: [] };
        if(options?.exitPaymentIdentities||options?.bankEventIdentities){
            const posts=(await client.query('select payload from post_investment_states')).rows.map(r=>r.payload as import('./post-investment.ts').PostInvestmentState);
            w.bankEventIdentities=posts.flatMap(p=>[...(p.exitPayments??[]),...(p.investmentCashflows??[])]);
            if(options.exitPaymentIdentities)w.exitPaymentIdentities=posts.flatMap(p=>p.exitPayments??[]);
        }
        if(options?.reportSources){
            const rows=await client.query(`select r.*, to_char(r.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as record_created_at,to_char(r.time at time zone 'Asia/Shanghai','YYYY-MM-DD') as time_label,to_char(r.updated_at at time zone 'Asia/Shanghai','YYYY-MM-DD HH24:MI') as updated_at_label from risks r where r.project_id=$1 order by r.created_at desc nulls last,r.id collate "C" asc`,[id]);
            w.reportSources={risks:[...rows.rows.map(mapRiskRow),...(postInvestment?.manualRisks??[]).filter(r=>!r.deletedAt)],capitalRecords:await queryCapitalRecords(client,{projectId:id})};
        }
        await withPurposes(client,w,undefined,id);
        const oldPost = JSON.stringify(postInvestment);
        const oldDeals = new Map(deals.map(d => [d.id, JSON.stringify(d)]));
        const oldDiligence = JSON.stringify(diligence);
        const oldTasks = new Map(tasks.map(t => [t.id, JSON.stringify(t)]));
        const oldRounds = new Map(rounds.map(r => [r.id, JSON.stringify(r)]));
        const oldReceipts = new Set(Object.keys(receipts));
        const oldProject = JSON.stringify(project);
        const result = await action(w);
        if (JSON.stringify(project) !== oldProject)
            await client.query('update projects set owner_actor_id=$2,manager_label=$3,manager_user_id=(select id from users where id=$2),stage=$4,latest=$5,next_action=$6,status=$7,updated_at=now() where id=$1', [id, project.ownerId ?? null, project.manager, project.stage, project.latest, project.nextAction, project.status]);
        if (w.diligence && JSON.stringify(w.diligence) !== oldDiligence)
            await client.query('insert into diligence_cases(project_id,payload) values($1,$2::jsonb) on conflict(project_id) do update set payload=excluded.payload', [id,JSON.stringify(w.diligence)]);
        if(w.postInvestment && JSON.stringify(w.postInvestment)!==oldPost){const persisted=structuredClone(w.postInvestment);restoreArchivedPurposeMetadata(persisted,archivedBefore);await client.query('insert into post_investment_states(project_id,payload) values($1,$2::jsonb) on conflict(project_id) do update set payload=excluded.payload',[id,JSON.stringify(persisted)]);}
        for (const d of w.deals ?? [])
            if (oldDeals.get(d.id) !== JSON.stringify(d))
                await client.query('insert into deal_batches(id,project_id,payload) values($1,$2,$3::jsonb) on conflict(id) do update set payload=excluded.payload', [d.id,id,JSON.stringify(d)]);
        for (const t of tasks)
            if (oldTasks.get(t.id) !== JSON.stringify(t))
                await client.query(`insert into tasks(id,project_id,name,type,stage,owner_user_id,owner_actor_id,owner_label,due_date,status,priority,relation,note,kind,approval_round_id,revision,completed_at,updated_at,data_origin)
        values($1,$2,$3,$4,$5,(select id from users where id=$6),$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,now(),$17)
        on conflict(id) do update set name=excluded.name,type=excluded.type,owner_user_id=excluded.owner_user_id,owner_actor_id=excluded.owner_actor_id,owner_label=excluded.owner_label,due_date=excluded.due_date,status=excluded.status,priority=excluded.priority,relation=excluded.relation,note=excluded.note,revision=excluded.revision,completed_at=excluded.completed_at,updated_at=now()`, [t.id, id, t.name, t.type, t.stage, t.ownerId ?? null, t.owner, t.dueDate, t.status, t.priority, t.relation, t.note, t.kind ?? 'manual', t.approvalRoundId ?? null, t.revision ?? 1, t.completedAt ?? null,t.dataOrigin ?? 'user_input']);
        for (const r of rounds)
            if (oldRounds.get(r.id) !== JSON.stringify(r))
                await client.query('insert into approval_rounds(id,project_id,payload) values($1,$2,$3::jsonb) on conflict(id) do update set payload=excluded.payload', [r.id, id, JSON.stringify(r)]);
        for (const [key, receipt] of Object.entries(receipts))
            if (!oldReceipts.has(key))
                await client.query('insert into workflow_requests(request_id,project_id,fingerprint,result) values($1,$2,$3,$4::jsonb)', [key, id, receipt.fingerprint, JSON.stringify(receipt.result)]);
        for (const event of w.auditEvents) {
            const actorId = JSON.parse(event.detail).actorId;
            const actorRecord = await client.query('select id from users where id = $1', [actorId]);
            await insertAuditEvent(client, { ...event, actorUserId: typeof actorRecord.rows[0]?.id === 'string' ? actorRecord.rows[0].id : null });
        }
        await persistNotices(client,w);return withPurposes(client,result,undefined,id);
    })),
    readLpPrivacy: () => runWithClient(async client=>(await client.query(`select
      coalesce((select jsonb_agg(jsonb_build_object('id',investor_id,'name',name)) from lp_identity_privacy),'[]'::jsonb) || coalesce((select payload->'history' from lp_ledger_state where id=true),'[]'::jsonb) || coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'name',v.value#>>'{}')) from fund_investors i cross join lateral jsonb_each(coalesce(i.profile->'fields','{}'::jsonb)||coalesce(i.profile->'extraFields','{}'::jsonb)) v where jsonb_typeof(v.value)='string'),'[]'::jsonb) as identities,
      coalesce((select jsonb_agg(material_id) from lp_material_privacy),'[]'::jsonb) as "materialIds",
      coalesce((select jsonb_agg(jsonb_build_object('id',id,'materialId',material_id)) from material_versions),'[]'::jsonb) as "materialVersions",
      coalesce((select jsonb_agg(jsonb_build_object('projectId',project_id,'items',payload->'items','findings',payload->'findings','reports',payload->'reports','supplements',payload->'supplements')) from diligence_cases),'[]'::jsonb) as "diligenceCases",
      coalesce((select jsonb_agg(context) from (
        select jsonb_build_object('projectId',project_id,'postInvestment',payload) as context from post_investment_states
        union all select jsonb_build_object('projectId',project_id,'deals',jsonb_build_array(payload)) from deal_batches
        union all select jsonb_build_object('projectId',project_id,'rounds',jsonb_build_array(payload)) from approval_rounds
      ) records),'[]'::jsonb) as "taskContexts"
    `)).rows[0] as Awaited<ReturnType<LedgerStore['readLpPrivacy']>>),
    listFunds: () => runWithClient((client) => queryFunds(client)),
    getFundDetail: (id) =>
      runWithClient(async (client) => {
        const fund = await queryFundById(client, id);
        if (!fund) return null;

        const investors = await queryInvestors(client, id);
        const documents = await queryFundDocuments(client, id);
        const clauses = await queryFundClauses(client, id);
        const projects = await queryProjects(client, { fundId: id });
        const reports = await queryReports(client, { fundId: id });
        const capitalRecords = await queryCapitalRecords(client, { fundId: id });
        const auditEvents = await queryAuditEvents(client, { fundId: id, source: fund.name });

        return { fund, investors, documents, clauses, projects, reports, capitalRecords, auditEvents };
      }),
    listProjects: () => runWithClient((client) => queryProjects(client)),
    createProject: (value, actor) => {
      const input = normalizeProjectInput(value);
      return createBoundProject({masterTransaction} as LedgerStore,input,actor);
    },
    updateProjectStage: (id, input) =>
      runWithClient((client) =>
        inTransaction(client, async () => {
          const previousProject = await queryProjectById(client, id);
          if (!previousProject) return null;

          await client.query("update projects set stage = $1, updated_at = now() where id = $2", [input.stage, id]);
          const project = await queryProjectById(client, id);
          if (!project) return null;

          const auditEvent = await insertAuditEvent(client, {
            module: "项目账本",
            action: "更新项目阶段",
            targetType: "项目",
            targetId: project.id,
            targetName: project.name,
            actor: input.actor ?? project.manager,
            detail: `项目阶段从“${previousProject.stage}”更新为“${project.stage}”。`,
            source: "项目详情",
          });

          return { project, auditEvent };
        }),
      ),
    getProjectDetail: (id) =>
      runWithClient(async (client) => {
        const project = await queryProjectById(client, id);
        if (!project) return null;

        const tasks = await queryTasks(client, id);
        const materials = await queryMaterials(client, { projectId: id, projectName: project.name, shortName: project.shortName });
        const reports = await queryReports(client, { projectId: id });
        const meetings = await queryMeetings(client, { projectId: id, projectName: project.name, shortName: project.shortName });
        const capitalRecords = await queryCapitalRecords(client, { projectId: id });
        const risks=(await client.query(`select r.*, to_char(r.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as record_created_at,to_char(r.time at time zone 'Asia/Shanghai','YYYY-MM-DD') as time_label,to_char(r.updated_at at time zone 'Asia/Shanghai','YYYY-MM-DD HH24:MI') as updated_at_label from risks r where r.project_id=$1 order by r.created_at desc nulls last,r.id collate "C" asc`,[id])).rows.map(mapRiskRow);
        const post=(await client.query('select payload from post_investment_states where project_id=$1',[id])).rows[0]?.payload as import('./post-investment.ts').PostInvestmentState|undefined;
        risks.push(...(post?.manualRisks??[]).filter(r=>!r.deletedAt));
        const auditEvents = await queryAuditEvents(client, { projectId: id });

        return { project, tasks, risks, materials, reports, meetings, capitalRecords, auditEvents };
      }),
    listTasks: (projectId) => runWithClient((client) => queryTasks(client, projectId)),
    createTask: (input) =>
      runWithClient((client) =>
        inTransaction(client, async () => {
          const taskId = input.id ?? nextId("task", input.name);
          const ownerUserId = await resolveUserId(client, input.owner);
          await client.query(
            `
              insert into tasks (id, project_id, name, type, stage, owner_user_id, due_date, status, priority, relation, note, updated_at, data_origin)
              values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),'user_input')
            `,
            [
              taskId,
              input.projectId,
              input.name,
              input.type,
              input.stage,
              ownerUserId,
              input.dueDate,
              input.status,
              input.priority,
              input.relation,
              input.note,
            ],
          );

          const task = await queryTaskById(client, taskId);
          if (!task) throw new Error("task_insert_failed");

          const auditEvent = await insertAuditEvent(client, {
            module: "任务中心",
            action: "创建任务",
            targetType: "项目",
            targetId: task.projectId,
            targetName: await queryProjectName(client, task.projectId),
            actor: task.owner,
            detail: `创建${task.type}任务 ${task.id}：${task.name}，负责人 ${task.owner}，截止 ${task.dueDate}。`,
            source: task.relation,
          });

          return { task, auditEvent };
        }),
      ),
    updateTask: (id, patch) =>
      runWithClient((client) =>
        inTransaction(client, async () => {
          const values: unknown[] = [];
          const updates: string[] = [];
          const directFields: Record<string, string> = {
            name: "name",
            type: "type",
            stage: "stage",
            dueDate: "due_date",
            status: "status",
            priority: "priority",
            relation: "relation",
            note: "note",
          };

          for (const [apiField, column] of Object.entries(directFields)) {
            const value = patch[apiField as keyof typeof patch];
            if (typeof value !== "undefined") {
              values.push(value);
              updates.push(`${column} = $${values.length}`);
            }
          }

          if (typeof patch.owner !== "undefined") {
            values.push(await resolveUserId(client, patch.owner));
            updates.push(`owner_user_id = $${values.length}`);
          }

          values.push(id);
          const update = await client.query(
            `
              update tasks
              set ${updates.length ? `${updates.join(", ")},` : ""} updated_at = now()
              where id = $${values.length}
              returning id
            `,
            values,
          );
          if (!update.rows[0]) return null;

          const task = await queryTaskById(client, id);
          if (!task) return null;

          const auditEvent = await insertAuditEvent(client, {
            module: "任务中心",
            action: "更新任务",
            targetType: "项目",
            targetId: task.projectId,
            targetName: await queryProjectName(client, task.projectId),
            actor: task.owner,
            detail: `任务 ${task.id} 状态更新为 ${task.status}。`,
            source: task.relation,
          });

          return { task, auditEvent };
        }),
      ),
    listMaterialVersions: (id) => runWithClient(client => queryVersions(client, id)),
    uploadMaterial: (input) => runWithClient(client => materialTransaction(client, async () => {
        await client.query("select pg_advisory_xact_lock(hashtext('material-upload'))");
        const fingerprint = uploadFingerprint(input);
        const priorResult = await client.query('select * from material_versions where request_id=$1', [input.requestId]);
        if (priorResult.rows[0]) {
            const prior = mapVersion(priorResult.rows[0]);
            if (prior.fingerprint !== fingerprint)
                throw new MaterialWriteError('upload_request_conflict', 409);
            return {
                material: (await queryMaterialById(client, prior.materialId))!,
                version: prior,
                auditEvent: (await queryAuditEventById(client, prior.auditEventId))!,
                created: false
            };
        }
        const project = input.projectId ? await queryProjectById(client, input.projectId) : undefined;
        const fund = input.fundId ? await queryFundById(client,input.fundId) : undefined;
        const company = input.companyId ? (await queryCompanies(client)).find(c=>c.id===input.companyId) : undefined;
        if ([input.projectId,input.fundId,input.companyId].filter(Boolean).length!==1 || (input.companyId ? !company : input.fundId ? !fund : !project))
            throw new MaterialWriteError('project_not_found', 404);
        let material = input.materialId ? await queryMaterialById(client, input.materialId) : null;
        if (input.materialId && !material)
            throw new MaterialWriteError('material_not_found', 404);
        if (material && (input.companyId ? !material.relationships?.companies.some(c=>c.id===input.companyId) || Boolean(material.projectId) || Boolean(material.fundId) : input.fundId ? Boolean(material.projectId) || material.fundId !== input.fundId : material.projectId !== input.projectId))
            throw new MaterialWriteError('invalid_uploaded_material', 409);
        if (material && (material.name !== input.name || material.type !== input.type))
            throw new MaterialWriteError('material_identity_conflict', 409);
        const adoptingLegacy = Boolean(material && !material.currentVersionId);
        if (adoptingLegacy && !input.legacyVersion)
            throw new MaterialWriteError('legacy_original_unavailable', 409);
        if (material && (material.currentVersion ?? 0) !== input.expectedVersion)
            throw new MaterialWriteError('material_version_conflict', 409);
        if (!material) {
            const duplicate = input.companyId ? await client.query('select m.id from materials m join material_company_relations r on r.material_id=m.id where r.company_id=$1 and m.name=$2 and m.current_version_id is not null limit 1',[input.companyId,input.name]) : await client.query(`select m.id from materials m where m.current_version_id is not null and m.name=$1 and (($3::text is null and (m.project_id=$2 or exists(select 1 from material_project_relations r where r.material_id=m.id and r.project_id=$2))) or ($3::text is not null and m.project_id is null and m.fund_id=$3)) limit 1`, [input.name, input.projectId ?? null,input.fundId ?? null]);
            if (duplicate.rows[0])
                throw new MaterialWriteError('material_name_conflict', 409, String(duplicate.rows[0].id));
        }
        const materialId = material?.id ?? `material-${randomUUID()}`;
        const versionNumber = adoptingLegacy ? 2 : (material?.currentVersion ?? 0) + 1;
        const createdAt = new Date().toISOString();
        const originalPath = `api/materials/${materialId}/versions/${input.versionId}/file`;
        if (!material) {
            await client.query(`insert into materials(id,fund_id,project_id,raw_project_label,name,category,archived_at,path,archive_path,source,status,citation_count,primary_scope,data_origin) values($1,$2,$3,$4,$5,$6,$7,$8,$8,'用户上传','待复核',0,$9,'user_input')`, [materialId, project?.fundId ?? fund?.id ?? null, project?.id ?? null, project?.name ?? fund?.name ?? company!.name, input.name, input.type, createdAt,project?'项目档案 / 用户上传':company?'企业档案 / 用户上传':'基金档案 / 用户上传',project?'project':company?'company':'fund']);
            if(project)await replaceUploadRelations(client, materialId, [project]);
            else await insertMaterialRelations(client,materialId,{projects:[],funds:fund?[{id:fund.id,name:fund.name,relationType:'primary',isPrimary:true}]:[],companies:company?[{id:company.id,name:company.name,relationType:'primary',isPrimary:true}]:[],investors:[]},{dataOrigin:'user_input'});
        }
        const auditEvent = await insertAuditEvent(client, {
            module: '资料库',
            action: '上传资料版本',
            targetType: '资料',
            targetId: materialId,
            targetName: input.name,
            actor: input.actor.name,
            detail: `${adoptingLegacy ? "保留历史原件为版本 1；" : ""}上传版本 ${versionNumber}，SHA256 ${input.sha256}`,
            source: '用户上传',
            dataOrigin: 'user_input',
            time: createdAt
        });
        if (adoptingLegacy) {
            const legacy = input.legacyVersion!;
            await client.query(`insert into material_versions(id,material_id,version,name,size_bytes,sha256,mime_type,uploaded_by,uploaded_by_id,created_at,blob_id,request_id,fingerprint,audit_event_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$1,$11,$12,$13)`, [legacy.id, materialId, 1, legacy.name, legacy.sizeBytes, legacy.sha256, legacy.mimeType, legacy.uploadedBy, legacy.uploadedById, legacy.createdAt, legacy.requestId, legacy.fingerprint, auditEvent.id]);
        }
        // Session actors may not be persisted users; retain their exact identity in the immutable version.
        await client.query(`insert into material_versions(id,material_id,version,name,size_bytes,sha256,mime_type,uploaded_by,uploaded_by_id,created_at,blob_id,request_id,fingerprint,audit_event_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$1,$11,$12,$13)`, [input.versionId, materialId, versionNumber, input.name, input.sizeBytes, input.sha256, input.mimeType, input.actor.name, input.actor.id, createdAt, input.requestId, fingerprint, auditEvent.id]);
        await client.query(`update materials set name=$2,category=$3,archived_at=$4,original_file_path=$5,size_bytes=$6,sha256=$7,file_extension=$8,current_version=$9,current_version_id=$10,preview_file_path=null,recognized_text_path=null,recognized_html_path=null,page_image_manifest_path=null,page_image_dir=null,status='待复核',source='用户上传' where id=$1`, [materialId, input.name, input.type, createdAt, originalPath, input.sizeBytes, input.sha256, input.name.split('.').pop()!.toLowerCase(), versionNumber, input.versionId]);
        await client.query('delete from material_text_chunks where material_id=$1 or material_id=$2', [materialId, material?.sourceMaterialId ?? materialId]);
        material = (await queryMaterialById(client, materialId))!;
        const version = (await queryVersions(client, materialId)).find(v => v.id === input.versionId)!;
        return {
            material,
            version,
            auditEvent,
            created: true
        };
    })),
    setMaterialProjects: (id, projectIds, actor) => runWithClient(client => materialTransaction(client, async () => {
        await client.query("select pg_advisory_xact_lock(hashtext('material-upload'))");
        const material = await queryMaterialById(client, id);
        if (!material)
            throw new MaterialWriteError('material_not_found', 404);
        const all = await queryProjects(client);
        const projects = projectIds.map(id => all.find(p => p.id === id));
        if (projects.some(p => !p))
            throw new MaterialWriteError('project_not_found', 404);
        const selected = projects as Project[];
        const previousProjectIds = material.relationships?.projects.map(p => p.id) ?? [material.projectId];
        const preserveLegacy = !material.currentVersionId || (await queryVersions(client, id)).some(version => version.fingerprint.startsWith('legacy:'));
        const relationships = materialProjectRelationships(material, selected, await queryFunds(client), preserveLegacy);
        await client.query('delete from material_project_relations where material_id=$1', [id]);
        if (!preserveLegacy)
            await client.query('delete from material_fund_relations where material_id=$1', [id]);
        await insertMaterialRelations(client, id, { ...relationships, companies: [], investors: [] }, { dataOrigin: String(material.dataOrigin ?? 'user_input') });
        await client.query('update materials set project_id=$2,fund_id=$3,raw_project_label=$4 where id=$1', [id, selected[0].id, preserveLegacy ? material.fundId ?? selected[0].fundId : selected[0].fundId, selected[0].name]);
        const auditEvent = await insertAuditEvent(client, {
            module: '资料库',
            action: '调整项目关联',
            targetType: '资料',
            targetId: id,
            targetName: material.name,
            actor: actor.name,
            detail: `项目关联从 [${previousProjectIds.join(', ')}] 调整为 [${projectIds.join(', ')}]`,
            source: '用户上传',
            dataOrigin: 'user_input',
            time: new Date().toISOString()
        });
        return { material: (await queryMaterialById(client, id))!, auditEvent };
    })),
    listMaterials: () => runWithClient((client) => queryMaterials(client)),
    searchMaterialTextChunks: (input) => runWithClient((client) => queryMaterialTextChunks(client, input)),
    archiveMaterial: (input) =>
      runWithClient((client) =>
        inTransaction(client, async () => {
          const project = await queryProjectMeta(client, input.project);
          const materialId = nextId("material", input.name);
          const ownerUserId = await resolveUserId(client, input.uploader);
          const fundId = input.fundId ?? project?.fundId ?? null;
          const projectId = input.projectId ?? project?.id ?? null;
          const materialPath = input.path ?? inferMaterialPath(input.name, input.type, input.source);
          const archivePath = input.archivePath ?? materialPath;
          const dataOrigin = String(input.dataOrigin ?? "user_input");
          await client.query(
            `
              insert into materials (
                id, fund_id, project_id, company_id, raw_project_label, name, category, owner_user_id,
                archived_at, path, archive_path, original_file_path, preview_file_path, recognized_text_path,
                recognized_html_path, page_image_manifest_path, page_image_dir,
                source, status, citation_count, primary_scope, source_material_id, file_extension,
                size_bytes, sha256, data_origin
              )
              values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
            `,
            [
              materialId,
              fundId,
              projectId,
              input.companyId ?? null,
              input.project,
              input.name,
              input.type,
              ownerUserId,
              input.time,
              materialPath,
              archivePath,
              input.originalFilePath ?? null,
              input.previewFilePath ?? null,
              input.recognizedTextPath ?? null,
              input.recognizedHtmlPath ?? null,
              input.pageImageManifestPath ?? null,
              input.pageImageDir ?? null,
              input.source,
              input.status,
              Number.parseInt(input.quotes, 10) || 0,
              input.primaryScope ?? (projectId ? "project" : fundId ? "fund" : "unassigned"),
              input.sourceMaterialId ?? null,
              input.fileExtension ?? null,
              input.sizeBytes ?? null,
              input.sha256 ?? null,
              dataOrigin,
            ],
          );
          await insertMaterialRelations(client, materialId, input.relationships, {
            fundId,
            projectId,
            companyId: input.companyId ?? null,
            primaryScope: input.primaryScope,
            dataOrigin,
          });

          const material = await queryMaterialById(client, materialId);
          if (!material) throw new Error("material_insert_failed");

          const auditEvent = await insertAuditEvent(client, {
            module: "AI 收件箱",
            action: "确认资料归档",
            targetType: "资料",
            targetId: material.id,
            targetName: material.name,
            actor: material.uploader,
            detail: `确认归档到 ${material.path}。`,
            source: material.source,
          });

          return { material, auditEvent };
        }),
      ),
    listReports: () => runWithClient((client) => queryReports(client)),
    listReportExports: () => runWithClient((client) => queryReportExports(client)),
    createReport: (input) =>
      runWithClient((client) =>
        inTransaction(client, async () => {
          const target = resolveReportTarget(input, await queryProjects(client), await queryFunds(client));
          const reportId = input.id ?? nextId("report", input.name);
          const ownerUserId = await resolveUserId(client, input.owner);

          await client.query(
            `
              insert into reports (id, fund_id, project_id, name, target, type, status, owner_user_id, updated_at, data_origin,content_sections,created_by_user_id)
              values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'user_input',$10::jsonb,$11)
            `,
            [
              reportId,
              target.fundId,
              target.projectId,
              input.name,
              target.target,
              input.type,
              input.status,
              ownerUserId,
              input.updatedAt,
              JSON.stringify(input.sections??[]),input.createdById??null,
            ],
          );

          const report = await queryReportById(client, reportId);
          if (!report) throw new Error("report_insert_failed");

          const auditEvent = await insertAuditEvent(client, {
            module: "报告中心",
            action: "保存报告草稿",
            targetType: "报告",
            targetId: report.id,
            targetName: report.name,
            actor: input.owner,
            detail: `保存${report.type}，目标对象 ${report.target}。`,
            source: "报告生成流程",
          });

          return { report:{...report,owner:input.owner}, auditEvent };
        }),
      ),
    saveReportContent:(id,sections,expectedUpdatedAt,actor,templateSnapshot)=>runWithClient(client=>inTransaction(client,async()=>{
      const current=(await client.query('select * from reports where id=$1 for update',[id])).rows[0];if(!current)return null;
      const report=await queryReportById(client,id);if(!report)return null;if(report.updatedAt!==expectedUpdatedAt)throw new WorkflowError('report_revision_conflict',409);
      await client.query("update reports set content_sections=$2::jsonb,template_snapshot=coalesce($3::jsonb,template_snapshot),status='草稿',updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=$1",[id,JSON.stringify(sections),templateSnapshot?JSON.stringify(templateSnapshot):null]);
      await insertAuditEvent(client,{module:'报告中心',action:'保存报告正文',targetType:'报告',targetId:id,targetName:report.name,actor:actor.name,detail:JSON.stringify({actorId:actor.id,sections,templateSnapshot:(templateSnapshot??report.templateSnapshot)?{id:(templateSnapshot??report.templateSnapshot)!.id,version:(templateSnapshot??report.templateSnapshot)!.version,sourceMaterialId:(templateSnapshot??report.templateSnapshot)!.sourceMapping?.materialId,sourceVersionId:(templateSnapshot??report.templateSnapshot)!.sourceMapping?.versionId}:undefined}),source:'正文编辑'});return queryReportById(client,id);
    })),
    approveReport: (id,actor={id:'legacy-reviewer',name:'未指定审核人'},expectedUpdatedAt) =>
      runWithClient((client) =>
        inTransaction(client, async () => {
          const locked=await client.query('select id from reports where id=$1 for update',[id]);if(!locked.rows[0])return null;
          const current=await queryReportById(client,id);if(!current)return null;
          if(expectedUpdatedAt!==undefined&&current.updatedAt!==expectedUpdatedAt)throw new WorkflowError('report_revision_conflict',409);
          assertReportReady(current);
          const update = await client.query("update reports set status = '已完成', last_approval_by_user_id=$2, updated_at = greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id = $1 returning id", [id,actor.id]);
          if (!update.rows[0]) return null;

          const report = await queryReportById(client, id);
          if (!report) return null;

          const auditEvent = await insertAuditEvent(client, {
            module: "报告中心",
            action: "审核通过报告",
            targetType: "报告",
            targetId: report.id,
            targetName: report.name,
            actor: actor.name,
            detail: `${report.type}已由${actor.name}审核通过，进入可导出状态。`,
            source: report.target,
          });

          return { report, auditEvent };
        }),
      ),
    exportReport: (id, format = "PDF",actor={id:'legacy-reviewer',name:'演示财务经理'}) =>
      runWithClient((client) =>
        inTransaction(client, async () => {
          await client.query('select id from reports where id=$1 for update',[id]);
          const currentReport = await queryReportById(client, id);
          if (!currentReport) return null;

          if(currentReport.status!=='已完成')throw new WorkflowError('report_not_approved',409);
          assertReportReady(currentReport);

          const report = await queryReportById(client, id);
          if (!report) return null;

          const extension = format.toLowerCase();
          const fileName = `${report.name.replace(/\s+/g, "-")}.${extension}`;
          const exportId = nextId("export", report.name);
          const actorUserId = await resolveUserId(client, actor.name);

          await client.query(
            `
              insert into report_exports (
                id, report_id, report_name, file_name, download_file_name, download_mime_type,
                format, exported_at, actor_user_id, watermark, sources, data_origin,sections_snapshot,actor_label
              )
              values ($1,$2,$3,$4,$5,$6,$7,now(),$8,$9,$10::jsonb,'system_generated',$11::jsonb,$12)
            `,
            [
              exportId,
              report.id,
              report.name,
              fileName,
              fileName,
              format==='PDF'?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              format,
              actorUserId,
              `内部材料 / ${actor.name} / ${await queryNowLabel(client)}`,
              JSON.stringify(["报告中心", "资料库", "审计日志"]),
              JSON.stringify(report.sections??[]),
              actor.name,
            ],
          );

          const exportRecord = await queryReportExportById(client, exportId);
          if (!exportRecord) throw new Error("report_export_insert_failed");

          const auditEvent = await insertAuditEvent(client, {
            module: "报告中心",
            action: "生成报告导出包",
            targetType: "报告",
            targetId: report.id,
            targetName: report.name,
            actor: actor.name,
            detail: `生成正式文件：${exportRecord.downloadFileName}；目标格式：${format}。`,
            source: "报告中心",
          });

          return { report, exportRecord, auditEvent };
        }),
      ),
    listCapitalRecords: () => runWithClient((client) => queryCapitalRecords(client)),
    createCapitalRecord: (input,actor) => runWithClient(client=>inTransaction(client,async()=>{
      validateCapitalReceipt(input);
      const fund=input.fundId?await queryFundMeta(client,input.fundId):await queryFundMetaByDisplayName(client,input.fund);
      if(input.fundId&&!fund)throw new WorkflowError('fund_not_found',404);
      const project=resolveCapitalProject(await queryProjects(client),input),fundId=input.fundId??fund?.id??project?.fundId;
      if(!fundId)throw new WorkflowError('fund_not_found',404);
      const capitalId=input.id??nextId('capital',`${input.company}-${input.date}`),canonical={...input,fundId,projectId:project?.id??null,source:input.source??'人工创建',confirmationStatus:'待确认'};
      await client.query('select pg_advisory_xact_lock(hashtext($1))',['capital-create:'+capitalId]);
      const prior=await queryCapitalRecordById(client,capitalId);
      if(prior){const original=await queryCurrentCapitalAudit(client,capitalId,'创建资金事项');if(!sameCapitalCreate(prior as unknown as Record<string,unknown>,canonical as unknown as Record<string,unknown>)||!original)throw new WorkflowError('capital_request_conflict',409);return {capitalRecord:prior,auditEvent:original};}
      await client.query(`insert into capital_records(id,fund_id,project_id,company,received_label,received_date,rule,receivable_label,due_date,status,source,confirmation_status,updated_at,data_origin,created_by_user_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now(),'user_input',$13)`,[capitalId,fundId,canonical.projectId,input.company,input.received,input.date||null,input.rule,input.receivable,input.dueDate,input.status,canonical.source,canonical.confirmationStatus,actor?.id??null]);
      const capitalRecord=(await queryCapitalRecordById(client,capitalId))!;
      const auditEvent=await insertAuditEvent(client,{module:'资金事项',action:'创建资金事项',targetType:'资金',targetId:capitalId,targetName:capitalRecord.company,actor:actor?.name??'演示投资经理',...(actor?{actorUserId:await capitalActorId(client,actor.id)}:{}),time:capitalRecord.updatedAt,detail:JSON.stringify({actorId:actor?.id??null,statement:'人工创建资金事项，不代表银行收付或基金账户同步。',received:capitalRecord.received,receivable:capitalRecord.receivable}),source:capitalRecord.source});
      return {capitalRecord,auditEvent};
    })),
    updateCapitalRecord:(id,input,expectedUpdatedAt,actor)=>runWithClient(client=>inTransaction(client,async()=>{
      validateCapitalReceipt(input);await client.query('select id from capital_records where id=$1 for update',[id]);
      const current=await queryCapitalRecordById(client,id);if(!current)throw new WorkflowError('capital_record_not_found',404);
      const keys=['fundId','projectId','company','received','date','rule','receivable','dueDate','status'] as const;
      if(current.updatedAt!==expectedUpdatedAt){if(keys.every(k=>current[k]===input[k]))return current;throw new WorkflowError('capital_revision_conflict',409);}
      if(!await queryFundMeta(client,input.fundId)||input.projectId&&!await queryProjectMetaById(client,input.projectId))throw new WorkflowError('capital_relation_not_found',404);
      await client.query("update capital_records set fund_id=$2,project_id=$3,company=$4,received_label=$5,received_date=$6,rule=$7,receivable_label=$8,due_date=$9,status=$10,confirmation_status='待确认',updated_at=greatest(now(),updated_at+interval '1 microsecond') where id=$1",[id,input.fundId,input.projectId??null,input.company,input.received,input.date||null,input.rule,input.receivable,input.dueDate,input.status]);
      const result=(await queryCapitalRecordById(client,id))!;await insertAuditEvent(client,{module:'资金事项',action:'编辑资金事项',targetType:'资金',targetId:id,targetName:result.company,actor:actor.name,actorUserId:await capitalActorId(client,actor.id),time:result.updatedAt,detail:JSON.stringify({actorId:actor.id,before:current,after:result}),source:'人工维护资金事项'});return result;
    })),
    confirmCapitalRecord:(id,actor)=>runWithClient(client=>inTransaction(client,async()=>{
      await client.query('select id from capital_records where id=$1 for update',[id]);const pending=await queryCapitalRecordById(client,id);if(!pending)return null;requireCapitalReceipt(pending);
      if(pending.status==='已收'&&pending.confirmationStatus?.endsWith(' 已确认')){const original=await queryCurrentCapitalAudit(client,id,'确认管理费到账');if(!original)throw new WorkflowError('capital_confirmation_unverifiable',409);return {capitalRecord:pending,auditEvent:original};}
      await client.query("update capital_records set status='已收',confirmation_status=$2,last_approval_by_user_id=$3,updated_at=greatest(now(),updated_at+interval '1 microsecond') where id=$1",[id,actor?actor.name+' 已确认':'AI 已确认',actor?.id??null]);
      const capitalRecord=(await queryCapitalRecordById(client,id))!;
      const auditEvent=await insertAuditEvent(client,{module:'资金事项',action:'确认管理费到账',targetType:'资金',targetId:id,targetName:capitalRecord.company,actor:actor?.name??'财务',...(actor?{actorUserId:await capitalActorId(client,actor.id)}:{}),time:capitalRecord.updatedAt,detail:JSON.stringify({actorId:actor?.id??null,statement:'仅登记本事项的人工确认，不代表银行收付或基金账户同步。',received:capitalRecord.received,date:capitalRecord.date}),source:capitalRecord.fund});return {capitalRecord,auditEvent};
    })),
    listRisks:()=>runWithClient(async client=>withPurposes(client,(await client.query(`select r.*, to_char(r.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as record_created_at,to_char(r.time at time zone 'Asia/Shanghai','YYYY-MM-DD') as time_label,to_char(r.updated_at at time zone 'Asia/Shanghai','YYYY-MM-DD HH24:MI') as updated_at_label from risks r order by r.created_at desc nulls last,r.id collate "C" asc`)).rows.map(mapRiskRow),'risk')),
    handleRisk: (input) =>
      runWithClient((client) =>
        inTransaction(client, async () => {
          const project =
            input.projectId ? await queryProjectMetaById(client, input.projectId) : await queryProjectMeta(client, input.target ?? input.title);
          const riskId = await upsertHandledRisk(client, {
            ...input,
            projectId: input.projectId ?? project?.id ?? null,
          });
          const risk = await queryRiskById(client, riskId);
          if (!risk) throw new Error("risk_handle_failed");

          const auditEvent = await insertAuditEvent(client, {
            module: "风险监控",
            action: "确认风险处理",
            targetType: risk.projectId ? "项目" : "风险",
            targetId: risk.projectId ?? risk.id,
            targetName: risk.title,
            actor: input.actor ?? project?.manager ?? "投后负责人",
            detail: `${risk.summary} 处理结果：${input.result}`,
            source: risk.source,
          });

          return { risk, auditEvent };
        }),
      ),
    listAiIntakeItems: () => runWithClient((client) => queryAiIntakeItems(client)),
    updateAiIntakeSuggestion: (id, patch) =>
      runWithClient((client) =>
        inTransaction(client, async () => {
          await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))',['workflow']);
          const before=await queryAiIntakeItemById(client,id);if(!before)return null;
          if(before.status!=="待确认")throw new WorkflowError("ai_intake_state_changed",409);
          const fund = await queryAiFund(client,patch);
          const project = await queryProjectMeta(client, patch.suggestedProject);
          const update = await client.query(
            `
              update ai_intake_items
              set suggested_fund_id = $1,
                suggested_project_id = $2,
                suggested_project_label = $3,
                suggested_path = $4,
                status = '待确认',
                review_note = '已人工修改归档建议，等待确认。',
                updated_at = now()
              where id = $5
              returning id
            `,
            [fund?.id ?? null, project?.id ?? null, patch.suggestedProject, patch.suggestedPath, id],
          );
          if (!update.rows[0]) return null;

          const item = await queryAiIntakeItemById(client, id);
          if (!item) return null;
          const auditEvent = await insertAuditEvent(client, {
            module: "AI 收件箱",
            action: "修改归档建议",
            targetType: "资料",
            targetId: item.id,
            targetName: item.title,
            actor: item.submittedBy,
            detail: `人工修改归属为 ${item.suggestedFund} / ${item.suggestedProject} / ${item.suggestedPath}。`,
            source: item.source,
          });
          return { item, auditEvent };
        }),
      ),
    rejectAiIntakeItem: (id, reviewNote) =>
      runWithClient((client) =>
        inTransaction(client, async () => {
          await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))',['workflow']);
          const before=await queryAiIntakeItemById(client,id);if(!before)return null;
          if(before.status!=="待确认")throw new WorkflowError("ai_intake_state_changed",409);
          const update = await client.query(
            `
              update ai_intake_items
              set status = '已退回', review_note = $1, updated_at = now()
              where id = $2 and status = '待确认'
              returning id
            `,
            [reviewNote, id],
          );
          if (!update.rows[0]) return null;

          const item = await queryAiIntakeItemById(client, id);
          if (!item) return null;
          const auditEvent = await insertAuditEvent(client, {
            module: "AI 收件箱",
            action: "退回归档建议",
            targetType: "资料",
            targetId: item.id,
            targetName: item.title,
            actor: item.submittedBy,
            detail: reviewNote,
            source: item.source,
          });
          return { item, auditEvent };
        }),
      ),
    createAiIntakeItem: (input) =>
      runWithClient((client) =>
        inTransaction(client, async () => {
          await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))',['workflow']);
          if(input.sourceMaterialId){ const prior=await queryAiIntakeItemById(client,input.id); if(prior)return {item:prior,auditEvent:(await queryAuditEvents(client)).find(e=>e.targetId===prior.id)!}; }
          if(input.sourceMaterialId){const source=await queryMaterialById(client,input.sourceMaterialId);if(!source||source.currentVersionId!==input.sourceVersionId)throw new WorkflowError("ai_intake_source_changed",409);}
          const fund = await queryAiFund(client,input);
          const project = await queryProjectMeta(client, input.suggestedProject);
          const submittedByUserId = input.ownerId
            ? (await client.query('select id from users where id = $1',[input.ownerId])).rows[0]?.id as string|undefined ?? null
            : await resolveUserId(client, input.submittedBy);
          if(input.ownerId && !submittedByUserId && input.ownerId!=='user-admin')throw new WorkflowError('actor_unavailable',409);
          await client.query(
            `
              insert into ai_intake_items (
                id, title, input_type, source, submitted_by_user_id, submitted_at, summary,
                confidence, suggested_fund_id, suggested_project_id, suggested_project_label,
                suggested_path, extracted, generated_tasks, status, review_note, updated_at, data_origin, submitted_by_actor_id, submitted_by_name_label, source_material_id, source_version_id, source_basis
              )
              values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15,$16,now(),$17,$18,$19,$20,$21,$22::jsonb)
              on conflict (id) do update set
                title = excluded.title,
                input_type = excluded.input_type,
                source = excluded.source,
                submitted_by_user_id = ai_intake_items.submitted_by_user_id,
                submitted_at = excluded.submitted_at,
                summary = excluded.summary,
                confidence = excluded.confidence,
                suggested_fund_id = excluded.suggested_fund_id,
                suggested_project_id = excluded.suggested_project_id,
                suggested_project_label = excluded.suggested_project_label,
                suggested_path = excluded.suggested_path,
                extracted = excluded.extracted,
                generated_tasks = excluded.generated_tasks,
                status = excluded.status,
                review_note = excluded.review_note,
                data_origin = ai_intake_items.data_origin,
                updated_at = now()
            `,
            [
              input.id,
              input.title,
              input.inputType,
              input.source,
              submittedByUserId,
              input.submittedAt,
              input.summary,
              input.confidence,
              fund?.id ?? null,
              project?.id ?? null,
              input.suggestedProject,
              input.suggestedPath,
              JSON.stringify(input.extracted),
              JSON.stringify(input.generatedTasks),
              input.status ?? "待确认",
              input.reviewNote ?? null,
              normalizeDataOrigin(input.dataOrigin),
              input.ownerId ?? submittedByUserId,
              input.submittedBy,
              input.sourceMaterialId??null, input.sourceVersionId??null, JSON.stringify(input.sourceBasis??[]),
            ],
          );
          const item = await queryAiIntakeItemById(client, input.id);
          if (!item) throw new Error("ai_intake_insert_failed");
          const auditEvent = await insertAuditEvent(client, {
            module: "AI 收件箱",
            action: "创建收件草稿",
            targetType: "资料",
            targetId: item.id,
            targetName: item.title,
            actor: item.submittedBy,
            actorUserId:submittedByUserId,
            detail: `解析${item.inputType}，生成归档建议：${item.suggestedPath}。`,
            source: item.source,
          });
          return { item, auditEvent };
        }),
      ),
    archiveAiIntakeItem: (id, sessionActor) =>
      runWithClient((client) =>
        inTransaction(client, async () => {
          await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))',['workflow']);
          const item = await queryAiIntakeItemById(client, id);
          if (!item) return null;
          if(!["待确认","已归档"].includes(item.status))throw new WorkflowError("ai_intake_state_changed",409);
          const fund = await queryAiFund(client,item);
          if (!fund) return null;
          const project = await queryProjectMeta(client, item.suggestedProject);
          if(item.status==='已归档') {
            const fundDocument=await queryFundDocumentById(client,`document-ai-${item.id}`);
            const material=await queryMaterialById(client,item.sourceMaterialId ?? `material-ai-${item.id}`);
            if(fundDocument && material) return {item,fundDocument,material,tasks:project?(await queryTasks(client,project.id)).filter(task=>task.id.startsWith(`ai-${item.id}-`)):[],auditEvents:[]};
          }
          const ownerUserId = item.ownerId ? (await client.query('select id from users where id = $1',[item.ownerId])).rows[0]?.id as string|undefined ?? null : await resolveUserId(client, item.submittedBy);
          const archivedDate = item.submittedAt.slice(0, 10);
          const documentId = `document-ai-${item.id}`;
          const sourceMaterial=item.sourceMaterialId?await queryMaterialById(client,item.sourceMaterialId):null;
          if(item.sourceMaterialId && (!sourceMaterial || sourceMaterial.currentVersionId!==item.sourceVersionId))throw new WorkflowError("ai_intake_source_changed",409);
          if(sourceMaterial && ((sourceMaterial.fundId??null)!==fund.id || (sourceMaterial.projectId??null)!==(project?.id??null)))throw new WorkflowError("ai_intake_scope_change_required",409);
          const documentName = sourceMaterial?.name ?? `${item.title}.${documentExtensionForAiIntake(item.inputType)}`;

          await client.query(
            `
              insert into fund_documents (id, fund_id, name, category, owner_user_id, archived_at, path, data_origin, source_basis)
              values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
              on conflict (id) do update set
                fund_id = excluded.fund_id,
                name = excluded.name,
                category = excluded.category,
                owner_user_id = excluded.owner_user_id,
                archived_at = excluded.archived_at,
                path = excluded.path,
                data_origin = excluded.data_origin,
                source_basis = excluded.source_basis
            `,
            [documentId, fund.id, documentName, item.inputType, ownerUserId, archivedDate, item.suggestedPath,normalizeDataOrigin(item.dataOrigin),JSON.stringify(sourceBasisOf(item,'intake',''))],
          );

          const materialId = item.sourceMaterialId ?? `material-ai-${item.id}`;
          if(sourceMaterial)await client.query("update materials set path=$2,archive_path=$2 where id=$1",[sourceMaterial.id,item.suggestedPath]);
          if(!sourceMaterial) await client.query(
            `
              insert into materials (
                id, fund_id, project_id, raw_project_label, name, category, owner_user_id,
                archived_at, path, source, status, citation_count, data_origin, source_basis
              )
              values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
              on conflict (id) do update set
                fund_id = excluded.fund_id,
                project_id = excluded.project_id,
                raw_project_label = excluded.raw_project_label,
                name = excluded.name,
                category = excluded.category,
                owner_user_id = excluded.owner_user_id,
                archived_at = excluded.archived_at,
                path = excluded.path,
                source = excluded.source,
                status = excluded.status,
                citation_count = excluded.citation_count,
                data_origin = excluded.data_origin,
                source_basis = excluded.source_basis
            `,
            [
              materialId,
              fund.id,
              project?.id ?? null,
              item.suggestedProject,
              documentName,
              materialCategoryForAiIntake(item.inputType),
              ownerUserId,
              archivedDate,
              item.suggestedPath,
              `AI 收件箱 / ${item.source}`,
              "已摘要",
              item.extracted.length,
              normalizeDataOrigin(item.dataOrigin),
              JSON.stringify(sourceBasisOf(item,'intake','')),
            ],
          );

          const tasks=project?(await queryTasks(client,project.id)).filter(task=>task.id.startsWith(`ai-${item.id}-`)):[];

          await client.query("update ai_intake_items set status = '已归档', review_note = null, updated_at = now() where id = $1", [item.id]);

          const archivedItem = await queryAiIntakeItemById(client, item.id);
          const fundDocument = await queryFundDocumentById(client, documentId);
          const material = await queryMaterialById(client, materialId);
          if (!archivedItem || !fundDocument || !material) throw new Error("ai_intake_archive_failed");

          const materialAudit = await insertAuditEvent(client, {
            module: "AI 收件箱",
            action: "确认资料归档",
            targetType: "资料",
            targetId: material.id,
            targetName: material.name,
            actor: sessionActor?.name ?? item.submittedBy,
            detail: `确认归档到 ${material.path}。`,
            source: material.source,
          });
          const taskAudits = await Promise.all(
            tasks.map((task) =>
              insertAuditEvent(client, {
                module: "任务中心",
                action: "创建任务",
                targetType: "项目",
                targetId: task.projectId,
                targetName: project?.name ?? task.projectId,
                actor: sessionActor?.name ?? task.owner,
                detail: `创建${task.type}任务 ${task.id}：${task.name}，负责人 ${task.owner}，截止 ${task.dueDate}。`,
                source: task.relation,
              }),
            ),
          );
          const intakeAudit = await insertAuditEvent(client, {
            module: "AI 收件箱",
            action: "确认 AI 收件箱归档",
            targetType: "基金",
            targetId: fund.id,
            targetName: item.title,
            actor: sessionActor?.name ?? item.submittedBy,
            detail: `确认归档到 ${item.suggestedPath}，并生成 ${tasks.length} 条建议任务。`,
            source: item.source,
          });
          return { item: archivedItem, fundDocument, material, tasks, auditEvents: [materialAudit, ...taskAudits, intakeAudit] };
        }),
      ),
    createMeeting: (meeting,actor) => runWithClient(client=>inTransaction(client,async()=>{
      await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['meeting:'+meeting.id]);
      const prior=await queryMeetingById(client,meeting.id,true);
      if(prior){if(prior.deletedAt)throw new WorkflowError('meeting_deleted',409);if(!sameMeeting(prior,meeting))throw new WorkflowError('meeting_request_conflict',409);return prior;}
      await client.query(`insert into meetings(id,project_id,raw_project_label,title,date,attendees,status,summary,conclusions,todo_items,risk_items,todos_count,risks_count,data_origin,task_due_date,schedule_status,starts_at,ends_at,created_by_user_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13,$14,$15,$16,$17,$18,$19)`,[meeting.id,meeting.projectId,meeting.project,meeting.title,meeting.date,meeting.attendees,'待确认',meeting.summary,JSON.stringify(meeting.conclusions),JSON.stringify(meeting.todoItems),JSON.stringify(meeting.riskItems),meeting.todos,meeting.risks,'user_input',meeting.taskDueDate??null,meeting.scheduleStatus??'unknown',meeting.startsAt??null,meeting.endsAt??null,actor.id]);
      await insertAuditEvent(client,{module:'会议纪要',action:'新建会议纪要',targetType:'项目',targetId:meeting.projectId!,targetName:meeting.title,actor:actor.name,detail:'保存待确认纪要，尚未归档或生成任务。',source:'会议纪要'});
      return (await queryMeetingById(client,meeting.id))!;
    })),
    updateMeeting:(id,input,expectedRevision,actor)=>runWithClient(client=>inTransaction(client,async()=>{await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['workflow']);const current=await queryMeetingById(client,id);if(!current)throw new WorkflowError('meeting_not_found',404);if(current.status==='已归档'&&!sameMeetingMinutes(current,input))throw new WorkflowError('archived_meeting_readonly',409);if((current.revision??1)===expectedRevision+1&&sameMeeting(current,input))return current;if((current.revision??1)!==expectedRevision)throw new WorkflowError('meeting_revision_conflict',409);await client.query('update meetings set project_id=$2,raw_project_label=$3,title=$4,date=$5,attendees=$6,summary=$7,conclusions=$8::jsonb,todo_items=$9::jsonb,risk_items=$10::jsonb,todos_count=$11,risks_count=$12,task_due_date=$13,schedule_status=$14,starts_at=$15,ends_at=$16,revision=revision+1,updated_at=now() where id=$1',[id,input.projectId,input.project,input.title,input.date,input.attendees,input.summary,JSON.stringify(input.conclusions),JSON.stringify(input.todoItems),JSON.stringify(input.riskItems),input.todos,input.risks,input.taskDueDate??null,input.scheduleStatus??'unknown',input.startsAt??null,input.endsAt??null]);await insertAuditEvent(client,{module:'会议纪要',action:sameMeetingMinutes(current,input)?'调整会议安排':'编辑会议纪要',targetType:'项目',targetId:input.projectId!,targetName:input.title,actor:actor.name,detail:sameMeetingMinutes(current,input)?JSON.stringify({before:{scheduleStatus:current.scheduleStatus,startsAt:current.startsAt,endsAt:current.endsAt},after:{scheduleStatus:input.scheduleStatus,startsAt:input.startsAt,endsAt:input.endsAt}}):'编辑待确认会议内容，尚未归档或生成任务。',source:'会议纪要'});return(await queryMeetingById(client,id))!;})),
    listMeetings: (deletedOnly=false) => runWithClient((client) => queryMeetings(client,{deletedOnly})),
    setMeetingDeleted:(id,deleted,input,actor)=>runWithClient(client=>inTransaction(client,async()=>{
      await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))',['workflow']);
      const fingerprint=JSON.stringify({id,deleted,...input,actorId:actor.id}),prior=(await client.query('select fingerprint,result from master_write_requests where request_id=$1',[input.requestId])).rows[0];
      if(prior){if(prior.fingerprint!==fingerprint)throw new WorkflowError('meeting_request_conflict',409);return prior.result as Meeting;}
      const current=await queryMeetingById(client,id,true);if(!current)throw new WorkflowError('meeting_not_found',404);
      const result=meetingVisibility(current,deleted,input.expectedRevision,actor);
      await client.query('update meetings set deleted_at=$2,deleted_by=$3,revision=$4,updated_at=now() where id=$1',[id,result.deletedAt??null,result.deletedBy??null,result.revision]);
      const registered=(await client.query('select id from users where id=$1',[actor.id])).rows[0];
      await insertAuditEvent(client,{module:'会议纪要',action:deleted?'删除会议纪要':'恢复会议纪要',targetType:current.projectId?'项目':'会议纪要',targetId:current.projectId??id,targetName:current.title,actor:actor.name,actorUserId:typeof registered?.id==='string'?registered.id:null,detail:deleted?'移入最近删除，关联任务、资料和历史记录保留。':'从最近删除恢复，关联任务和资料未重复生成。',source:`会议纪要:${id}`});
      await client.query('insert into master_write_requests(request_id,fingerprint,result) values($1,$2,$3::jsonb)',[input.requestId,fingerprint,JSON.stringify(result)]);return result;
    })),
    confirmMeeting: (id, sessionActor, expectedRevision, storageRoot) => meetingFileTransaction(storageRoot, stage =>
      runWithClient((client) =>
        inTransaction(client, async () => {
          await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))',['workflow']);
          const meeting = await queryMeetingById(client, id);
          if (!meeting) return null;
          if(expectedRevision!==undefined&&(meeting.revision??1)!==expectedRevision&&!(meeting.status==='已归档'&&(meeting.revision??1)===expectedRevision+1))throw new WorkflowError('meeting_revision_conflict',409);
          const project = meeting.projectId ? await queryProjectMetaById(client, meeting.projectId) : await queryProjectMeta(client, meeting.project);
          if(meeting.status==='已归档') {
            const material=await queryMaterialById(client,`material-meeting-${meeting.id}`);
            if(material) return {meeting,material,tasks:project?(await queryTasks(client,project.id)).filter(task=>meeting.dataOrigin==='user_input'?task.id.startsWith(`meeting-${project.id}-${meeting.id}-`):task.relation===`会议纪要 / ${meeting.title}`):[],auditEvents:[]};
          }
          if(meeting.status==='已归档')throw new WorkflowError('meeting_archive_unavailable',409);
          const actor = sessionActor?.name ?? project?.manager ?? '未指定确认人';
          const actorUserId = await resolveUserId(client, actor);
          const materialId = `material-meeting-${meeting.id}`;
          const version = await stage(meeting,sessionActor??{id:actorUserId??'',name:actor});
          const archivedDate = await queryTodayLabel(client);

          await client.query(
            `
              insert into materials (
                id, fund_id, project_id, raw_project_label, name, category, owner_user_id,
                archived_at, path, source, status, citation_count, data_origin, source_basis
              )
              values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
            `,
            [
              materialId,
              project?.fundId ?? null,
              project?.id ?? null,
              meeting.project,
              `${meeting.title}.docx`,
              "会议资料",
              actorUserId,
              archivedDate,
              "项目档案 / 会议纪要 / 投后沟通",
              "会议纪要",
              "已摘要",
              meeting.conclusions.length + meeting.todoItems.length + meeting.riskItems.length,
              normalizeDataOrigin(meeting.dataOrigin),
              JSON.stringify(sourceBasisOf(meeting,'meeting','')),
            ],
          );

          await client.query(`update materials set original_file_path=$2,size_bytes=$3,sha256=$4,file_extension='docx',current_version=1,current_version_id=$5,source='会议纪要生成' where id=$1`,[materialId,`api/materials/${materialId}/versions/${version.id}/file`,version.sizeBytes,version.sha256,version.id]);

          const tasks = project
            ? await Promise.all(
                meeting.todoItems.map((taskName, index) =>
                  upsertTaskWithoutAudit(client, {
                    id: meeting.dataOrigin==='user_input'?`meeting-${project.id}-${meeting.id}-${index + 1}`:`meeting-${project.id}-${index + 1}`,
                    dataOrigin:normalizeDataOrigin(meeting.dataOrigin),
        sourceBasis:sourceBasisOf(meeting,'meeting',''),
                    projectId: project.id,
                    name: `跟进${taskName}`,
                    type: "会议待办",
                    stage: project.stage,
                    owner: project.manager,
                    ownerId: project.ownerId??undefined,
                    dueDate: meeting.taskDueDate ?? "2026-06-12",
                    status: "未开始",
                    priority: meeting.risks > 0 ? "高" : "中",
                    relation: `会议纪要 / ${meeting.title}`,
                    note: `由${meeting.title}确认归档后生成。会议风险点：${meeting.riskItems.join("、") || "无"}`,
                  }),
                ),
              )
            : [];

          await client.query("update meetings set revision=revision+case when status='已归档' then 0 else 1 end,status = '已归档', last_approval_by_user_id=$2, updated_at = now() where id = $1", [meeting.id,sessionActor?.id??null]);
          const updatedMeeting = await queryMeetingById(client, meeting.id);
          const material = await queryMaterialById(client, materialId);
          if (!updatedMeeting || !material) throw new Error("meeting_confirm_failed");

          const materialAudit = await insertAuditEvent(client, {
            module: "AI 收件箱",
            action: "确认资料归档",
            targetType: "资料",
            targetId: material.id,
            targetName: material.name,
            actor,
            detail: `确认归档到 ${material.path}。`,
            source: material.source,
          });
          await client.query(`insert into material_versions(id,material_id,version,name,size_bytes,sha256,mime_type,uploaded_by,uploaded_by_id,created_at,blob_id,request_id,fingerprint,audit_event_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,[version.id,materialId,1,version.name,version.sizeBytes,version.sha256,version.mimeType,version.uploadedBy,version.uploadedById,version.createdAt,version.blobId,version.requestId,version.fingerprint,materialAudit.id]);
          const taskAudits = await Promise.all(
            tasks.map((task) =>
              insertAuditEvent(client, {
                module: "任务中心",
                action: "创建任务",
                targetType: "项目",
                targetId: task.projectId,
                targetName: project?.name ?? task.projectId,
                actor: sessionActor?.name ?? task.owner,
                detail: `创建${task.type}任务 ${task.id}：${task.name}，负责人 ${task.owner}，截止 ${task.dueDate}。`,
                source: task.relation,
              }),
            ),
          );
          const meetingAudit = await insertAuditEvent(client, {
            module: "会议纪要",
            action: "确认会议纪要",
            targetType: project ? "项目" : "基金",
            targetId: project?.id ?? slugify(meeting.project),
            targetName: meeting.title,
            actor,
            detail: "会议纪要已归档到资料库，并绑定对应项目或基金。",
            source: "会议纪要",
          });
          return { meeting: updatedMeeting, material, tasks, auditEvents: [materialAudit, ...taskAudits, meetingAudit] };
        }),
      )),
    listAuditEvents: (projectId) => runWithClient((client) => queryAuditEvents(client, { projectId })),
  };
}

async function queryFunds(client: Queryable): Promise<Fund[]> {
  const result = await client.query(`
    select
      f.id, to_char(f.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as record_created_at,
      f.name,
      f.short_name,
      f.stage,
      f.manager_user_id,
      f.revision, f.custom_fields, f.schema_revision,
      coalesce(manager.name, f.manager_user_id, '未分配') as manager_name,
      f.scale_label,
      f.paid_in_label,
      f.invested_label,
      f.balance_label,
      f.next_action,
      f.data_origin,
      to_char(f.updated_at at time zone 'Asia/Shanghai', 'YYYY-MM-DD') as updated_at_label,
      count(distinct p.id)::int as project_count,
      count(distinct i.id)::int as investor_count,
      count(distinct t.id) filter (where t.status not in ('已完成','已取消'))::int as open_tasks,
      count(distinct r.id) filter (where r.status <> '已处理')::int as risk_count
    from funds f
    left join users manager on manager.id = f.manager_user_id
    left join projects p on p.fund_id = f.id
    left join fund_investors i on i.fund_id = f.id
    left join tasks t on t.project_id = p.id
    left join risks r on r.project_id = p.id
    group by f.id, manager.name
    order by f.created_at desc nulls last, f.id collate "C" asc
  `);
  return withPurposes(client,result.rows.map(mapFundRow),'fund');
}

async function queryFundById(client: Queryable, id: string): Promise<Fund | null> {
  return (await queryFunds(client)).find((fund) => fund.id === id) ?? null;
}

async function queryFundMeta(client: Queryable, id: string) {
  const result = await client.query(
    `
      select f.id, f.name, coalesce(u.name, f.manager_user_id, '基金运营') as manager
      from funds f
      left join users u on u.id = f.manager_user_id
      where f.id = $1
    `,
    [id],
  );
  return result.rows[0] as { id: string; name: string; manager: string } | undefined;
}

async function queryFundMetaByDisplayName(client: Queryable, value: string) {
  const result = await client.query(
    `
      select id, name
      from funds
      where id = $1 or name = $1 or short_name = $1
    `,
    [value],
  );
  const exactId=result.rows.find(r=>r.id===value);
  if(exactId)return exactId as {id:string;name:string};
  if(result.rows.length>1)throw new WorkflowError("fund_ambiguous",409);
  return result.rows[0] as { id: string; name: string } | undefined;
}

async function queryInvestors(client: Queryable, fundId: string): Promise<FundInvestor[]> {
  const result = await client.query(
    `
      select *, to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as record_created_at, to_char(updated_at at time zone 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI') as updated_at_label
      from fund_investors
      where fund_id = $1
      order by created_at desc nulls last, id collate "C" asc
    `,
    [fundId],
  );
  return withPurposes(client,result.rows.map(mapInvestorRow),'investor');
}

async function queryFundDocuments(client: Queryable, fundId: string): Promise<FundDocument[]> {
  const result = await client.query(
    `
      select d.*, to_char(d.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as record_created_at, coalesce(u.name, d.owner_user_id, '未分配') as owner_name,
        to_char(d.archived_at at time zone 'Asia/Shanghai', 'YYYY-MM-DD') as archived_at_label
      from fund_documents d
      left join users u on u.id = d.owner_user_id
      where d.fund_id = $1
      order by d.created_at desc nulls last, d.id collate "C" asc
    `,
    [fundId],
  );
  return withPurposes(client,result.rows.map(mapFundDocumentRow),'document');
}

async function queryFundDocumentById(client: Queryable, id: string): Promise<FundDocument | null> {
  const result = await client.query(
    `
      select d.*, to_char(d.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as record_created_at, coalesce(u.name, d.owner_user_id, '未分配') as owner_name,
        to_char(d.archived_at at time zone 'Asia/Shanghai', 'YYYY-MM-DD') as archived_at_label
      from fund_documents d
      left join users u on u.id = d.owner_user_id
      where d.id = $1
    `,
    [id],
  );
  return withPurposes(client,result.rows[0] ? mapFundDocumentRow(result.rows[0]) : null,'document');
}

async function queryFundClauses(client: Queryable, fundId: string): Promise<FundClause[]> {
  const result = await client.query(
    `
      select c.*, to_char(c.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as record_created_at, coalesce(u.name, c.owner_user_id, '未分配') as owner_name
      from fund_clause_monitors c
      left join users u on u.id = c.owner_user_id
      where c.fund_id = $1
      order by c.created_at desc nulls last, c.id collate "C" asc
    `,
    [fundId],
  );
  return withPurposes(client,result.rows.map(mapFundClauseRow),'clause');
}

async function queryProjects(client: Queryable, filters: { fundId?: string; projectIds?: string[] } = {}): Promise<Project[]> {
  const values: unknown[] = [];
  const where: string[] = [];
  if(filters.projectIds){values.push(filters.projectIds);where.push(`p.id=any($${values.length}::text[])`);}
  if (filters.fundId) {
    values.push(filters.fundId);
    where.push(`p.fund_id = $${values.length}`);
  }

  const result = await client.query(
    `
      select
        p.id, to_char(p.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as record_created_at,
        p.fund_id,
        p.company_id,
        p.master_revision, p.custom_fields, p.schema_revision,
        p.name,
        p.short_name,
        f.name as fund_name,
        p.industry,
        p.status,
        p.stage,
        coalesce(nullif(trim(manager.name), ''), nullif(trim(p.manager_label), ''), '未分配') as manager_name,
        p.manager_label,
        p.owner_actor_id,
        p.collaborators,
        p.source_channel,
        p.amount_label,
        p.risk_level,
        p.latest,
        p.description,
        p.thesis,
        p.next_action,
        p.data_origin,
        to_char(p.updated_at at time zone 'Asia/Shanghai', 'YYYY-MM-DD') as updated_at_label,
        count(distinct t.id) filter (where t.status not in ('已完成','已取消'))::int as todo_count
      from projects p
      join funds f on f.id = p.fund_id
      left join users manager on manager.id = p.manager_user_id
      left join tasks t on t.project_id = p.id
      ${where.length ? `where ${where.join(" and ")}` : ""}
      group by p.id, f.name, manager.name
      order by p.created_at desc nulls last, p.id collate "C" asc
    `,
    values,
  );
  return withPurposes(client,result.rows.map(mapProjectRow),'project');
}

async function queryProjectById(client: Queryable, id: string): Promise<Project | null> {
  return (await queryProjects(client)).find((project) => project.id === id) ?? null;
}

async function queryProjectMeta(client: Queryable, value: string) {
  const result = await client.query(
    `
      select p.id, p.fund_id as "fundId", p.name, p.short_name as "shortName", p.stage, coalesce(p.owner_actor_id,p.manager_user_id) as "ownerId", coalesce(nullif(trim(u.name), ''), nullif(trim(p.manager_label), ''), '未分配') as manager
      from projects p
      left join users u on u.id = p.manager_user_id
      where p.id = $1 or p.name = $1 or p.short_name = $1
      limit 1
    `,
    [value],
  );
  return result.rows[0] as { id: string; fundId: string; name: string; shortName: string; stage: string; manager: string; ownerId?: string | null } | undefined;
}

async function queryProjectMetaById(client: Queryable, id: string) {
  const result = await client.query(
    `
      select p.id, p.fund_id as "fundId", p.name, p.short_name as "shortName", p.stage, coalesce(p.owner_actor_id,p.manager_user_id) as "ownerId", coalesce(nullif(trim(u.name), ''), nullif(trim(p.manager_label), ''), '未分配') as manager
      from projects p
      left join users u on u.id = p.manager_user_id
      where p.id = $1
      limit 1
    `,
    [id],
  );
  return result.rows[0] as { id: string; fundId: string; name: string; shortName: string; stage: string; manager: string; ownerId?: string | null } | undefined;
}

async function queryProjectName(client: Queryable, id: string) {
  const result = await client.query("select name from projects where id = $1", [id]);
  return String(result.rows[0]?.name ?? id);
}

async function queryTasks(client: Queryable, projectId?: string): Promise<ProjectTask[]> {
  const result = await client.query(
    `
      select t.*, to_char(t.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as record_created_at, coalesce(u.name, t.owner_label, t.owner_user_id, '未分配') as owner_name,
        to_char(t.due_date, 'YYYY-MM-DD') as due_date_label,
        to_char(t.updated_at at time zone 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI') as updated_at_label
      from tasks t
      left join users u on u.id = t.owner_user_id
      ${projectId ? "where t.project_id = $1" : ""}
      order by t.created_at desc nulls last, t.id collate "C" asc
    `,
    projectId ? [projectId] : [],
  );
  return withPurposes(client,result.rows.map(mapTaskRow),'task');
}

async function queryTaskById(client: Queryable, id: string): Promise<ProjectTask | null> {
  const result = await client.query(
    `
      select t.*, to_char(t.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as record_created_at, coalesce(u.name, t.owner_label, t.owner_user_id, '未分配') as owner_name,
        to_char(t.due_date, 'YYYY-MM-DD') as due_date_label,
        to_char(t.updated_at at time zone 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI') as updated_at_label
      from tasks t
      left join users u on u.id = t.owner_user_id
      where t.id = $1
    `,
    [id],
  );
  return withPurposes(client,result.rows[0] ? mapTaskRow(result.rows[0]) : null,'task');
}

async function upsertTaskWithoutAudit(
  client: Queryable,
  input: Omit<ProjectTask, "updatedAt">,
): Promise<ProjectTask> {
  // Actor identity and display label survive when a configured account has no legacy users row.
  let ownerId=input.ownerId??null;
  if(!ownerId){const exact=await client.query('select id from users where name = $1 order by id asc limit 2',[input.owner]);if(exact.rows.length===1)ownerId=String(exact.rows[0].id);}
  await client.query(
    `
      insert into tasks (id, project_id, name, type, stage, owner_user_id, due_date, status, priority, relation, note, updated_at, data_origin, source_basis, owner_actor_id, owner_label)
      values ($1,$2,$3,$4,$5,(select id from users where id=$6),$7,$8,$9,$10,$11,now(),$12,$13::jsonb,$6,$14)
      on conflict (id) do nothing
    `,
    [
      input.id,
      input.projectId,
      input.name,
      input.type,
      input.stage,
      ownerId,
      input.dueDate,
      input.status,
      input.priority,
      input.relation,
      input.note,
      input.dataOrigin??"system_generated",
      JSON.stringify(input.sourceBasis??[]),
      input.owner,
    ],
  );
  const task = await queryTaskById(client, input.id);
  if (!task) throw new Error("task_upsert_failed");
  return task;
}

async function queryMaterials(client: Queryable, filters: { projectId?: string; projectName?: string; shortName?: string } = {}): Promise<Material[]> {
  const values: unknown[] = [];
  const where: string[] = [];
  if (filters.projectId) {
    values.push(filters.projectId);
    where.push(`(m.project_id=$1 or exists(select 1 from material_project_relations mr where mr.material_id=m.id and mr.project_id=$1))`);
  }

  const result = await client.query(
    `
      select m.*, to_char(m.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as record_created_at, exists(select 1 from lp_material_privacy lp where lp.material_id=m.id) as lp_sensitive, coalesce((select v.uploaded_by from material_versions v where v.id=m.current_version_id), u.name, m.owner_user_id, '未分配') as owner_name, p.name as project_name,
        coalesce(fr.relations, '[]'::jsonb) as fund_relations,
        coalesce(pr.relations, '[]'::jsonb) as project_relations,
        coalesce(cr.relations, '[]'::jsonb) as company_relations,
        coalesce(ir.relations, '[]'::jsonb) as investor_relations,
        to_char(m.archived_at at time zone 'Asia/Shanghai', 'YYYY-MM-DD') as archived_at_label
      from materials m
      left join users u on u.id = m.owner_user_id
      left join projects p on p.id = m.project_id
      left join lateral (
        select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'relationType', mfr.relation_type, 'isPrimary', mfr.is_primary) order by mfr.is_primary desc, f.name) as relations
        from material_fund_relations mfr
        join funds f on f.id = mfr.fund_id
        where mfr.material_id = m.id
      ) fr on true
      left join lateral (
        select jsonb_agg(jsonb_build_object('id', p2.id, 'name', p2.name, 'relationType', mpr.relation_type, 'isPrimary', mpr.is_primary) order by mpr.is_primary desc, p2.name) as relations
        from material_project_relations mpr
        join projects p2 on p2.id = mpr.project_id
        where mpr.material_id = m.id
      ) pr on true
      left join lateral (
        select jsonb_agg(jsonb_build_object('id', pc.id, 'name', pc.name, 'relationType', mcr.relation_type, 'isPrimary', mcr.is_primary) order by mcr.is_primary desc, pc.name) as relations
        from material_company_relations mcr
        join portfolio_companies pc on pc.id = mcr.company_id
        where mcr.material_id = m.id
      ) cr on true
      left join lateral (
        select jsonb_agg(jsonb_build_object('id', fi.id, 'name', fi.name, 'relationType', mir.relation_type, 'isPrimary', mir.is_primary) order by mir.is_primary desc, fi.name) as relations
        from material_investor_relations mir
        join fund_investors fi on fi.id = mir.investor_id
        where mir.material_id = m.id
      ) ir on true
      ${where.length ? `where ${where.join(" and ")}` : ""}
      order by m.created_at desc nulls last, m.id collate "C" asc
    `,
    values,
  );
  return withPurposes(client,result.rows.map(mapMaterialRow),'material');
}

async function queryMaterialById(client: Queryable, id: string): Promise<Material | null> {
  const result = await client.query(
    `
      select m.*, to_char(m.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as record_created_at, exists(select 1 from lp_material_privacy lp where lp.material_id=m.id) as lp_sensitive, coalesce((select v.uploaded_by from material_versions v where v.id=m.current_version_id), u.name, m.owner_user_id, '未分配') as owner_name, p.name as project_name,
        coalesce(fr.relations, '[]'::jsonb) as fund_relations,
        coalesce(pr.relations, '[]'::jsonb) as project_relations,
        coalesce(cr.relations, '[]'::jsonb) as company_relations,
        coalesce(ir.relations, '[]'::jsonb) as investor_relations,
        to_char(m.archived_at at time zone 'Asia/Shanghai', 'YYYY-MM-DD') as archived_at_label
      from materials m
      left join users u on u.id = m.owner_user_id
      left join projects p on p.id = m.project_id
      left join lateral (
        select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'relationType', mfr.relation_type, 'isPrimary', mfr.is_primary) order by mfr.is_primary desc, f.name) as relations
        from material_fund_relations mfr
        join funds f on f.id = mfr.fund_id
        where mfr.material_id = m.id
      ) fr on true
      left join lateral (
        select jsonb_agg(jsonb_build_object('id', p2.id, 'name', p2.name, 'relationType', mpr.relation_type, 'isPrimary', mpr.is_primary) order by mpr.is_primary desc, p2.name) as relations
        from material_project_relations mpr
        join projects p2 on p2.id = mpr.project_id
        where mpr.material_id = m.id
      ) pr on true
      left join lateral (
        select jsonb_agg(jsonb_build_object('id', pc.id, 'name', pc.name, 'relationType', mcr.relation_type, 'isPrimary', mcr.is_primary) order by mcr.is_primary desc, pc.name) as relations
        from material_company_relations mcr
        join portfolio_companies pc on pc.id = mcr.company_id
        where mcr.material_id = m.id
      ) cr on true
      left join lateral (
        select jsonb_agg(jsonb_build_object('id', fi.id, 'name', fi.name, 'relationType', mir.relation_type, 'isPrimary', mir.is_primary) order by mir.is_primary desc, fi.name) as relations
        from material_investor_relations mir
        join fund_investors fi on fi.id = mir.investor_id
        where mir.material_id = m.id
      ) ir on true
      where m.id = $1
    `,
    [id],
  );
  return withPurposes(client,result.rows[0] ? mapMaterialRow(result.rows[0]) : null,'material');
}

async function insertMaterialRelations(
  client: Queryable,
  materialId: string,
  relationships: MaterialRelationships | undefined,
  defaults: {
    fundId?: string | null;
    projectId?: string | null;
    companyId?: string | null;
    primaryScope?: string | null;
    dataOrigin: string;
  },
) {
  const fundRelations = uniqueRelations([
    ...(relationships?.funds ?? []),
    ...(defaults.fundId ? [{ id: defaults.fundId, name: "", relationType: "primary", isPrimary: defaults.primaryScope === "fund" }] : []),
  ]);
  for (const relation of fundRelations) {
    if (!relation.id) continue;
    await client.query(
      `
        insert into material_fund_relations (material_id, fund_id, relation_type, is_primary)
        values ($1,$2,$3,$4)
        on conflict (material_id, fund_id, relation_type) do update set
          is_primary = excluded.is_primary
      `,
      [materialId, relation.id, relation.relationType ?? "linked", Boolean(relation.isPrimary)],
    );
  }

  const projectRelations = uniqueRelations([
    ...(relationships?.projects ?? []),
    ...(defaults.projectId ? [{ id: defaults.projectId, name: "", relationType: "linked", isPrimary: defaults.primaryScope === "project" }] : []),
  ]);
  for (const relation of projectRelations) {
    if (!relation.id) continue;
    await client.query(
      `
        insert into material_project_relations (material_id, project_id, relation_type, is_primary)
        values ($1,$2,$3,$4)
        on conflict (material_id, project_id, relation_type) do update set
          is_primary = excluded.is_primary
      `,
      [materialId, relation.id, relation.relationType ?? "linked", Boolean(relation.isPrimary)],
    );
  }

  const companyRelations = uniqueRelations([
    ...(relationships?.companies ?? []),
    ...(defaults.companyId ? [{ id: defaults.companyId, name: "", relationType: "linked", isPrimary: defaults.primaryScope === "company" }] : []),
  ]);
  for (const relation of companyRelations) {
    const companyId = await resolveMaterialCompanyRelationId(client, relation, defaults.dataOrigin);
    if (!companyId) continue;
    await client.query(
      `
        insert into material_company_relations (material_id, company_id, relation_type, is_primary)
        values ($1,$2,$3,$4)
        on conflict (material_id, company_id, relation_type) do update set
          is_primary = excluded.is_primary
      `,
      [materialId, companyId, relation.relationType ?? "linked", Boolean(relation.isPrimary)],
    );
  }

  for (const relation of uniqueRelations(relationships?.investors ?? [])) {
    const investorId = await resolveMaterialInvestorRelationId(client, relation, defaults.fundId, defaults.dataOrigin);
    if (!investorId) continue;
    await client.query(
      `
        insert into material_investor_relations (material_id, investor_id, relation_type, is_primary)
        values ($1,$2,$3,$4)
        on conflict (material_id, investor_id, relation_type) do update set
          is_primary = excluded.is_primary
      `,
      [materialId, investorId, relation.relationType ?? "linked", Boolean(relation.isPrimary)],
    );
  }
}

async function resolveMaterialCompanyRelationId(
  client: Queryable,
  relation: MaterialRelationships["companies"][number],
  dataOrigin: string,
) {
  // Display names and OCR labels are not identity evidence.
  const relationId = relation.id?.trim();
  if (!relationId) return null;
  const result=await client.query('select id from portfolio_companies where id=$1',[relationId]);
  return result.rows.length ? relationId : null;
}

async function resolveMaterialInvestorRelationId(
  client: Queryable,
  relation: MaterialRelationships["investors"][number],
  fundId: string | null | undefined,
  dataOrigin: string,
) {
  const relationId = relation.id?.trim();
  if (relationId) return relationId;
  const name = relation.name?.trim();
  if (!name || !fundId) return null;
  const id = stableBusinessId("investor", `${fundId}:${name}`);
  const result = await client.query(
    `
      insert into fund_investors (
        id, fund_id, name, type, commitment_label, paid_in_label,
        suitability_status, sign_status, updated_at, data_origin
      )
      values ($1,$2,$3,'机构投资者','待补充','待补充','待复核','待签署',now(),$4)
      on conflict (id) do update set
        name = excluded.name,
        data_origin = excluded.data_origin,
        updated_at = now()
      returning id
    `,
    [id, fundId, name, dataOrigin],
  );
  return String(result.rows[0]?.id ?? id);
}

function uniqueRelations<T extends { id?: string; name?: string; relationType?: string }>(relations: T[]) {
  const seen = new Set<string>();
  return relations.filter((relation) => {
    const key = relation.id
      ? `id:${relation.id}:${relation.relationType ?? ""}`
      : `name:${relation.name ?? ""}:${relation.relationType ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(relation.id || relation.name);
  });
}

async function queryMaterialTextChunks(
  client: Queryable,
  input: {
    query: string;
    relationType?: MaterialTextSearchRelationType;
    relationId?: string;
    limit?: number;
    includeDemo?: boolean;
    allowedDataOrigins?: string[];
    allowedMaterialIds?: string[];
  },
): Promise<MaterialTextChunk[]> {
  const limit = Math.max(1, Math.min(input.limit ?? 6, 12));
  const terms = extractMaterialSearchTerms(input.query);
  if (terms.length === 0) return [];

  const values: unknown[] = [input.query, input.relationType ?? "", limit];
  // shortcut: current versions are not OCR indexed yet; enable only with a version-aware index.
  const where = ["m.id = c.material_id", "m.current_version_id is null"];
  if (input.allowedMaterialIds) {
    if (input.allowedMaterialIds.length === 0) return [];
    values.push(input.allowedMaterialIds);
    where.push(`m.id = any($${values.length}::text[])`);
  }
  if(input.includeDemo===false)where.push("m.data_origin <> 'seed_demo'", "not exists (select 1 from source_record_purposes sp where sp.record_type='material_version' and sp.project_id='' and sp.record_id=m.current_version_id::text and sp.data_purpose='engineering_fixture')", "not exists (select 1 from jsonb_array_elements(m.source_basis) b where b->>'dataPurpose'='engineering_fixture' or exists (select 1 from source_record_purposes sp where sp.record_type=b->>'recordType' and sp.record_id=b->>'id' and sp.project_id=b->>'projectId' and sp.data_purpose='engineering_fixture'))", "not exists (select 1 from source_record_purposes sp where sp.record_type='material' and sp.project_id='' and sp.record_id=m.id and sp.data_purpose='engineering_fixture')");
  const relationJoin = materialSearchRelationJoin(input.relationType);
  if (input.relationType && input.relationId) {
    values.push(input.relationId);
    where.push(`${relationJoin.alias}.${relationJoin.idColumn} = $${values.length}`);
  }
  const allowedDataOrigins = input.allowedDataOrigins?.map((origin) => origin.trim()).filter(Boolean) ?? [];
  if (allowedDataOrigins.length > 0) {
    values.push(Array.from(new Set(allowedDataOrigins)));
    where.push(`m.data_origin = any($${values.length}::text[])`);
  }

  values.push(terms.map(normalizeSearchText));
  const termParameter = `$${values.length}`;
  values.push(terms.map((term) => Math.max(2, term.length)));
  const weightParameter = `$${values.length}`;
  const result = await client.query(
    `
      select c.id, c.material_id, m.data_origin, m.source_basis, m.project_id, m.name as file_name, m.category,
        coalesce(f.name, m.raw_project_label, '') as project_or_fund,
        coalesce(m.archive_path, m.path) as archive_path,
        c.page_number, c.chunk_index, c.content, c.recognized_text_path, c.original_file_path
      from material_text_chunks c
      join materials m on m.id = c.material_id
      left join funds f on f.id = m.fund_id
      ${relationJoin.sql}
      cross join lateral (
        select sum(term.weight) as score
        from unnest(${termParameter}::text[], ${weightParameter}::int[]) as term(value, weight)
        where strpos(trim(regexp_replace(regexp_replace(lower(concat_ws(' ', c.content, m.name, m.category,
          coalesce(f.name, m.raw_project_label, ''), coalesce(m.archive_path, m.path))),
          '[，。？！、；：,.?!;:"''“”‘’（）()【】《》<>]', ' ', 'g'), '[[:space:]]+', ' ', 'g')), term.value) > 0
      ) matched
      where ${where.join(" and ")}
        and ($1::text is not null)
        and ($2::text is not null or true)
        and matched.score > 0
      order by matched.score desc, c.material_id asc, c.page_number asc, c.chunk_index asc
      limit $3::int
    `,
    values,
  );

  const purposes=await querySourcePurposes(client);
  return result.rows
    .map((row) => ({...mapMaterialTextChunkRow(row),dataPurpose:recordPurpose(purposes,'material',row.material_id),sourceBasis:Array.isArray(row.source_basis)?row.source_basis as NonNullable<Material['sourceBasis']>:[]}))
    .map((chunk) => ({ chunk, score: scoreMaterialTextChunk(chunk, terms) }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.chunk.materialId.localeCompare(b.chunk.materialId) || a.chunk.page - b.chunk.page)
    .slice(0, limit)
    .map((result) => result.chunk);
}

async function queryReports(client: Queryable, filters: { fundId?: string; projectId?: string } = {}): Promise<Report[]> {
  const values: unknown[] = [];
  const where: string[] = [];
  if (filters.fundId) {
    values.push(filters.fundId);
    where.push(`r.fund_id = $${values.length}`);
  }
  if (filters.projectId) {
    values.push(filters.projectId);
    where.push(`r.project_id = $${values.length}`);
  }

  const result = await client.query(
    `
      select r.*, to_char(r.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as record_created_at, coalesce(u.name, (select a.actor_name from audit_events a where a.target_id=r.id and a.action='保存报告草稿' order by a.event_time asc limit 1), r.owner_user_id, '未分配') as owner_name,
        to_char(r.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at_label
      from reports r
      left join users u on u.id = r.owner_user_id
      ${where.length ? `where ${where.join(" and ")}` : ""}
      order by r.created_at desc nulls last, r.id collate "C" asc
    `,
    values,
  );
  return withPurposes(client,result.rows.map(mapReportRow),'report');
}

async function queryReportById(client: Queryable, id: string): Promise<Report | null> {
  const result = await client.query(
    `
      select r.*, to_char(r.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as record_created_at, coalesce(u.name, (select a.actor_name from audit_events a where a.target_id=r.id and a.action='保存报告草稿' order by a.event_time asc limit 1), r.owner_user_id, '未分配') as owner_name,
        to_char(r.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at_label
      from reports r
      left join users u on u.id = r.owner_user_id
      where r.id = $1
    `,
    [id],
  );
  return withPurposes(client,result.rows[0] ? mapReportRow(result.rows[0]) : null,'report');
}

async function queryReportExportById(client: Queryable, id: string): Promise<ReportExport | null> {
  const result = await client.query(
    `
      select e.*, r.data_origin as report_data_origin, (select sp.data_purpose from source_record_purposes sp where sp.record_type='report' and sp.project_id='' and sp.record_id=r.id) as report_data_purpose, coalesce(e.actor_label,u.name,e.actor_user_id,'未分配') as actor_name,
        to_char(e.exported_at at time zone 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI') as exported_at_label
      from report_exports e
      left join reports r on r.id=e.report_id
      left join users u on u.id = e.actor_user_id
      where e.id = $1
    `,
    [id],
  );
  return withPurposes(client,result.rows[0] ? mapReportExportRow(result.rows[0]) : null,'report_export');
}

async function queryReportExports(client: Queryable): Promise<ReportExport[]> {
  const result = await client.query(
    `
      select e.*, r.data_origin as report_data_origin, (select sp.data_purpose from source_record_purposes sp where sp.record_type='report' and sp.project_id='' and sp.record_id=r.id) as report_data_purpose, coalesce(e.actor_label,u.name,e.actor_user_id,'未分配') as actor_name,
        to_char(e.exported_at at time zone 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI') as exported_at_label
      from report_exports e
      left join reports r on r.id=e.report_id
      left join users u on u.id = e.actor_user_id
      order by e.exported_at desc, e.id asc
    `,
  );
  return withPurposes(client,result.rows.map(mapReportExportRow),'report_export');
}

async function queryMeetings(client: Queryable, filters: { projectId?: string; projectName?: string; shortName?: string; deletedOnly?:boolean } = {}): Promise<Meeting[]> {
  const values: unknown[] = [];
  const where: string[] = [filters.deletedOnly?'m.deleted_at is not null':'m.deleted_at is null'];
  if (filters.projectId) {
    values.push(filters.projectId);
    where.push('m.project_id = $1');
  }

  const result = await client.query(
    `
      select m.*, to_char(m.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as record_created_at, p.name as project_name, to_char(m.date, 'YYYY-MM-DD') as date_label, to_char(m.task_due_date, 'YYYY-MM-DD') as task_due_date_label
      from meetings m
      left join projects p on p.id = m.project_id
      ${where.length ? `where ${where.join(" and ")}` : ""}
      order by m.created_at desc nulls last, m.id collate "C" asc
    `,
    values,
  );
  return withPurposes(client,result.rows.map(mapMeetingRow),'meeting');
}

async function queryMeetingById(client: Queryable, id: string,includeDeleted=false): Promise<Meeting | null> {
  const result = await client.query(
    `
      select m.*, to_char(m.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as record_created_at, p.name as project_name, to_char(m.date, 'YYYY-MM-DD') as date_label, to_char(m.task_due_date, 'YYYY-MM-DD') as task_due_date_label
      from meetings m
      left join projects p on p.id = m.project_id
      where m.id = $1 ${includeDeleted?'':'and m.deleted_at is null'}
    `,
    [id],
  );
  return withPurposes(client,result.rows[0] ? mapMeetingRow(result.rows[0]) : null,'meeting');
}

async function queryAiIntakeItems(client: Queryable): Promise<AiIntakeItem[]> {
  const result = await client.query(
    `
      select i.*, to_char(i.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as record_created_at, coalesce(u.name, i.submitted_by_name_label, i.submitted_by_actor_id, i.submitted_by_user_id, '未分配') as submitted_by_name,
        f.name as suggested_fund_name,
        p.name as suggested_project_name,
        to_char(i.submitted_at at time zone 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI') as submitted_at_label
      from ai_intake_items i
      left join users u on u.id = i.submitted_by_user_id
      left join funds f on f.id = i.suggested_fund_id
      left join projects p on p.id = i.suggested_project_id
      order by i.created_at desc nulls last, i.id collate "C" asc
    `,
  );
  return withPurposes(client,result.rows.map(mapAiIntakeRow),'intake');
}

async function queryAiIntakeItemById(client: Queryable, id: string): Promise<AiIntakeItem | null> {
  const result = await client.query(
    `
      select i.*, to_char(i.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as record_created_at, coalesce(u.name, i.submitted_by_name_label, i.submitted_by_actor_id, i.submitted_by_user_id, '未分配') as submitted_by_name,
        f.name as suggested_fund_name,
        p.name as suggested_project_name,
        to_char(i.submitted_at at time zone 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI') as submitted_at_label
      from ai_intake_items i
      left join users u on u.id = i.submitted_by_user_id
      left join funds f on f.id = i.suggested_fund_id
      left join projects p on p.id = i.suggested_project_id
      where i.id = $1
    `,
    [id],
  );
  return withPurposes(client,result.rows[0] ? mapAiIntakeRow(result.rows[0]) : null,'intake');
}

async function queryCapitalRecords(client: Queryable, filters: { fundId?: string; projectId?: string; company?: string } = {}): Promise<CapitalRecord[]> {
  const values: unknown[] = [];
  const where: string[] = [];
  if (filters.fundId) {
    values.push(filters.fundId);
    where.push(`c.fund_id = $${values.length}`);
  }
  if (filters.projectId) {
    values.push(filters.projectId);
    where.push(`c.project_id = $${values.length}`);
  }
  if (filters.company) {
    values.push(filters.company);
    where.push(`c.company = $${values.length}`);
  }

  const result = await client.query(
    `
      select c.*, to_char(c.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as record_created_at, f.name as fund_name,
        to_char(c.received_date, 'YYYY-MM-DD') as received_date_label,
        to_char(c.due_date, 'YYYY-MM-DD') as due_date_label,
        to_char(c.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at_label
      from capital_records c
      join funds f on f.id = c.fund_id
      ${where.length ? `where ${where.join(" or ")}` : ""}
      order by c.created_at desc nulls last, c.id collate "C" asc
    `,
    values,
  );
  return withPurposes(client,result.rows.map(mapCapitalRecordRow),'capital');
}

async function queryCapitalRecordById(client: Queryable, id: string): Promise<CapitalRecord | null> {
  const result = await client.query(
    `
      select c.*, to_char(c.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as record_created_at, f.name as fund_name,
        to_char(c.received_date, 'YYYY-MM-DD') as received_date_label,
        to_char(c.due_date, 'YYYY-MM-DD') as due_date_label,
        to_char(c.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at_label
      from capital_records c
      join funds f on f.id = c.fund_id
      where c.id = $1
    `,
    [id],
  );
  return withPurposes(client,result.rows[0] ? mapCapitalRecordRow(result.rows[0]) : null,'capital');
}

async function upsertHandledRisk(
  client: Queryable,
  input: {
    title: string;
    target?: string;
    type?: string;
    level?: string;
    source?: string;
    time?: string;
    summary?: string;
    projectId?: string | null;
    result: string;
  },
) {
  const existing = await client.query(
    "select id from risks where title = $1 and project_id is not distinct from $2::text limit 1",
    [input.title, input.projectId ?? null],
  );
  const riskId = typeof existing.rows[0]?.id === "string" ? existing.rows[0].id : nextId("risk", input.title);

  await client.query(
    `
      insert into risks (id, project_id, target_label, title, type, source, level, time, summary, status, updated_at, data_origin)
      values ($1,$2,$3,$4,$5,$6,$7,coalesce($8::timestamptz, now()),$9,'已处理',now(),'user_input')
      on conflict (id) do update set
        project_id = excluded.project_id,
        target_label = excluded.target_label,
        type = excluded.type,
        source = excluded.source,
        level = excluded.level,
        summary = excluded.summary,
        status = '已处理',
        data_origin = excluded.data_origin,
        updated_at = now()
    `,
    [
      riskId,
      input.projectId ?? null,
      input.target ?? input.title,
      input.title,
      input.type ?? "风险处理",
      input.source ?? "风险监控",
      input.level ?? "中",
      input.time ?? null,
      input.summary ?? input.result,
    ],
  );

  return riskId;
}

async function queryRiskById(client: Queryable, id: string): Promise<RiskRecord | null> {
  const result = await client.query(
    `
      select r.*, to_char(r.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as record_created_at, to_char(r.time at time zone 'Asia/Shanghai', 'YYYY-MM-DD') as time_label,
        to_char(r.updated_at at time zone 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI') as updated_at_label
      from risks r
      where r.id = $1
    `,
    [id],
  );
  return withPurposes(client,result.rows[0] ? mapRiskRow(result.rows[0]) : null,'risk');
}

async function queryAuditEvents(client: Queryable, filters: { fundId?: string; source?: string; projectId?: string } = {}): Promise<AuditEvent[]> {
  const values: unknown[] = [];
  const where: string[] = [];
  if (filters.fundId) {
    values.push(filters.fundId);
    where.push(`a.target_id = $${values.length}`);
  }
  if (filters.source) {
    values.push(filters.source);
    where.push(`a.source = $${values.length}`);
  }
  if (filters.projectId) {
    values.push(filters.projectId);
    where.push(`(a.target_id = $${values.length} or a.target_id in (select id from tasks where project_id = $${values.length}))`);
  }

  const result = await client.query(
    `
      select a.*, to_char(a.event_time at time zone 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI') as event_time_label
      from audit_events a
      ${where.length ? `where ${where.join(" or ")}` : ""}
      order by a.event_time desc, a.created_at desc, a.id asc
    `,
    values,
  );
  return withPurposes(client,result.rows.map(mapAuditEventRow),'audit');
}

async function insertAuditEvent(client: Queryable, input: Omit<AuditEvent, "id" | "time"> & { id?:string; time?: string; actorUserId?: string | null }): Promise<AuditEvent> {
  const id = input.id ?? nextId("audit", `${input.targetId}-${input.action}`);
  const actorUserId = "actorUserId" in input ? input.actorUserId : await resolveUserId(client, input.actor);
  await client.query(
    `
      insert into audit_events (
        id, module, action, target_type, target_id, target_name, actor_user_id,
        actor_name, event_time, detail, source, data_origin
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,coalesce($9::timestamptz, now()),$10,$11,$12)
    `,
    [
      id,
      input.module,
      input.action,
      input.targetType,
      input.targetId,
      input.targetName,
      actorUserId,
      input.actor,
      input.time ?? null,
      input.detail,
      input.source ?? null,
      input.dataOrigin ?? "system_generated",
    ],
  );
  const auditEvent = await queryAuditEventById(client, id);
  if (!auditEvent) throw new Error("audit_event_insert_failed");
  return auditEvent;
}

async function capitalActorId(client:Queryable,id:string){const result=await client.query('select id from users where id=$1',[id]);return typeof result.rows[0]?.id==='string'?result.rows[0].id:null;}
async function queryCurrentCapitalAudit(client:Queryable,id:string,action:string):Promise<AuditEvent|null>{
 const found=await client.query('select a.id from audit_events a join capital_records c on c.id=a.target_id where a.target_id=$1 and a.action=$2 and a.event_time=c.updated_at order by a.event_time asc,a.id asc limit 1',[id,action]);
 return typeof found.rows[0]?.id==='string'?queryAuditEventById(client,found.rows[0].id):null;
}

async function queryAuditEventById(client: Queryable, id: string): Promise<AuditEvent | null> {
  const result = await client.query(
    `
      select a.*, to_char(a.event_time at time zone 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI') as event_time_label
      from audit_events a
      where a.id = $1
    `,
    [id],
  );
  return withPurposes(client,result.rows[0] ? mapAuditEventRow(result.rows[0]) : null,'audit');
}

async function inTransaction<T>(client: Queryable, callback: () => Promise<T>): Promise<T> {
  await client.query("begin");
  let commitAttempted=false;
  try {
    const result = await callback();
    commitAttempted=true;
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    if (!commitAttempted && error && typeof error === "object") Object.assign(error,{safeToDeleteBlob:true});
    throw error;
  }
}

async function resolveUserId(client: Queryable, displayName: string): Promise<string | null> {
  const cleanName = displayName.split("/").at(-1)?.trim() ?? displayName;
  const result = await client.query("select id from users where name = $1 or $2 like '%' || name || '%' order by id asc limit 1", [cleanName, displayName]);
  return typeof result.rows[0]?.id === "string" ? result.rows[0].id : null;
}

async function queryNowLabel(client: Queryable) {
  const result = await client.query(`select ${DEFAULT_NOW_SQL} as value`);
  return String(result.rows[0]?.value ?? "");
}

async function queryTodayLabel(client: Queryable) {
  const result = await client.query("select to_char(now() at time zone 'Asia/Shanghai', 'YYYY-MM-DD') as value");
  return String(result.rows[0]?.value ?? "");
}

function mapFundRow(row: Record<string, unknown>): Fund {
  return {...creationMetadata(row.record_created_at??row.created_at),customFields:row.custom_fields as Fund["customFields"]??{},schemaRevision:toNumber(row.schema_revision??0),
    id: String(row.id),
    name: String(row.name),
    shortName: String(row.short_name),
    stage: String(row.stage),
    manager: String(row.manager_name),
    managerId: nullableString(row.manager_user_id),
    revision: toNumber(row.revision) || 1,
    scale: String(row.scale_label),
    paidIn: String(row.paid_in_label),
    invested: String(row.invested_label),
    balance: String(row.balance_label),
    projectCount: toNumber(row.project_count),
    investorCount: toNumber(row.investor_count),
    openTasks: toNumber(row.open_tasks),
    riskCount: toNumber(row.risk_count),
    nextAction: String(row.next_action),
    updatedAt: String(row.updated_at_label),
    dataOrigin: dataOriginOf(row),
  };
}

function mapProjectRow(row: Record<string, unknown>): Project {
  return {...creationMetadata(row.record_created_at??row.created_at),customFields:row.custom_fields as Project["customFields"]??{},schemaRevision:toNumber(row.schema_revision??0),
    id: String(row.id),
    fundId: String(row.fund_id),
    companyId: nullableString(row.company_id),
    masterRevision: toNumber(row.master_revision??1),
    name: String(row.name),
    shortName: String(row.short_name),
    fund: String(row.fund_name),
    industry: String(row.industry),
    status: String(row.status),
    stage: String(row.stage),
    manager: String(row.manager_name),
    ownerId: nullableString(row.owner_actor_id),
    managerLabel: nullableString(row.manager_label) ?? undefined,
    collaborators: nullableString(row.collaborators) ?? undefined,
    sourceChannel: nullableString(row.source_channel) ?? undefined,
    amount: String(row.amount_label),
    risk: String(row.risk_level),
    latest: String(row.latest),
    todoCount: toNumber(row.todo_count),
    updatedAt: String(row.updated_at_label),
    description: String(row.description),
    thesis: String(row.thesis),
    nextAction: String(row.next_action),
    dataOrigin: dataOriginOf(row),
  };
}

function mapInvestorRow(row: Record<string, unknown>): FundInvestor {
  return {...creationMetadata(row.record_created_at??row.created_at),
    id: String(row.id),
    fundId: String(row.fund_id),
    name: String(row.name),
    type: String(row.type),
    ...(row.profile?{profile:row.profile as FundInvestor['profile']}:{}),revision:Number(row.revision??1), contactName:String(row.contact_name??''),contactPhone:String(row.contact_phone??''),contactEmail:String(row.contact_email??''),
    commitment: String(row.commitment_label),
    paidIn: String(row.paid_in_label),
    suitabilityStatus: String(row.suitability_status),
    signStatus: String(row.sign_status),
    updatedAt: String(row.updated_at_label ?? row.updated_at ?? ""),
    dataOrigin: dataOriginOf(row),
  };
}

function mapFundDocumentRow(row: Record<string, unknown>): FundDocument {
  return {...creationMetadata(row.record_created_at??row.created_at),
    id: String(row.id),
    fundId: String(row.fund_id),
    name: String(row.name),
    category: String(row.category),
    owner: String(row.owner_name),
    archivedAt: String(row.archived_at_label),
    path: String(row.path),
    dataOrigin: dataOriginOf(row),
    sourceBasis: Array.isArray(row.source_basis)?row.source_basis as NonNullable<Material['sourceBasis']>:[],
  };
}

function mapFundClauseRow(row: Record<string, unknown>): FundClause {
  return {...creationMetadata(row.record_created_at??row.created_at),
    id: String(row.id),
    fundId: String(row.fund_id),
    title: String(row.title),
    source: String(row.source),
    trigger: String(row.trigger),
    owner: String(row.owner_name),
    status: String(row.status),
    dataOrigin: dataOriginOf(row),
  };
}

function mapTaskRow(row: Record<string, unknown>): ProjectTask {
  return {...creationMetadata(row.record_created_at??row.created_at),
    id: String(row.id),
    projectId: String(row.project_id),
    name: String(row.name),
    type: String(row.type),
    stage: String(row.stage),
    owner: String(row.owner_name),
    ownerId: nullableString(row.owner_actor_id) ?? nullableString(row.owner_user_id),
    kind: (row.kind ?? 'manual') as ProjectTask['kind'],
    approvalRoundId: nullableString(row.approval_round_id),
    revision: Number(row.revision ?? 1),
    completedAt: row.completed_at ? new Date(String(row.completed_at)).toISOString() : null,
    dueDate: String(row.due_date_label),
    status: String(row.status),
    priority: String(row.priority),
    relation: String(row.relation),
    note: String(row.note),
    updatedAt: String(row.updated_at_label),
    dataOrigin: dataOriginOf(row),
    sourceBasis: Array.isArray(row.source_basis)?row.source_basis as NonNullable<Material['sourceBasis']>:[],
  };
}

function mapMaterialRow(row: Record<string, unknown>): Material {
  const archivePath = nullableString(row.archive_path) ?? String(row.path);

  return {...creationMetadata(row.record_created_at??row.created_at),
    scopeRevision:Number(row.scope_revision??1),
    lpSensitive: row.lp_sensitive === true,
    id: String(row.id),
    version: row.current_version == null ? undefined : Number(row.current_version),
    currentVersion: row.current_version == null ? undefined : Number(row.current_version),
    currentVersionId: nullableString(row.current_version_id),
    fundId: nullableString(row.fund_id),
    projectId: nullableString(row.project_id),
    companyId: nullableString(row.company_id),
    name: String(row.name),
    type: String(row.category),
    uploader: String(row.owner_name),
    time: String(row.archived_at_label),
    source: String(row.source),
    status: String(row.status),
    quotes: String(row.citation_count ?? 0),
    project: String(row.raw_project_label ?? row.project_name ?? ""),
    path: String(row.path),
    primaryScope: nullableString(row.primary_scope),
    archivePath,
    originalFilePath: nullableString(row.original_file_path),
    previewFilePath: nullableString(row.preview_file_path),
    recognizedTextPath: nullableString(row.recognized_text_path),
    recognizedHtmlPath: nullableString(row.recognized_html_path),
    pageImageManifestPath: nullableString(row.page_image_manifest_path),
    pageImageDir: nullableString(row.page_image_dir),
    sourceMaterialId: nullableString(row.source_material_id),
    fileExtension: nullableString(row.file_extension),
    sizeBytes: nullableNumber(row.size_bytes),
    sha256: nullableString(row.sha256),
    dataOrigin: dataOriginOf(row),
    sourceBasis: Array.isArray(row.source_basis)?row.source_basis as NonNullable<Material['sourceBasis']>:[],
    relationships: {
      funds: toMaterialRelations(row.fund_relations),
      projects: toMaterialRelations(row.project_relations),
      companies: toMaterialRelations(row.company_relations),
      investors: toMaterialRelations(row.investor_relations),
    },
  };
}

function mapMaterialTextChunkRow(row: Record<string, unknown>): MaterialTextChunk {
  const recognizedTextPath = String(row.recognized_text_path);
  const originalPath = String(row.original_file_path);
  const page = Number(row.page_number);

  return {
    id: String(row.id),
    materialId: String(row.material_id),
    dataOrigin: normalizeDataOrigin(row.data_origin),
    fileName: String(row.file_name),
    category: String(row.category),
    projectOrFund: String(row.project_or_fund),
    archivePath: String(row.archive_path),
    page,
    chunkIndex: Number(row.chunk_index),
    text: String(row.content),
    recognizedTextPath,
    recognizedTextHref: `/${recognizedTextPath}#page-${page}`,
    originalPath,
    originalDocumentHref: `/${originalPath}#page=${page}`,
  };
}

function materialSearchRelationJoin(relationType: MaterialTextSearchRelationType | undefined) {
  if (relationType === "fund") {
    return {
      sql: "join material_fund_relations mfr on mfr.material_id = m.id",
      alias: "mfr",
      idColumn: "fund_id",
    };
  }
  if (relationType === "project") {
    return {
      sql: "join material_project_relations mpr on mpr.material_id = m.id",
      alias: "mpr",
      idColumn: "project_id",
    };
  }
  if (relationType === "company") {
    return {
      sql: "join material_company_relations mcr on mcr.material_id = m.id",
      alias: "mcr",
      idColumn: "company_id",
    };
  }
  if (relationType === "investor") {
    return {
      sql: "join material_investor_relations mir on mir.material_id = m.id",
      alias: "mir",
      idColumn: "investor_id",
    };
  }
  return { sql: "", alias: "m", idColumn: "id" };
}

function extractMaterialSearchTerms(query: string) {
  const normalized = normalizeSearchText(query);
  const domainTerms = [
    "专业投资者",
    "普通投资者",
    "风险匹配",
    "风险承受能力",
    "年度报告",
    "信息披露",
    "基金净资产",
    "财务数据",
    "管理费",
    "认缴金额",
    "实缴金额",
  ].filter((term) => normalized.includes(normalizeSearchText(term)));
  const genericTerms = normalized
    .split(/\s+/)
    .map((term) => term.replace(/请问|请|帮我|一下|哪些|什么|如何|查询|检索|资料|文档|文件|条款|内容/g, ""))
    .filter((term) => term.length >= 2);
  return Array.from(new Set([...domainTerms, ...genericTerms]));
}

function scoreMaterialTextChunk(chunk: MaterialTextChunk, terms: string[]) {
  const text = normalizeSearchText([chunk.text, chunk.fileName, chunk.category, chunk.projectOrFund, chunk.archivePath].join(" "));
  return terms.reduce((score, term) => (text.includes(normalizeSearchText(term)) ? score + Math.max(2, term.length) : score), 0);
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[，。？！、；：,.?!;:"'“”‘’（）()【】《》<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mapReportRow(row: Record<string, unknown>): Report {
  return {...(typeof row.last_approval_by_user_id==='string'?{lastApprovalById:row.last_approval_by_user_id}:{}),...(typeof row.created_by_user_id==='string'?{createdById:row.created_by_user_id}:{}),...creationMetadata(row.record_created_at??row.created_at),
    sections:(row.content_sections??[]) as Report['sections'],
    ...(row.template_snapshot?{templateSnapshot:row.template_snapshot as Report['templateSnapshot']}:{}),
    id: String(row.id),
    fundId: nullableString(row.fund_id),
    projectId: nullableString(row.project_id),
    name: String(row.name),
    target: String(row.target),
    type: String(row.type),
    status: String(row.status),
    owner: String(row.owner_name),
    updatedAt: String(row.updated_at_label),
    dataOrigin: dataOriginOf(row),
  };
}

function mapReportExportRow(row: Record<string, unknown>): ReportExport {
  return {
    ...reportExportSource({dataOrigin:normalizeDataOrigin(row.data_origin)},{id:String(row.report_id),dataOrigin:normalizeDataOrigin(row.report_data_origin),dataPurpose:row.report_data_purpose as DataPurpose}),
    id: String(row.id),
    reportId: String(row.report_id),
    reportName: String(row.report_name),
    fileName: String(row.file_name),
    downloadFileName: String(row.download_file_name),
    sectionsSnapshot:(row.sections_snapshot??[]) as ReportExport['sectionsSnapshot'],
    downloadMimeType: String(row.download_mime_type??"text/html;charset=utf-8") as ReportExport['downloadMimeType'],
    format: String(row.format) as ReportExport["format"],
    exportedAt: String(row.exported_at_label),
    actor: String(row.actor_name),
    watermark: String(row.watermark),
    sources: toStringArray(row.sources),
  };
}

function mapMeetingRow(row: Record<string, unknown>): Meeting {
  return {...(typeof row.last_approval_by_user_id==='string'?{lastApprovalById:row.last_approval_by_user_id}:{}),...(typeof row.created_by_user_id==='string'?{createdById:row.created_by_user_id}:{}),...creationMetadata(row.record_created_at??row.created_at),
    id: String(row.id),
    revision:toNumber(row.revision??1),
    ...(row.deleted_at?{deletedAt:new Date(String(row.deleted_at)).toISOString(),deletedBy:String(row.deleted_by??'')}:{}),
    projectId: nullableString(row.project_id),
    project: String(row.raw_project_label ?? row.project_name ?? ""),
    ...(row.task_due_date_label?{taskDueDate:String(row.task_due_date_label)}:{}),
    scheduleStatus:(row.schedule_status??'unknown') as Meeting['scheduleStatus'],
    ...(row.starts_at?{startsAt:new Date(String(row.starts_at)).toISOString()}:{}),
    ...(row.ends_at?{endsAt:new Date(String(row.ends_at)).toISOString()}:{}),
    title: String(row.title),
    date: String(row.date_label),
    attendees: String(row.attendees),
    status: String(row.status),
    summary: String(row.summary),
    todos: toNumber(row.todos_count),
    risks: toNumber(row.risks_count),
    conclusions: toStringArray(row.conclusions),
    todoItems: toStringArray(row.todo_items),
    riskItems: toStringArray(row.risk_items),
    dataOrigin: dataOriginOf(row),
  };
}

function mapAiIntakeRow(row: Record<string, unknown>): AiIntakeItem {
  return {...creationMetadata(row.record_created_at??row.created_at),
    id: String(row.id),
    title: String(row.title),
    inputType: String(row.input_type) as AiIntakeItem["inputType"],
    sourceMaterialId: nullableString(row.source_material_id)??undefined,
    sourceVersionId: nullableString(row.source_version_id)??undefined,
    sourceBasis: (row.source_basis??[]) as AiIntakeItem["sourceBasis"],
    source: String(row.source),
    submittedBy: String(row.submitted_by_name),
    ownerId: nullableString(row.submitted_by_actor_id ?? row.submitted_by_user_id),
    submittedAt: String(row.submitted_at_label),
    summary: String(row.summary),
    confidence: String(row.confidence),
    suggestedFundId: nullableString(row.suggested_fund_id),
    suggestedFund: String(row.suggested_fund_name ?? row.suggested_fund_id ?? ""),
    suggestedProject: String(row.suggested_project_label ?? row.suggested_project_name ?? row.suggested_project_id ?? ""),
    suggestedPath: String(row.suggested_path),
    extracted: toStringArray(row.extracted),
    generatedTasks: toStringArray(row.generated_tasks),
    status: String(row.status),
    reviewNote: nullableString(row.review_note) ?? undefined,
    dataOrigin: dataOriginOf(row),
  };
}

function mapCapitalRecordRow(row: Record<string, unknown>): CapitalRecord {
  return {...(typeof row.last_approval_by_user_id==='string'?{lastApprovalById:row.last_approval_by_user_id}:{}),...(typeof row.created_by_user_id==='string'?{createdById:row.created_by_user_id}:{}),...creationMetadata(row.record_created_at??row.created_at),
    id: String(row.id),
    fundId: String(row.fund_id),
    projectId: nullableString(row.project_id),
    company: String(row.company),
    fund: String(row.fund_name),
    received: String(row.received_label),
    date: row.received_date_label==null?'':String(row.received_date_label),
    rule: String(row.rule),
    receivable: String(row.receivable_label),
    dueDate: String(row.due_date_label),
    status: String(row.status),
    source: nullableString(row.source) ?? undefined,
    confirmationStatus: nullableString(row.confirmation_status) ?? undefined,
    updatedAt: String(row.updated_at_label),
    dataOrigin: dataOriginOf(row),
  };
}

function mapRiskRow(row: Record<string, unknown>): RiskRecord {
  return {...creationMetadata(row.record_created_at??row.created_at),
    id: String(row.id),
    projectId: nullableString(row.project_id),
    target: String(row.target_label),
    title: String(row.title),
    type: String(row.type),
    level: String(row.level),
    source: String(row.source),
    time: String(row.time_label),
    summary: String(row.summary),
    status: String(row.status),
    updatedAt: String(row.updated_at_label),
    dataOrigin: dataOriginOf(row),
  };
}

function mapAuditEventRow(row: Record<string, unknown>): AuditEvent {
  return {
    id: String(row.id),
    module: String(row.module),
    action: String(row.action),
    targetType: String(row.target_type),
    targetId: String(row.target_id),
    targetName: String(row.target_name),
    actor: String(row.actor_name),
    time: String(row.event_time_label),
    detail: String(row.detail),
    source: nullableString(row.source) ?? undefined,
    dataOrigin: dataOriginOf(row),
  };
}

function nextId(prefix: string, value: string) {
  return `${prefix}-${slugify(value)}-${randomUUID().slice(0, 8)}`;
}

function stableBusinessId(prefix: string, value: string) {
  return `${prefix}-${createHash("sha1").update(value).digest("hex").slice(0, 16)}`;
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "item";
}

function inferMaterialPath(name: string, type: string, source: string) {
  const text = `${name} ${type} ${source}`;
  if (/信披|信息披露|半年度报告|年度报告|实施细则/.test(text)) return "基金档案 / 信息披露 / 报告模板";
  if (/清算|终止|股权转让|财产分配|合伙人大会/.test(text)) return "基金档案 / 清算退出 / 清算文件";
  if (/份额转让|转让申请/.test(text)) return "基金档案 / 重大事项 / 份额转让";
  if (/立项审批/.test(text)) return "基金档案 / 投资管理 / 立项审批";
  if (/资金到账|缴款|出资能力|审计报告/.test(text)) return "基金档案 / 募集 / 出资证明";
  if (/适当性|风险测评|基本信息表|合格投资者|回访|税收居民|风险匹配|调查表/.test(text)) {
    return "基金档案 / 募集 / 投资者适当性";
  }
  if (/托管协议|监督协议|无托管|合伙协议|招募说明|备案承诺|备案模版|风险揭示/.test(text)) {
    return "基金档案 / 募集 / 备案与协议";
  }
  if (/产品结构图|工商公示/.test(text)) return "基金档案 / 募集 / 基础信息";
  if (/功能构想|需求/.test(text)) return "产品资料 / 需求构想 / 功能说明";
  if (/协议|条款|PDF/.test(text)) return "项目档案 / 协议条款 / 投资协议";
  if (/会议|纪要|语音/.test(text)) return "项目档案 / 会议纪要 / 投后沟通";
  if (/财务|报表|Excel|xlsx/.test(text)) return "基金档案 / 账户资金 / 季度大表";
  return "项目档案 / 其他资料 / 待复核";
}

function documentExtensionForAiIntake(inputType: AiIntakeItem["inputType"]) {
  if (inputType === "投资协议") return "pdf";
  if (inputType === "财务报表") return "xlsx";
  return "txt";
}

function materialCategoryForAiIntake(inputType: AiIntakeItem["inputType"]) {
  if (inputType === "投资协议") return "法务资料";
  if (inputType === "财务报表") return "财务资料";
  return "会议资料";
}

function inferAiTaskType(taskName: string) {
  if (/[条款业绩回购监控]/.test(taskName)) return "条款监控";
  if (/[报告数据收集]/.test(taskName)) return "报告收集";
  if (/[补充资料整理]/.test(taskName)) return "资料补充";
  if (/[确认复核口径]/.test(taskName)) return "人工确认";
  return "任务跟进";
}

function inferAiTaskPriority(taskName: string) {
  return /[业绩管理费确认复核口径风险条款]/.test(taskName) ? "高" : "中";
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function nullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function nullableNumber(value: unknown) {
  if (value === null || typeof value === "undefined") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dataOriginOf(row: Record<string, unknown>) {
  return normalizeDataOrigin(row.data_origin);
}

function toMaterialRelations(value: unknown): MaterialRelationships["funds"] {
  const parsed = typeof value === "string" ? safeJsonParse(value) : value;
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item): MaterialRelationships["funds"] => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      const id = String(record.id ?? "");
      const name = String(record.name ?? "");
      if (!id || !name) return [];
      return [{
        id,
        name,
        relationType: nullableString(record.relationType) ?? undefined,
        isPrimary: typeof record.isPrimary === "boolean" ? record.isPrimary : undefined,
      }];
    });
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

function toNumber(value: unknown) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mapVersion(row: Record<string, unknown>): MaterialVersion {
    return {
        id: String(row.id), materialId: String(row.material_id), version: Number(row.version), name: String(row.name), sizeBytes: Number(row.size_bytes), sha256: String(row.sha256), mimeType: String(row.mime_type), uploadedBy: String(row.uploaded_by), uploadedById: String(row.uploaded_by_id), createdAt: new Date(String(row.created_at)).toISOString(), blobId: String(row.blob_id), requestId: String(row.request_id), fingerprint: String(row.fingerprint), auditEventId: String(row.audit_event_id)
    };
}
async function queryVersions(client: Queryable, id: string) { return withPurposes(client,(await client.query('select * from material_versions where material_id=$1 order by version desc', [id])).rows.map(mapVersion),'material_version'); }
async function replaceUploadRelations(client: Queryable, id: string, projects: Project[]) {
    await client.query('delete from material_project_relations where material_id=$1', [id]);
    await client.query('delete from material_fund_relations where material_id=$1', [id]);
    await insertMaterialRelations(client, id, projectRelationships(projects, []), { dataOrigin: 'user_input' });
}
async function materialTransaction<T>(client: Queryable, callback: () => Promise<T>): Promise<T> {
    await client.query('begin');
    let committing = false;
    try {
        const result = await callback();
        committing = true;
        await client.query('commit');
        return result;
    }
    catch (error) {
        if (!committing) {
            try {
                await client.query('rollback');
            }
            catch { /* Preserve the original error. */ }
        }
        if (error instanceof Error)
            Object.assign(error, { safeToDeleteBlob: !committing });
        throw error;
    }
}

function mapAccountUser(r:Record<string,unknown>):StoredUser{return {id:String(r.id),name:String(r.name),email:String(r.email),role:r.role as StoredUser['role'],passwordHash:nullableString(r.password_hash),enabled:r.enabled!==false,revision:Number(r.revision??1)};}
function mapAuthSession(r:Record<string,unknown>):AuthSession{return {hash:String(r.session_hash),actorId:String(r.actor_id),expiresAt:new Date(r.expires_at as string|Date).toISOString()};}

async function queryAiFund(client:Queryable,input:Pick<AiIntakeItem,'suggestedFund'|'suggestedFundId'>){
  if(input.suggestedFundId!=null){const fund=await queryFundMeta(client,input.suggestedFundId);if(!fund)throw new WorkflowError('fund_not_found',404);return fund;}
  return queryFundMetaByDisplayName(client,input.suggestedFund);
}

async function queryCompanies(client:Queryable):Promise<Company[]>{
  const result=await client.query(`select id,name,short_name,industry,revision,data_origin,custom_fields,schema_revision,owner_actor_id,to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as record_created_at from portfolio_companies order by created_at desc,id collate "C" asc`);
  return withPurposes(client,result.rows.map(r=>({...creationMetadata(r.record_created_at??r.created_at),customFields:r.custom_fields as Company["customFields"]??{},schemaRevision:toNumber(r.schema_revision??0),id:String(r.id),ownerId:nullableString(r.owner_actor_id),name:String(r.name),shortName:String(r.short_name),industry:String(r.industry??''),revision:toNumber(r.revision??1),dataOrigin:dataOriginOf(r)})),'company');
}

async function readSchemas(client:Queryable):Promise<Schemas>{const schemas=emptySchemas();for(const row of (await client.query('select object_type,payload from custom_field_schemas')).rows)schemas[row.object_type as keyof Schemas]=row.payload as Schemas[keyof Schemas];return schemas;}
async function persistCustom(client:Queryable,schemas:Schemas,companies:Company[],projects:Project[],funds:Fund[]){
 for(const [kind,schema] of Object.entries(schemas))await client.query('update custom_field_schemas set payload=$2::jsonb where object_type=$1',[kind,JSON.stringify(schema)]);
 for(const c of companies)await client.query('update portfolio_companies set custom_fields=$2::jsonb,schema_revision=$3 where id=$1',[c.id,JSON.stringify(c.customFields??{}),c.schemaRevision??0]);
 for(const p of projects)await client.query('update projects set custom_fields=$2::jsonb,schema_revision=$3 where id=$1',[p.id,JSON.stringify(p.customFields??{}),p.schemaRevision??0]);
 for(const f of funds)await client.query('update funds set custom_fields=$2::jsonb,schema_revision=$3 where id=$1',[f.id,JSON.stringify(f.customFields??{}),f.schemaRevision??0]);
}

async function persistNotices(client:Queryable,state:object){for(const event of takeNotices(state))await client.query('insert into business_notification_outbox(id,payload) values($1,$2::jsonb) on conflict(id) do nothing',[event.id,JSON.stringify(event)]);}
