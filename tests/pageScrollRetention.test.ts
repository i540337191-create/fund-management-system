import test from 'node:test';
import assert from 'node:assert/strict';
import {retainedPageHeight} from '../src/lib/usePageScrollRetention.ts';
test('a temporarily short panel still leaves room for the current viewport position',()=>{
 for(const y of [0,44.4444465637207,320,1500]){const height=retainedPageHeight(y,875,69);assert(height+69-875>=y);assert(height+69-875-y<1);}
 assert.equal(retainedPageHeight(-20,875,69),806);assert.equal(retainedPageHeight(0,500,600),0);
});
