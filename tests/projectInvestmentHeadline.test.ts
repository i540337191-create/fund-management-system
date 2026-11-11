import test from 'node:test';
import assert from 'node:assert/strict';
import {projectInvestmentHeadline} from '../src/lib/projectInvestmentHeadline.ts';
import type {InvestmentLedger} from '../src/lib/investmentLedgerTypes.ts';
const ledger=(rows:unknown[],paid='30.00',issues:unknown[]=[])=>({rows,totals:{investmentPrincipal:paid,closedContribution:'70.00'},issues}) as InvestmentLedger;
test('investment facts count each fund allocation once and keep actual principal distinct',()=>{
 const value=projectInvestmentHeadline(ledger([{basis:'current_plan',plannedContribution:'30.00'},{basis:'approved_closing',plannedContribution:'70.00',closedContribution:'70.00',cashStatus:'posted'}]));
 assert.deepEqual(value,{total:10000n,paid:3000n,remaining:7000n,closed:7000n});
});
test('empty, invalid, incomplete or excess-payment records never imply a known unpaid balance',()=>{
 assert.equal(projectInvestmentHeadline(ledger([])).total,null);
 for(const [rows,paid,issues] of [[[{basis:'current_plan',plannedContribution:null}],'0.00',[]],[[{basis:'current_plan',plannedContribution:'10.00'}],'20.00',[]],[[{basis:'current_plan',plannedContribution:'10.00'}],'0.00',[{code:'unknown_investment_currency'}]]] as const)assert.equal(projectInvestmentHeadline(ledger([...rows],paid,[...issues])).remaining,null);
});

test('missing payment records and unresolved currencies remain unknown instead of zero',()=>{
 const row={basis:'approved_closing',closedContribution:'100.00',cashStatus:'not_recorded'};assert.equal(projectInvestmentHeadline(ledger([row],'0.00')).paid,null);
 assert.equal(projectInvestmentHeadline(ledger([{...row,cashStatus:'posted'}],'0.00',[{code:'unknown_investment_currency'}])).paid,null);
});
