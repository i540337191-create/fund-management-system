import test from 'node:test';import assert from 'node:assert/strict';
import {ledgerPageNumbers,ledgerPageSize} from '../src/lib/ledgerPagination.ts';
test('both ledgers use ten rows and expose page boundaries with compact numbered navigation',()=>{
 assert.equal(ledgerPageSize,10);assert.deepEqual(ledgerPageNumbers(5,1),[1]);assert.deepEqual(ledgerPageNumbers(10,1),[1]);assert.deepEqual(ledgerPageNumbers(11,2),[1,2]);
 assert.deepEqual(ledgerPageNumbers(225,1),[1,2,3,'gap',23]);assert.deepEqual(ledgerPageNumbers(225,23),[1,'gap',21,22,23]);assert.deepEqual(ledgerPageNumbers(225,12),[1,'gap',10,11,12,13,14,'gap',23]);assert.deepEqual(ledgerPageNumbers(0,1),[1]);
});
