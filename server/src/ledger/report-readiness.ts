import type {Report} from './store.ts';
import {WorkflowError} from './workflow.ts';

export class ReportReadinessError extends WorkflowError {
  fields:string[];
  constructor(fields:string[],code='report_not_ready') {
    super(code,409);
    this.fields=fields;
  }
}

// Validate the saved revision inside the same lock that approves or snapshots it.
export function assertReportReady(report:Report) {
  if(!Array.isArray(report.sections)||!report.sections.length)throw new ReportReadinessError(['请先编辑并保存报告正文。'],'report_content_required');
  const fields:string[]=[];
  const checkMarkers=(text:string,location:string)=>{
    const markers=[...new Set(text.match(/\{\s*\{[^{}]*\}\s*\}/gu)??[])];
    for(const marker of markers)fields.push(`${location}：请替换变量 ${marker.replace(/\s+/g,'')} 后重新保存。`);
  };
  for(const [label,value] of [['报告名称',report.name],['报告对象',report.target],['报告类型',report.type],['经办人',report.owner]])checkMarkers(value??'',label);
  report.sections.forEach((section,index)=>{
    const location=`第${index+1}章「${(typeof section?.title==='string'?section.title.trim():'')||'未填写标题'}」`;
    if(!section||typeof section.title!=='string'||!section.title.trim()||typeof section.text!=='string'||!section.text.trim()){fields.push(`${location}：请补齐章节标题和正文后保存。`);return;}
    checkMarkers(section.title,location+'标题');
    checkMarkers(section.text,location);
  });
  for(const field of report.templateSnapshot?.fields??[]){
    if(field.enabled!==false&&field.required&&!report.sections.some(s=>s&&typeof s.title==='string'&&s.title.trim()===field.label.trim()&&typeof s.text==='string'&&s.text.trim()))fields.push(`请补齐模板必填章节「${field.label}」并保存。`);
  }
  if(fields.length)throw new ReportReadinessError(fields);
}
