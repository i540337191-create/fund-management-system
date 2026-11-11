import {test} from 'node:test';
import assert from 'node:assert/strict';
import {riskGroups} from '../../src/iterationA/riskGroups.ts';
test('risk sections preserve unknown statuses and every original record',()=>{
 const rows=[{id:'a',status:'待跟进'},{id:'b',status:'已处理'},{id:'c'},{id:'d',status:'历史自定义状态'}];
 const groups=riskGroups(rows);
 assert.deepEqual(groups.flatMap(g=>g.records).map(r=>r.id).sort(),['a','b','c','d']);
 assert.equal(groups.find(g=>g.label==='状态待核对')?.records[0],rows[2]);
 assert.equal(groups.find(g=>g.label==='历史自定义状态')?.records[0],rows[3]);
 assert.equal(rows[2].status,undefined);
});
