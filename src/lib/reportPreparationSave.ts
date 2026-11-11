import type {ReportRecord} from '../data/reports';
// Retry by stable identity; a lost response must not overwrite a later human edit.
export async function savePreparedReport(draft:ReportRecord,templateRef:{id:string;version:number},io:{list:()=>Promise<ReportRecord[]>;create:(draft:ReportRecord)=>Promise<ReportRecord>;bind:(report:ReportRecord,templateRef:{id:string;version:number})=>Promise<ReportRecord>}){
 let report=(await io.list()).find(r=>r.id===draft.id);
 if(!report)report=await io.create(draft);
 const identity=(r:ReportRecord)=>({type:r.targetType??(r.projectId?'project':r.fundId?'fund':undefined),id:r.targetId??r.projectId??r.fundId});
 const existingTarget=identity(report),draftTarget=identity(draft);
 const sameSections=report.sections?.length===draft.sections?.length&&(report.sections??[]).every((section,index)=>section.title===draft.sections?.[index]?.title&&section.text===draft.sections?.[index]?.text);
 if(!draftTarget.id||existingTarget.id!==draftTarget.id||existingTarget.type!==draftTarget.type||report.name!==draft.name||report.type!==draft.type||!sameSections)throw Error('报告已被修改，请保留本次草稿并在报告列表核对，不能覆盖已有正文。');
 if(report.templateSnapshot?.id===templateRef.id&&report.templateSnapshot.version===templateRef.version)return report;
 if(report.templateSnapshot)throw Error('报告模板已有变化，请在报告列表核对已有版本。');
 return io.bind(report,templateRef);
}
