import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import ts from '../../node_modules/typescript/lib/typescript.js';
import {chromium} from '/tmp/demo-user/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
let app=await fs.readFile(root+'src/App.tsx','utf8');
const patch=await fs.readFile(root+'../evidence/design-review-20261106/双线程交接/B/integration-requests/005-capital-relation-confirm.patch','utf8');
// Exercise the proposed App callback code without editing the shared App file.
if(!app.includes('const needsRelationConfirmation=')){
const original=app.split('\n'),lines=patch.split('\n'),output=[];let cursor=0,index=2;
while(index<lines.length){if(!lines[index].startsWith('@@')){index++;continue;}const target=Number(lines[index].match(/@@ -(\d+)/)[1])-1;output.push(...original.slice(cursor,target));cursor=target;index++;while(index<lines.length&&!lines[index].startsWith('@@')){const line=lines[index++];if(line.startsWith(' ')){output.push(line.slice(1));cursor++;}else if(line.startsWith('-'))cursor++;else if(line.startsWith('+'))output.push(line.slice(1));}}output.push(...original.slice(cursor));app=output.join('\n');
}
const start=app.indexOf('function CapitalCreateModal('),end=app.indexOf('\nfunction ',start+10);
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2020}}).outputText;
const modal=compile(app.slice(start,end)+'\nexport {CapitalCreateModal};'),relation=compile(await fs.readFile(root+'src/iterationB/capitalRelation.ts','utf8')),notice=compile(await fs.readFile(root+'src/iterationB/CapitalRelationNotice.tsx','utf8'));
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1200,height:1000}});page.on('pageerror',error=>console.error(error.message));await page.setContent('<div id="root"></div>');
 for(const name of ['react/umd/react.development.js','react-dom/umd/react-dom.development.js'])await page.addScriptTag({path:root+'node_modules/'+name});
 await page.evaluate(({modal,relation,notice})=>{
  Object.assign(window,{React,useState:React.useState,useRef:React.useRef});const e=React.createElement;
  const helper={};new Function('exports',relation)(helper);Object.assign(window,helper);const view={};new Function('exports',notice)(view);Object.assign(window,view);
  window.WorkflowDialog=({children})=>e('div',{role:'dialog'},children);
  window.Field=({label,value,onChange})=>e('label',null,label,e('input',{value,onChange:event=>onChange(event.target.value)}));
  window.NoticeHelp=()=>null;window.isLocalBusinessStateMode=()=>false;window.confirmAction=async()=>window.allowClose;window.allowClose=false;
  const exports={};new Function('exports',modal)(exports);const root=ReactDOM.createRoot(document.getElementById('root'));
  window.attempts=[];window.draftClosedCount=0;window.run=0;
  const funds=[{id:'A',name:'基金A'},{id:'B',name:'基金B'}],projects=[{id:'X',name:'项目X',fundId:'A',fund:'基金A'},{id:'Y',name:'项目Y',fundId:'B',fund:'基金B'}];
  window.openModal=()=>root.render(e(exports.CapitalCreateModal,{key:++run,projects,funds,initial:{id:'draft-id',company:'项目X',projectId:'X',...capitalScopeFund(projects[0],funds[1]),received:'0',date:'',rule:'人工事项',receivable:'10',dueDate:'2026-12-01',status:'未收'},onClose:()=>{window.draftClosedCount++;root.render(null);},onSave:draft=>new Promise((resolve,reject)=>attempts.push({draft:structuredClone(draft),resolve,reject})).then(()=>root.render(null))}));
  openModal();
 },{modal,relation,notice});
 const fund=page.getByRole('combobox',{name:/所属基金/}),project=page.getByRole('combobox',{name:/关联项目/}),save=page.getByRole('button',{name:'保存资金事项',exact:true});
 await page.waitForSelector('[role=dialog]');assert.equal(await fund.inputValue(),'','cross URL fund not prefilled');
 await fund.selectOption('B');await save.click();assert.equal(await page.evaluate(()=>attempts.length),0);assert.match(await page.getByRole('alert').innerText(),/确认/);
 const confirmation=page.getByRole('checkbox');await confirmation.check();await project.selectOption('Y');await project.selectOption('X');assert.equal(await confirmation.isChecked(),false,'project A→B→A clears consent');
 await confirmation.check();await fund.selectOption('A');await fund.selectOption('B');assert.equal(await confirmation.isChecked(),false,'fund A→B clears consent');
 await confirmation.check();await save.click();await page.waitForFunction(()=>attempts.length===1);assert.equal(await fund.isDisabled(),true,'scope cannot change during save');
 await page.evaluate(()=>attempts[0].reject(Error('unknown result')));await page.waitForSelector('button:has-text("原样重试本次保存")');assert.equal(await project.isDisabled(),true,'unknown result freezes original request');
 await page.getByRole('button',{name:'原样重试本次保存',exact:true}).click();await page.waitForFunction(()=>attempts.length===2);assert.deepEqual(await page.evaluate(()=>attempts.map(x=>x.draft)),[await page.evaluate(()=>attempts[0].draft),await page.evaluate(()=>attempts[0].draft)],'retry keeps exact request');
 await page.evaluate(()=>attempts[1].resolve());await page.waitForSelector('[role=dialog]',{state:'detached'});await page.evaluate(()=>openModal());await page.waitForSelector('[role=dialog]');await fund.selectOption('B');
 await page.getByRole('button',{name:'取消',exact:true}).click();assert.equal(await page.evaluate(()=>draftClosedCount),0,'cancelled close retains draft');assert.equal(await fund.inputValue(),'B');
 await page.evaluate(()=>window.allowClose=true);await page.getByRole('button',{name:'取消',exact:true}).click();await page.waitForFunction(()=>draftClosedCount===1);
 await page.evaluate(()=>openModal());await page.waitForSelector('[role=dialog]');assert.equal(await fund.inputValue(),'','reentry rechecks initial cross-fund relation');
 console.log('PASS cross-scope initialization, project/fund switching resets confirmation, guarded save, exact unknown-result retry, cancel retains input, confirmed close and reentry');
}finally{await browser.close();}
