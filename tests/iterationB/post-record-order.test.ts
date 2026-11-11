import test from 'node:test';
import assert from 'node:assert/strict';
import {newestCreatedPostRecords} from '../../src/iterationB/postRecordOrder.ts';
test('new creation precedes revised old record, independent of input order and without mutating history',()=>{
 const rows=[{id:'old',version:1,time:'2026-10-01T00:00:00Z'},{id:'new',version:1,time:'2026-11-01T00:00:00Z'},{id:'old',version:2,time:'2026-12-01T00:00:00Z'}],before=structuredClone(rows);
 for(const input of [rows,[...rows].reverse(),JSON.parse(JSON.stringify(rows))]){const sorted=newestCreatedPostRecords(input);assert.deepEqual(sorted.map(r=>[r.id,r.version]),[['new',1],['old',2]]);}
 assert.deepEqual(rows,before);
});
test('equal creation timestamps use stable IDs; unavailable/invalid V1 never borrows edit time',()=>{
 const rows=[{id:'b',version:1,time:'2026-11-01T00:00:00Z'},{id:'a',version:1,time:'2026-11-01T08:00:00+08:00'},{id:'missing',version:2,time:'2099-01-01T00:00:00Z'},{id:'invalid',version:1,time:'unknown'}];
 assert.deepEqual(newestCreatedPostRecords(rows).map(r=>r.id),['a','b','invalid','missing']);assert.deepEqual(newestCreatedPostRecords([...rows].reverse()).map(r=>r.id),['a','b','invalid','missing']);assert.deepEqual(newestCreatedPostRecords([]),[]);
});
