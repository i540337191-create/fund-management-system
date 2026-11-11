export type DataOrigin = "seed_demo" | "source_pdf_ocr" | "source_file" | "user_input" | "system_generated" | "unknown";

export function normalizeDataOrigin(value: string | null | undefined): DataOrigin {
  if (value === "source_pdf_ocr") return "source_pdf_ocr";
  if (value === "source_file") return "source_file";
  if (value === "user_input") return "user_input";
  if (value === "system_generated") return "system_generated";
  if (value === "seed_demo") return "seed_demo";
  return "unknown";
}

export function dataOriginLabel(value: string | null | undefined) {
  const origin = normalizeDataOrigin(value);
  if (origin === "source_pdf_ocr") return "PDF识别物料";
  if (origin === "source_file") return "真实原始物料";
  if (origin === "user_input") return "人工录入数据";
  if (origin === "system_generated") return "系统生成数据";
  return origin === "seed_demo" ? "模拟业务数据" : "来源未核实";
}

export function dataOriginDescription(value: string | null | undefined) {
  const origin = normalizeDataOrigin(value);
  if (origin === "source_pdf_ocr") return "来自本地 PDF 原文和 OCR 识别文本";
  if (origin === "source_file") return "来自本地归档原始文件，尚无 OCR 全文";
  if (origin === "user_input") return "来自用户上传、确认或手工录入，业务真实性与用途仍须核实";
  if (origin === "system_generated") return "由系统生成，内容真实性仍须核对其依据";
  return origin === "seed_demo" ? "用于演示流程的种子业务数据，不等同于 PDF 识别事实" : "缺少可确认的来源标记，不能作为已核实业务事实";
}

export type SourceProvenance={dataOrigin?:string|null;dataPurpose?:string|null;currentVersionPurpose?:string|null;sourceBasis?:{id:string;dataOrigin:string;dataPurpose?:string;recordType?:string;projectId?:string}[]};
export function hasConfirmedSource(record:SourceProvenance){const origin=normalizeDataOrigin(record.dataOrigin);return !isEngineeringRecord(record)&&origin!=='seed_demo'&&origin!=='unknown'&&(origin!=='system_generated'||Boolean(record.sourceBasis?.length))&&(record.sourceBasis??[]).every(v=>!isEngineeringRecord(v)&&['user_input','source_file','source_pdf_ocr'].includes(normalizeDataOrigin(v.dataOrigin)));}

export type DataPurpose='engineering_fixture'|'unknown';
export function normalizeDataPurpose(value:string|null|undefined):DataPurpose{return value==='engineering_fixture'?'engineering_fixture':'unknown';}
export function isEngineeringRecord(record:{dataPurpose?:string|null;currentVersionPurpose?:string|null;sourceBasis?:{id?:string;dataOrigin?:string;dataPurpose?:string|null;recordType?:string;projectId?:string}[]}){return normalizeDataPurpose(record.dataPurpose)==='engineering_fixture'||normalizeDataPurpose(record.currentVersionPurpose)==='engineering_fixture'||Boolean(record.sourceBasis?.some(v=>normalizeDataPurpose(v.dataPurpose)==='engineering_fixture'));}
export function dataPurposeLabel(value:string|null|undefined){return normalizeDataPurpose(value)==='engineering_fixture'?'工程测试':'用途未核实';}
