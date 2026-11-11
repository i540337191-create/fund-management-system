import assert from "node:assert/strict";
import test from "node:test";
import { fundClauseMonitors, fundDocuments, fundInvestors, funds } from "../src/data/funds.ts";

const fundIds = new Set(funds.map((fund) => fund.id));

test("fund ledger child records reference known funds", () => {
  const referencedIds = [
    ...fundInvestors.map((investor) => investor.fundId),
    ...fundDocuments.map((document) => document.fundId),
    ...fundClauseMonitors.map((clause) => clause.fundId),
  ];

  assert.equal(referencedIds.every((fundId) => fundIds.has(fundId)), true);
});

test("advanced manufacturing ledger does not include fundapp growth records", () => {
  const advancedFund = funds.find((fund) => fund.id === "advanced-manufacturing");
  assert.ok(advancedFund);

  const investorNames = fundInvestors
    .filter((investor) => investor.fundId === advancedFund.id)
    .map((investor) => investor.name);
  const documentNames = fundDocuments
    .filter((document) => document.fundId === advancedFund.id)
    .map((document) => document.name);
  const clauseNames = fundClauseMonitors
    .filter((clause) => clause.fundId === advancedFund.id)
    .map((clause) => clause.title);

  assert.deepEqual(investorNames, ["演示投资者C"]);
  assert.deepEqual(documentNames, ["先进制造投资者适当性补充清单.xlsx"]);
  assert.deepEqual(clauseNames, ["投资者适当性资料补齐"]);
});
