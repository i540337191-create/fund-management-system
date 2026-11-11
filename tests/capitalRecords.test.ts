import assert from "node:assert/strict";
import test from "node:test";
import { aiCapitalRecord, createManualCapitalRecord, sameManualCapitalRecord, prependManualCapitalRecord, upsertAiCapitalRecord } from "../src/lib/capitalRecords.ts";
import type { CapitalItem } from "../src/data/capital.ts";

test("adds an AI confirmed capital record when it is not already present", () => {
  const records = upsertAiCapitalRecord([]);

  assert.equal(records.length, 1);
  assert.deepEqual(records[0], aiCapitalRecord);
});

test("marks the existing matching capital record as AI confirmed instead of duplicating it", () => {
  const existing: CapitalItem = {
    ...aiCapitalRecord,
    source: undefined,
    confirmationStatus: undefined,
  };

  const records = upsertAiCapitalRecord([existing]);

  assert.equal(records.length, 1);
  assert.equal(records[0].source, "AI 数字员工");
  assert.equal(records[0].confirmationStatus, "AI 已确认");
});

test("creates a manual capital record and places it at the top of the list", () => {
  const record = createManualCapitalRecord({
    company: "测试企业",
    fund: "测试基金",
    received: "1000 万元",
    date: "2026-05-02",
    rule: "年化 2%，按日计费",
    receivable: "120,000 元",
    dueDate: "2026-05-10",
    status: "未收",
  });
  const records = prependManualCapitalRecord([aiCapitalRecord], record);

  assert.equal(record.source, "人工创建");
  assert.equal(record.confirmationStatus, "待确认");
  assert.equal(records[0], record);
  assert.equal(records.length, 2);
});

test('unknown manual capital write readback requires stable ID and exact fund and original facts',()=>{
 const row={...aiCapitalRecord,id:'capital-retry',fundId:'fund-a'};
 assert.equal(sameManualCapitalRecord(row,{...row,fund:'新名'}),true);
 assert.equal(sameManualCapitalRecord({...row,fundId:'fund-b'},row),false);
 assert.equal(sameManualCapitalRecord({...row,receivable:'1元'},row),false);
 assert.equal(sameManualCapitalRecord({...row,id:'other'},row),false);
 assert.equal(sameManualCapitalRecord(aiCapitalRecord,aiCapitalRecord),false);
});

test('manual capital readback recovers an unknown commit only within the same session',async()=>{
 const {saveManualCapitalRecord}=await import('../src/lib/capitalRecords.ts');
 const row={...createManualCapitalRecord({...aiCapitalRecord}),id:'capital-unknown',fundId:'fund-a'};
 let reads=0;
 const api={createCapitalRecord:async()=>{throw Error('controlled response loss');},getCapitalRecords:async()=>{reads++;return {capitalRecords:[row]};}} as Parameters<typeof saveManualCapitalRecord>[0];
 const result=await saveManualCapitalRecord(api,row);assert.equal(result.capitalRecord.id,row.id);assert.equal(reads,1);
});

test('manual capital recovery cannot cross session epoch or apply a delayed readback',async()=>{
 const {saveManualCapitalRecord}=await import('../src/lib/capitalRecords.ts');
 const {invalidateClientSession}=await import('../src/lib/sessionBoundary.ts');
 const row={...createManualCapitalRecord({...aiCapitalRecord}),id:'capital-old-scope',fundId:'fund-a'};
 let reads=0;
 const changed={createCapitalRecord:async()=>{invalidateClientSession();throw Object.assign(Error('late old response'),{status:409,code:'client_session_changed'});},getCapitalRecords:async()=>{reads++;return {capitalRecords:[row]};}} as Parameters<typeof saveManualCapitalRecord>[0];
 await assert.rejects(saveManualCapitalRecord(changed,row),{code:'client_session_changed'});assert.equal(reads,0);
 const delayed={createCapitalRecord:async()=>{throw Error('unknown commit');},getCapitalRecords:async()=>{reads++;invalidateClientSession();return {capitalRecords:[row]};}} as Parameters<typeof saveManualCapitalRecord>[0];
 await assert.rejects(saveManualCapitalRecord(delayed,row),{code:'client_session_changed'});
});

test('manual capital recovery requires the explicitly selected project or explicit unbound state',()=>{
 const row={...aiCapitalRecord,id:'capital-projected',fundId:'fund-a',projectId:'project-a'};
 assert.equal(sameManualCapitalRecord(row,{...row,projectId:'project-b'}),false);
 assert.equal(sameManualCapitalRecord(row,{...row,projectId:null}),false);
 assert.equal(sameManualCapitalRecord(row,{...row}),true);
});
