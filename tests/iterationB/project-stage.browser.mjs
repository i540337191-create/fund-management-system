import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import ts from '../../node_modules/typescript/lib/typescript.js';
import {chromium} from '/tmp/demo-user/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1200,height:800}});page.on('pageerror',error=>console.error(error.message));await page.setContent('<div id="root"></div>');
 for(const name of ['react/umd/react.development.js','react-dom/umd/react-dom.development.js'])await page.addScriptTag({path:root+'node_modules/'+name});
 await page.addStyleTag({path:root+'src/businessVisuals.css'});await page.addStyleTag({path:root+'src/iterationB/projectStage.css'});
 const transpile=async path=>ts.transpileModule(await fs.readFile(root+path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2020}}).outputText;
 const source=await transpile('src/components/ProjectStageChart.tsx'),model=await transpile('src/lib/chartModels.ts');
 await page.evaluate(({source,model})=>{window.React=React;const counts={};new Function('exports',model)(counts);const chart={};new Function('exports','require',source)(chart,name=>name.includes('chartModels')?counts:{});const e=React.createElement;
  function Test(){const [selected,setSelected]=React.useState('');return e(chart.ProjectStageChart,{projects:[{stage:'初筛'},{stage:'初筛'},{stage:'退出'},{stage:' '}],selected,onSelect:setSelected});}
  ReactDOM.createRoot(document.getElementById('root')).render(e(Test));
 },{source,model});
 await page.waitForSelector('.project-stock-segment');assert.equal(await page.locator('.project-stage-selected-count').count(),0);
 const reset=page.getByRole('button',{name:'查看全部阶段',exact:true});assert.equal(await reset.isDisabled(),true);
 const y=await page.locator('.project-stock-legend').evaluate(el=>el.getBoundingClientRect().y);
 await page.locator('.project-stock-segment').first().click();assert.equal(await page.locator('.project-stage-selected-count').innerText(),'2 个项目');assert.equal(await reset.isEnabled(),true);
 assert.equal(await page.locator('.project-stock-segment').first().evaluate(el=>getComputedStyle(el).boxShadow),'none');
 assert.equal(await page.locator('.project-stock-legend').evaluate(el=>el.getBoundingClientRect().y),y,'selection count does not move legend');
 await page.getByRole('button',{name:/未登记阶段/}).first().click();assert.equal(await page.locator('.project-stage-selected-count').innerText(),'1 个项目');
 await reset.click();assert.equal(await page.locator('.project-stage-selected-count').count(),0);assert.equal(await reset.isDisabled(),true);
 await page.locator('.project-stock-segment').first().focus();await page.keyboard.press('Enter');assert.equal(await page.locator('.project-stage-selected-count').innerText(),'2 个项目');
 console.log('PASS actual stage counts, blank stage, selected-only count, no black inset, stable layout, reset and keyboard');
}finally{await browser.close();}
