import {AsyncLocalStorage} from 'node:async_hooks';
import type {LedgerStore,Project,Fund,Material} from '../ledger/store.ts';
import type {SessionUser} from './session.ts';
import type {StoredUser} from '../ledger/workflow.ts';
import type {AuthSession} from '../ledger/accounts.ts';
import type {AuditEvent} from '../ledger/store.ts';
export type AccessRule={visibility:'members'|'public';memberIds:string[];revision:number};
export type AccessData={funds:Record<string,AccessRule>;projects:Record<string,AccessRule>;materials?:Record<string,AccessRule>;projectRevisions?:Record<string,number>;materialRevisions?:Record<string,number>};
export type ObjectAccessSnapshot={data:AccessData;funds:Pick<Fund,'id'|'managerId'>[];projects:Pick<Project,'id'|'fundId'|'ownerId'|'companyId'>[];materials:Pick<Material,'id'|'projectId'|'fundId'|'relationships'|'sourceMaterialId'|'currentVersionId'|'sourceBasis'>[];rows:unknown[]};
export type AccessState={data:AccessData;users:StoredUser[];sessions:AuthSession[];auditEvents:AuditEvent[]};
export const emptyAccess=():AccessData=>({funds:{},projects:{}});
export const accessContext=new AsyncLocalStorage<{actor:SessionUser;policy?:Promise<ObjectPolicy>;validate?:()=>Promise<boolean>;refresh?:()=>Promise<ObjectPolicy>}>();
export class ObjectAccessError extends Error{statusCode=403;code='forbidden';constructor(){super('forbidden');}}
export class FundAccessAssignmentError extends ObjectAccessError{statusCode=409;code='fund_access_assignment_conflict';}
export async function objectPolicy(store:LedgerStore,actor:SessionUser):Promise<ObjectPolicy>{
 return store.withObjectAccessLock(async()=>{
 const snapshot=await store.readObjectAccessSnapshot();return new ObjectPolicy(actor,snapshot.data,snapshot.projects,snapshot.funds,snapshot.materials,snapshot.rows);
 });
}
export class ObjectPolicy{
 private companyOwners=new Map<string,string>();
 private restricted=new Set<string>();
 private visible=new Map<string,boolean>();private projectsById:Map<string,ObjectAccessSnapshot['projects'][number]>;private fundsById:Map<string,ObjectAccessSnapshot['funds'][number]>;
 actor:SessionUser;data:AccessData;
 constructor(actor:SessionUser,data:AccessData,projects:ObjectAccessSnapshot['projects'],funds:ObjectAccessSnapshot['funds'],materials:ObjectAccessSnapshot['materials'],rows:unknown[]){
  this.actor=actor;this.data=data;
  this.projectsById=new Map(projects.map(p=>[p.id,p]));this.fundsById=new Map(funds.map(f=>[f.id,f]));
  for(const f of funds)this.visible.set(f.id,this.fund(f.id));for(const p of projects)this.visible.set(p.id,this.project(p.id));
  for(const row of rows){const r=row as Record<string,unknown>;if(r.objectType==='company'&&typeof r.id==='string')this.companyOwners.set(r.id,String(r.ownerId??''));}
  for(const m of materials){this.visible.set(m.id,this.material(m));if(data.materials?.[m.id]&&!this.visible.get(m.id))this.restricted.add(m.id);}
  // Legacy source aliases and version references must obey the same material restriction.
  for(const m of materials)for(const id of [m.sourceMaterialId,m.currentVersionId])if(id&&id!==m.id&&this.restricted.has(m.id))this.visible.set(id,false);
  // Only explicit material restrictions propagate; existing inherited visibility stays unchanged.
  const baseIds=new Set(this.visible.keys());
  for(let i=0;i<=rows.length+materials.length;i++){
   let changed=false;
   for(const m of materials)if(!this.restricted.has(m.id)&&this.sourceIds(m as Record<string,unknown>).some(id=>this.restricted.has(id))){this.restricted.add(m.id);this.visible.set(m.id,false);changed=true;}
   for(const m of materials)for(const id of [m.sourceMaterialId,m.currentVersionId])if(id&&this.restricted.has(m.id)&&!this.restricted.has(id)){this.restricted.add(id);this.visible.set(id,false);changed=true;}
   for(const row of rows){
    const r=row as Record<string,unknown>;
    if(typeof r.id!=='string'||baseIds.has(r.id)||r.objectType==='material_version'&&!this.restricted.has(String(r.materialId)))continue;
    const sourceRestricted=[...this.sourceIds(r),r.materialId,r.reportId,r.targetId].some(id=>typeof id==='string'&&this.restricted.has(id));
    if(!this.restricted.has(r.id)&&sourceRestricted){this.restricted.add(r.id);this.visible.set(r.id,false);changed=true;}
    if(this.visible.get(r.id)!==false){const allowed=this.row(r,true);if(this.visible.get(r.id)!==allowed)changed=true;this.visible.set(r.id,allowed);}
   }
   if(!changed)break;
  }
 }
 private rule(rule:AccessRule|undefined,owner?:string|null){return this.actor.role==='admin'||Boolean(rule?.visibility==='public'||rule?.memberIds.includes(this.actor.id)||owner===this.actor.id);}
 fund(id:string){const f=this.fundsById.get(id);return !!f&&this.rule(this.data.funds[id],f.managerId);}
 project(id:string){const p=this.projectsById.get(id);if(!p)return false;if(this.actor.role==='admin'||p.ownerId===this.actor.id)return true;const rule=this.data.projects[id];return rule?this.rule(rule):this.fund(p.fundId);}
 material(m:ObjectAccessSnapshot['materials'][number]){if(this.actor.role==='admin')return true;if(this.restricted.has(m.id))return false;if(this.data.materials?.[m.id]&&!this.rule(this.data.materials[m.id]))return false;const projects=[m.projectId,...(m.relationships?.projects??[]).map(p=>p.id)].filter(Boolean) as string[];const funds=[m.fundId,...(m.relationships?.funds??[]).map(f=>f.id)].filter(Boolean) as string[];return projects.length?projects.some(id=>this.project(id)):funds.length?funds.some(id=>this.fund(id)):(m.relationships?.companies??[]).some(c=>this.companyOwners.get(c.id)===this.actor.id||[...this.projectsById.values()].some(p=>p.companyId===c.id&&this.project(p.id)));}
 allowsKnown(id:string){return this.actor.role==='admin'||this.visible.get(id)===true;}
 allows(id:string){return this.actor.role==='admin'||this.visible.get(id)!==false;}
 private sourceIds(r:Record<string,unknown>):string[]{
  const ids=['sourceMaterialId','sourceVersionId'].flatMap(k=>typeof r[k]==='string'?[r[k] as string]:[]);
  for(const key of ['materialIds','sourceMaterialIds','scopeIds'])if(Array.isArray(r[key]))ids.push(...r[key].filter((id):id is string=>typeof id==='string'));
  if(Array.isArray(r.sourceBasis))for(const ref of r.sourceBasis)if(ref&&typeof ref.id==='string')ids.push(ref.id);
  // Derived summaries must not outlive access to their explicit evidence snapshots.
  const evidenceIds=(value:unknown):string[]=>typeof value==='string'?[value]:Array.isArray(value)?value.flatMap(evidenceIds):value&&typeof value==='object'?Object.values(value).flatMap(evidenceIds):[];
  for(const key of ['evidence','source'])if(r[key]&&typeof r[key]==='object')ids.push(...evidenceIds(r[key]));
  for(const key of ['sourceMapping','templateSnapshot'])if(r[key]&&typeof r[key]==='object'){const ref=r[key] as Record<string,unknown>;if(typeof ref.materialId==='string')ids.push(ref.materialId);ids.push(...this.sourceIds(ref));}
  return ids;
 }
 private row(r:Record<string,unknown>,recompute=false){
  if(this.actor.role==='admin')return true;
  if(this.sourceIds(r).some(id=>this.restricted.has(id)))return false;
  if(!recompute&&typeof r.id==='string'&&this.visible.has(r.id))return this.visible.get(r.id)!;
  for(const key of ['project','fund','material','report']){const child=r[key];if(child&&typeof child==='object'&&typeof (child as Record<string,unknown>).id==='string'&&!this.allows(String((child as Record<string,unknown>).id)))return false;}
  // Project membership shares project work without granting access to the entire fund.
  const refs=(r.projectId?['projectId','materialId','reportId','targetId']:['fundId','suggestedFundId','materialId','reportId','targetId']).map(k=>r[k]).filter(v=>typeof v==='string'&&v) as string[];
  if(refs.some(id=>this.visible.get(id)===false))return false;
  if(refs.length&&!refs.some(id=>this.visible.get(id)===true)&&(r.objectType==='scoped'||(r.targetType&&r.targetId)))return false;
  if(r.objectType==='scoped'&&!refs.length)return r.ownerId===this.actor.id;
  if(!recompute&&r.id&&this.visible.has(String(r.id)))return this.visible.get(String(r.id))!;
  if(r.objectType==='company'&&typeof r.id==='string'){const related=[...this.projectsById.values()].filter(p=>p.companyId===r.id);return r.ownerId===this.actor.id||related.some(p=>this.project(p.id));}
  if(typeof r.companyId==='string'){const related=[...this.projectsById.values()].filter(p=>p.companyId===r.companyId);return related.some(p=>this.project(p.id));}
  if(typeof r.id==='string'&&!refs.length){const related=[...this.projectsById.values()].filter(p=>p.companyId===r.id);if(related.length)return related.some(p=>this.project(p.id));}
  return true;
 }
 assert(value:unknown){if(typeof value==='string'){if(!this.allows(value))throw new ObjectAccessError();}else if(Array.isArray(value))value.forEach(v=>this.assert(v));else if(value&&typeof value==='object')for(const [k,v]of Object.entries(value))if(!['prompt','title','text','content','description','note','opinion','requestId'].includes(k))this.assert(v);}
 filter<T>(value:T,parentKey=''):T{
  if(this.actor.role==='admin')return value;
  if(Array.isArray(value)){if(parentKey==='evidence')return value.map(v=>v&&typeof v==='object'&&!this.row(v as Record<string,unknown>)?{materialId:v.materialId,versionId:v.versionId,name:'关联原件当前不可读取',readIssue:v.readIssue??'forbidden'}:this.filter(v)) as T;return value.filter(v=>!(v&&typeof v==='object')||this.row(v as Record<string,unknown>)).map(v=>this.filter(v)) as T;}
  if(value&&typeof value==='object'){const r=value as Record<string,unknown>;if(!this.row(r))return null as T;return Object.fromEntries(Object.entries(r).map(([k,v])=>[k,this.filter(v,k)])) as T;}
  return value;
 }
}
export function scopedLedgerStore(raw:LedgerStore):LedgerStore{
 return new Proxy(raw,{get(target,key){const value=Reflect.get(target,key);if(typeof value!=='function'||typeof key!=='string')return value;
  return async(...args:unknown[])=>{const ctx=accessContext.getStore();if(!ctx||['readObjectAccessSnapshot','withObjectAccessLock','accessTransaction','accountTransaction','readAuthSession','listUsers','insertUser','assistantTransaction','readLpPrivacy'].includes(key))return value.apply(target,args);
   const write=!/^(list|read|search|get)/.test(key);
   const execute=async()=>{
    if(write&&ctx.validate&&!await ctx.validate())throw Object.assign(new Error('unauthenticated'),{statusCode:401});
    if(ctx.actor.role==='admin')return value.apply(target,args);
    if(write)ctx.policy=objectPolicy(raw,ctx.actor);
    const policy=await(ctx.policy??=objectPolicy(raw,ctx.actor));
    if(/Transaction$/.test(key)){
      if(typeof args[0]==='string')policy.assert(args[0]);
      const callbackIndex=args.findIndex(v=>typeof v==='function');
      if(callbackIndex>=0){const action=args[callbackIndex] as (s:any)=>Promise<unknown>;args[callbackIndex]=async(s:any)=>{
        const before=new Map<string,string>();for(const name of ['funds','projects','investors','materials','versions'])for(const row of s[name]??[])if(row?.id)before.set(row.id,JSON.stringify(row));
        const result=await action(s);
        for(const name of ['funds','projects','investors','materials','versions'])for(const row of s[name]??[])if(before.get(row.id)!==JSON.stringify(row)){policy.assert(row.id);policy.assert(row);}
        if(key==='fundTransaction'){
          // Validate the resulting owner before commit; filtering the response afterward is too late.
          const snapshot=await raw.readObjectAccessSnapshot(),next=new ObjectPolicy(ctx.actor,snapshot.data,snapshot.projects,s.funds,snapshot.materials,snapshot.rows);
          for(const fund of s.funds)if(before.get(fund.id)!==JSON.stringify(fund)&&!next.fund(fund.id))throw new FundAccessAssignmentError();
        }
        return result;
      };}
      const result=await value.apply(target,args);const latest=await objectPolicy(raw,ctx.actor);ctx.policy=Promise.resolve(latest);return latest.filter(result);
    }
    if(write){
      policy.assert(args);
      if(['createMeeting','createReport','createCapitalRecord','createAiIntakeItem','updateAiIntakeSuggestion','archiveMaterial','handleRisk','archiveAiIntakeItem','confirmMeeting'].includes(key)){
        // Recheck stored labels too: a previously absent name can later resolve to a private project.
        const input=(key==='archiveAiIntakeItem'?(await raw.listAiIntakeItems()).find(i=>i.id===args[0]):key==='confirmMeeting'?(await raw.listMeetings()).find(i=>i.id===args[0]):args[key==='updateAiIntakeSuggestion'?1:0]) as Record<string,unknown>|undefined;
        if(input){
          const [projects,funds]=await Promise.all([raw.listProjects(),raw.listFunds()]);
          if(key==='handleRisk'){const project=projects.find(p=>p.id===input.projectId||(typeof input.title==='string'&&(input.title.includes(p.name)||input.title.includes(p.shortName)))||input.target===p.name);if(project)policy.assert(project.id);}
          const labels=[input.target,input.company,input.project,input.suggestedProject,input.fund,input.suggestedFund].filter(v=>typeof v==='string'&&v);
          for(const row of [...projects,...funds])if(labels.some(v=>v===row.id||v===row.name||v===row.shortName))policy.assert(row.id);
        }
      }
    }
    if(key==='listMaterialVersions'||key==='readPostInvestmentArchive')policy.assert(args[0]);
    const result=await value.apply(target,args);if(write){const latest=await objectPolicy(raw,ctx.actor);ctx.policy=Promise.resolve(latest);return latest.filter(result);}return policy.filter(result);
   };
   return write?raw.withObjectAccessLock(execute):execute();
  };
 }});
}
