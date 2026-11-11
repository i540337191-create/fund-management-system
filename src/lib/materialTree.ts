import type {ApiMaterialRelationships} from './materialFilters.ts';
export type MaterialTreeFile = {recordKey:string;name:string;fund:string;project:string;relationScope?:string;relationships?:ApiMaterialRelationships};
export function groupMaterialTree(rows:MaterialTreeFile[], projects:{name:string;shortName:string;fund:string}[]) {
  const funds = new Map<string, Map<string, MaterialTreeFile[]>>();
  for (const row of rows) {
    const relations=row.relationships;
    const projectNames=relations ? relations.projects.map(p=>p.name) : row.relationScope==='基金'?[]:[row.project];
    const fundNames=relations ? relations.funds.map(f=>f.name) : [row.fund];
    const branches=projectNames.map(name=>{
      const project=projects.find(p=>p.name===name||p.shortName===name);
      return {fund:project?.fund || (fundNames.length===1?fundNames[0]:'未明确基金归属'),project:name};
    });
    for (const fund of fundNames) if (!branches.some(b=>b.fund===fund)) branches.push({fund,project:''});
    if (!branches.length) branches.push({fund:'未关联基金',project:''});
    for (const branch of branches) {
      const fund=branch.fund||'未关联基金';
      if (!funds.has(fund)) funds.set(fund,new Map());
      const groups=funds.get(fund)!;
      if (!groups.has(branch.project)) groups.set(branch.project,[]);
      const files=groups.get(branch.project)!;
      if (!files.some(file=>file.recordKey===row.recordKey)) files.push(row);
    }
  }
  return [...funds].map(([name,groups])=>({name,groups:[...groups].map(([name,files])=>({name,files}))}));
}
