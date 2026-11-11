import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function fixture(){
 const values=[],requests=[],exports={};
 const react={useState(initial){const index=values.length;values.push(initial);return [initial,value=>{values[index]=typeof value==='function'?value(values[index]):value;}];},useRef:value=>({current:value}),useCallback:fn=>fn,useEffect:()=>{}};
 const code=ts.transpileModule(readFileSync(new URL('../../src/lib/agentWorkspaceClient.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext(code,{exports,require:name=>name==='react'?react:{clientSessionEpoch:()=>0,assertSessionEpoch:()=>{},fetchInSession:fetcher=>fetcher()},fetch:()=>new Promise(resolve=>requests.push(resolve))});
 return {model:exports.useAgentWorkspace(),values,reply:(index,status,revision)=>requests[index]({ok:status===200,status,json:async()=>({revision,tasks:[]})})};
}
test('a late read failure cannot replace a newer successful workspace result',async()=>{
 const f=fixture(),old=f.model.refresh(),latest=f.model.refresh();
 assert.equal(f.values[3],true);
 f.reply(1,200,2);await latest;f.reply(0,503,0);await assert.rejects(old);
 assert.equal(f.values[0].revision,2);assert.equal(f.values[1],'');assert.equal(f.values[3],false);
});
test('a late success cannot clear the latest failed read',async()=>{
 const f=fixture(),old=f.model.refresh(),latest=f.model.refresh();
 f.reply(1,503,0);await assert.rejects(latest);const error=f.values[1];
 f.reply(0,200,1);await old;
 assert.ok(error);assert.equal(f.values[1],error);assert.equal(f.values[0],null);assert.equal(f.values[3],false);
});
