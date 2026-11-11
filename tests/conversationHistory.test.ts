import test from 'node:test';import assert from 'node:assert/strict';
import {mergeConversationHistory} from '../src/lib/assistantClient.ts';
test('history keeps both legacy data scopes, deduplicates IDs and orders newest first',()=>{
 const old={id:'old',title:'给我个入口所在对话',revision:1,updatedAt:'2026-11-04T17:17:39Z',messageCount:6,running:false};
 const recent={...old,id:'recent',updatedAt:'2026-11-04T17:30:35Z'};
 const result=mergeConversationHistory([[recent],[old,recent]]);assert.deepEqual(result.map(x=>x.id),['recent','old']);assert.equal(result[1].messageCount,6);
});
