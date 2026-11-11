import {displayedDealTerms,type DealBatch} from '../src/lib/dealTypes.ts';
import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeDataOrigin,dataOriginLabel,hasConfirmedSource} from '../src/lib/dataOrigin.ts';
import {filterSeedDemoRecords,filterMaterialRecordsBySeedDemo} from '../src/lib/dataOriginFilter.ts';
import {createApiClient,apiMaterialToRecord,type ApiMaterial} from '../src/lib/apiClient.ts';
import {summarizeInvestmentCashflows} from '../src/lib/investmentCashflowView.ts';
import type {InvestmentCashflow} from '../src/lib/investmentCashflowTypes.ts';
import {buildQwenChatPayload,createRuleBasedAiReply} from '../src/lib/aiService.ts';

test('missing origin stays unknown; visibility is not a claim of verified business data',()=>{
 for(const value of [undefined,null,'','real-by-guess','USER_INPUT']){assert.equal(normalizeDataOrigin(value),'unknown');assert.equal(dataOriginLabel(value),'来源未核实');assert.equal(hasConfirmedSource({dataOrigin:value}),false);}
 assert.deepEqual(filterSeedDemoRecords([{id:'demo',dataOrigin:'seed_demo'},{id:'unknown'},{id:'real',dataOrigin:'user_input'}],true).map(r=>r.id),['unknown','real']);
 assert.equal(hasConfirmedSource({dataOrigin:'system_generated'}),false);
 assert.equal(hasConfirmedSource({dataOrigin:'system_generated',sourceBasis:[{id:'original',dataOrigin:'source_file'}]}),true);
 assert.equal(hasConfirmedSource({dataOrigin:'user_input',sourceBasis:[{id:'prior-demo',dataOrigin:'seed_demo'}]}),false);
});
test('material adapters preserve authoritative origin even when free-text source looks real or project is demo',()=>{
 const row={name:'原件',type:'法务',uploader:'用户',time:'2026-10-30',source:'用户上传',status:'待核对',quotes:'0',project:'演示项目',dataOrigin:'source_file'} as ApiMaterial;
 const material=apiMaterialToRecord(row);assert.equal(material[8],'source_file');assert.equal(filterMaterialRecordsBySeedDemo([material],true).length,1);
 const demo=apiMaterialToRecord({...row,dataOrigin:'seed_demo'});assert.equal(filterMaterialRecordsBySeedDemo([demo],true).length,0);
 const unknown=apiMaterialToRecord({...row,dataOrigin:undefined,source:'AI已确认真实到账'});assert.equal(unknown[8],'unknown');assert.equal(filterMaterialRecordsBySeedDemo([unknown],true).length,1);
});
test('hidden cash summaries exclude seed and unknown amounts before exact totals, preserving all raw records',()=>{
 const records=[['100.00','user_input'],['900.00','seed_demo'],['50.00','unknown']].map(([amount,dataOrigin])=>({amount,dataOrigin,kind:'investment_payment',currency:'CNY',status:'posted'} as InvestmentCashflow));
 const before=structuredClone(records),visible=filterSeedDemoRecords(records,true),sum=summarizeInvestmentCashflows(visible,true);
 assert.equal(sum.investment_payment,'100.00');assert.equal(sum.unverifiedRecords,1);assert.equal(visible.length,2);assert.deepEqual(records,before);assert.equal(summarizeInvestmentCashflows(records).investment_payment,'1050.00');
});
test('source policy is explicit on all ledger read surfaces; manual writers cannot submit trusted origin claims',async()=>{
 const seen:{url:string;body:Record<string,unknown>}[]=[];const api=createApiClient({fetchImpl:async(url,init)=>{seen.push({url:String(url),body:init?.body?JSON.parse(String(init.body)):{}});return new Response('{}',{headers:{'content-type':'application/json'}});}});
 await api.getInvestmentLedger({type:'fund',id:'f /1'},false);await api.getFundDeals('f /1',false);await api.getInvestmentCashflows('p',false);await api.getExitSettlement('p',false);await api.getPostInvestment('p',false);await api.getProjectAssetHistory('p',false);await api.getAssetHistory({includeDemo:'false'});await api.getExitSettlementLedger({includeDemo:'false'});await api.getInvestmentCashflowLedger({includeDemo:'false'});
 for(const r of seen)assert.equal(new URL(r.url,'http://localhost').searchParams.get('includeDemo'),'false');
 const marked={dataOrigin:'user_input',sourceBasis:[{id:'forged',dataOrigin:'source_file'}]};
 await api.archiveMaterial({...marked,name:'manual'} as any);await api.createReport({...marked,name:'report'} as any);await api.createCapitalRecord({...marked,company:'company'} as any);
 for(const r of seen.slice(-3)){assert.equal(Object.hasOwn(r.body,'dataOrigin'),false);assert.equal(Object.hasOwn(r.body,'sourceBasis'),false);}
 await api.createAiIntakeItem({...marked,dataOrigin:'seed_demo',id:'demo'} as any);assert.equal(seen.at(-1)!.body.isDemo,true);assert.equal(Object.hasOwn(seen.at(-1)!.body,'dataOrigin'),false);
});
test('hidden AI payload discards prior demo history and fallback directs explicit manual entry without invented facts',()=>{
 const payload=buildQwenChatPayload({prompt:'查询实际情况',includeDemo:false,history:[{role:'assistant',content:'旧模拟项目已到账3000万'}]});assert.equal(JSON.stringify(payload).includes('3000万'),false);
 for(const prompt of ['帮我记录到账500元','生成季度报告','创建跟进任务','请归档会议纪要']){const r=createRuleBasedAiReply(prompt);assert.equal(JSON.stringify(r).includes('演示智能设备'),false);assert.equal(JSON.stringify(r).includes('3000'),false);assert.ok(r.action?.href);assert.match(r.content,/尚未核实/);}
 assert.equal(createRuleBasedAiReply('这份季度报告有哪些风险').action,undefined);
});

test('closed deal view pins its approved closing terms, while active drafts keep the current version',()=>{
 const approved={id:'closing',status:'approved',version:1},rejected={id:'later',status:'rejected',version:2};
 const closed={status:'closed',terms:[approved,rejected],closing:{termsId:'closing'}} as DealBatch;
 assert.equal(displayedDealTerms(closed),approved);assert.equal(displayedDealTerms({...closed,status:'active'}),rejected);
 assert.equal(displayedDealTerms({...closed,closing:{...closed.closing!,termsId:'missing'}}),undefined);
});
