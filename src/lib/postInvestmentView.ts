export function latestPostRecords<T extends {id:string;version:number}>(records:T[]):T[] {
  const latest=new Map<string,T>();
  for(const item of records) if(!latest.has(item.id)||latest.get(item.id)!.version<item.version)latest.set(item.id,item);
  return [...latest.values()];
}
export function postTaskTab(type:string):string { return type==='退出方案审核'?'投资信息':type.startsWith('投后报告')?'报告记录':type==='投后审核'?'投后经营':'履约预警'; }
import type {PostInvestmentState} from './postInvestmentTypes';
export function findPostTaskRecord(post:Pick<PostInvestmentState,'financials'|'clauses'|'reports'|'exitPreparations'>,taskId:string|null) {
  if(!taskId)return undefined;
  return [...post.financials,...post.clauses,...post.reports??[],...post.exitPreparations??[]].find(item=>('reviewerTaskId' in item&&item.reviewerTaskId===taskId)||('warningTaskId' in item&&item.warningTaskId===taskId)||('taskIds' in item&&item.taskIds.includes(taskId)));
}
