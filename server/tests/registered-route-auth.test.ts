import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from '../src/index.ts';

test('every registered business route rejects anonymous requests before handling payloads', async t=>{
 const server=createServer({auth:{mode:'password',sessionSecret:'isolated-route-boundary'}});
 t.after(()=>server.close());await server.ready();
 const parents:string[]=[];let checked=0;
 for(const line of server.printRoutes({commonPrefix:false}).split('\n')){
  const match=line.match(/^(.*?) (\/.*?) \(([A-Z, ]+)\)$/);if(!match)continue;
  const depth=(match[1].length-3)/4;
  assert.ok(Number.isInteger(depth)&&depth>=0,line);
  parents[depth]=match[2];parents.length=depth+1;
  const path=parents.join('').replace(/:[A-Za-z][A-Za-z0-9_]*/g,'isolated-missing');
  for(const method of match[3].split(', ')){
   if(path==='/api/health'||path==='/api/session/login')continue;
   const response=await server.inject({method:method as any,url:path});
   assert.equal(response.statusCode,401,`${method} ${path}`);
   if(method!=='HEAD')assert.equal(response.json().error,'unauthenticated',`${method} ${path}`);checked++;
  }
 }
 assert.ok(checked>100,`Only ${checked} routes checked`);
 t.diagnostic(`${checked} registered method/path combinations verified`);
});
