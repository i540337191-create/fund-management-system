import assert from "node:assert/strict";
import test from "node:test";
import { capitalItems } from "../src/data/capital.ts";
import {
  deriveCapitalLedger,
  filterCapitalRecords,
  formatYuan,
  parseMoneyToYuan,
} from "../src/lib/capitalLedger.ts";

test("filters capital records by fund and project company", () => {
  const fundRows = filterCapitalRecords(capitalItems, { fund: "示例成长一期基金" });
  const projectRows = filterCapitalRecords(capitalItems, { company: "演示智能设备有限公司" });

  assert.equal(fundRows.length, 2);
  assert.deepEqual(projectRows.map((row) => row.receivable), ["407,671 元"]);
});

test("derives capital ledger totals from visible capital records", () => {
  const ledger = deriveCapitalLedger(capitalItems, { fund: "示例成长一期基金" });

  assert.equal(ledger.totalRecords, 2);
  assert.equal(ledger.pendingCount, 2);
  assert.equal(ledger.overdueCount, 0);
  assert.equal(ledger.totalReceivableYuan, 704383);
  assert.equal(ledger.totalReceivableLabel, "70.4 万");
});

test("parses common Chinese money labels without changing display source", () => {
  assert.equal(parseMoneyToYuan("407,671 元"), 407671);
  assert.equal(parseMoneyToYuan("127.6 万"), 1276000);
  assert.equal(formatYuan(407671), "40.8 万");
});

test('fund ID keeps renamed capital records associated and excludes same-name funds and unbound records',()=>{
 const base=capitalItems[0];
 const records=[{...base,id:'a',fundId:'fund-a',fund:'旧名'},{...base,id:'b',fundId:'fund-b',fund:'新名'},{...base,id:'legacy',fund:'新名'}];
 assert.deepEqual(filterCapitalRecords(records,{fundId:'fund-a',fund:'新名'}).map(r=>r.id),['a']);
 assert.deepEqual(filterCapitalRecords(records,{fundId:'fund-a',fund:'新名',allowLegacyName:true}).map(r=>r.id),['a','legacy']);
});

test('project capital ledger uses stable project ID and does not consume same-name unbound capital history',()=>{
 const rows=[{...capitalItems[0],id:'a',projectId:'a',company:'旧名称'},{...capitalItems[0],id:'b',projectId:'b',company:'现名称'},{...capitalItems[0],id:'unknown',projectId:null,company:'现名称'}];
 assert.deepEqual(filterCapitalRecords(rows,{projectId:'a',company:'现名称'}).map(r=>r.id),['a']);
});
