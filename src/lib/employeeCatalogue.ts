import type {WorkspaceRecord} from './agentWorkspaceClient';

export const abilityCategories=['全部能力','资料与知识','业务与分析','执行与协同','规则与方法','自定义能力'];
export const pluginCategories=['全部连接','业务系统','资料目录','公开信源'];
export function employeeCategory(row:WorkspaceRecord,kind:string){
 if(kind==='plugins')return ({business:'业务系统','local-library':'资料目录','public-feed':'公开信源'} as Record<string,string>)[row.kind]??'其他连接';
 if(!row.builtin)return '自定义能力';
 if(['skill-knowledge','skill-intake','skill-materials'].includes(row.id))return '资料与知识';
 if(['skill-business','skill-profile','skill-fee','skill-investor','skill-risk','skill-report','skill-weekly'].includes(row.id))return '业务与分析';
 if(['skill-memory','skill-templates','skill-admin-system'].includes(row.id))return '规则与方法';
 return '执行与协同';
}
// Only identity and timestamps may differ; permissions, versions and every configuration field must match.
function canonical(value:unknown):unknown{
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)]));
 return value;
}
export function groupEmployeeRecords(rows:WorkspaceRecord[]){
 const groups:{record:WorkspaceRecord;duplicates:WorkspaceRecord[]}[]=[],byConfig=new Map<string,typeof groups[number]>();
 for(const row of rows){
  const key=(row.builtin?row.id+':':'')+JSON.stringify(canonical(Object.fromEntries(Object.entries(row).filter(([key])=>!['id','createdAt','updatedAt'].includes(key)))));
  const existing=byConfig.get(key);
  if(existing)existing.duplicates.push(row);else{const group={record:row,duplicates:[]};groups.push(group);byConfig.set(key,group);}
 }
 return groups;
}

const businessFamilies=[
 {ids:['skill-knowledge','skill-intake','skill-materials'],title:'资料查阅与整理',description:'查找资料中的原文，识别上传的文件，核对缺失材料，整理成待核对草稿和补件清单。'},
 {ids:['skill-profile','skill-risk'],title:'项目分析与风险跟进',description:'根据已有资料梳理项目情况、投资要点和风险线索，列出依据及需要跟进的事项。'},
 {ids:['skill-report','skill-weekly'],title:'报告与周报撰写',description:'根据业务资料和实际任务起草报告、工作周报及下周计划，标出依据和待补充内容。'},
];
export function employeeSearchText(row:WorkspaceRecord,kind:string){
 const family=kind==='skills'&&row.builtin?businessFamilies.find(f=>f.ids.includes(row.id)):undefined;
 return [row.title,row.description??row.text??row.note??'',family?.title,family?.description].filter(Boolean).join(' ');
}
// Group business purposes for browsing; keep each member's permissions and switches independent.
export function businessEmployeeGroups(rows:WorkspaceRecord[],kind:string){
 const entries=groupEmployeeRecords(rows).map(group=>({...group,members:[] as ReturnType<typeof groupEmployeeRecords>,title:'',description:''}));
 if(kind!=='skills')return entries;
 const result:typeof entries=[],families=new Map<string,typeof entries[number]>();
 for(const entry of entries){
  const family=entry.record.builtin?businessFamilies.find(f=>f.ids.includes(entry.record.id)):undefined;
  if(!family){result.push(entry);continue;}
  const existing=families.get(family.title);
  if(existing)existing.members.push(entry);else{const group={...entry,title:family.title,description:family.description,members:[entry]};families.set(family.title,group);result.push(group);}
 }
 return result.map(group=>group.members.length>1?group:{...group,members:[]});
}
