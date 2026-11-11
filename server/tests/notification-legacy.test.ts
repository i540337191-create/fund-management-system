import test from 'node:test';
import assert from 'node:assert/strict';
import {accessContext} from '../src/auth/object-access.ts';
import {notifyingLedgerStore} from '../src/notifications/transitions.ts';
import {takeNotices} from '../src/notifications/outbox.ts';

test('notification projection preserves legacy workflow reads without inventing recipients',async()=>{
 const state:any={project:{id:'legacy',name:'历史项目'},rounds:[{id:'round',status:'approved'}],tasks:[],diligence:{items:[{id:'item'}],reports:[{id:'report',status:'approved'}]},deals:[{id:'deal',terms:[{id:'terms',status:'approved'}],agreements:[{id:'agreement'}]}]};
 const before=structuredClone(state);
 const raw:any={workflowTransaction:async(_id:string,action:(s:any)=>unknown)=>action(state)};
 const store=notifyingLedgerStore(raw);
 await accessContext.run({actor:{id:'operator',name:'经办人',email:'operator@example.invalid',role:'admin'}},async()=>{
  assert.equal(await store.workflowTransaction('legacy',async()=> 'read result'),'read result');
  assert.deepEqual(state,before);
  assert.deepEqual(takeNotices(state),[]);
  await store.workflowTransaction('legacy',async(s:any)=>{
   s.deals[0].reviewers=[{id:'reviewer'}];s.deals[0].terms[0].status='pending';
  });
  const notices=takeNotices(state);
  assert.deepEqual(notices.map(n=>n.sourceKey).sort(),['agreement:agreement','terms:terms']);
  assert.ok(notices.every(n=>n.recipientId==='reviewer'&&n.kind==='assigned'));
 });
});
