import test from 'node:test';
import assert from 'node:assert/strict';
import {clampNavHeight,readNavHeight,saveNavHeight} from '../src/lib/sidebarHeight.ts';
test('saved divider positions are isolated by account key and invalid or unavailable storage falls back',()=>{
 const values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
 saveNavHeight('account-a:admin',543.2,storage);assert.equal(readNavHeight('account-a:admin',storage),543);assert.equal(readNavHeight('account-b:admin',storage),256);assert.equal(readNavHeight('account-a:viewer',storage),256);
 for(const value of ['NaN','Infinity','-1','0','10001','']){values.set('bad',value);assert.equal(readNavHeight('bad',storage),256);}
 assert.equal(readNavHeight('blocked',{getItem:()=>{throw Error('blocked');}}),256);assert.doesNotThrow(()=>saveNavHeight('blocked',320,{setItem:()=>{throw Error('blocked');}}));saveNavHeight('account-a:admin',NaN,storage);assert.equal(readNavHeight('account-a:admin',storage),543);
});
test('resizing clamps to available space without overwriting the preferred height for a later larger window',()=>{
 assert.equal(clampNavHeight(543,360),360);assert.equal(clampNavHeight(543,720),543);assert.equal(clampNavHeight(-200,360),88);assert.equal(clampNavHeight(600,-10),88);assert.equal(clampNavHeight(333.7,720),334);
});
