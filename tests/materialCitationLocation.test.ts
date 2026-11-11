import test from 'node:test';
import assert from 'node:assert/strict';
import {citationLocation} from '../src/lib/assistantClient.ts';
import {createMaterialCitationPreviewLinks} from '../src/lib/materialPreviewLinks.ts';
import {buildQwenChatPayload} from '../server/src/ai/qwen.ts';
test('source location does not invent physical pages for Word, tables, slides, plain text or audio',()=>{
 for(const [title,expected] of [['original.docx','正文片段 2'],['original.doc','正文片段 2'],['original.xlsx','工作表 2'],['original.xls','工作表 2'],['original.pptx','幻灯片 2'],['original.ppt','幻灯片 2'],['original.txt','正文片段 2'],['original.pdf','第2页'],['original.png','图 2'],['original.wav','录音片段 2']])assert.equal(citationLocation({title,page:2,excerpt:''}),expected);
 assert.equal(citationLocation({title:'original.wav',page:2,excerpt:'录音 00:01–00:25 原文'}),'录音 00:01–00:25');
 assert.equal(citationLocation({title:'renamed',page:1,excerpt:'',location:'工作表 2'}),'工作表 2');
});
test('Word citation has no false page jump; PDF physical page jump remains',()=>{
 const args={page:2,recognizedTextHref:'/text.md',originalDocumentHref:'/original.docx',pageImageDir:'/images',pageCount:3};
 const word=createMaterialCitationPreviewLinks({...args,fileName:'original.docx'});
 assert.equal(word.some(x=>x.kind==='original_page_images'),false);
 assert.equal(new URLSearchParams(word[0].href.split('?')[1]).has('page'),false);
 const pdf=createMaterialCitationPreviewLinks({...args,fileName:'original.pdf'});
 assert.equal(pdf.some(x=>x.kind==='original_page_images'),true);
 assert.equal(new URLSearchParams(pdf[0].href.split('?')[1]).get('page'),'2');
});
test('model context carries location and explicit ban on invented physical pages',()=>{
 const payload=buildQwenChatPayload({prompt:'机构清单',evidence:[{materialId:'doc',page:1,location:'正文片段 1',text:'机构五项',dataOrigin:'source_file'}]},{model:'fixture'});
 const text=JSON.stringify(payload.messages);assert.match(text,/正文片段 1/);assert.match(text,/不得推算或编造原件物理页码/);assert.match(text,/PDF可称第几页/);assert.match(text,/历史回复中的页码不是依据/);assert.match(text,/即使用户索要页码/);assert.match(text,/明确说明不能核验物理页码/);
});
