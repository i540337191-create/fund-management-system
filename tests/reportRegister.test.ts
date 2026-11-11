import test from 'node:test';import assert from 'node:assert/strict';import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {createServer} from 'vite';
test('report register keeps identity, business metadata and existing delete permission for long names',async()=>{
 const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:{port:30000+process.pid%20000}},appType:'custom'});
 try{(await server.ssrLoadModule('/src/i18n/locale.ts')).setLocale('zh');const {ReportRegister}=await server.ssrLoadModule('/src/components/ReportRegister.tsx');const {RecordManagementProvider}=await server.ssrLoadModule('/src/components/RecordManagement.tsx');const report={id:'r-test',name:'长报告名称'.repeat(12),target:'明确关联对象',type:'基金季度报告',status:'草稿',owner:'经办人',updatedAt:'2026-11-06T00:00:00Z',dataOrigin:'user_input',dataPurpose:'engineering_fixture'};
 const props={reports:[report],selectedId:report.id,onSelect:()=>{}};const html=renderToStaticMarkup(createElement(ReportRegister,props));for(const text of [report.name,report.target,report.owner,'工程测试','data-selected="true"'])assert.ok(html.includes(text),text);assert.ok(!html.includes('>删除<'));
 const admin=renderToStaticMarkup(createElement(RecordManagementProvider,{role:'admin',onChanged:async()=>{},children:createElement(ReportRegister,props)}));assert.ok(admin.includes('>删除<'));const empty=renderToStaticMarkup(createElement(ReportRegister,{...props,reports:[]}));assert.ok(empty.includes('没有符合当前筛选的报告'));
 }finally{await server.close();}
});
