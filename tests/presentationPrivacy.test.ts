import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import ts from 'typescript';
import {exitSettlementError} from '../src/lib/exitSettlementTypes.ts';
const root=new URL('../src/',import.meta.url);
function exposedTechnicalValues(source:string,name:string){
 const ast=ts.createSourceFile(name,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),findings:string[]=[];
 const technical=(node:ts.Node|undefined):boolean=>{if(!node)return false;if(ts.isPropertyAccessExpression(node)){return node.getText(ast)!=='ref.id'&&/^(id|.*Id|sha256|sourceHash|contentHash|fingerprint|revision|masterRevision|model|baseUrl|maskedApiKey|providerName)$/.test(node.name.text);}if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='slice')return technical(node.expression.expression);if(ts.isTemplateExpression(node))return node.templateSpans.some(s=>technical(s.expression));if(ts.isConditionalExpression(node))return technical(node.whenTrue)||technical(node.whenFalse);return false;};
 const businessRevision=(node:ts.JsxExpression)=>{if(!node.expression||!ts.isPropertyAccessExpression(node.expression)||node.expression.name.text!=='revision'||!ts.isJsxElement(node.parent))return false;const index=node.parent.children.indexOf(node),prefix=node.parent.children[index-1];return Boolean(prefix&&ts.isJsxText(prefix)&&/^\s*修订\s*$/.test(prefix.text));};
 const walk=(node:ts.Node)=>{if(ts.isJsxExpression(node)&&!ts.isJsxAttribute(node.parent)&&technical(node.expression)&&!businessRevision(node))findings.push(node.getText(ast));if(ts.isJsxText(node)&&/SHA256|预览资源路径|原始文件路径|稳定标识|批次 ID|项目 ID|Qwen|qwen|Base URL|Nginx|RBAC/.test(node.text))findings.push(node.text);ts.forEachChild(node,walk);};walk(ast);return findings;
}
test('business UI does not render internal identifiers, fingerprints or provider configuration',()=>{
 const files=['App.tsx',...readdirSync(new URL('components/',root)).filter(f=>f.endsWith('.tsx')).map(f=>'components/'+f)];
 const findings=files.flatMap(name=>exposedTechnicalValues(readFileSync(new URL(name,root),'utf8'),name).map(value=>name+': '+value));assert.deepEqual(findings,[]);
 // Prove the guard catches old display patterns while allowing internal keys, links and business versions.
 assert.equal(exposedTechnicalValues('<p>{record.id} {record.sha256} {status.model}</p>','old.tsx').length,3);
 assert.deepEqual(exposedTechnicalValues('<span>修订 {record.revision}</span>','business-revision.tsx'),[]);
 assert.equal(exposedTechnicalValues('<span>{record.revision}</span><span>修订 {record.id}</span><span>修订 {record.sha256}</span>','private.tsx').length,3);
 assert.deepEqual(exposedTechnicalValues('<a key={record.id} href={record.downloadHref}>V{record.version} · {record.title}</a>','business.tsx'),[]);
});
test('business errors retain human guidance without exposing internal error codes',()=>{assert(!exitSettlementError({code:'internal_storage_error',status:500}).includes('internal_storage_error'));assert.match(exitSettlementError({code:'请至少选择一份原件'}),/请至少选择一份原件/);assert.match(exitSettlementError({status:403}),/权限/);});
