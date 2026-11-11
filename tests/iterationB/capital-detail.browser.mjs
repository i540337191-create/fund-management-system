import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import ts from '../../node_modules/typescript/lib/typescript.js';
import {chromium} from '/tmp/demo-user/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage();await page.route('http://capital.test/**',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await page.goto('http://capital.test/');
 for(const p of ['react/umd/react.development.js','react-dom/umd/react-dom.development.js'])await page.addScriptTag({path:root+'node_modules/'+p});
 const source={};for(const name of ['capitalNavigation.ts','CapitalDetailWorkspace.tsx'])source[name]=ts.transpileModule(await fs.readFile(root+'src/iterationB/'+name,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
 await page.evaluate(source=>{
  window.React=React;const navigation={exports:{}};new Function('exports',source['capitalNavigation.ts'])(navigation.exports);const component={exports:{}};new Function('exports','require',source['CapitalDetailWorkspace.tsx'])(component.exports,name=>name==='react'?React:name==='../components/MaterialFileDialogs'?{WorkflowDialog:({open,children,onClose,busy,title})=>React.createElement('div',{hidden:!open},React.createElement('button',{disabled:busy,onClick:onClose},'关闭'+title),children)}:navigation.exports);
  const e=React.createElement;function Test(){const [locked,setLocked]=React.useState(false);return e('div',null,e('button',{id:'open',onClick:()=>navigation.exports.revealCapitalTarget('capital-payments')},'打开付款'),e('button',{id:'lock',onClick:()=>setLocked(v=>!v)},'切换锁定'),e(component.exports.CapitalDetailWorkspace,{locked,tools:null},e('section',{id:'capital-payments'},e('input',{id:'draft',defaultValue:''})),e('section',{id:'capital-investment-ledger'},'投资批次内容'),e('section',{id:'capital-matters'},e('div',{id:'capital-items'},'事项内容'))));}ReactDOM.createRoot(document.getElementById('root')).render(e(Test));
 },source);
 await page.getByRole('button',{name:'投资批次',exact:true}).last().click();assert.equal(new URL(page.url()).hash,'#capital-investment-ledger');await page.locator('#open').click();await page.locator('#draft').waitFor();await page.waitForTimeout(60);assert.equal(await page.locator('#draft').isVisible(),true,'another existing hash must not revert a requested panel');assert.equal(new URL(page.url()).hash,'#capital-payments');
 await page.locator('#draft').fill('保留原输入');await page.locator('#lock').click();assert.equal(await page.getByRole('button',{name:'投资批次',exact:true}).last().isDisabled(),true);await page.locator('#open').click();await page.evaluate(()=>window.dispatchEvent(new CustomEvent('fundapp:capital-detail',{detail:'capital-investment-ledger',cancelable:true})));assert.equal(await page.locator('#draft').isVisible(),true);await page.locator('#lock').click();assert.equal(await page.locator('#draft').isVisible(),true,'blocked request is not queued after unlocking');
 await page.getByRole('button',{name:'投资批次',exact:true}).last().click();await page.getByRole('button',{name:'付款与凭证',exact:true}).last().click();assert.equal(await page.locator('#draft').inputValue(),'保留原输入');
 await page.getByRole('button',{name:'关闭付款与凭证'}).click();assert.equal(await page.locator('#draft').isVisible(),false);assert.equal(new URL(page.url()).hash,'');
 await page.evaluate(()=>location.hash='capital-items');await page.locator('#capital-items').waitFor();assert.equal(await page.locator('.capital-detail-content:visible').count(),1);await page.evaluate(()=>location.hash='');await page.waitForFunction(()=>document.querySelectorAll('.capital-detail-content:not([hidden])').length===0);
 console.log('PASS old-hash cross-panel navigation, locked requests not queued, mounted input retention, close and legacy child hash');
}finally{await browser.close();}
