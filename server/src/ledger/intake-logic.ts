import {validCalendarDate,negativeFinancialValue} from './business-value-checks.ts';
export type LogicCandidate={key:string;value:string;quote:string;materialId:string;page:number};
export type LogicField={key:string;label:string;type?:string;required?:boolean;nonNegative?:boolean};
export type IntakeLogicIssue={code:string;key?:string;candidateIndex?:number;message:string;materialIds?:string[];severity:'review'|'error'};
const empty=(value:unknown)=>value===undefined||value===null||typeof value==='string'&&!value.trim();
export function intakeLogicIssues(input:{candidates:LogicCandidate[];fields:LogicField[];currentFields?:Record<string,unknown>;targetName?:string;sourceCount?:number;sources?:{materialId:string;page:number;text:string}[];dateRanges?:{fromKey:string;toKey:string;label:string}[]}){
 const issues:IntakeLogicIssue[]=[],current=input.currentFields??{},byKey=new Map(input.fields.map(f=>[f.key,f]));
 for(const field of input.fields)if(field.required&&empty(current[field.key]))issues.push({code:'required_field_missing',key:field.key,message:`请补充“${field.label}”。${input.candidates.some(c=>c.key===field.key)?'原件已有候选，请核对后采用。':'原件尚未提供可采用的依据，请补充原件或人工核对填写。'}`,severity:'error'});
 if(input.sourceCount&&input.candidates.length===0)issues.push({code:'no_relevant_candidate',message:'原件尚未提取到当前业务字段。请确认是否上传了正确对象的资料；也可以保留原件并人工填写。',severity:'review'});
 const groups=new Map<string,LogicCandidate[]>();
 input.candidates.forEach((candidate,index)=>{
  const field=byKey.get(candidate.key),label=field?.label??'当前字段',row=groups.get(candidate.key)??[];row.push(candidate);groups.set(candidate.key,row);
  const push=(code:string,message:string,severity:'review'|'error')=>issues.push({code,key:candidate.key,candidateIndex:index,message,materialIds:[candidate.materialId],severity});
  if(field?.type==='date'&&!validCalendarDate(candidate.value))push('invalid_calendar_date',`“${label}”不是有效的年月日，请核对原文后填写 YYYY-MM-DD，不自动修正日期。`,'error');
  if(field?.type==='number'&&!/^[-+]?\d+(?:\.\d+)?$/.test(candidate.value))push('invalid_number',`“${label}”需要明确数值。请核对金额单位或百分比口径，填写与字段单位一致的数字，不自动换算。`,'error');
  if((field?.nonNegative||candidate.key==='scale')&&negativeFinancialValue(candidate.value))push('negative_nonnegative_amount',`“${label}”不能为负数。请核对原文符号、金额及单位后再填写。`,'error');
  if(candidate.key==='name'&&input.targetName&&candidate.value.replace(/\s/g,'')!==input.targetName.replace(/\s/g,''))push('object_name_differs','原文对象名称与当前业务对象不同。请确认是更名、其他主体的关联资料，还是上传了不同对象的文件；确认前不替换名称。','review');
  if(!candidate.quote.replace(/\s/g,'').includes(candidate.value.replace(/\s/g,'')))push('candidate_requires_interpretation',`“${label}”的候选不是原文逐字内容。请核对是否涉及概括、日期格式或单位换算，确认后再采用。`,'review');
 });
 for(const [key,rows]of groups)if(new Set(rows.map(c=>c.value.trim())).size>1)issues.push({code:'multiple_source_values',key,message:`“${byKey.get(key)?.label??'当前字段'}”有不同原文候选。请核对对象、时间及单位，并确认采用哪一项；系统不自动判定哪份正确。`,materialIds:[...new Set(rows.map(c=>c.materialId))],severity:'review'});
 const originals=new Map<string,string[]>();for(const source of input.sources??[]){const pages=originals.get(source.materialId)??[];pages.push(source.text);originals.set(source.materialId,pages);}
 if(input.targetName)for(const [materialId,pages]of originals)if(!pages.some(text=>text.replace(/\s/g,'').includes(input.targetName!.replace(/\s/g,''))))issues.push({code:'source_object_unconfirmed',message:'该原件未出现当前对象名称。请确认是否为该对象的关联资料，确认前不据此替换对象信息。',materialIds:[materialId],severity:'review'});
 for(const source of input.sources??[]){
  for(const field of input.fields){const lines=source.text.split(/\r?\n/).filter(line=>line.includes(field.label));for(const line of lines){
   const value=line.slice(line.indexOf(field.label)+field.label.length).replace(/^[\s：:]+/,''),date=/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/.exec(value);
   if(field.type==='date'&&date&&!validCalendarDate(`${date[1]}-${date[2].padStart(2,'0')}-${date[3].padStart(2,'0')}`)&&!issues.some(i=>i.key===field.key&&i.code==='invalid_calendar_date'&&i.materialIds?.includes(source.materialId)))issues.push({code:'invalid_source_calendar_date',key:field.key,message:`“${field.label}”原文出现无效年月日，请核对正确日期；不采用自动归一化后的日期。`,materialIds:[source.materialId],severity:'error'});
   if((field.nonNegative||field.key==='scale')&&negativeFinancialValue(value)&&!issues.some(i=>i.key===field.key&&i.code==='negative_nonnegative_amount'&&i.materialIds?.includes(source.materialId)))issues.push({code:'negative_nonnegative_amount',key:field.key,message:`“${field.label}”原文为负数，请核对符号、金额及单位。`,materialIds:[source.materialId],severity:'error'});
   if(field.type==='number'&&/(万元|亿元|万|亿|%|％)/.test(value))issues.push({code:'source_unit_requires_confirmation',key:field.key,message:`“${field.label}”原文带有计量单位或百分比，请核对与字段要求的单位是否一致；系统不直接换算后写入。`,materialIds:[source.materialId],severity:'review'});
  }}
 }
 for(const range of input.dateRanges??[]){const from=current[range.fromKey],to=current[range.toKey];if(typeof from==='string'&&typeof to==='string'&&validCalendarDate(from)&&validCalendarDate(to)&&from>to)issues.push({code:'date_range_reversed',key:range.toKey,message:`“${range.label}”结束日期早于开始日期，请核对两个日期，不自动调换。`,severity:'error'});}
 return issues;
}
