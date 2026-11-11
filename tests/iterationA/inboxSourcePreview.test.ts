import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inboxSourcePreview,intakeSourceVersionState} from '../../src/iterationA/inboxSourcePreview.ts';
import type {ApiMaterialRecord} from '../../src/lib/materialFilters.ts';
const material=(id:string,extra:Partial<ApiMaterialRecord>={}):ApiMaterialRecord=>({id,name:id+'.pdf',type:'协议',uploader:'经办人',time:'2026-11-06',source:'用户上传',status:'待复核',quotes:'0',project:'项目',...extra});
test('a missing original remains explicit, without fabricating a preview',()=>{
 assert.equal(inboxSourcePreview(),undefined);
 assert.equal(inboxSourcePreview(material('without-path')),undefined);
});
test('preview uses this material evidence and changes with its version',()=>{
 const first=inboxSourcePreview(material('one',{originalFilePath:'api/materials/one/versions/v1/file',previewFilePath:'previews/one-v1.pdf',recognizedTextPath:'text/one-v1.txt'}));
 assert.equal(first?.kind,'preview_document');
 assert.equal(new URL(first!.href,'http://localhost').searchParams.get('sourceHref'),'/previews/one-v1.pdf');
 const next=inboxSourcePreview(material('two',{originalFilePath:'api/materials/two/versions/v2/file'}));
 assert.equal(next?.kind,'original_document');
 assert.equal(new URL(next!.href,'http://localhost').searchParams.get('sourceHref'),'/api/materials/two/versions/v2/file');
 assert.ok(!next!.href.includes('one-v1'));
});
test('available original page images take precedence over generated document links',()=>{
 const preview=inboxSourcePreview(material('pages',{pageImageDir:'pages/current',previewFilePath:'previews/current.pdf',originalFilePath:'api/materials/pages/versions/current/file'}));
 assert.equal(preview?.kind,'original_page_images');
 assert.equal(new URL(preview!.href,'http://localhost').searchParams.get('sourceHref'),'/pages/current/page-001.png');
});
test('an intake bound to an older version never previews the newer material evidence',()=>{
 const preview=inboxSourcePreview(material('updated',{currentVersionId:'v2',originalFilePath:'api/materials/updated/versions/v2/file',previewFilePath:'previews/v2.pdf',recognizedTextPath:'texts/v2.txt'}),'v1');
 assert.equal(preview?.kind,'original_document');
 assert.equal(new URL(preview!.href,'http://localhost').searchParams.get('sourceHref'),'/api/materials/updated/versions/v1/file');
 assert.ok(!preview!.href.includes('v2'));
});

test('missing binding is distinct from an unverified or changed source version',()=>{
 assert.equal(intakeSourceVersionState(material('one')),'unbound');
 assert.equal(intakeSourceVersionState(material('one'),'v1'),'unverified');
 assert.equal(intakeSourceVersionState(material('one',{currentVersionId:'v1'}),'v1'),'current');
 assert.equal(intakeSourceVersionState(material('one',{currentVersionId:'v2'}),'v1'),'changed');
});

test('a bound current intake also uses its immutable original endpoint',()=>{
 const preview=inboxSourcePreview(material('same',{currentVersionId:'v1',pageImageDir:'current-images',originalFilePath:'mutable/current-file'}),'v1');
 assert.equal(preview?.kind,'original_document');
 assert.equal(new URL(preview!.href,'http://localhost').searchParams.get('sourceHref'),'/api/materials/same/versions/v1/file');
});
