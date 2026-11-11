import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from '/tmp/demo-user/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1400,height:900}});
 await page.setContent(`<html class="atelier-theme"><body><main class="fund-dossier">
 <div class="dossier-at-a-glance"><button data-ui="navigation">关联项目 <strong>0</strong></button></div>
 <section class="dossier-tab-content"><table><tbody><tr><td><button data-ui="navigation">投资者名称</button></td></tr></tbody></table></section>
 <div class="dossier-work"><button data-ui="primary">查看待办</button></div></main>
 <section class="fund-ledger-overview"><div class="fund-ledger-metrics"><button class="fund-ledger-metric" data-ui="navigation"><strong>113</strong><span>未完成待办</span></button></div></section></body></html>`);
 for(const file of ['atelier.css','controls.css','iterationB/fundDossier.css','iterationB/fundRelations.css'])await page.addStyleTag({content:await fs.readFile(root+'src/'+file,'utf8')});
 const clear=async locator=>{const style=await locator.evaluate(el=>({background:getComputedStyle(el).backgroundColor,shadow:getComputedStyle(el).boxShadow,decoration:getComputedStyle(el).textDecorationLine}));assert.equal(style.background,'rgba(0, 0, 0, 0)');assert.equal(style.shadow,'none');assert.equal(style.decoration,'none');};
 for(const theme of ['light','dark']){
  await page.locator('html').evaluate((el,theme)=>el.dataset.colorMode=theme,theme);
  for(const selector of ['.dossier-at-a-glance>button','.dossier-tab-content table button']){
   const link=page.locator(selector);await page.mouse.move(0,0);await page.waitForTimeout(200);await clear(link);await link.hover();await page.waitForTimeout(200);await clear(link);
  }
 }
 const number=page.locator('.fund-ledger-metric strong'),label=page.locator('.fund-ledger-metric span');
 await page.mouse.move(0,0);await number.hover();await page.waitForTimeout(200);
 assert.equal(await number.evaluate(el=>getComputedStyle(el).transform),'matrix(1, 0, 0, 1, 0, -3)');
 assert.equal(await label.evaluate(el=>getComputedStyle(el).transform),'none');
 assert.equal(await page.locator('.fund-ledger-metric').evaluate(el=>getComputedStyle(el).boxShadow),'none');
 await page.mouse.move(0,0);await page.waitForTimeout(200);assert.equal(await number.evaluate(el=>getComputedStyle(el).transform),'none');
 await page.emulateMedia({reducedMotion:'reduce'});await number.hover();assert.equal(await number.evaluate(el=>getComputedStyle(el).transform),'none');
 await page.mouse.move(0,0);await page.getByRole('button',{name:'关联项目 0'}).focus();
 assert.notEqual(await page.locator('.dossier-at-a-glance>button').evaluate(el=>getComputedStyle(el).outlineStyle),'none');
 console.log('PASS: light/dark text links flat before and during hover; number alone lifts 3px and resets; reduced motion and keyboard focus retained.');
}finally{await browser.close();}
