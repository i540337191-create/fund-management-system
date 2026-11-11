import type { DataOrigin } from './store.ts';
import { fail } from './workflow.ts';
export type DataPurpose = 'unknown'|'engineering_fixture';
export type SourceBasis = { id:string; recordType?:string; projectId?:string; dataOrigin:DataOrigin|string; dataPurpose?:DataPurpose };
export type SourceRecord = { dataOrigin?: DataOrigin | string; dataPurpose?: DataPurpose; currentVersionPurpose?:DataPurpose; currentVersionId?:string|null; sourceBasis?: SourceBasis[] };
export function normalizeDataPurpose(value:unknown):DataPurpose { return value==='engineering_fixture'?'engineering_fixture':'unknown'; }
export function engineeringSource(record:SourceRecord):boolean { return normalizeDataPurpose(record.dataPurpose)==='engineering_fixture'||normalizeDataPurpose(record.currentVersionPurpose)==='engineering_fixture'||Boolean(record.sourceBasis?.some(v=>normalizeDataPurpose(v.dataPurpose)==='engineering_fixture')); }
export function hiddenSource(record:SourceRecord):boolean { return normalizeDataOrigin(record.dataOrigin)==='seed_demo'||engineeringSource(record); }
const origins = new Set(['unknown','seed_demo','source_pdf_ocr','source_file','user_input','system_generated']);
export function normalizeDataOrigin(value: unknown): DataOrigin { return typeof value==='string' && origins.has(value) ? value as DataOrigin : 'unknown'; }
export function sourceOf(record: SourceRecord) { return { dataPurpose:normalizeDataPurpose(record.dataPurpose), dataOrigin: normalizeDataOrigin(record.dataOrigin), ...((record.sourceBasis||record.currentVersionId) ? { sourceBasis: [...(record.sourceBasis??[]),...(record.currentVersionId?[{id:record.currentVersionId,recordType:'material_version',projectId:'',dataOrigin:record.dataOrigin??'unknown',dataPurpose:normalizeDataPurpose(record.currentVersionPurpose)}]:[])].map((v:SourceBasis)=>({id:v.id,...(typeof v.recordType==='string'?{recordType:v.recordType}:{}),...(typeof v.projectId==='string'?{projectId:v.projectId}:{}),dataOrigin:normalizeDataOrigin(v.dataOrigin),dataPurpose:normalizeDataPurpose(v.dataPurpose)})) } : {}) }; }
export function sourceBasisOf(record:SourceRecord & {id:string;recordType?:string;projectId?:string|null},recordType=record.recordType,projectId=record.projectId):SourceBasis[] { const source=sourceOf(record);return [{id:record.id,...(recordType?{recordType,...(typeof projectId==='string'?{projectId}:{})}:{}),dataOrigin:source.dataOrigin,dataPurpose:source.dataPurpose},...(source.sourceBasis??[])]; }
// A selected historical version must not inherit the material's current-version purpose.
export function materialVersionSourceBasis(material:SourceRecord & {id:string},version?:{id:string;dataPurpose?:DataPurpose}):SourceBasis[] {
 return [...sourceBasisOf({...material,currentVersionId:null,currentVersionPurpose:'unknown'},'material',''),...(version?[{id:version.id,recordType:'material_version',projectId:'',dataOrigin:normalizeDataOrigin(material.dataOrigin),dataPurpose:normalizeDataPurpose(version.dataPurpose)}]:[])];
}
// Copy entries so later purpose overlays cannot mutate sealed evidence through shared references.
export function retainEvidenceSource<T extends SourceRecord>(record:T,refs:{sourceBasis?:SourceBasis[]}[]):T {
 const basis=refs.flatMap(ref=>(ref.sourceBasis??[]).map(v=>({...v})));if(basis.length)record.sourceBasis=[...(record.sourceBasis??[]),...basis];return record;
}
export function confirmedSource(record: SourceRecord): boolean { const origin=normalizeDataOrigin(record.dataOrigin); return !hiddenSource(record) && origin!=='unknown' && origin!=='seed_demo' && (origin!=='system_generated' || Boolean(record.sourceBasis?.length)) && (record.sourceBasis??[]).every(v=>['user_input','source_file','source_pdf_ocr'].includes(normalizeDataOrigin(v.dataOrigin))); }
export function parseIncludeDemo(value: unknown): boolean { if(value===undefined)return true;if(value==='true'||value===true)return true;if(value==='false'||value===false)return false;fail('invalid_include_demo',400); }
export function inputSource(prior?:SourceRecord & {id?:string},recordType?:string,projectId?:string) { return {dataPurpose:'unknown' as const,dataOrigin:'user_input' as const,...(prior?{sourceBasis:sourceBasisOf({...prior,id:prior.id??'prior'},recordType,projectId)}:{})}; }
export function readSourceRows<T extends object>(records: T[] | undefined, includeDemo: boolean): (T & ReturnType<typeof sourceOf>)[] {
 return (records??[]).filter(v=>includeDemo||!hiddenSource(v as SourceRecord)).map(v=>({...structuredClone(v),...sourceOf(v as SourceRecord)}));
}
export function readSourcePolicy(includeDemo: boolean) { return {includeDemo,unknownAmounts:includeDemo?'included' as const:'excluded' as const,countUnit:'records' as const}; }
export function reportExportSource(record:SourceRecord, report?:SourceRecord & {id:string}) {
 const own=normalizeDataOrigin(record.dataOrigin),origin=normalizeDataOrigin(report?.dataOrigin);
 return {dataPurpose:normalizeDataPurpose(record.dataPurpose),dataOrigin:own==='seed_demo'||origin==='seed_demo'?'seed_demo' as const:report&&confirmedSource({dataOrigin:report.dataOrigin,sourceBasis:report.sourceBasis?.map(v=>({id:v.id,dataOrigin:v.dataOrigin}))})?'system_generated' as const:'unknown' as const,sourceBasis:report?sourceBasisOf(report,'report',''):[]};
}
