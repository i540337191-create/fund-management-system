import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registeredPayments,registeredReceipts} from '../../src/iterationB/capitalAmounts.ts';
import type {InvestmentCashflow} from '../../src/lib/investmentCashflowTypes.ts';
import type {ExitPayment} from '../../src/lib/exitSettlementTypes.ts';
const payment=(values:Partial<InvestmentCashflow>={})=>({status:'posted',currency:'CNY',amount:'10.01',kind:'investment_payment',dataOrigin:'user_input',...values}) as InvestmentCashflow;
const receipt=(values:Partial<ExitPayment>={})=>({status:'posted',currency:'CNY',amount:'10.01',dataOrigin:'user_input',...values}) as ExitPayment;
test('actual money uses exact cents, excludes reversals and separates payment kinds',()=>{
 assert.equal(registeredPayments([payment({amount:'9007199254740993.01'}),payment({kind:'project_fee',amount:'0.02'}),payment({kind:'project_tax',amount:'0.03'}),payment({status:'reversed'})],true).amount,'9007199254740993.06');
 assert.equal(registeredReceipts([receipt(),receipt({amount:'0.09'}),receipt({status:'reversed'})],true).amount,'10.10');
});
test('empty, unknown source, invalid money and unspecified currency never become verified zero',()=>{
 assert.equal(registeredPayments([],true).amount,null);assert.equal(registeredReceipts([],true).amount,null);
 for(const amount of ['-1.00','100','1.001','abc']){assert.equal(registeredPayments([payment({amount})],false).amount,null);assert.equal(registeredReceipts([receipt({amount})],false).amount,null);}
 assert.equal(registeredReceipts([receipt({currency:undefined})],true).amount,null);
 assert.equal(registeredReceipts([receipt({dataOrigin:'unknown'})],true).amount,null);
 assert.equal(registeredPayments([payment(),payment({dataOrigin:'unknown'})],true).amount,null);
 assert.equal(registeredReceipts([receipt({dataOrigin:'seed_demo'})],false).amount,'10.01');
});
