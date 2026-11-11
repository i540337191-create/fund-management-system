import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cents,money,portfolioFunds,portfolioFees,readPortfolioFilters} from '../../src/iterationB/capitalPortfolioModel.ts';
import type {InvestmentLedgerRow,InvestmentLedger} from '../../src/lib/investmentLedgerTypes.ts';
import type {FundOperations} from '../../src/lib/fundOperationsTypes.ts';
const row=(patch:Partial<InvestmentLedgerRow>={})=>({fundId:'a',projectId:'p',projectName:'项目',basis:'approved_closing',closedContribution:'100.00',plannedContribution:null,investmentPrincipal:'40.00',returnedPrincipal:'10.00',cashStatus:'posted',...patch}) as InvestmentLedgerRow;
test('fund/project joins preserve original allocation fields without inventing a fund budget',()=>{
 const rows=[row(),row({fundId:'b',closedContribution:'50.00',investmentPrincipal:'20.00'})];
 const groups=portfolioFunds({rows} as InvestmentLedger,[{id:'a',name:'A'},{id:'b',name:'B'},{id:'c',name:'C'}]);
 assert.equal(groups[0].rows[0].closedContribution,'100.00');assert.equal(groups[1].rows[0].investmentPrincipal,'20.00');assert.equal(groups[2].rows.length,0);assert.equal(groups[0].projects[0].rows.length,1);assert.equal('budget' in groups[0],false);assert.equal('remaining' in groups[0],false);
 assert.equal(money(cents('9007199254740993.01')),'9,007,199,254,740,993.01');assert.equal(money(-1n),'-0.01');assert.equal(cents('1.0'),null);
});

const fee=(patch={})=>({id:'r',ruleId:'rule',title:'管理费',from:'2026-10-01',to:'2026-10-31',dueDate:'2026-11-06',amount:'100.03',received:'40.02',remaining:'60.01',status:'partial',overdue:true,allocations:[],...patch});
const fund=(rows:unknown[],patch={})=>({fundId:'a',fundName:'基金',privateDetailsVisible:true,feeLedger:{currency:'CNY',registered:true,rows},...patch}) as FundOperations['funds'][number];
test('monthly due, receipts, outstanding and all-period overdue keep cancelled and partial records distinct',()=>{
 const result=portfolioFees([fund([fee(),fee({id:'cancel',amount:'900.00',status:'cancelled'}),fee({id:'old',dueDate:'2026-10-01',remaining:'20.00'})])],'2026-11');
 assert.equal(result.rows.length,2);assert.equal(result.all.length,3);assert.equal(result.receivable,10003n);assert.equal(result.received,4002n);assert.equal(result.remaining,6001n);assert.equal(result.pending,1);assert.equal(result.overdue.length,2);assert.equal(result.overdueTotal,8001n);
 const restricted=portfolioFees([fund([fee()]),fund([],{privateDetailsVisible:false,feeLedger:null})],'2026-11');assert.equal(restricted.receivable,null);assert.equal(restricted.pending,null);
 assert.equal(portfolioFees([fund([])],'2026-12').receivable,null);
 const unregistered=portfolioFees([fund([],{feeLedger:{currency:'CNY',registered:false,rows:[]}})],'2026-11');assert.equal(unregistered.ready,true);assert.equal(unregistered.registered,false);assert.equal(unregistered.pending,null);assert.equal(unregistered.overdueTotal,null);
});

test('fee filters restore the same context from the URL and normalize unsupported values',()=>{
 assert.deepEqual(readPortfolioFilters('?fundId=a&month=2026-10&feePeriod=range&feeState=pending&feeFrom=2026-09-01&feeTo=2026-10-31','2026-11'),{month:'2026-10',period:'range',state:'pending',from:'2026-09-01',to:'2026-10-31'});
 assert.equal(readPortfolioFilters('?feeFrom=2026-02-31','2026-11').from,'');
 assert.deepEqual(readPortfolioFilters('?month=2026-99&feePeriod=wrong&feeState=unknown&feeFrom=wrong','2026-11'),{month:'2026-11',period:'month',state:'all',from:'',to:''});
});
