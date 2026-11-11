import {test} from 'node:test';
import assert from 'node:assert/strict';
import {financialQuality,relatedQuality,parseRegisteredMoney,feeCalculation,legacyOutstanding,allocationQuality,snapshotEvidence} from '../../src/iterationB/capitalDataIntegrity.ts';
import {portfolioFunds,registeredContribution} from '../../src/iterationB/capitalPortfolioModel.ts';
import type {InvestmentLedger,InvestmentLedgerRow} from '../../src/lib/investmentLedgerTypes.ts';
import type {Project} from '../../src/data/projects.ts';
import type {FundLifecycleView} from '../../src/lib/fundLifecycleTypes.ts';
import {feeAmount} from '../../server/src/ledger/fund-lifecycle.ts';
const proof={materialId:'document',versionId:'v1',sha256:'a'.repeat(64),name:'合同审批.pdf',sizeBytes:1200};
const rule={id:'rule',name:'管理费',rate:'2.00',dayBasis:'365',rounding:'half_up',basis:'合同按实际天数',approvedBy:'批准人',validFrom:'2026-01-01',validTo:'2026-12-31',approval:proof};
const charge={id:'charge',ruleId:'rule',title:'管理费',tranche:'1',principal:'1000.00',from:'2026-11-01',to:'2026-11-02',dueDate:'2026-11-06',days:2,amount:'0.11',received:'0.00',remaining:'0.11',overdue:true};
test('sample facts, name-based suspicions and confirmed industry words are distinguished',()=>{
 assert.equal(financialQuality({dataOrigin:'seed_demo'},'真实公司名称').kind,'sample');
 assert.equal(financialQuality({dataOrigin:'user_input'},'合成验收，非合同').kind,'sample');
 assert.equal(financialQuality({dataOrigin:'user_input'},'QA项目').kind,'suspected');
 assert.equal(financialQuality({dataOrigin:'user_input'},'合成材料有限公司').kind,'registered');
 assert.equal(financialQuality({dataOrigin:'user_input'},'Qatar 投资').kind,'registered');
 assert.equal(financialQuality({dataOrigin:'unknown'},'正式项目').kind,'unverified');
 assert.equal(financialQuality({dataOrigin:'user_input',sourceBasis:[{id:'demo-proof',dataOrigin:'seed_demo'}]},'普通名称').kind,'sample');
 assert.equal(relatedQuality({dataOrigin:'unknown'},'缺标记',[{record:{dataOrigin:'seed_demo'},description:'关联基金'}]).kind,'sample');
 assert.equal(allocationQuality({sourceOrigins:{project:{dataOrigin:'user_input'},batch:{dataOrigin:'user_input'},terms:{dataOrigin:'user_input',dataPurpose:'engineering_fixture'}},projectName:'企业',dealTitle:'批次'} as InvestmentLedgerRow,{dataOrigin:'user_input',name:'基金'}).kind,'sample');
});
test('master monetary text preserves Chinese unit precision and never turns unknowns into zero',()=>{
 assert.equal(parseRegisteredMoney('5.00 亿'),50000000000n);assert.equal(parseRegisteredMoney('3000 万元'),3000000000n);assert.equal(parseRegisteredMoney('407,671 元'),40767100n);assert.equal(parseRegisteredMoney('0元'),0n);assert.equal(parseRegisteredMoney('0.00000001亿'),100n);
 for(const value of ['未录入','待确认','qwe','1,2,3元','USD 10','-1元','0.001元'])assert.equal(parseRegisteredMoney(value),null,value);
});
test('all primary and co-investment projects are joined without inventing allocations or counting them twice',()=>{
 const projects=[{id:'p1',fundId:'a',name:'已投项目'},{id:'p2',fundId:'a',name:'未登记项目'},{id:'p3',fundId:'b',name:'联合出资项目'}] as Project[];
 const rows=[{projectId:'p1',fundId:'a',projectName:'已投项目'},{projectId:'p3',fundId:'a',projectName:'联合出资项目'}] as InvestmentLedgerRow[];
 const groups=portfolioFunds({rows} as InvestmentLedger,[{id:'a',name:'A'},{id:'b',name:'B'}],projects);
 assert.equal(groups[0].primaryCount,2);assert.equal(groups[0].investmentCount,2);assert.equal(groups[0].projects.length,3);assert.equal(groups[0].projects.find(p=>p.id==='p2')!.rows.length,0);assert.equal('budget' in groups[0].projects.find(p=>p.id==='p2')!,false);assert.equal(groups[0].projects.find(p=>p.id==='p3')!.primary,false);assert.equal(groups[1].projects.length,1);
});
test('contract calculation matches the existing backend, rejects missing proof and inconsistent imported values',()=>{
 for(const rounding of ['half_up','down'])for(const dayBasis of ['360','365','366']){
  const backend=feeAmount(charge.principal,rule.rate,charge.from,charge.to,dayBasis,rounding);
  assert.equal(feeCalculation({...charge,...backend},{...rule,dayBasis,rounding}).valid,true);
 }
 assert.equal(feeCalculation(charge,undefined).valid,false);
 assert.equal(feeCalculation({...charge,amount:'100.03'},rule).valid,false);
 assert.equal(feeCalculation(charge,{...rule,approval:{...proof,readIssue:'forbidden'}}).valid,false);
 assert.equal(feeCalculation(charge,{...rule,approval:{...proof,sha256:''}}).valid,false);
 assert.equal(feeCalculation({...charge,days:248},rule).valid,false);
 assert.equal(feeCalculation({...charge,from:'2026-02-31'},rule).valid,false);
 assert.equal(feeCalculation(charge,{...rule,rate:'invalid'}).valid,false);
 assert.equal(feeCalculation(charge,{...rule,validTo:'2026-01-01'}).valid,false);
});
test('independent item aging uses its own status and due date, without subtracting ambiguous receipts',()=>{
 assert.deepEqual(legacyOutstanding({status:'未收',dueDate:'2026-05-06'},'2026-11-07'),{pending:true,overdue:true,unknownDate:false});
 assert.equal(legacyOutstanding({status:'已收',dueDate:'2026-05-06'},'2026-11-07').overdue,false);
 assert.equal(legacyOutstanding({status:'部分收',dueDate:'2026-11-30'},'2026-11-07').overdue,false);
 assert.equal(legacyOutstanding({status:'未收',dueDate:'2026-02-31'},'2026-11-07').unknownDate,true);
});

