import assert from "node:assert/strict";
import test from "node:test";
import { capitalItems } from "../src/data/capital.ts";
import { fundInvestors, funds } from "../src/data/funds.ts";
import { reports } from "../src/data/reports.ts";
import {
  confirmFundFeeRecord,
  confirmFundInvestorSignature,
  deriveFundFeeRows,
  deriveFundReportRows,
  deriveFundraisingRows,
} from "../src/lib/fundLedger.ts";

test("derives fundraising rows with the next operational action", () => {
  const rows = deriveFundraisingRows(fundInvestors.filter((investor) => investor.fundId === "advanced-manufacturing"));

  assert.equal(rows[0].name, "演示投资者C");
  assert.equal(rows[0].nextAction, "补齐适当性资料并确认签署");
  assert.equal(rows[0].closed, false);
});

test("confirms investor suitability and signature", () => {
  const investor = fundInvestors.find((item) => item.fundId === "advanced-manufacturing");
  assert.ok(investor);

  const confirmed = confirmFundInvestorSignature(investor);

  assert.equal(confirmed.suitabilityStatus, "已完成");
  assert.equal(confirmed.signStatus, "已签署");
});

test("derives fund report rows bound to the current fund", () => {
  const fund = funds.find((item) => item.id === "fundapp-growth-i");
  assert.ok(fund);

  const rows = deriveFundReportRows(fund, reports, true);

  assert.deepEqual(rows.map((row) => row.name), ["示例成长一期基金 2026 年一季度运营报告"]);
});

test("derives fee rows and confirms a fund fee record", () => {
  const rows = deriveFundFeeRows(capitalItems, "示例成长一期基金");
  const confirmed = confirmFundFeeRecord(rows[0]);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].nextAction, "确认管理费到账");
  assert.equal(confirmed.status, "已收");
  assert.equal(confirmed.confirmationStatus, "AI 已确认");
});

test("server fund reports use exact IDs and never same-name or unbound legacy rows", () => {
  const fund = { ...funds[0], id: "fund-b", name: "同名基金", shortName: "同名" };
  const rows = [{ ...reports[0], id: "report-a", fundId: "fund-a", target: fund.name }, { ...reports[0], id: "legacy", fundId: null, target: fund.name }, { ...reports[0], id: "report-b", fundId: fund.id, target: "显示名称不决定归属" }];
  assert.deepEqual(deriveFundReportRows(fund, rows).map(row => row.id), ["report-b"]);
});

test('fund fee lookup follows stable ID after rename without mixing identical display names',()=>{
 const rows=[{...capitalItems[0],id:'target',fundId:'a',fund:'原名'},{...capitalItems[0],id:'other',fundId:'b',fund:'现名'}];
 assert.deepEqual(deriveFundFeeRows(rows,'现名','a').map(r=>r.id),['target']);
});
