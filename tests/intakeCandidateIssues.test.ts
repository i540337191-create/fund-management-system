import test from 'node:test';import assert from 'node:assert/strict';
import {intakeCandidateDifferences} from '../src/lib/intakeCandidateIssues.ts';
const a={key:'name',value:'甲企业',quote:'名称甲企业',materialId:'first',page:1};
test('different source candidates prompt only the affected field and retain source evidence',()=>{
 const rows=intakeCandidateDifferences([a,{...a,value:'乙企业',quote:'名称乙企业',materialId:'second',page:2},{...a,key:'industry',value:'科技'}]);
 assert.deepEqual(rows.map(row=>row.key),['name']);assert.deepEqual(rows[0].values,['甲企业','乙企业']);assert.equal(rows[0].sources[1].materialId,'second');assert.equal(rows[0].sources[1].quote,'名称乙企业');
});
test('duplicate same value does not invent a contradiction, and different units remain explicitly unnormalized',()=>{
 assert.deepEqual(intakeCandidateDifferences([a,{...a,value:' 甲企业 '}]),[]);
 assert.deepEqual(intakeCandidateDifferences([{...a,key:'amount',value:'100万'},{...a,key:'amount',value:'1000000'}])[0].values,['100万','1000000']);
});
