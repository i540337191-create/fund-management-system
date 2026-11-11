import test from 'node:test';
import assert from 'node:assert/strict';
import {readMaterialPreviewHtmlPageSize,readMaterialPreviewHtmlPageKind} from '../src/lib/materialPreviewHtml.ts';
const html=`<section class="ocr-document-page" data-page="1"><iframe srcdoc="&lt;style&gt;.page{width:794px;height:1200px;padding:20px}&lt;/style&gt;&lt;p&gt;Synthetic text&lt;/p&gt;"></iframe></section><section class="ocr-document-page" data-page="2" style="width:1121px;height:839px"><table><tr><td>Synthetic cell</td></tr></table></section>`;
test('expanded srcdoc size includes content padding',()=>{assert.deepEqual(readMaterialPreviewHtmlPageSize(html,1),{width:794,height:1240});});
test('landscape synthetic page remains wider than tall',()=>{assert.deepEqual(readMaterialPreviewHtmlPageSize(html,2),{width:1121,height:839});});
test('table classification and missing pages do not depend on customer OCR',()=>{assert.equal(readMaterialPreviewHtmlPageKind(html,1),'text');assert.equal(readMaterialPreviewHtmlPageKind(html,2),'table');assert.equal(readMaterialPreviewHtmlPageSize(html,99),null);});
