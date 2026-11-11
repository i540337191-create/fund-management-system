export type ReportGeneration={chapterTitles?:string[];id:string;userId:string;type:string;fundId:string;projectId:string;name:string;period:string;templateKey:string;materialIds:string[];ownerId:string;conversationId:string;requestId:string};
const prefix='fundapp.report-generation.v1:';
export const reportGenerationEvent='fundapp:report-generation-changed';
export function readReportGenerations(storage:Pick<Storage,'getItem'>,userId:string):ReportGeneration[]{
 const value=JSON.parse(storage.getItem(prefix+userId)??'[]');
 if(!Array.isArray(value))throw Error('报告任务记录无法读取，请保留当前页面。');
 return value.filter((v:any)=>v&&v.userId===userId&&['id','type','fundId','projectId','name','period','templateKey','ownerId','conversationId','requestId'].every(k=>typeof v[k]==='string')&&Array.isArray(v.materialIds)&&v.materialIds.every((id:unknown)=>typeof id==='string'));
}
export function rememberReportGeneration(storage:Pick<Storage,'getItem'|'setItem'>,task:ReportGeneration){const rows=readReportGenerations(storage,task.userId);storage.setItem(prefix+task.userId,JSON.stringify([...rows.filter(r=>r.id!==task.id),task]));}
export function forgetReportGeneration(storage:Pick<Storage,'getItem'|'setItem'>,task:ReportGeneration){storage.setItem(prefix+task.userId,JSON.stringify(readReportGenerations(storage,task.userId).filter(r=>r.id!==task.id)));}
