import test from 'node:test';
import assert from 'node:assert/strict';
import {taskOverview,matchesTaskCompletion} from '../src/lib/taskOverview.ts';
test('task composition keeps cancellation separate and sources reconcile including missing/new types',()=>{
 const rows=[{status:'open',source:'业务材料'},{status:'waiting',source:'LP募集'},{status:'complete',source:'项目业务'},{status:'cancelled',source:'会议纪要'},{status:'blocked'}];
 const x=taskOverview(rows);assert.deepEqual([x.total,x.open,x.complete,x.cancelled],[5,3,1,1]);assert.equal(x.sources.reduce((n,s)=>n+s.value,0),5);assert.equal(x.sources[3].value,2);
 assert.equal(matchesTaskCompletion('cancelled','complete'),false);assert.equal(matchesTaskCompletion('cancelled','cancelled'),true);assert.equal(matchesTaskCompletion('cancelled','inactive'),true);assert.equal(matchesTaskCompletion('waiting','active'),true);assert.equal(taskOverview([]).total,0);
});
