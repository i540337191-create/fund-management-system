import test from 'node:test';
import assert from 'node:assert/strict';
import {reportCatalogue,reportFlow,parseReportDraft} from '../src/lib/reportCatalogue.ts';
import {reportTypes} from '../src/data/reports.ts';
test('catalogue covers all eight report types and their business guidance',()=>{
 assert.deepEqual(reportCatalogue.map(r=>r.type),reportTypes);
 assert.equal(new Set(reportCatalogue.map(r=>r.type)).size,8);
 for(const r of reportCatalogue)assert.ok(r.stage&&r.timing&&r.materials&&r.group);
 assert.equal(reportFlow.at(-2),'人工审核');assert.equal(reportFlow.at(-1),'导出归档');
});
test('AI draft accepts complete chapters, strips optional fences and discards extra fields',()=>{
 const value={sections:[{title:'季度运营',text:'待核对：所选资料未含本季度数据。',extra:'ignore'}]};
 assert.deepEqual(parseReportDraft('```json\n'+JSON.stringify(value)+'\n```'),[{title:'季度运营',text:'待核对：所选资料未含本季度数据。'}]);
});
test('partial, empty, oversized and malformed AI results cannot become savable reports',()=>{
 for(const value of ['', 'not JSON','{"sections":[',JSON.stringify({sections:[]}),JSON.stringify({sections:[{title:' ',text:'正文'}]}),JSON.stringify({sections:[{title:'章节',text:''}]}),JSON.stringify({sections:Array.from({length:99},()=>({title:'章节',text:'正文'}))}),JSON.stringify({sections:[{title:'章节',text:'x'.repeat(100001)}]})])assert.throws(()=>parseReportDraft(value));
});
test('catalogue renders eight direct creation entries and preserves older/custom report types and source labels',async()=>{
 const {createServer}=await import('vite');const {createElement}=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');
 const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:{port:30000+process.pid%20000}},appType:'custom'});
 try{(await server.ssrLoadModule('/src/i18n/locale.ts')).setLocale('zh');const {ReportCatalogue}=await server.ssrLoadModule('/src/components/ReportCatalogue.tsx');
 const report={id:'legacy-r',name:'历史待核验报告',target:'既有基金',type:'历史自定义报告',status:'草稿',owner:'原经办人',updatedAt:'2026-04-27T17:20:00Z',dataOrigin:'seed_demo'};
 const html=renderToStaticMarkup(createElement(ReportCatalogue,{reports:[report],filteredReports:[report],typeFilter:'全部报告类型',onTypeFilter:()=>{},nameQuery:'',onNameQuery:()=>{},canCreate:true,onCreate:()=>{},onView:()=>{}}));
 assert.equal((html.match(/class="report-catalogue-row"/g)??[]).length,8);for(const r of reportCatalogue)assert.ok(html.includes(`创建${r.type}`));for(const text of [report.name,report.target,report.owner,report.type,'模拟业务数据','三步指引','人工审核','导出归档'])assert.ok(html.includes(text),text);
 }finally{await server.close();}
});
test('native AI Markdown follows exact template chapters and keeps quotes and citations',()=>{
 const text='## 基金情况\n原文写有"待核对"。\n\n## 风险事项\n无可核验材料，待补充。\n[资料](/materials?materialId=m1)';
 const sections=parseReportDraft(text,['基金情况','风险事项']);assert.equal(sections[0].text,'原文写有"待核对"。');assert.ok(sections[1].text.includes('/materials?materialId=m1'));
 assert.throws(()=>parseReportDraft(text,['基金情况','缺失章节','风险事项']));assert.throws(()=>parseReportDraft('## 基金情况\n',['基金情况']));assert.throws(()=>parseReportDraft(text,['风险事项','基金情况']));
});
