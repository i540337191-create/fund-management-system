import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
test('every business route renders desktop height and width controls plus one history host with account-specific preference',async()=>{
 const server=await createServer({server:{middlewareMode:true},appType:'custom'});
 try{
  const {Layout}=await server.ssrLoadModule('/src/components/Layout.tsx');
  for(const currentPath of ['/dashboard','/projects','/funds','/capital','/tasks','/monitoring','/materials','/ai-inbox','/meetings','/reports','/settings','/ai-assistant','/ai-assistant/skills','/ai-assistant/plugins','/ai-assistant/weekly']){
   const html=renderToStaticMarkup(createElement(Layout,{currentPath,sessionUser:{id:'account-a',name:'甲',email:'a',role:'admin'},onLogout:async()=>{},hideSeedDemoData:false,hiddenSeedDemoCount:0,onHideSeedDemoDataChange:()=>{},children:null}));
   assert.equal((html.match(/role="separator"/g)??[]).length,2,currentPath);
   assert.ok(html.includes('aria-label="Resize sidebar"')&&html.includes('aria-orientation="vertical"'),currentPath);
   assert.equal((html.match(/id="agent-history-slot"/g)??[]).length,1,currentPath);
   assert.ok(html.includes('aria-controls="agent-business-navigation"'),currentPath);
   assert.ok(!html.includes('历史按当前账号与角色隔离'),currentPath);
   assert.ok(html.indexOf('sidebar-history-scroll')<html.indexOf('agent-history-slot'),currentPath);
   assert.ok(html.indexOf('agent-history-slot')<html.indexOf('agent-sidebar-user'),currentPath);
   assert.ok(!html.includes('class="agent-sidebar-art"'),currentPath);
   assert.ok(html.includes('class="agent-sidebar-user"><div class="agent-sidebar-caravan" aria-hidden="true"><img'),currentPath);
   assert.ok(!html.includes('>数字员工</span>')&&!html.includes('>工作周报</span>'),currentPath);
   const labels=['Dashboard','Funds','Projects','Capital &amp; fees','Documents','Task center','Risk monitoring','Meeting minutes','Reports','Settings'];
   for(const label of labels)assert.ok(html.includes('>'+label+'</span>'),currentPath+': '+label);
   for(let i=1;i<labels.length;i++)assert.ok(html.indexOf('>'+labels[i-1]+'</span>')<html.indexOf('>'+labels[i]+'</span>'),currentPath);
   assert.ok(html.includes('AI inbox,'),currentPath);
   for(const name of ['能力仓库','插件','定时任务','执行记录','规则与记忆'])assert.ok(!html.includes('>'+name+'</span>'),currentPath);
  }
 }finally{await server.close();}
});
