import test from 'node:test';
import assert from 'node:assert/strict';
import {dealTermsHistoryMissing, displayedDealTerms, type DealBatch, type DealTerms} from '../src/lib/dealTypes.ts';
test('legacy approved terms retain missing history distinctly from explicit empty lists without manufacturing decisions', () => {
  const terms = { id:'legacy-terms', date:'2026-01-01', share:'1', amount:'100.00', status:'approved', version:1, valuation:'10000.00', allocations:[{fundId:'fund',amount:'100.00'}] } as DealTerms;
  const before=structuredClone(terms);
  const deal={status:'closed',terms:[terms],closing:{termsId:'legacy-terms'}} as DealBatch;
  assert.equal(displayedDealTerms(deal),terms);
  assert.deepEqual(dealTermsHistoryMissing(terms),['decisions','requiredAgreements','conditions']);
  assert.deepEqual(dealTermsHistoryMissing({...terms,decisions:[],requiredAgreements:[],conditions:[]}),[]);
  assert.deepEqual(terms,before);
  assert(!('decisions' in terms)); assert(!('conditions' in terms));
});
