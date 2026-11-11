import assert from 'node:assert/strict';
import test from 'node:test';
import { aiIntakeItems } from '../src/data/funds.ts';
import { intakeQueue } from '../src/lib/inboxView.ts';
test('pending intake is first while other items and input order remain intact',()=>{
 const items=[{...aiIntakeItems[0],status:'已归档' as const},aiIntakeItems[1],aiIntakeItems[2]];
 const before=items.map(i=>i.id);
 assert.deepEqual(intakeQueue(items,'全部').map(i=>i.id),[items[1].id,items[0].id,items[2].id]);
 assert.deepEqual(items.map(i=>i.id),before);
});
test('filters each intake status without borrowing another record for empty views',()=>{
 for(const status of ['待确认','已归档','已退回'] as const)assert.ok(intakeQueue(aiIntakeItems,status).every(item=>item.status===status));
 assert.equal(intakeQueue(aiIntakeItems,'待确认').length,2);
 assert.deepEqual(intakeQueue(aiIntakeItems,'已退回'),[]);
 assert.deepEqual(intakeQueue([],'全部'),[]);
});
