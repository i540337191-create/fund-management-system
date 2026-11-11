import test from 'node:test';
import assert from 'node:assert/strict';
import {fundDossierTab,fundDossierTabs,fundNextActionTab,fundFeeSection} from '../../src/iterationB/fundDossierNavigation.ts';
test('ten destinations and legacy fund-operation deep links retain precise business context',()=>{
 assert.equal(fundDossierTabs.length,10);
 for(const tab of fundDossierTabs)assert.equal(fundDossierTab(new URLSearchParams({tab})),tab);
 assert.equal(fundDossierTab(new URLSearchParams('tab=基金运营&feeId=fee1')),'费用流水');
 assert.equal(fundDossierTab(new URLSearchParams('tab=基金运营&lifecycleAction=capital')),'账户资金');
 assert.equal(fundDossierTab(new URLSearchParams('tab=基金运营')),'基金事务');
 assert.equal(fundDossierTab(new URLSearchParams('tab=文档模板')),'募集档案');
 assert.equal(fundDossierTab(new URLSearchParams('tab=invalid')),'概览');
});
test('existing next-action wording opens the related fund business, without generating tasks',()=>{
 for(const [text,tab] of [['收集二季度投后报告资料','投后报告'],['管理费待收','费用流水'],['投资者实缴待补','募集档案'],['核对银行回单','账户资金'],['清算资料核对','基金事务'],['其他资料','资料档案']])assert.equal(fundNextActionTab(text),tab);
});

test('fee deep links select the management section while ordinary entry retains the fee ledger',()=>{
 assert.equal(fundFeeSection('?tab=费用流水'),'ledger');
 assert.equal(fundFeeSection('?tab=费用流水&feeId=fee-1'),'fees');
 assert.equal(fundFeeSection('?tab=基金运营&feeId=fee-2'),'fees');
});
