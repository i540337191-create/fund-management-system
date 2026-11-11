import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import ts from '../../node_modules/typescript/lib/typescript.js';
import {chromium} from '/tmp/demo-user/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}});page.on('pageerror',error=>console.error(error.message));await page.setContent('<div id="root"></div>');
 for(const name of ['react/umd/react.development.js','react-dom/umd/react-dom.development.js'])await page.addScriptTag({path:root+'node_modules/'+name});
 await page.addStyleTag({content:'.legacy-span{grid-column:span 2 / span 2}'});await page.addStyleTag({path:root+'src/iterationB/overviewA.css'});
 const sources={};for(const path of ['src/iterationB/ProjectOverviewA.tsx','src/iterationB/FundOverviewA.tsx','src/iterationB/ProjectHeaderA.tsx','src/iterationB/ProjectReviewStrip.tsx','src/iterationB/useFundOverviewCounts.ts','src/iterationB/MaterialExcerpts.tsx','src/iterationB/projectOverviewModel.ts','src/lib/useSourceScope.ts'])sources[path]=ts.transpileModule(await fs.readFile(root+path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2020}}).outputText;
 await page.evaluate(sources=>{
  window.React=React;window.requests=[];window.opened=[];window.invalidate=()=>{};
  const request=type=>id=>new Promise((resolve,reject)=>requests.push({type,id,resolve,reject}));
  const mock={'../lib/sourceVisibility':{useHideSeedDemo:()=>false},'../lib/dataOriginFilter':{filterSeedDemoRecords:rows=>rows},'../iterationA/RefreshButton':{RefreshButton:props=>React.createElement('button',props)},react:React,'../lib/apiClient':{createApiClient:()=>({getMaterialExtractionText:request('extraction'),getProject:request('project'),getDiligence:request('diligence'),getApprovals:request('approvals')})},'../lib/sessionBoundary':{subscribeSessionInvalidation:fn=>{window.invalidate=fn;return()=>{};}},'../components/Layout':{navigate:path=>window.lastPath=path},'./overviewA.css':{}};
  const cache={};function load(path){if(cache[path])return cache[path];const result={};new Function('exports','require',sources[path])(result,name=>{if(name in mock)return mock[name];const p=new URL(name,'http://test/'+path.slice(0,path.lastIndexOf('/')+1)).pathname.slice(1);return load([p,p+'.ts',p+'.tsx'].find(path=>path in sources)??p);});return cache[path]=result;}
  const e=React.createElement,{ProjectOverviewA}=load('src/iterationB/ProjectOverviewA.tsx'),{FundOverviewA}=load('src/iterationB/FundOverviewA.tsx'),appRoot=ReactDOM.createRoot(document.getElementById('root'));
  const {ProjectReviewStrip}=load('src/iterationB/ProjectReviewStrip.tsx'),{ProjectHeaderA}=load('src/iterationB/ProjectHeaderA.tsx');
  window.renderStrip=(id,refreshToken=0)=>appRoot.render(e(ProjectReviewStrip,{projectId:id,refreshToken}));
  window.renderHeader=()=>appRoot.render(e(ProjectHeaderA,{project:{name:'长项目名称'.repeat(20),industry:'行业',fund:'基金',manager:'负责人',updatedAt:'2026-11-06'},stage:'初筛',stages:['初筛','尽调','投后'],tabs:['资料目录','审计日志'],tab:'资料目录',badges:'实际状态',logs:['保留日志'],onOpen:tab=>opened.push(tab)}));
  window.renderProject=id=>appRoot.render(e(ProjectOverviewA,{project:{id,name:id,description:'实际主档简介',latest:'实际主档进展',thesis:'实际投资逻辑'},fields:e('div',null,'原自定义字段'),nextAction:e('section',{className:'legacy-span'},'原流程下一步'),onOpen:tab=>opened.push(tab)}));
  window.renderFund=()=>appRoot.render(e(FundOverviewA,{fund:{projectCount:2,investorCount:3,riskCount:1},metrics:e('div',{id:'metrics'},'真实四卡'),ledger:e('div',{id:'ledger'},'真实账本'),fields:'字段',onOpen:tab=>opened.push(tab)}));
  renderProject('A');
 },sources);
 await page.waitForFunction(()=>requests.length===3);assert.match(await page.locator('#root').innerText(),/正在读取/);
 assert.equal(await page.locator('.overview-a-side').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),1,'legacy span cannot create narrow implicit columns');
 const checklistY=await page.locator('.overview-a-checklist').evaluate(el=>el.getBoundingClientRect().y);
 await page.evaluate(()=>renderProject('B'));await page.waitForFunction(()=>requests.length===6);
 await page.evaluate(()=>{requests[0].resolve({materials:new Array(99),risks:[]});requests[1].resolve({diligence:null});requests[2].resolve({rounds:[]});requests[3].resolve({materials:[],risks:[]});requests[4].reject(Error('restricted'));requests[5].resolve({rounds:[]});});
 await page.waitForFunction(()=>document.body.textContent.includes('未能核验'));
 assert.ok(!(await page.locator('#root').innerText()).includes('99 份'),'late project A cannot overwrite B');
 assert.equal(await page.locator('.overview-a-checklist').evaluate(el=>el.getBoundingClientRect().y),checklistY,'loading and failure preserve list position');
 await page.getByRole('button',{name:'重新核验项目概览',exact:true}).click();await page.waitForFunction(()=>requests.length===9);
 await page.evaluate(()=>{requests[6].resolve({materials:[{id:'m',name:'真实隔离原件',currentVersionId:'v1',quotes:'7'}],risks:[{status:'待处理',level:'高'}]});requests[7].resolve({diligence:{status:'active',items:[{id:'i',taskId:'task-i',title:'具体事项',status:'draft',requirements:[{id:'r'}],submissions:[]}]}});requests[8].resolve({rounds:[]});});
 await page.getByRole('button',{name:'补齐原件',exact:true}).click();assert.match(await page.evaluate(()=>lastPath),/taskId=task-i/);assert.match(await page.evaluate(()=>lastPath),/projects\/B/);
 await page.waitForFunction(()=>requests.length===10);await page.evaluate(()=>requests[9].resolve({versionId:'v2',text:'不可显示的新版正文',pageCount:1}));await page.getByText(/正文版本与当前资料不一致/).waitFor();assert.ok(!(await page.locator('.overview-a-excerpts').innerText()).includes('不可显示的新版正文'));assert.ok(!(await page.locator('.overview-a-excerpts').innerText()).match(/\b7\b/),'citation count is never an excerpt');
 await page.getByRole('button',{name:'重新读取资料正文',exact:true}).click();await page.waitForFunction(()=>requests.length===11);await page.evaluate(()=>requests[10].reject(Error('503')));await page.getByText(/本份资料正文暂未读取/).waitFor();await page.getByRole('button',{name:'重新读取资料正文',exact:true}).click();await page.waitForFunction(()=>requests.length===12);await page.evaluate(()=>requests[11].resolve({versionId:'v1',text:'本版真实识别正文',pageCount:1}));await page.getByText('本版真实识别正文',{exact:true}).waitFor();assert.match(await page.getByRole('link',{name:'核对本版原件',exact:true}).getAttribute('href'),/m\/versions\/v1\/file/);
 for(const width of [1440,900,390]){await page.setViewportSize({width,height:1100});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no page overflow at '+width);}
 await page.evaluate(()=>{invalidate();});await page.waitForFunction(()=>document.body.textContent.includes('登录已变化'));
 await page.evaluate(()=>renderFund());await page.waitForSelector('#ledger');assert.ok(await page.locator('#metrics').evaluate(el=>el.compareDocumentPosition(document.querySelector('#ledger'))&Node.DOCUMENT_POSITION_FOLLOWING),'fund metrics precede ledger');
 await page.getByRole('button',{name:'查看基金出资明细',exact:true}).click();assert.equal(await page.evaluate(()=>opened.at(-1)),'投资项目');
 const offset=await page.evaluate(()=>requests.length);await page.evaluate(()=>renderStrip('strip-A'));await page.waitForFunction(offset=>requests.length===offset+2,offset);
 await page.evaluate(()=>renderStrip('strip-B'));await page.waitForFunction(offset=>requests.length===offset+4,offset);
 await page.evaluate(offset=>{requests[offset].resolve({diligence:{items:[{id:'old',taskId:'old',title:'不应闪回',requirements:[{id:'r'}],submissions:[]}]}});requests[offset+1].resolve({rounds:[]});requests[offset+2].reject(Error('denied'));requests[offset+3].resolve({rounds:[]});},offset);
 await page.waitForFunction(()=>document.body.textContent.includes('未能读取'));assert.ok(!(await page.locator('#root').innerText()).includes('不应闪回'));
 await page.getByRole('button',{name:'重读项目初筛提醒'}).click();await page.waitForFunction(offset=>requests.length===offset+6,offset);
 await page.evaluate(offset=>{requests[offset+4].resolve({diligence:{items:[{id:'i',taskId:'deep-item',title:'真实待补',requirements:[{id:'r'}],submissions:[]}]}});requests[offset+5].resolve({rounds:[]});},offset);
 await page.setViewportSize({width:390,height:1100});
 const mobileAction=await page.locator('.project-review-strip-results button').evaluate(button=>{const b=button.getBoundingClientRect(),r=button.closest('.project-review-strip-results').getBoundingClientRect();return {top:b.top,bottom:b.bottom,regionTop:r.top,regionBottom:r.bottom};});assert.ok(mobileAction.top>=mobileAction.regionTop&&mobileAction.bottom<=mobileAction.regionBottom,'mobile reminder action must not be clipped');
 await page.locator('.project-review-strip-results button').click();assert.match(await page.evaluate(()=>lastPath),/strip-B.*taskId=deep-item/);
 const refreshOffset=await page.evaluate(()=>requests.length);await page.evaluate(()=>renderStrip('strip-B',1));await page.waitForFunction(offset=>requests.length===offset+2,refreshOffset);
 await page.evaluate(offset=>{requests[offset].resolve({diligence:{items:[{id:'i',taskId:'deep-item',title:'已补齐事项',requirements:[{id:'r'}],submissions:[{version:1,evidence:[{requirementId:'r',material:{}}]}]}]}});requests[offset+1].resolve({rounds:[]});},refreshOffset);
 await page.waitForFunction(()=>document.body.textContent.includes('未发现缺件'));assert.ok(!(await page.locator('.project-review-strip-results').innerText()).includes('真实待补'),'same-project workflow refresh replaces old reminder');
 await page.evaluate(()=>renderHeader());await page.waitForSelector('.project-header-a');for(const width of [1440,900,390]){await page.setViewportSize({width,height:1100});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'header no overflow '+width);}
 await page.getByRole('button',{name:'资料目录',exact:true}).click();assert.equal(await page.evaluate(()=>opened.at(-1)),'资料目录');
 console.log('PASS version-bound excerpts (not citation counts), mismatch/failure/retry, scoped loading, late result isolation, failure/retry, fixed checklist position, precise task link, responsive widths, session clearing, fund card order and entry');
}finally{await browser.close();}
