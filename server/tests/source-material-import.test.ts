import assert from 'node:assert/strict';
import {join} from 'node:path';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import test from 'node:test';
import {createSourceMaterialImportPlan} from '../src/db/source-material-import.ts';
function syntheticFixture(){
 const root=mkdtempSync(join(tmpdir(),'fund-import-fixture-')),collectionPath='docs/synthetic-test',dir=join(root,collectionPath);
 mkdirSync(join(dir,'text'),{recursive:true});
 const common={size_bytes:100,sha256:'0'.repeat(64),archive_path:'基金档案 / 募集 / 投资者适当性',project_or_fund:'示例基金',uploader:'演示管理员',archived_at:'2026-01-01',source:'synthetic parser fixture',material_status:'已摘要'};
 writeFileSync(join(dir,'source-index.json'),JSON.stringify({materials:[
 {...common,id:'demo-office',file_name:'Demo.docx',relative_path:'originals/Demo.docx',extension:'docx',category:'募集文件',preview_path:'previews/Demo.pdf'},
 {...common,id:'demo-pdf',file_name:'Demo-Investor.pdf',relative_path:'originals/Demo-Investor.pdf',extension:'pdf',category:'投资者适当性资料',pdf:{recognized_text_path:'text/Demo.md',recognized_html_path:'text/Demo.html',page_image_dir:'pages/demo',page_image_manifest_path:'pages/demo/manifest.json'}}
 ]}));
 writeFileSync(join(dir,'text/Demo.md'),'# Page 1\n\n虚构测试资料。投资者名称\n演示机构投资人A\n\n普通投资者分类应当由人工核验。\n\n# Page 2\n\n虚构测试：报告资料完整性与来源需人工复核。');
 return {root,collectionPath};
}
test('synthetic import maps files, preview paths, fund and investor relations',()=>{
 const f=syntheticFixture();try{const p=createSourceMaterialImportPlan({projectRoot:f.root,collectionPath:f.collectionPath});assert.equal(p.materials.length,2);assert.equal(p.materials[0].dataOrigin,'source_file');assert.equal(p.materials[1].dataOrigin,'source_pdf_ocr');assert(p.materials[0].previewFilePath?.endsWith('previews/Demo.pdf'));assert.equal(p.fundRelations.length,2);assert(p.investorRelations.some(r=>r.investorName==='演示机构投资人A'));assert.equal(p.companyRelations.length,0);}finally{rmSync(f.root,{recursive:true,force:true});}
});
test('synthetic import chunks retain page boundaries and original evidence paths',()=>{
 const f=syntheticFixture();try{const p=createSourceMaterialImportPlan({projectRoot:f.root,collectionPath:f.collectionPath});assert.equal(p.textChunks.length,2);assert.equal(p.textChunks[1].pageNumber,2);assert.match(p.textChunks[0].content,/普通投资者/);assert.match(p.textChunks[0].recognizedTextPath,/text\/Demo\.md$/);assert.match(p.textChunks[0].originalFilePath,/originals\/Demo-Investor\.pdf$/);}finally{rmSync(f.root,{recursive:true,force:true});}
});
