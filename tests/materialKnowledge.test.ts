import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureEntries as entries,fixtureSummary as summary,fixtureChunks as chunks} from './fixtures/material-fixtures.ts';
import {filterMaterialKnowledge,materialKnowledgeToAiContext,createMaterialEvidenceLinks,createMaterialEvidenceHref} from '../src/lib/materialKnowledge.ts';
import {searchMaterialTextChunks,createMaterialRagReply} from '../src/lib/materialRag.ts';
import {createMaterialAssistantReply,isMaterialKnowledgePrompt} from '../src/lib/materialAssistant.ts';

test('synthetic knowledge fixtures distinguish searchable PDFs and metadata-only Office files',()=>{
 assert.equal(summary.total,3);assert.equal(summary.pdf,2);assert.equal(summary.fullTextReady,2);assert.equal(summary.metadataOnly,1);assert.equal(summary.apiOcrFailed,0);
 assert(entries.filter(e=>e.extension==='pdf').every(e=>e.readiness==='full_text'&&e.textSource==='ocr_api'));
});
test('knowledge filters compose query, category, fund and readiness',()=>{
 const results=filterMaterialKnowledge(entries,{query:'风险匹配',category:'投资者适当性资料',projectOrFund:'示例成长一期基金',readiness:'full_text'});
 assert.equal(results.length,1);assert.equal(results[0].id,'demo-doc-risk');
 assert.equal(filterMaterialKnowledge(entries,{query:'does-not-exist'}).length,0);
});
test('AI context retains source paths and evidence links without requiring customer samples',()=>{
 const context=materialKnowledgeToAiContext(entries,{limit:2});
 assert.match(context,/Demo-Fund-Agreement/);assert.match(context,/docs\/demo-fixtures/);assert(!context.includes('Demo-Quarterly-Report'));
 const links=createMaterialEvidenceLinks(entries[1]);assert(links.some(l=>l.kind==='original_document'));assert(links.some(l=>l.kind==='recognized_text'));assert(links.some(l=>l.kind==='recognized_html'));
});
test('Office previews and page images remain available in the synthetic index',()=>{
 const office=entries[0];assert.equal(office.extension,'docx');assert(office.previewPath?.endsWith('demo-doc-office.pdf'));
 assert(createMaterialEvidenceLinks(office).some(l=>l.kind==='preview_document'));
 assert.equal(entries[1].pageImages?.length,2);assert(entries[1].pageImages?.[0].href.endsWith('page-001.png'));
});
test('page-level retrieval returns the matching fixture and keeps original evidence',()=>{
 const found=searchMaterialTextChunks('风险匹配告知书 专业投资者 普通投资者',chunks);
 assert(found.length>0);assert.equal(found[0].materialId,'demo-doc-risk');assert.equal(found[0].page,1);assert.match(found[0].originalDocumentHref,/#page=1$/);
 assert.equal(searchMaterialTextChunks('zxqv-no-match',chunks).length,0);
});
test('RAG replies cite indexed evidence and unknown questions return no fabricated answer',()=>{
 const reply=createMaterialRagReply('风险匹配告知书 专业投资者',chunks,entries,summary);assert(reply);assert.match(JSON.stringify(reply),/demo-doc-risk|风险匹配告知书/);
 assert.equal(createMaterialRagReply('zxqv-no-match',chunks,entries,summary),null);
});
test('assistant recognizes document questions and respects empty knowledge',()=>{
 assert(isMaterialKnowledgePrompt('查询资料 风险匹配告知书'));assert(!isMaterialKnowledgePrompt('你好'));
 assert.equal(createMaterialAssistantReply('你好',entries,summary),null);
 const reply=createMaterialAssistantReply('查询资料 风险匹配告知书',entries,summary,chunks);assert(reply);
});
test('source hrefs preserve non-ASCII evidence file names',()=>{
 assert.equal(createMaterialEvidenceHref('docs/demo-fixtures/演示.pdf'),'/docs/demo-fixtures/演示.pdf');
});
