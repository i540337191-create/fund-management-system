import test from 'node:test';
import assert from 'node:assert/strict';
import {canViewFullLp,canConfirmLpSignature} from '../src/lib/lpPrivacy.ts';
import {fundInvestors} from '../src/data/funds.ts';
test('LP full-view presentation follows the approved roles and denies unknown roles',()=>{
 for(const role of ['admin','investment_manager','finance','legal'])assert.equal(canViewFullLp(role),true);
 for(const role of ['post_investment','viewer','unknown','',undefined])assert.equal(canViewFullLp(role),false);
});
test('server signature authority stays limited while explicit anonymous local demo keeps its action',()=>{
 for(const role of ['admin','investment_manager'])assert.equal(canConfirmLpSignature(role),true);
 for(const role of ['finance','legal','post_investment','viewer',undefined])assert.equal(canConfirmLpSignature(role),false);
 assert.equal(canConfirmLpSignature(undefined,true),true);
});
test('public demonstration LP rows contain only anonymous examples with stable IDs and explicit source',()=>{
 assert.equal(new Set(fundInvestors.map(v=>v.id)).size,fundInvestors.length);
 assert.ok(fundInvestors.every(v=>v.id&&v.dataOrigin==='seed_demo'&&/^演示投资者[A-D]$/.test(v.name)));
});
