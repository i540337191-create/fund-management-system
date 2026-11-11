type Task={id?:string;status?:string;source?:string};
export function taskOverview(rows:readonly Task[]){
 const count=(source:string)=>rows.filter(row=>row.source===source).length;
 const sources=['业务材料','LP募集','项目业务'].map(label=>({label,value:count(label)}));
 sources.push({label:'其他',value:rows.length-sources.reduce((n,s)=>n+s.value,0)});
 return {total:rows.length,open:rows.filter(r=>matchesTaskCompletion(r.status,'active')).length,complete:rows.filter(r=>r.status==='complete').length,cancelled:rows.filter(r=>r.status==='cancelled').length,sources};
}
export function matchesTaskCompletion(status:string|undefined,filter:string){
 return filter==='all'||(filter==='active'?!['complete','cancelled'].includes(status??''):filter==='complete'?status==='complete':filter==='cancelled'?status==='cancelled':['complete','cancelled'].includes(status??''));
}
