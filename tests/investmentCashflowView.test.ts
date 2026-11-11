import test from 'node:test';
import assert from 'node:assert/strict';
import {afterCashflowSave,summarizeInvestmentCashflows} from '../src/lib/investmentCashflowView.ts';
import type {InvestmentCashflow} from '../src/lib/investmentCashflowTypes.ts';

test('a save finishing after its ledger is left cannot refresh or update a different fund',async()=>{
 let current=true,reloads=0;let release!:()=>void;
 const wait=new Promise<void>(resolve=>{release=resolve;});
 const result=afterCashflowSave(()=>current,()=>wait,async()=>{reloads++;});
 current=false;release();assert.equal(await result,null);assert.equal(reloads,0);
 assert.equal(await afterCashflowSave(()=>false,async()=>{throw Error('must not refresh');},async()=>{}),null);
});
test('late refresh failures cannot overwrite a new view, while current failures retain the saved outcome',async()=>{
 let current=true;let reject!:(reason:Error)=>void;
 const wait=new Promise<void>((_resolve,r)=>{reject=r;});
 const result=afterCashflowSave(()=>current,async()=>{},()=>wait);await Promise.resolve();current=false;reject(Error('old fund failed'));assert.equal(await result,null);
 assert.equal(await afterCashflowSave(()=>true,async()=>{throw Error('refresh failed');},async()=>{}),false);
 assert.equal(await afterCashflowSave(()=>true,async()=>{},async()=>{}),true);
});
const row=(kind:InvestmentCashflow['kind'],amount:string,status:InvestmentCashflow['status']='posted')=>({kind,amount,status,currency:'CNY'} as InvestmentCashflow);
test('registered payment subtotals use exact cents, exclude corrections and keep categories separate',()=>{
 const result=summarizeInvestmentCashflows([row('investment_payment','9007199254740993.01'),row('investment_payment','0.09'),row('investment_payment','100.00','reversed'),row('project_fee','2.03'),row('project_tax','0.07')]);
 assert.deepEqual(result,{investment_payment:'9007199254740993.10',project_fee:'2.03',project_tax:'0.07',invalidRecords:0,unverifiedRecords:0,postedCount:4,reversedCount:1});
 assert.equal(summarizeInvestmentCashflows([]).investment_payment,'0.00');
});
test('malformed or unsupported current records invalidate subtotals instead of becoming a zero amount',()=>{
 const result=summarizeInvestmentCashflows([row('investment_payment','unknown'),{...row('project_tax','5.00'),currency:'USD'} as unknown as InvestmentCashflow]);
 assert.equal(result.invalidRecords,2);assert.equal(result.investment_payment,null);assert.equal(result.project_fee,null);assert.equal(result.project_tax,null);
});
