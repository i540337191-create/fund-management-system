export function sameTemplateStage(left:string|undefined,right:string|undefined){return left===right||['投后','投后管理'].includes(left??'')&&['投后','投后管理'].includes(right??'');}
