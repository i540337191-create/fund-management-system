import test from 'node:test';import assert from 'node:assert/strict';
import {investmentEntry} from '../src/lib/investmentEntry.ts';
import type {DealBatch} from '../src/lib/dealTypes.ts';
const deal=(status:string,terms?:string)=>({status,terms:terms?[{status:terms}]:[]}) as DealBatch;
test('empty and active investment records expose manual entry',()=>{assert.equal(investmentEntry(undefined).action,'create');assert.equal(investmentEntry(deal('active')).action,'terms');for(const s of ['draft','returned','approved'])assert.equal(investmentEntry(deal('active',s)).action,'terms');});
test('pending, rejected and closed records cannot bypass the workflow',()=>{for(const s of ['pending','rejected'])assert.equal(investmentEntry(deal('active',s)).action,'blocked');assert.equal(investmentEntry(deal('closed','approved')).action,'create');});
