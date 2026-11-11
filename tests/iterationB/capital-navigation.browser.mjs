import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import ts from '../../node_modules/typescript/lib/typescript.js';
import {chromium} from '/tmp/demo-user/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1000,height:700}});
 await page.route('http://capital.test/**',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
 await page.goto('http://capital.test/#capital-items');
 await page.evaluate(()=>document.documentElement.className='atelier-theme');
 await page.addStyleTag({content:':root.atelier-theme details>summary{color:#b42318!important}'});
 await page.addStyleTag({path:root+'src/iterationB/capital.css'});
 for(const name of ['react/umd/react.development.js','react-dom/umd/react-dom.development.js'])await page.addScriptTag({path:root+'node_modules/'+name});
 const source={};
 for(const name of ['capitalNavigation.ts','CapitalSection.tsx'])source[name]=ts.transpileModule(await fs.readFile(root+'src/iterationB/'+name,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
 await page.evaluate(({source})=>{
  window.React=React;
  const navigation={exports:{}};new Function('exports',source['capitalNavigation.ts'])(navigation.exports);
  const component={exports:{}};
  new Function('exports','require',source['CapitalSection.tsx'])(component.exports,name=>name==='react'?React:name==='./capitalNavigation'?navigation.exports:name==='lucide-react'?{ChevronDown:()=>null}:{});
  window.revealCapitalTarget=navigation.exports.revealCapitalTarget;
  window.capitalHashTarget=navigation.exports.capitalHashTarget;
  const e=React.createElement;
  ReactDOM.createRoot(document.getElementById('root')).render(e('div',null,
   e('a',{id:'jump',href:'#capital-items'},'核对资金事项'),
   e('button',{id:'program',onClick:()=>window.revealCapitalTarget('capital-items')},'账龄定位'),
   e('div',{style:{height:800}},'页面内容'),
   e(component.exports.CapitalSection,{id:'capital-matters',title:'资金事项',description:'测试'},e('div',{id:'capital-items'},e('input',{id:'draft',defaultValue:'保留输入'}))),
   e(component.exports.CapitalSection,{id:'other',title:'其他区',description:'测试'},'其他内容')));
 },{source});
 await page.waitForFunction(()=>document.querySelector('#capital-matters')?.open);
 assert.equal(await page.locator('#capital-matters>summary>strong').evaluate(el=>getComputedStyle(el).color),'rgb(255, 255, 255)','open header overrides global red summary');
 assert.equal(await page.locator('#other').evaluate(el=>el.open),false,'initial hash opens only target section');
 await page.locator('#draft').fill('未保存输入');
 for(const trigger of ['same-hash-link','program','hashchange','popstate']){
  await page.evaluate(()=>{document.querySelector('#capital-matters').open=false;window.scrollTo(0,0);});
  if(trigger==='same-hash-link')await page.locator('#jump').click();
  if(trigger==='program')await page.locator('#program').click();
  if(trigger==='hashchange')await page.evaluate(()=>{location.hash='other';location.hash='capital-items';});
  if(trigger==='popstate')await page.evaluate(()=>{history.pushState({},'','#capital-items');dispatchEvent(new PopStateEvent('popstate'));});
  await page.waitForFunction(()=>document.querySelector('#capital-matters').open);
  assert.equal(await page.locator('#draft').inputValue(),'未保存输入',trigger+' preserves mounted draft');
  const top=await page.locator('#capital-items').evaluate(el=>el.getBoundingClientRect().top);
  assert.ok(top>=0&&top<700,trigger+' scrolls visible target');
 }
 assert.equal(await page.evaluate(()=>window.capitalHashTarget('#%E0%A4%A')),'');
 await page.evaluate(()=>window.revealCapitalTarget('missing-target'));
 await page.locator('#capital-matters>summary').click();
 assert.equal(await page.locator('#capital-matters').evaluate(el=>el.open),false,'manual close still works');
 const luminance=hex=>{const v=hex.match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4);return v[0]*0.2126+v[1]*0.7152+v[2]*0.0722;};
 for(const color of ['89613e','765235'])assert.ok(1.05/(luminance(color)+0.05)>=4.5,'white small text contrast');
 console.log('PASS contrast, global red override, initial hash, same hash link, programmatic locate, hashchange, popstate, preserved draft, missing/malformed targets, manual close');
}finally{await browser.close();}
