import {test} from 'node:test';
import assert from 'node:assert/strict';
import {capitalScopeFund,capitalRelationNeedsConfirmation} from '../../src/iterationB/capitalRelation.ts';
import {filterCapitalRecords} from '../../src/lib/capitalLedger.ts';
import type {CapitalItem} from '../../src/data/capital.ts';
test('fund scope and project intersect without hiding unrelated records in all scope',()=>{
 const rows=[{id:'ax',fundId:'A',projectId:'X'},{id:'ay',fundId:'A',projectId:'Y'},{id:'bx',fundId:'B',projectId:'X'},{id:'by',fundId:'B',projectId:'Y'},{id:'unknown',projectId:'X'}] as CapitalItem[];
 const ids=(filter:{fundId?:string;projectId?:string})=>filterCapitalRecords(rows,filter).map(row=>row.id);
 assert.deepEqual(ids({fundId:'A',projectId:'X'}),['ax']);assert.deepEqual(ids({fundId:'B',projectId:'X'}),['bx']);assert.deepEqual(ids({fundId:'unknown',projectId:'X'}),[]);
 assert.deepEqual(ids({fundId:'A'}),['ax','ay']);assert.deepEqual(ids({projectId:'X'}),['ax','bx','unknown']);assert.deepEqual(ids({}),rows.map(row=>row.id));
});
test('cross primary fund never becomes an automatically accepted draft relation',()=>{
 const project={fundId:'A',fund:'基金A'},fund={id:'B',name:'基金B'};
 assert.deepEqual(capitalScopeFund(project,fund),{fundId:'',fund:''});assert.equal(capitalRelationNeedsConfirmation(project,'B'),true);
 assert.deepEqual(capitalScopeFund(project,{id:'A',name:'基金A'}),{fundId:'A',fund:'基金A'});assert.equal(capitalRelationNeedsConfirmation(project,'A'),false);
 assert.deepEqual(capitalScopeFund(undefined,fund),{fundId:'B',fund:'基金B'});assert.equal(capitalRelationNeedsConfirmation(undefined,'B'),false);
 assert.equal(capitalRelationNeedsConfirmation({fundId:undefined},'B'),true);
});
