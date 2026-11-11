import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import ts from '../../node_modules/typescript/lib/typescript.js';
import {chromium} from '/tmp/demo-user/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage();await page.setContent('<div id="root"></div>');
 for(const path of ['react/umd/react.development.js','react-dom/umd/react-dom.development.js'])await page.addScriptTag({path:root+'node_modules/'+path});
 await page.addStyleTag({path:root+'src/components/file-upload-button.css'});
 const source=ts.transpileModule(await fs.readFile(root+'src/components/FileUploadButton.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2020}}).outputText;
 await page.evaluate(source=>{
  const exports={};new Function('exports','require',source)(exports,name=>name==='react'?React:name==='lucide-react'?{Upload:()=>null}:{});
  const e=React.createElement,root=ReactDOM.createRoot(document.getElementById('root'));window.inputRef=React.createRef();window.changes=0;
  window.render=(props={})=>root.render(e('form',{onSubmit:event=>{event.preventDefault();window.saved=true;}},e(exports.FileUploadButton,{ref:inputRef,required:true,'aria-label':'测试原件',accept:'.txt',autoFocus:true,onChange:()=>changes++,...props}),e('button',{type:'submit'},'保存')));
  render();
 },source);
 const button=page.getByRole('button',{name:'上传文件',exact:true}),input=page.locator('input[type=file]');
 await button.waitFor();assert.equal(await button.evaluate(el=>document.activeElement===el),true);
  const select=page.waitForEvent('filechooser');await button.press('Enter');await(await select).setFiles({name:'single.txt',mimeType:'text/plain',buffer:Buffer.from('one')});
 assert.equal(await page.getByRole('status').innerText(),'single.txt');assert.equal(await page.evaluate(()=>changes),1);
 assert.equal(await page.evaluate(()=>inputRef.current===document.querySelector('input[type=file]')),true);
 await page.evaluate(()=>{inputRef.current.value='';render({multiple:true,selectedNames:[]});});await page.getByRole('status').getByText('未选择文件').waitFor();
 await page.getByRole('button',{name:'保存',exact:true}).click();assert.equal(await button.getAttribute('aria-invalid'),'true');assert.equal(await button.evaluate(el=>document.activeElement===el),true);assert.equal(await page.evaluate(()=>Boolean(window.saved)),false);
 await input.setInputFiles([{name:'a.txt',mimeType:'text/plain',buffer:Buffer.from('a')},{name:'b.txt',mimeType:'text/plain',buffer:Buffer.from('b')}]);
 assert.equal(await button.getAttribute('aria-invalid'),null);await page.evaluate(()=>render({multiple:true}));await page.getByText('已选择 2 个文件',{exact:true}).waitFor();
 await page.getByRole('button',{name:'保存',exact:true}).click();assert.equal(await page.evaluate(()=>saved),true);
 await page.evaluate(()=>render({disabled:true}));await page.waitForFunction(()=>document.querySelector('button').disabled);assert.equal(await button.isDisabled(),true);assert.equal(await input.isDisabled(),true);
 console.log('PASS: chooser, ref, controlled reset, required validation/focus, multiple selection, disabled, submit');
}finally{await browser.close();}
