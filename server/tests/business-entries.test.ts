import test from 'node:test';import assert from 'node:assert/strict';
import {businessEntryFooter} from '../src/ai/business-entries.ts';
test('business recommendations carry real known entry points without inventing objects or executing actions',()=>{
 const entries=[{label:'上传与管理资料',href:'/materials'},{label:'报告审核与正文',href:'/reports'}],objects=[{label:'一期基金报告',href:'/reports?reportId=report-known'}];
 assert.match(businessEntryFooter('一期基金报告缺少正文，请补齐资料并审核。',entries,objects),/\[一期基金报告\]\(\/reports\?reportId=report-known\)/);
 assert.equal(businessEntryFooter('你好',entries,objects),'');assert.equal(businessEntryFooter('查看[报告审核与正文](/reports)',entries),'');assert(!businessEntryFooter('查看不存在的报告',entries,objects).includes('report-known'));
});
import {requestedBusinessEntry} from '../src/ai/business-entries.ts';
test('entry intent uses context, clarifies ambiguity, and opens a concrete upload form',()=>{
 assert.match(requestedBusinessEntry('给我一个入口','资料库与报告都需补全')!,/哪个入口/);
 assert.match(requestedBusinessEntry('给我一个入口','')!,/哪个入口/);
 assert.match(requestedBusinessEntry('给我一个入口','请补充资料库原件')!,/\[资料库 \/ 文件列表\]\(\/materials\)/);
 const explicit=requestedBusinessEntry('资料库/文件列表 的入口','之前还有报告',[]);
 assert.match(explicit!,/\/materials\?upload=1/);
 assert.match(requestedBusinessEntry('上传资料入口','',[],'known-project')!,/projectId=known-project/);
 assert.equal(requestedBusinessEntry('你好',''),null);
});
test('follow-up entry requests resolve one prior named object and clarify multiple records',()=>{
 const objects=[{label:'一期季度报告',href:'/reports?reportId=known-a'},{label:'二期季度报告',href:'/reports?reportId=known-b'}];
 assert.match(requestedBusinessEntry('给我入口','一期季度报告需要补正文',objects)!,/reportId=known-a/);
 assert.match(requestedBusinessEntry('给我入口','一期季度报告和二期季度报告都需补全',objects)!,/哪个入口/);
 assert.match(requestedBusinessEntry('资料库入口','一期季度报告要补全',objects)!,/\/materials/);
});

test('draft continuation and factual questions use business context rather than the navigation shortcut',()=>{assert.equal(requestedBusinessEntry('请查我的未完成草稿，说明《QA续办草稿》是什么对象、接下来在哪个入口继续。',''),null);assert.equal(requestedBusinessEntry('分析这个项目的进展并给出入口。',''),null);});


test('a review or calculation request with source links must not be replaced by a navigation shortcut',()=>{
 for(const prompt of ['请查阅当前基金投资者募集数据，核对规模并附原表链接','检查这个项目还缺哪些资料，给我补齐入口','计算管理费并附批准合同链接'])assert.equal(requestedBusinessEntry(prompt,'',[]),null);
});
