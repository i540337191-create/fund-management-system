import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionEntry} from '../src/lib/sessionEntry.ts';
function memory(){const values=new Map<string,string>();return {getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};}
test('explicit exit survives reload but successful login resumes automatic restoration',()=>{
 const storage=memory(),entry=createSessionEntry(()=>storage,()=> '');
 assert.equal(entry.isSignedOut(),false);assert.equal(entry.signOut(),'/');assert.equal(entry.isSignedOut(),true);
 const reloaded=createSessionEntry(()=>storage,()=> '');assert.equal(reloaded.isSignedOut(),true);
 reloaded.resume();assert.equal(reloaded.isSignedOut(),false);assert.equal(createSessionEntry(()=>storage,()=> '').isSignedOut(),false);
});
test('blocked storage uses a refresh-safe homepage marker',()=>{
 const blocked=()=>{throw Error('storage blocked');};const entry=createSessionEntry(blocked,()=> '');
 assert.equal(entry.isSignedOut(),false);assert.equal(entry.signOut(),'/?signedOut=1');assert.equal(entry.isSignedOut(),true);
 assert.equal(createSessionEntry(blocked,()=> '?signedOut=1').isSignedOut(),true);
 entry.resume();assert.equal(entry.isSignedOut(),false);
});
test('manual exit is local to its tab and never changes business storage',()=>{
 const left=memory(),right=memory();const a=createSessionEntry(()=>left,()=> ''),b=createSessionEntry(()=>right,()=> '');
 left.setItem('business-record','preserve');a.signOut();assert.equal(b.isSignedOut(),false);a.resume();assert.equal(left.getItem('business-record'),'preserve');
});
