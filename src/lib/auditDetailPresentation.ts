export function auditDetailPresentation(detail:string){
 try{const value:unknown=JSON.parse(detail);if(value!==null&&typeof value==='object')return {structured:true,text:JSON.stringify(value,null,2)};}catch{}
 return {structured:false,text:detail};
}
