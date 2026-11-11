import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import ts from '../../node_modules/typescript/lib/typescript.js';
import {chromium} from '/tmp/demo-user/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage();await page.route('http://localhost:19183/**',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await page.goto('http://localhost:19183/projects/p?taskId=warning-old');
 for(const file of ['react/umd/react.development.js','react-dom/umd/react-dom.development.js'])await page.addScriptTag({path:root+'node_modules/'+file});
 const sources={};for(const path of ['src/components/PostInvestmentPanel.tsx','src/lib/postInvestmentView.ts','src/iterationB/postRecordOrder.ts'])sources[path]=ts.transpileModule(await fs.readFile(root+path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2020}}).outputText;
 await page.evaluate(sources=>{
  const e=React.createElement,actor={id:'user-admin',name:'隔离用户',email:'test@example.local',role:'admin'},clause={id:'clause',dealId:'b',owner:actor,version:1,status:'active',title:'隔离履约',triggerDate:'2026-10-01',quote:'原文',obligation:'义务',threshold:'条件',sourceLocation:'1页',signedMaterial:{name:'原件',downloadHref:'/source'},warningTaskId:'warning-old'};
  const archive={id:'archive-old',version:1,dealId:'b',owner:actor,time:'2026-10-01T00:00:00Z',period:{kind:'quarter',value:'2026-Q3'},category:'旧归档',note:'旧资料',materials:[],allocations:[]};
  const post={financials:[],visits:[],archives:[archive,{...archive,id:'archive-new',time:'2026-11-01T00:00:00Z',category:'新归档'}],reports:[],exitPreparations:[],clauses:[clause,{...clause,version:2,warningTaskId:'warning-current'}]},payload={postInvestment:post,closedDeals:[{id:'a',title:'批次A',owner:actor},{id:'b',title:'批次B',owner:actor}],currentUser:actor};
  const helper={};new Function('exports',sources['src/lib/postInvestmentView.ts'])(helper);
  const order={};new Function('exports','require',sources['src/iterationB/postRecordOrder.ts'])(order,()=>helper);
  window.postReads=0;const api={getPostInvestment:async()=>{postReads++;return payload;},getUsers:async()=>({users:[]}),getMaterials:async()=>({materials:[]}),getWorkflowTasks:async()=>({tasks:[]}),getFunds:async()=>({funds:[]})};
  const mock={react:React,'../lib/apiClient':{createApiClient:()=>api},'../lib/postInvestmentView':helper,'../iterationB/postRecordOrder':order,'../lib/useSourceScope':{useSourceScope:()=>()=>true},'../lib/sourceVisibility':{useHideSeedDemo:()=>false},'../iterationA/RefreshButton':{RefreshButton:props=>e('button',props)},'./NoticeHelp':{NoticeHelp:()=>null},'./MaterialFileDialogs':{},'../lib/exitPreparation':{}};
  const exports={};new Function('exports','require',sources['src/components/PostInvestmentPanel.tsx'])(exports,name=>{if(name in mock)return mock[name];throw Error('unmocked '+name);});
  const app=ReactDOM.createRoot(document.getElementById('root'));window.render=(view,fixedDealId)=>app.render(e(exports.PostInvestmentPanel,{project:{id:'p',ownerId:actor.id},view,fixedDealId}));render('履约预警');
 },sources);
 await page.getByText(/当前任务关联来源 V1/).waitFor();assert.equal(await page.locator('select').inputValue(),'b');assert.equal(await page.locator('article details').getAttribute('open'),'');
 await page.evaluate(()=>render('期间档案'));await page.getByText(/新归档/).waitFor();assert.match(await page.locator('article').first().innerText(),/新归档/);assert.equal(await page.getByText(/当前任务关联来源/).count(),0);assert.equal(await page.locator('select').inputValue(),'b');assert.match(page.url(),/taskId=warning-old/);const reads=await page.evaluate(()=>postReads);await page.getByRole('button',{name:'刷新投后档案',exact:true}).click();await page.waitForFunction(reads=>postReads>reads,reads);assert.match(await page.locator('article').first().innerText(),/新归档/);
 for(const view of ['走访记录','投后经营','报告记录','退出准备']){await page.evaluate(view=>render(view),view);await page.getByRole('heading',{name:view,exact:true}).waitFor();assert.equal(await page.getByText(/当前任务关联来源/).count(),0);assert.equal(await page.locator('select').inputValue(),'b');}
 await page.evaluate(()=>render('履约预警','a'));await page.getByText('当前批次暂无履约条件。').waitFor();assert.equal(await page.getByText(/当前任务关联来源/).count(),0);assert.equal(await page.locator('select').inputValue(),'a');
 await page.evaluate(()=>render('履约预警'));await page.getByText(/当前任务关联来源 V1/).waitFor();assert.equal(await page.locator('article details').getAttribute('open'),'');assert.equal(await page.locator('select').inputValue(),'b');
 console.log('PASS exact historical clause opens only matching view; cross-tab hint absent; newest archive stays first after refresh; batch and task URL preserved; returning restores exact history');
}finally{await browser.close();}
