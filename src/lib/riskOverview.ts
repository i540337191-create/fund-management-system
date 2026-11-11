import {normalizeDataPurpose} from './dataOrigin.ts';
export const overviewLevels=['高','中','低','未知'] as const;
export type OverviewLevel=typeof overviewLevels[number];
export type OverviewRecord={kind:'manual'|'reference';level?:string;target?:string;state:string;origin?:string;purpose?:string};
export function summarizeRiskOverview(records:OverviewRecord[]){
 const levels:Record<OverviewLevel,number>={高:0,中:0,低:0,未知:0};
 const objects=new Map<string,{target:string;total:number;levels:Record<OverviewLevel,number>}>();
 let manual=0,pending=0,resolved=0,unverified=0,demo=0,unverifiedManual=0,unknownStatus=0;
 for(const row of records){
  const level:OverviewLevel=row.level==='高'||row.level==='中'||row.level==='低'?row.level:'未知';levels[level]++;
  const target=row.target?.trim()||'未明确对象';let group=objects.get(target);if(!group){group={target,total:0,levels:{高:0,中:0,低:0,未知:0}};objects.set(target,group);}group.total++;group.levels[level]++;
  if(row.kind==='manual'){manual++;if(normalizeDataPurpose(row.purpose)==='unknown')unverifiedManual++;}
  if(row.origin==='seed_demo')demo++;
  if(row.state==='已处理')resolved++;
  else if(row.state==='待跟进'||row.state==='已建立跟进任务')pending++;
  else if(row.state==='待核验')unverified++;
  else unknownStatus++;
 }
 return {total:records.length,levels,objects:[...objects.values()].sort((a,b)=>b.total-a.total||a.target.localeCompare(b.target,'zh-CN')),manual,pending,resolved,unverified,demo,unverifiedManual,unknownStatus};
}
