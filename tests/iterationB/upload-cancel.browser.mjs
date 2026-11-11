import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import ts from '../../node_modules/typescript/lib/typescript.js';
import {chromium} from '/tmp/demo-user/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage();await page.setContent('<div id="root"></div>');
 for(const file of ['react/umd/react.development.js','react-dom/umd/react-dom.development.js'])await page.addScriptTag({path:root+'node_modules/'+file});
 const sources={};for(const file of ['components/MaterialFileDialogs.tsx','components/FileUploadButton.tsx','lib/useBackdropDismiss.ts'])sources[file]=ts.transpileModule(await fs.readFile(root+'src/'+file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2020}}).outputText;
 await page.evaluate(sources=>{
  const cache={};const load=file=>{if(cache[file])return cache[file];const exports={};cache[file]=exports;new Function('exports','require',sources[file])(exports,name=>name==='react'?React:name.endsWith('useBackdropDismiss')?load('lib/useBackdropDismiss.ts'):name==='./FileUploadButton'?load('components/FileUploadButton.tsx'):name.includes('apiClient')?{createApiClient:()=>({})}:name==='lucide-react'?{Upload:()=>null}:{});return exports;};
  const {WorkflowDialog}=load('components/MaterialFileDialogs.tsx'),{FileUploadButton}=load('components/FileUploadButton.tsx'),e=React.createElement,root=ReactDOM.createRoot(document.getElementById('root'));window.closeRequests=0;
  window.render=busy=>root.render(e(WorkflowDialog,{title:'新建基金',busy,onClose:()=>closeRequests++},e('input',{'aria-label':'基金名称',defaultValue:'保留填写'}),e(FileUploadButton,{'aria-label':'上传业务原件'})));
  render(false);
 },sources);
 const dialog=page.getByRole('dialog',{name:'新建基金'}),input=dialog.locator('input[type=file]');await dialog.waitFor();
 await input.dispatchEvent('cancel',{bubbles:true});
 assert.equal(await page.evaluate(()=>closeRequests),0,'canceling the file chooser must not request dialog close');
 assert.equal(await dialog.getByLabel('基金名称',{exact:true}).inputValue(),'保留填写');
 // Re-selecting the same file also emits cancel in browsers.
 await input.setInputFiles({name:'original.txt',mimeType:'text/plain',buffer:Buffer.from('fixture')});await input.dispatchEvent('cancel',{bubbles:true});
 assert.equal(await page.evaluate(()=>closeRequests),0);assert.equal(await page.getByRole('status').innerText(),'original.txt');
 await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>closeRequests),1,'dialog Escape still requests close');
 await page.evaluate(()=>render(true));await page.waitForFunction(()=>document.querySelector('dialog').getAttribute('aria-busy')==='true');await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>closeRequests),1,'busy protection remains');
 await page.evaluate(()=>render(false));await page.waitForFunction(()=>document.querySelector('dialog').getAttribute('aria-busy')==='false');await page.getByRole('button',{name:'关闭新建基金'}).click();assert.equal(await page.evaluate(()=>closeRequests),2,'explicit close remains');
 console.log('PASS: actual WorkflowDialog ignores file cancel, retains form/file, handles own Escape, busy and explicit close');
}finally{await browser.close();}
