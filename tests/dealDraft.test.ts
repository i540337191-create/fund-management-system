import test from 'node:test';
import assert from 'node:assert/strict';
import {dealConditions} from '../src/lib/dealDraft.ts';
test('condition IDs survive lost-response retries, reordering and saved versions',()=>{
 const ids=new Map([['原有条件','saved-id']]);let n=0;const next=()=>`new-${++n}`;
 const first=dealConditions('原有条件\n 新条件 ',ids,next);
 assert.deepEqual(dealConditions('原有条件\n 新条件 ',ids,next),first);
 assert.equal(n,1);
 assert.deepEqual(dealConditions('新条件\n原有条件',ids,next),[first[1],first[0]]);
 assert.equal(dealConditions('\n原有条件\n',ids,next)[0].id,'saved-id');
});
