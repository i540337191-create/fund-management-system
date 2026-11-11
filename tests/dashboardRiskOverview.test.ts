import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';

test('risk overview keeps fund and project items in one list without implementation notes or category tabs',async()=>{
 const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:{port:31000+process.pid%20000}},appType:'custom'});
 try{(await server.ssrLoadModule('/src/i18n/locale.ts')).setLocale('zh');
  const {DashboardRiskOverview}=await server.ssrLoadModule('/src/components/DashboardRiskOverview.tsx');
  const props={state:'ready',onRetry:()=>{},currentRole:'viewer',funds:[{id:'fund-a',name:'甲基金'}],projects:[{id:'project-a',fundId:'fund-a',name:'甲项目'}],risks:[
   {id:'r-a',projectId:'project-a',title:'审计材料待补',target:'甲项目',level:'高',summary:'补齐审计材料',time:'2026-11-07',source:'人工登记'},
   {id:'r-b',title:'基金期限临近',target:'甲基金',level:'中',summary:'核对退出安排',time:'2026-11-06',source:'人工登记'},
  ]};
  const html=renderToStaticMarkup(React.createElement(DashboardRiskOverview,props));
  assert.match(html,/审计材料待补/);assert.match(html,/基金期限临近/);assert.match(html,/基金：甲基金 → 项目：甲项目/);
  assert.equal((html.match(/class="dashboard-compact-row"/g)||[]).length,2);
  assert.doesNotMatch(html,/同一接口|风险对象分类|基金下项目风险|其他登记|既有风险资料/);
  const empty=renderToStaticMarkup(React.createElement(DashboardRiskOverview,{...props,risks:[]}));assert.match(empty,/暂无待处理关注事项/);
 }finally{await server.close();}
});
