import test from 'node:test';
import assert from 'node:assert/strict';
import {registerRouteGuard,checkRouteChange} from '../src/lib/routeGuard.ts';
test('route guard retains restoration context on cancellation and cleans up by owner',async()=>{
 assert.equal((await checkRouteChange()).allowed,true);
 const first=registerRouteGuard({allow:async()=>false,restoreUrl:()=>'/projects/a?tab=三会审批'});
 assert.deepEqual(await checkRouteChange(),{allowed:false,restoreUrl:'/projects/a?tab=三会审批'});
 const second=registerRouteGuard({allow:async()=>true,restoreUrl:()=>'/projects/b'});first();
 assert.deepEqual(await checkRouteChange(),{allowed:true,restoreUrl:'/projects/b'});
 second();assert.equal((await checkRouteChange()).allowed,true);
});
