import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
test('LP checklist exports are available before opening any disclosure and respect privacy',async()=>{
 const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:{port:30000+process.pid%20000}},appType:'custom'});
 try{(await server.ssrLoadModule('/src/i18n/locale.ts')).setLocale('zh');
  const {FundraisingPanel}=await server.ssrLoadModule('/src/components/FundraisingPanel.tsx');
  const props={fundId:'synthetic-fund',detail:{investor:{id:'synthetic-lp',revision:1},materials:[]},onChanged:async()=>{}};
  const html=renderToStaticMarkup(createElement(FundraisingPanel,{...props,role:'admin'}));
  assert.equal((html.match(/生成(?:无)?托管募集资料清单/g)??[]).length,4);
  assert(!html.includes('<details>'));assert(html.includes('aria-label="生成募集资料清单"'));
  const restricted=renderToStaticMarkup(createElement(FundraisingPanel,{...props,role:'viewer'}));
  assert(!restricted.includes('生成托管募集资料清单'));assert(!restricted.includes('生成无托管募集资料清单'));
 }finally{await server.close();}
});
