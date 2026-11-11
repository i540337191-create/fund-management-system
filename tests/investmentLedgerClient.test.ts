import test from 'node:test';
import assert from 'node:assert/strict';
import {createApiClient} from '../src/lib/apiClient.ts';
import {ledgerAmount,ledgerScopePath,ledgerCashLabels,type InvestmentLedgerScope} from '../src/lib/investmentLedgerTypes.ts';

test('ledger scopes use exact stable identifiers and one read-only endpoint for each view',async()=>{
 const scopes:InvestmentLedgerScope[]=[{type:'all'},{type:'fund',id:'f /一'},{type:'project',id:'p /二'},{type:'company',id:'c /三'}];
 const seen:{url:string;method?:string}[]=[];
 const api=createApiClient({fetchImpl:async(url,init)=>{seen.push({url:String(url),method:init?.method});return new Response('{}',{headers:{'content-type':'application/json'}});}});
 for(const scope of scopes)await api.getInvestmentLedger(scope);
 assert.deepEqual(seen.map(s=>s.url),['/api/investment-ledger','/api/funds/f%20%2F%E4%B8%80/investment-ledger','/api/projects/p%20%2F%E4%BA%8C/investment-ledger','/api/companies/c%20%2F%E4%B8%89/investment-ledger']);
 assert.equal(seen.some(s=>s.method&&s.method!=='GET'),false);
 assert.equal(ledgerScopePath({type:'project',id:'a?b#c'}),'/api/projects/a%3Fb%23c/investment-ledger');
});
test('ledger display preserves exact large money, separates missing values and actual cash statuses',()=>{
 assert.equal(ledgerAmount('9007199254740993.01'),'9,007,199,254,740,993.01');
 assert.equal(ledgerAmount('0.00'),'0.00');assert.equal(ledgerAmount(null),'—');
 for(const invalid of ['1.1','1e4','NaN','-1.00','1,000.00'])assert.equal(ledgerAmount(invalid),'待核对');
 assert.equal(ledgerCashLabels.needs_review,'付款记录待核对');assert.notEqual(ledgerCashLabels.posted,ledgerCashLabels.not_recorded);assert.notEqual(ledgerCashLabels.reversed_only,ledgerCashLabels.not_recorded);
});
