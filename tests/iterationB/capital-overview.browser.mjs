import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import ts from '../../node_modules/typescript/lib/typescript.js';
import {chromium} from '/tmp/demo-user/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.setContent('<div id="root"></div><div id="after">后续区块</div>');
 for(const name of ['react/umd/react.development.js','react-dom/umd/react-dom.development.js'])await page.addScriptTag({path:root+'node_modules/'+name});
 await page.addStyleTag({path:root+'src/iterationB/capital.css'});
 const paths=['src/iterationB/CapitalOverview.tsx','src/iterationB/capitalAmounts.ts','src/lib/useSourceScope.ts','src/lib/investmentCashflowView.ts','src/lib/dataOrigin.ts'];
 const sources={};for(const path of paths)sources[path]=ts.transpileModule(await fs.readFile(root+path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2020}}).outputText;
 await page.evaluate(sources=>{
  window.React=React;window.requests=[];window.invalidate=()=>{};
  const request=type=>filters=>new Promise((resolve,reject)=>requests.push({type,filters,resolve,reject}));
  const mocks={'../iterationA/RefreshButton':{RefreshButton:props=>React.createElement('button',props)},'react':React,'lucide-react':{RefreshCw:()=>null},'../lib/apiClient':{createApiClient:()=>({getInvestmentCashflowLedger:request('outgoing'),getExitSettlementLedger:request('incoming')})},'../lib/sourceVisibility':{useHideSeedDemo:()=>false},'../lib/sessionBoundary':{subscribeSessionInvalidation:fn=>{window.invalidate=fn;return()=>{};}},'./investmentCashflowTypes.ts':{investmentCashflowKinds:{investment_payment:'投资付款',project_fee:'项目费用付款',project_tax:'项目税款付款'}},'./capital.css':{}};
  const cache={};
  function load(path){if(cache[path])return cache[path];const exports={};new Function('exports','require',sources[path])(exports,name=>{if(name in mocks)return mocks[name];const base=path.slice(0,path.lastIndexOf('/')+1);const normalized=new URL(name,'http://test/'+base).pathname.slice(1);return load(normalized.endsWith('.ts')?normalized:normalized+'.ts');});return cache[path]=exports;}
  const {CapitalOverview}=load('src/iterationB/CapitalOverview.tsx');const root=ReactDOM.createRoot(document.getElementById('root'));
  window.renderScope=(fundId,revision=0)=>root.render(React.createElement(CapitalOverview,{fundId,fundCount:1,pendingCount:2,revision,onOpenItems:()=>{window.opened=true;}}));
  window.resolveRequest=(index,amount)=>requests[index].resolve(requests[index].type==='incoming'?{payments:[{status:'posted',currency:'CNY',amount,dataOrigin:'user_input'}]}:{rows:[{status:'posted',currency:'CNY',amount,kind:'investment_payment',dataOrigin:'user_input'}]});
  renderScope('A');
 },sources);
 await page.waitForFunction(()=>requests.length===2);
 const y=await page.locator('#after').evaluate(el=>el.getBoundingClientRect().y);
 assert.match(await page.locator('#root').innerText(),/正在读取/);
 await page.evaluate(()=>renderScope('B'));await page.waitForFunction(()=>requests.length===4);
 await page.evaluate(()=>{resolveRequest(0,'999.00');resolveRequest(1,'999.00');resolveRequest(2,'12.34');requests[3].reject(Error('temporary'));});
 await page.waitForFunction(()=>document.body.textContent.includes('回款读取失败'));
 assert.ok(!(await page.locator('#root').innerText()).includes('999.00'),'late A cannot overwrite B');
 assert.match(await page.locator('#root').innerText(),/12.34/);
 assert.equal(await page.locator('#after').evaluate(el=>el.getBoundingClientRect().y),y,'loading/error preserve layout height');
 await page.getByRole('button',{name:'重试读取资金汇总'}).click();await page.waitForFunction(()=>requests.length===6);
 await page.evaluate(()=>{resolveRequest(4,'20.00');resolveRequest(5,'30.00');});await page.waitForFunction(()=>document.body.textContent.includes('30.00'));
 assert.equal(await page.locator('#after').evaluate(el=>el.getBoundingClientRect().y),y,'success preserves layout height');
 await page.getByRole('button',{name:'核对资金事项',exact:true}).click();assert.equal(await page.evaluate(()=>window.opened),true);
 await page.evaluate(()=>renderScope('A',1));await page.waitForFunction(()=>requests.length===8);
 await page.evaluate(()=>{invalidate('logout');resolveRequest(6,'100.00');resolveRequest(7,'100.00');});
 await page.waitForFunction(()=>document.body.textContent.includes('登录身份已变化'));
 assert.ok(!(await page.locator('#root').innerText()).includes('100.00'),'session invalidation hides later amounts');
 console.log('PASS initial loading, A→B late result, partial failure, retry recovery, fixed layout, precise item action, session invalidation');
}finally{await browser.close();}
