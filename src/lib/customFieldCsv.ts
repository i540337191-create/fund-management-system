import {orderedCustomFields,getCustomValue,customValueLabel,isMissingCustom,type CustomExportSnapshot} from './customFields.ts';
import {filterSeedDemoRecords} from './dataOriginFilter.ts';
import {dataOriginLabel,dataPurposeLabel} from './dataOrigin.ts';
// Spreadsheet programs interpret formula prefixes even inside quoted CSV cells.
export function csvCell(value:unknown){const text=value===null||value===undefined?'':String(value);const safe=/^[\s\u0000-\u001f]*[=+\-@]/.test(text)?"'"+text:text;return '"'+safe.replace(/"/g,'""')+'"';}
export function customFieldCsv(snapshot:CustomExportSnapshot,hideDemo:boolean){
 if(!snapshot.schema||!Number.isSafeInteger(snapshot.schema.schemaRevision)||!Array.isArray(snapshot.schema.fields)||!Array.isArray(snapshot.records)||!Number.isFinite(Date.parse(snapshot.capturedAt)))throw Error('导出快照不完整，请重新读取。');
 const fields=orderedCustomFields(snapshot.schema),records=filterSeedDemoRecords(snapshot.records,hideDemo);
 const headers=['记录标识','名称','来源','用途','字段设置版本','数据填写版本','快照时间（UTC）','待补录字段'];
 for(const f of fields){headers.push(`${f.label}${f.enabled?'':'（已停用）'} [${f.id}]`);if(f.type==='singleChoice')headers.push(`${f.label}选项标识 [${f.id}]`);}
 const lines=[headers];
 for(const record of records){
  const missing=fields.filter(f=>f.enabled&&f.required&&isMissingCustom(getCustomValue(record.customFields,f.id))).map(f=>f.label).join('、');
  const row=[record.id,record.name,dataOriginLabel(record.dataOrigin),dataPurposeLabel(record.dataPurpose),String(snapshot.schema.schemaRevision),record.schemaRevision===undefined?'':String(record.schemaRevision),snapshot.capturedAt,missing];
  for(const f of fields){const value=getCustomValue(record.customFields,f.id);row.push(isMissingCustom(value)?'':String(customValueLabel(f,value)));if(f.type==='singleChoice')row.push(typeof value==='string'?value:'');}
  lines.push(row);
 }
 return {text:'\uFEFF'+lines.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n',rows:records.length,schemaRevision:snapshot.schema.schemaRevision,capturedAt:snapshot.capturedAt};
}
