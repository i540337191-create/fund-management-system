import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recordedCashTotal,overviewMoney} from '../../src/iterationB/capitalPortfolioModel.ts';
test('registered cash differentiates absent records, reversed records and effective payments',()=>{
 assert.equal(recordedCashTotal([]),null);
 assert.equal(recordedCashTotal([{status:'reversed',currency:'CNY',amount:'100.00',eligible:false}]),0n);
 assert.equal(recordedCashTotal([{status:'posted',currency:'CNY',amount:'50.00',eligible:true}]),5000n);
 for(const patch of [{currency:undefined},{eligible:false},{amount:'未录入'},{status:'unknown'}])assert.equal(recordedCashTotal([{status:'posted',currency:'CNY',amount:'50.00',eligible:true,...patch}]),null);
});
test('large registered values use exact units without rounding or inventing zero',()=>{
 assert.deepEqual(overviewMoney(null),{value:'—',unit:''});
 assert.deepEqual(overviewMoney(50000000000n),{value:'5.00',unit:'亿元'});
 assert.deepEqual(overviewMoney(50000000001n),{value:'500,000,000.01',unit:'元'});
 assert.deepEqual(overviewMoney(0n),{value:'0.00',unit:'元'});
});