test('mixed plan and closing rows remain in their own registered amount scopes',()=>{
 const rows=[{basis:'current_plan',plannedContribution:'50.00',closedContribution:null},{basis:'approved_closing',plannedContribution:null,closedContribution:'100.00'}] as InvestmentLedgerRow[];
 assert.equal(registeredContribution(rows,'current_plan'),5000n);assert.equal(registeredContribution(rows,'approved_closing'),10000n);
 assert.equal(registeredContribution([{...rows[0],plannedContribution:null},rows[1]],'current_plan'),null);assert.equal(registeredContribution([{...rows[0],plannedContribution:null},rows[1]],'approved_closing'),10000n);
});
test('declared synthetic snapshots cannot enter supported amounts even under a normal fund and proof name',()=>{
 const snapshot={balance:'500.00',committed:'100.00',reserve:'50.00',available:'350.00',threshold:'0.00',warning:false,date:'2026-11-07',note:'人工核对',basis:'快照',proof};const fund={dataOrigin:'user_input',name:'业务基金'};
 assert.equal(snapshotEvidence(snapshot,fund,'2026-11-07').amount,35000n);assert.equal(snapshotEvidence({...snapshot,note:'合成验收，非真实'},fund,'2026-11-07').amount,null);assert.equal(snapshotEvidence({...snapshot,note:'合成验收，非真实'},fund,'2026-11-07').quality.kind,'sample');
 assert.equal(snapshotEvidence({...snapshot,available:'999.00'},fund,'2026-11-07').amount,null);assert.equal(snapshotEvidence({...snapshot,date:'2026-11-08'},fund,'2026-11-07').amount,null);
});
