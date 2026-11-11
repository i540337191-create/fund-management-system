export type SourcedCandidate={key:string;value:string;quote:string;materialId:string;page:number};
export function intakeCandidateDifferences(candidates:SourcedCandidate[]){
 const groups=new Map<string,SourcedCandidate[]>();
 for(const candidate of candidates){const group=groups.get(candidate.key)??[];group.push(candidate);groups.set(candidate.key,group);}
 return [...groups].filter(([,rows])=>new Set(rows.map(row=>row.value.trim())).size>1).map(([key,rows])=>({key,values:[...new Set(rows.map(row=>row.value.trim()))],sources:rows.map(row=>({materialId:row.materialId,page:row.page,quote:row.quote}))}));
}
