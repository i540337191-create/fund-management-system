import test from 'node:test';
import assert from 'node:assert/strict';
import {navigationOrder,moveNavigation} from '../src/lib/navigationOrder.ts';
test('saved navigation preserves relative order, drops unavailable paths and adds new routes',()=>{
 assert.deepEqual(navigationOrder(['a','b','c'],['b','private','b','a']),['b','a','c']);
 assert.deepEqual(navigationOrder(['a','b'],{}),['a','b']);
});
test('navigation moves both ways without losing or duplicating routes',()=>{
 assert.deepEqual(moveNavigation(['a','b','c'],'a','c'),['b','c','a']);
 assert.deepEqual(moveNavigation(['a','b','c'],'c','a'),['c','a','b']);
 assert.deepEqual(moveNavigation(['a','b'],'unknown','b'),['a','b']);
});

test('restored meeting entry joins existing account order without moving saved entries',()=>{
 const available=['/dashboard','/funds','/meetings','/reports','/settings'];
 assert.deepEqual(navigationOrder(available,['/funds','/dashboard','/reports','/settings']),['/funds','/dashboard','/meetings','/reports','/settings']);
 assert.deepEqual(navigationOrder(available,['/meetings','/funds','/dashboard','/reports','/settings']),['/meetings','/funds','/dashboard','/reports','/settings']);
});
