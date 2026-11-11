import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeFundFees} from '../src/lib/fundFeeSummary.ts';
import type {FundOperations} from '../src/lib/fundOperationsTypes.ts';
test('same IDs, cents, fund and period scope exclude cancellations and inaccessible ledgers',()=>{
 const row={id:'fee',ruleId:'r',title:'费',from:'2026-01-01',to:'2026-01-02',dueDate:'2026-11-06',amount:'100.03',received:'40.02',remaining:'60.01',status:'partial',overdue:true,allocations:[]};
 const funds=[{fundId:'a',fundName:'甲',privateDetailsVisible:true,feeLedger:{currency:'CNY',rows:[row,{...row,id:'cancel',amount:'900.00',status:'cancelled'}]}},{fundId:'b',fundName:'乙',privateDetailsVisible:false,feeLedger:null}] as unknown as FundOperations['funds'];
 const result=summarizeFundFees(funds,{from:'2026-11-06',to:'2026-11-06'});
 assert.equal(result.fundCount,2);assert.equal(result.privateFundCount,1);assert.equal(result.registeredFundCount,1);assert.equal(result.rows[0].id,'fee');assert.deepEqual(result.totals,[{currency:'CNY',receivable:'100.03',allocated:'40.02',remaining:'60.01',overdue:'60.01'}]);assert.deepEqual(summarizeFundFees(funds,{fundId:'b'}).totals,[]);assert.equal(summarizeFundFees(funds,{from:'2026-11-07'}).rows.length,0);
});
