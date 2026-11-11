import type {LedgerStore,AuditEvent} from './store.ts';
export const recordKinds=['company','project','fund','material','report','capital','intake','investor'] as const;
export type RecordKind=typeof recordKinds[number];
export type DeletedRecord={id:string;kind:RecordKind;title:string;deletedAt:string;deletedBy:string;revision:number;nonRestorable?:boolean;fundId?:string|null;projectId?:string|null};
export type RecordManagementData={entries:DeletedRecord[];requests:Record<string,{fingerprint:string;result:DeletedRecord}>};
export type RecordManagementState={data:RecordManagementData;auditEvents:AuditEvent[]};
export const emptyRecordManagement=():RecordManagementData=>({entries:[],requests:{}});
export async function managementRecords(store:LedgerStore,kind:RecordKind){
 switch(kind){case 'investor':return store.lpTransaction(s=>s.investors);case 'company':return store.listCompanies();case 'project':return store.listProjects();case 'fund':return store.listFunds();case 'material':return store.listMaterials();case 'report':return store.listReports();case 'capital':return store.listCapitalRecords();case 'intake':return store.listAiIntakeItems();}
}
export function recordReferenceIds(value:unknown):string[]{
 return Array.isArray(value)?value.flatMap(recordReferenceIds):value&&typeof value==='object'&&!Buffer.isBuffer(value)?Object.entries(value).flatMap(([key,child])=>/^(id|projectId|fundId|companyId|materialId|reportId|itemId|suggestedFundId|investorId)$/.test(key)&&typeof child==='string'?[child]:/^(ids|projectIds|fundIds|companyIds|materialIds|reportIds|itemIds|investorIds)$/.test(key)&&Array.isArray(child)?child.filter((id):id is string=>typeof id==='string'):recordReferenceIds(child)):[];
}
// Deletion markers hide current records; originals and business history remain stored.
export function managedLedgerStore(raw:LedgerStore):LedgerStore{
 return new Proxy(raw,{get(target,key){const fn=Reflect.get(target,key);if(typeof fn!=='function'||typeof key!=='string'||['readObjectAccessSnapshot','withObjectAccessLock','readRecordManagement','recordManagementTransaction','readLpPrivacy','healthCheck'].includes(key))return fn;
  return async(...args:unknown[])=>{
   const data=await raw.readRecordManagement(),removed=new Set(data.entries.filter(e=>e.deletedAt).map(e=>e.id));
   const read=/^(list|read|search|get)/.test(key);
   if(['getProjectDetail','getFundDetail'].includes(key)&&removed.has(String(args[0])))return null;
   if(!read&&removed.size){

    if((typeof args[0]==='string'&&removed.has(args[0]))||recordReferenceIds(args).some(id=>removed.has(id)))throw Object.assign(new Error('record_deleted'),{statusCode:409,code:'record_deleted'});
   }
   const result=await fn.apply(target,args);
   if((!read&&key!=='lpTransaction')||!removed.size)return result;
   const filter=(value:any):any=>Array.isArray(value)?value.filter(v=>!v||typeof v!=='object'||!removed.has(v.id)&&!(key.startsWith('search')&&removed.has(v.materialId))).map(filter):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,filter(v)])):value;
   const filtered=filter(result);if(key==='getFundDetail'&&filtered?.fund&&Array.isArray(filtered.investors))filtered.fund.investorCount=filtered.investors.length;if(key==='listFunds'&&data.entries.some(e=>e.kind==='investor'&&e.deletedAt)){const investors=await raw.lpTransaction(s=>s.investors);for(const fund of filtered)fund.investorCount=investors.filter(i=>i.fundId===fund.id&&!removed.has(i.id)).length;}return filtered;
  };
 }});
}
