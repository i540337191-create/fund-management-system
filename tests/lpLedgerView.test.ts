import test from 'node:test';
import assert from 'node:assert/strict';
import {formatLpMoney,canEditLpMaster,canRecordLpReceipt,lpFailure} from '../src/lib/lpLedgerView.ts';
test('LP registered amounts retain exact cents above safe integer and distinguish unknown from zero',()=>{
 assert.equal(formatLpMoney('900719925474099312.34'),'900,719,925,474,099,312.34');
 assert.equal(formatLpMoney('0.00'),'0.00');assert.equal(formatLpMoney(null),'待登记');
 assert.equal(formatLpMoney('1.2 亿'),'金额待核对');assert.equal(formatLpMoney('1e10'),'金额待核对');
});
test('LP master and actual receipt actions use separate approved roles',()=>{
 for(const role of ['admin','investment_manager','finance','legal','post_investment','viewer']){
  assert.equal(canEditLpMaster(role),['admin','investment_manager'].includes(role));
  assert.equal(canRecordLpReceipt(role),['admin','finance'].includes(role));
 }
});
test('unknown save and conflict feedback preserve input and instruct explicit recovery',()=>{
 assert.match(lpFailure(new Error('network')),/原样重试/);assert.match(lpFailure({status:409}),/先核对最新版本/);
 assert.match(lpFailure({code:'client_session_changed',status:409}),/登录身份已变化/);
});

import {suspectedLpReceipt} from '../src/lib/lpLedgerView.ts';
test('receipt warning compares exact yuan and dates or bank references, excluding corrected rows',()=>{const rows=[{active:true,amount:'12.10',bankDate:'2026-11-01',reference:'BANK-1'}];assert.equal(suspectedLpReceipt(rows,'12.1','2026-11-01',''),true);assert.equal(suspectedLpReceipt(rows,'12.1','2026-11-02',''),false);assert.equal(suspectedLpReceipt(rows,'13','2026-11-02','BANK-1'),true);assert.equal(suspectedLpReceipt([{...rows[0],active:false}],'12.1','2026-11-01','BANK-1'),false);assert.equal(suspectedLpReceipt(rows,'1e1','2026-11-01',''),false);});

test('commitment floor failure explains scheduled plans instead of a generic conflict',()=>{assert.match(lpFailure({status:409,code:'commitment_below_payment_plans'}),/缴款计划/);});


test('missing material evidence is not flattened into an unrelated revision conflict',()=>{
 assert.match(lpFailure({status:409,code:'material_version_unavailable'}),/材料原件版本已失效/);
 assert.match(lpFailure({status:409,code:'material_not_linked'}),/材料尚未关联当前LP/);
 assert.match(lpFailure({status:409,code:'lp_revision_conflict'}),/冲突/);
 assert.match(lpFailure({status:403,code:'material_version_unavailable'}),/没有本项操作权限/);
});
