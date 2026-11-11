import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import ts from '../../node_modules/typescript/lib/typescript.js';
import {chromium} from '/tmp/demo-user/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));let source=await fs.readFile(root+'src/components/RecordManagement.tsx','utf8');
source=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2020}}).outputText;
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1000,height:800}});page.on('pageerror',error=>console.error(error.message));await page.route('http://127.0.0.1:19998/**',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await page.goto('http://127.0.0.1:19998/');for(const file of ['react/umd/react.development.js','react-dom/umd/react-dom.development.js'])await page.addScriptTag({path:root+'node_modules/'+file});
 await page.evaluate(source=>{window.React=React;window.actions=[];window.hasHistory=false;window.failHistory=false;window.pending=null;
 const api={getDeletedRecords:async()=>{if(failHistory)throw Error('offline');return {records:hasHistory?[{id:'legacy',kind:'project',title:'历史项目',deletedAt:'2026-01-01'}]:[],versions:{p:'a'.repeat(64),legacy:'b'.repeat(64)}};},changeRecordVisibility:(...args)=>{actions.push(args);return new Promise(resolve=>window.pending=resolve);}};
 const module={};new Function('exports','require',source)(module,name=>name==='react'?React:name==='../lib/apiClient'?{createApiClient:()=>api}:name==='./MaterialFileDialogs'?{WorkflowDialog:({title,children})=>React.createElement('div',{role:'dialog','aria-label':title},children)}:{});
 const e=React.createElement,root=ReactDOM.createRoot(document.getElementById('root'));let run=0;
 window.renderCase=()=>root.render(e(module.RecordManagementProvider,{key:++run,role:'admin',onChanged:async()=>{}},e(module.DeleteRecordButton,{kind:'project',id:'p',title:'新项目'}),e(module.DeletedRecordsButton,{kind:'project'}),e(module.DeletedRecordsButton,{kind:'fund'})));
 renderCase();
 },source);
 await page.getByRole('button',{name:'删除项目：新项目'}).click();const dialog=page.getByRole('dialog',{name:'删除项目',exact:true});await page.waitForFunction(()=>document.querySelector('[role=dialog] button')&&!document.querySelector('[role=dialog] button').disabled);
 assert.match(await dialog.innerText(),/不可通过系统恢复/);assert.match(await dialog.innerText(),/不级联清除或物理擦除/);assert.equal(await dialog.locator('strong.text-red-700').count(),2);
 await dialog.getByRole('button',{name:'取消',exact:true}).click();assert.equal(await page.evaluate(()=>actions.length),0);
 assert.equal(await page.getByRole('button',{name:/最近删除|历史可恢复记录/}).count(),0);
 await page.evaluate(()=>{hasHistory=true;renderCase();});await page.waitForTimeout(30);assert.equal(await page.getByRole('button',{name:/最近删除|历史可恢复记录/}).count(),0);
 await page.evaluate(()=>{failHistory=true;renderCase();});await page.waitForTimeout(30);assert.equal(await page.getByRole('button',{name:/最近删除|历史可恢复记录/}).count(),0);assert.equal(await page.evaluate(()=>actions.length),0);
 console.log('PASS deletion consequences and cancel remain; all recently-deleted entry points removed without record actions');

}finally{await browser.close();}
