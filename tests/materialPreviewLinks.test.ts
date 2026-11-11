import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureEntries as entries,fixtureChunks} from './fixtures/material-fixtures.ts';
import {createMaterialCitationPreviewLinks,createMaterialPrimaryPreviewLink} from '../src/lib/materialPreviewLinks.ts';
import type {MaterialDirectoryRow} from '../src/lib/materialFilters.ts';
const row:MaterialDirectoryRow={name:'Demo.pdf',type:'投资者适当性资料',uploader:'演示投资经理',time:'2026-01-01',source:'虚构测试',status:'已摘要',quotes:'0',project:'',fund:'示例成长一期基金',stage:'募集期',path:'基金档案 / 募集',rule:'演示',confidence:'高',dataOrigin:'seed_demo'};
test('PDF preview opens controlled original page images with comparison evidence',()=>{
 const entry=entries[1],link=createMaterialPrimaryPreviewLink({entry,row});assert.equal(link.kind,'original_page_images');
 const p=new URLSearchParams(link.href.split('?')[1]);assert.match(p.get('sourceHref')??'',/demo-doc-risk\/page-001\.png$/);assert.match(p.get('downloadHref')??'',/演示风险匹配告知书\.pdf$/);assert.equal(p.get('pageCount'),'2');
});
test('Office preview keeps generated PDF and original download separate',()=>{
 const entry=entries[0],link=createMaterialPrimaryPreviewLink({entry,row});assert.equal(link.kind,'original_page_images');
 const p=new URLSearchParams(link.href.split('?')[1]);assert.match(p.get('downloadHref')??'',/Demo-Fund-Agreement\.docx$/);assert.match(p.get('sourceHref')??'',/demo-doc-office\/page-001\.png$/);
});
test('citation links retain target page, search highlight and source metadata',()=>{
 const entry=entries[1],links=createMaterialCitationPreviewLinks({...fixtureChunks[0],page:2,highlightTerms:['专业投资者'],metadata:row});assert(links.length>0);assert(links.some(l=>l.href.includes('page=2')));assert(links.filter(l=>l.kind!=='original_document').every(l=>l.href.startsWith('/materials/preview?')));assert(links.some(l=>l.kind==='original_document'&&l.href.endsWith('.pdf')));
});
test('metadata-only Office records fall back to preview PDF',()=>{
 const entry={...entries[0],previewPageImages:undefined,previewPageImageDir:undefined};
 assert.equal(createMaterialPrimaryPreviewLink({entry,row}).kind,'preview_document');
});
