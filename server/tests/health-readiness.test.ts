import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryLedgerStore} from '../src/ledger/store.ts';
import {createTestServer} from './auth-fixture.ts';
test('health reports database failure without leaking details and recovers on the next probe',async t=>{
 const store=createMemoryLedgerStore();let failed=true;store.healthCheck=async()=>{if(failed)throw Error('private-database-configuration');};
 const app=createTestServer({ledgerStore:store,auth:{mode:'password',sessionSecret:'readiness-synthetic'}});t.after(()=>app.close());
 const bad=await app.inject('/api/health');assert.equal(bad.statusCode,503);assert.equal(bad.json().database,'unavailable');assert.ok(!bad.body.includes('private'));
 failed=false;const ready=await app.inject('/api/health');assert.equal(ready.statusCode,200);assert.equal(ready.json().database,'ready');
});
