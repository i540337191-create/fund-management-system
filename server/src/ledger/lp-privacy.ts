import { lpDerivedFieldSet, lpNumericFields } from './lp-privacy-fields.ts';
import { termChoices } from './return-basis.ts';
import type { SessionUser } from '../auth/session.ts';
import type { LedgerStore, Material } from './store.ts';
export const isLpMaterial = (material: Material) => Boolean(material.lpSensitive || material.relationships?.investors?.length || material.primaryScope === 'investor' || material.type === '投资者适当性资料');
export const canReadLp = (user: SessionUser | null) => Boolean(user && ['admin','investment_manager','finance','legal'].includes(user.role));
export async function lpProjection(store: LedgerStore) {
  const registry = await store.readLpPrivacy();
  const values = [...new Set(registry.identities.map(i=>i.name).filter(Boolean))].sort((a,b)=>b.length-a.length);
  const ids = new Set(registry.identities.map(i=>i.id));
  const replace = (value:string,token:string) => /^[A-Za-z0-9_]{1,2}$/.test(token)
    ? value.replace(new RegExp(`(?<![A-Za-z0-9_])${token}(?![A-Za-z0-9_])`,'g'),'[LP信息已脱敏]')
    : value.split(token).join('[LP信息已脱敏]');
  const text = (value:string) => {
    const unmasked=value.split('[LP信息已脱敏]').join('');
    const matched=[...values,...registry.materialIds].some(v=>[...new Set([v,encodeURIComponent(v)])].some(token=>replace(unmasked,token)!==unmasked));
    return matched ? '[LP信息已脱敏]' : value;
  };
  const identifier = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;
  const protocol = (key:string,value:string) => (
    (/^(?:id|.*Id|.*Ids)$/.test(key) && identifier.test(value)) ||
    (/^(?:sha256|contentHash|basisContentHash|sourceHash|sourceVersionHash|sourceFingerprint|fingerprint|snapshotHash)$/.test(key) && /^[a-f0-9]{64}$/i.test(value)) ||
    (['recordType','objectType','dataOrigin','dataPurpose','role','error','code','mode','relationType','status','state'].includes(key) && /^[a-z][a-z0-9_:-]*$/.test(value)) ||
    (key==='type' && ['text','number','boolean','date','singleChoice','multiChoice'].includes(value)) ||
    (['downloadHref','href','fileHref'].includes(key) && /^\/api\/(?:materials\/[A-Za-z0-9_.:-]+(?:\/versions\/[A-Za-z0-9_.:-]+)?\/file|projects\/[A-Za-z0-9_.:-]+\/(?:approvals|diligence\/submissions)\/[A-Za-z0-9_.:-]+\/materials\/[A-Za-z0-9_.:-]+\/file|projects\/[A-Za-z0-9_.:-]+\/(?:deals\/[A-Za-z0-9_.:-]+|post-investment|exit-settlements|returns)\/files\/[A-Za-z0-9_.:-]+)$/.test(value))
  );
  const materialIds=new Set(registry.materialIds);
  const versionParents=new Map((registry.materialVersions??[]).map(v=>[v.id,v.materialId]));
  const directMaterial = (object:Record<string,unknown>,slot='') => {
    if(typeof object.materialId==='string'&&materialIds.has(object.materialId))return 'lp_privacy_forbidden';
    const type=object.recordType??object.sourceType;
    const id=type&&object.sourceId!==undefined?object.sourceId:object.id;
    if(type==='material_version'&&typeof id==='string') {
      const parent=versionParents.get(id);
      return parent===undefined?'material_privacy_unknown':materialIds.has(parent)?'lp_privacy_forbidden':null;
    }
    const typed=type!==undefined?type==='material':['material','materials'].includes(slot)||('type' in object&&'path' in object&&'fundId' in object);
    return typed&&typeof id==='string'&&materialIds.has(id)?'lp_privacy_forbidden':null;
  };
  type MaterialIssue='lp_privacy_forbidden'|'material_privacy_unknown';
  const marker=(issue:MaterialIssue)=>issue==='material_privacy_unknown'?'[资料关联待核实]':'[LP信息已脱敏]';
  let linkedIssues=new WeakMap<object,MaterialIssue>();
  const hasLpMaterial = (value:unknown,slot=''):MaterialIssue|null => {
    if(!value||typeof value!=='object')return null;
    if(slot==='materialIds'&&Array.isArray(value)&&value.some(id=>typeof id==='string'&&materialIds.has(id)))return 'lp_privacy_forbidden';
    const linked=linkedIssues.get(value);
    const issues=Array.isArray(value)?value.map(v=>hasLpMaterial(v,slot)):[linked,directMaterial(value as Record<string,unknown>,slot),...Object.entries(value).map(([k,v])=>hasLpMaterial(v,k))];
    return issues.includes('lp_privacy_forbidden')?'lp_privacy_forbidden':issues.includes('material_privacy_unknown')?'material_privacy_unknown':null;
  };
  const safeMaterialKeys=new Set(['id','materialId','versionId','currentVersionId','version','currentVersion','sha256','contentHash','sizeBytes','page','pages','recordType','sourceType','sourceId','projectId','fundId','dataOrigin','dataPurpose','sourceBasis','readIssue']);
  const derivedTextKeys=lpDerivedFieldSet;
  const redactDerived = (value:unknown,key='',issue:MaterialIssue='lp_privacy_forbidden',textMap=false):unknown => {
    if(typeof value==='string') {
      const choice=(termChoices as Record<string,readonly string[]>)[key];
      const safe=!textMap&&(protocol(key,value)||lpNumericFields.has(key)&&/^-?\d+(?:\.\d+)?$/.test(value)||/^(?:date|time|.*Date|.*At|value)$/.test(key)&&/^\d{4}(?:-\d\d(?:-\d\d)?)?(?:T[0-9:.]+Z)?$/.test(value)||({currency:['CNY'],direction:['outflow','inflow'],decision:['approve','return','reject'],frequency:['monthly','quarterly','yearly'],kind:['day','month','quarter','half','year','plan','negotiation','agreement','investment_payment','project_fee','project_tax'],origin:['finance_independent','engineering_fixture','system_summary','manual_edit'],irrUnit:['annual_fraction'],type:['project_fund_deal','correction_of_registration']} as Record<string,string[]>)[key]?.includes(value)||choice?.includes(value)||['investment_payment','project_fee','project_tax','exit_receipt'].includes(key)&&['outflow','inflow','exclude'].includes(value));
      return safe&&!['href','downloadHref','fileHref'].includes(key)?value:text(value)!==value?'[LP信息已脱敏]':marker(issue);
    }
    if(Array.isArray(value))return value.map(v=>redactDerived(v,key,issue,textMap));
    if(value&&typeof value==='object') {
      if(['owner','actor','author','reviewer','submittedBy','savedBy','createdBy','generatedBy','project','fund'].includes(key))return walk(value,key,false);
      if(directMaterial(value as Record<string,unknown>,key))return walk(value,key,false);
      return Object.fromEntries(Object.entries(value).filter(([k])=>!['downloadHref','href','fileHref','path','packetBlobId'].includes(k)).map(([k,v])=>[k,redactDerived(v,k,issue,textMap||key==='missingReasons')]));
    }
    return value;
  };
  const walk = (value:unknown,key:string,free:boolean,lpContext=false):unknown => {
    if(typeof value==='string') {
      if(value.startsWith('{')||value.startsWith('[')) {try{const issue=hasLpMaterial(JSON.parse(value));if(issue)return marker(issue);}catch{}}
      return !free && protocol(key,value) ? value : text(value);
    }
    if(Array.isArray(value)) return value.map(v=>walk(v,key,free,lpContext));
    if(value && typeof value==='object') {
      const object=value as Record<string,unknown>;
      const materialIssue=directMaterial(object,key);
      if(materialIssue)return {...Object.fromEntries(Object.entries(object).filter(([k])=>safeMaterialKeys.has(k)).map(([k,v])=>[k,walk(v,k,false)])),name:marker(hasLpMaterial(object,key)??materialIssue),readIssue:materialIssue};
      const derived=hasLpMaterial(object,key);
      const linkedTask=typeof object.projectId==='string'&&typeof object.id==='string'&&linkedIssues.has(object);
      const reportMetadata='target' in object&&'updatedAt' in object&&'type' in object&&'status' in object;

      const investorType=object.recordType??object.sourceType;
      const investorSlot=investorType!==undefined?investorType==='investor':['investor','investors'].includes(key)||('commitment' in object&&'paidIn' in object&&'fundId' in object);
      const investor=lpContext || [object.investorId,...(investorSlot?[object.id,object.sourceId]:[])].some(id=>typeof id==='string'&&ids.has(id));
      return Object.fromEntries(Object.entries(object).map(([k,v])=>[k,derived && (derivedTextKeys.has(k)||linkedTask&&k==='name'||reportMetadata&&['name','target','owner'].includes(k)) && v && !(k==='source'&&typeof v==='object') && !(k==='terms'&&Array.isArray(v)) ? redactDerived(v,k,investor?'lp_privacy_forbidden':derived) : investor && ['name','type','phone','mobile','email','contact','contactName','address','identityNumber','telephone','contactPhone','contactEmail','contactDetails','profile','bankAccount','note','detail','description','content','text','remarks'].includes(k) && v ? '[LP信息已脱敏]' : walk(v,k,free || k==='customFields',investor)]));
    }
    return value;
  };
  const indexDiligenceLinks=(payload:unknown)=>{
    linkedIssues=new WeakMap();
    const tasks=new Map<string,MaterialIssue>();
    const approvalIssues=new Map<string,MaterialIssue>();
    const bind=(projectId:string,id:unknown,kind:string,issue:MaterialIssue|null)=>{if(issue&&typeof id==='string')tasks.set(JSON.stringify([projectId,id,kind]),issue);};
    for(const context of registry.taskContexts??[]){
      const p=context.postInvestment;
      for(const v of p?.visits??[])for(const f of (v.followUps??[]))bind(context.projectId,f.taskId,'manual',hasLpMaterial(v));
      for(const v of [...p?.financials??[],...p?.exitPreparations??[]])bind(context.projectId,v.reviewerTaskId,'post_clause',hasLpMaterial(v));
      for(const v of p?.clauses??[])bind(context.projectId,v.warningTaskId,'post_clause',hasLpMaterial(v));
      for(const v of p?.reports??[])for(const id of (v.taskIds??[]))bind(context.projectId,id,'post_clause',hasLpMaterial(v));
      for(const v of [...p?.returnBases??[],...p?.returnSamples??[],...p?.cashflowReviews??[]])for(const id of (v.taskIds??[]))bind(context.projectId,id,'review',hasLpMaterial(v));
      for(const d of context.deals??[])for(const schedule of d.closing?.responsibility?.schedules??[])for(const id of [schedule.taskId,...schedule.taskIds??[]])bind(context.projectId,id,'manual',hasLpMaterial(d.closing)??hasLpMaterial(d));
      for(const round of context.rounds??[]){const issue=hasLpMaterial(round);if(issue)approvalIssues.set(JSON.stringify([context.projectId,round.id]),issue);}
    }
    const visit=(value:unknown,bindTasks=false):void=>{
      if(!value||typeof value!=='object')return;
      if(Array.isArray(value)){value.forEach(v=>visit(v,bindTasks));return;}
      const object=value as Record<string,unknown>;
      if(!bindTasks&&typeof object.projectId==='string'&&Array.isArray(object.items)&&Array.isArray(object.reports)&&Array.isArray(object.supplements)) {
        const items=new Map(object.items.filter(v=>v&&typeof v==='object').map(v=>[v.id,hasLpMaterial(v)]));
        const findings=Array.isArray(object.findings)?object.findings:[];
        for(const record of [...object.items,...findings,...object.reports]){
          const issue=hasLpMaterial(record);if(!issue)continue;
          for(const id of [record.taskId,...(record.reviewTaskIds??[])])if(typeof id==='string')tasks.set(JSON.stringify([object.projectId,id,'diligence']),issue);
        }
        const reports=new Map(object.reports.filter(v=>v&&typeof v==='object').map(v=>[v.id,hasLpMaterial(v)]));
        for(const supplement of object.supplements){
          if(!supplement||typeof supplement!=='object')continue;
          const issue=items.get(supplement.itemId)??reports.get(supplement.reportId);
          if(issue){linkedIssues.set(supplement,issue);if(typeof supplement.taskId==='string')tasks.set(JSON.stringify([object.projectId,supplement.taskId,'diligence']),issue);}
        }
      }
      if(bindTasks&&typeof object.projectId==='string'&&typeof object.id==='string'){
        const issue=tasks.get(JSON.stringify([object.projectId,object.id,object.kind]))??(['review','supplement'].includes(String(object.kind))?approvalIssues.get(JSON.stringify([object.projectId,object.approvalRoundId])):undefined);if(issue)linkedIssues.set(object,issue);
      }
      Object.values(object).forEach(v=>visit(v,bindTasks));
    };
    visit(registry.diligenceCases??[]);visit(payload);visit(payload,true);
  };
  // Protocol exemptions apply only to server DTOs, never client-supplied context.
  const project = (value:unknown) => {indexDiligenceLinks(value);return walk(value,'',false);};
  const freeText = (value:unknown) => {indexDiligenceLinks(value);return walk(value,'',true);};
  const privateHeader = (name:string,value:string) => {
    const decode=(v:string)=>{try{return decodeURIComponent(v);}catch{return v;}};
    if(name==='content-disposition') {
      const filenames=[...value.matchAll(/(?:^|;)\s*(filename\*?)\s*=\s*(?:"([^"]*)"|([^;]*))/gi)];
      return filenames.some(match=>{
        const raw=(match[2]??match[3]??'').trim();
        const filename=match[1].endsWith('*')?decode(raw.replace(/^[^']*'[^']*'/,'')):raw;
        return text(filename)!==filename;
      });
    }
    if(name==='location') {
      try {
        const location=new URL(value,'http://local.invalid');
        const path=decode(location.pathname);
        return JSON.stringify(project({href:path}))!==JSON.stringify({href:path}) ||
          [...location.searchParams.values(),decode(location.hash.slice(1))].some(v=>text(v)!==v);
      } catch { return text(value)!==value; }
    }
    return false;
  };
  return {text,project,freeText,privateHeader,materialIds};
}
