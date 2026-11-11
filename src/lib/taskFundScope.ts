export const visibleFundsTaskScope='__visible_funds__';
export function matchesTaskFund(task:{id?:string;fundId?:string},scope:string,funds:readonly {id:string}[]){return !scope||(scope===visibleFundsTaskScope?funds.some(f=>f.id===task.fundId):task.fundId===scope);}
export function isOpenWorkspaceTask(task:{id?:string;status?:string}){return !['complete','cancelled'].includes(task.status??'');}
export function hasTaskTestMarker(title:string,objectName=''){return /(^|[\s-])QA|测试|合成|隔离|\btest\b/i.test(title+' '+objectName);}
