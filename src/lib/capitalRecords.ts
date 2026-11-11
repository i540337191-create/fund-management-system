import {clientSessionEpoch} from './sessionBoundary.ts';
import type {ApiClient} from './apiClient';
import type { CapitalItem } from "../data/capital";

export type ManualCapitalDraft = Omit<CapitalItem, "source" | "confirmationStatus">;

export const aiCapitalRecord: CapitalItem = {
  company: "演示智能设备有限公司",
  fund: "示例成长一期基金",
  received: "3000 万元",
  date: "2026-04-27",
  rule: "年化 2%，按日计费",
  receivable: "407,671 元",
  dueDate: "2026-05-06",
  status: "未收",
  source: "AI 数字员工",
  confirmationStatus: "AI 已确认",
};

export function createManualCapitalRecord(draft: ManualCapitalDraft): CapitalItem {
  return {
    ...draft,
    source: "人工创建",
    confirmationStatus: "待确认",
  };
}

export function prependManualCapitalRecord(items: CapitalItem[], record: CapitalItem) {
  return [record, ...items];
}

export function upsertAiCapitalRecord(items: CapitalItem[]) {
  const existingIndex = items.findIndex(
    (item) =>
      item.company === aiCapitalRecord.company &&
      item.date === aiCapitalRecord.date &&
      item.received === aiCapitalRecord.received,
  );

  if (existingIndex === -1) return [aiCapitalRecord, ...items];

  return items.map((item, index) =>
    index === existingIndex
      ? {
          ...item,
          source: aiCapitalRecord.source,
          confirmationStatus: aiCapitalRecord.confirmationStatus,
        }
      : item,
  );
}

export function sameManualCapitalRecord(stored:CapitalItem,input:CapitalItem){
  return Boolean(input.id&&stored.id===input.id&&(input.projectId===undefined||stored.projectId===input.projectId)&&['fundId','company','received','date','rule','receivable','dueDate','status','source','confirmationStatus'].every(key=>stored[key as keyof CapitalItem]===input[key as keyof CapitalItem]));
}

export async function saveManualCapitalRecord(api:Pick<ApiClient,'createCapitalRecord'|'getCapitalRecords'>,input:CapitalItem){
 const epoch=clientSessionEpoch();
 const current=()=>{if(epoch!==clientSessionEpoch())throw Object.assign(Error('登录上下文已变化，请重新核对本次操作。'),{status:409,code:'client_session_changed'});};
 try{const result=await api.createCapitalRecord(input);current();return result;}
 catch(error){
  current();
  const {status,code}=error as {status?:number;code?:string};
  if(!input.id||status===401||status===403||code==='client_session_changed'||code==='session_context_changed')throw error;
  const existing=await api.getCapitalRecords().then(r=>r.capitalRecords.find(row=>row.id===input.id)).catch(()=>undefined);
  current();
  if(existing&&sameManualCapitalRecord(existing,input))return {capitalRecord:existing,auditEvent:undefined};
  throw error;
 }
}
