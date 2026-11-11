import test from 'node:test';
import assert from 'node:assert/strict';
import {createApiClient} from '../src/lib/apiClient.ts';
import {canManageFunds,type FundMasterInput} from '../src/lib/fundMasterTypes.ts';

test('fund master retries preserve request identity and edit uses stable ID and exact expected revision',async()=>{
 const seen:{url:string;method?:string;body?:string}[]=[];
 const api=createApiClient({fetchImpl:async(url,init)=>{seen.push({url:String(url),method:init?.method,body:init?.body as string});return new Response('{}',{headers:{'content-type':'application/json'}});}});
 const input:FundMasterInput={requestId:'fixed-operation',name:'基金名称',shortName:'简称',managerId:'person-id',stage:'募集期',scale:'',nextAction:''};
 await api.createFund(input);await api.createFund(input);
 assert.equal(seen[0].body,seen[1].body);assert.deepEqual(JSON.parse(seen[0].body!),input);
 assert.equal(seen[0].method,'POST');assert.equal(seen[0].url,'/api/funds');
 await api.updateFund('fund /一',{...input,expectedRevision:7});assert.equal(seen[2].url,'/api/funds/fund%20%2F%E4%B8%80');assert.equal(seen[2].method,'PATCH');assert.equal(JSON.parse(seen[2].body!).expectedRevision,7);
 await api.getFundManagers();assert.equal(seen[3].url,'/api/funds/managers');
});
test('only existing fund write roles get master controls',()=>{
 assert.equal(canManageFunds('admin'),true);assert.equal(canManageFunds('investment_manager'),true);
 for(const role of ['finance','viewer','legal','post_investment',undefined])assert.equal(canManageFunds(role),false);
});

test('AI inbox fund selection uses stored ID, blocks ambiguous names and never falls back from a missing ID',async()=>{
 const {resolveIntakeFundId}=await import('../src/lib/fundMasterTypes.ts');
 const {funds}=await import('../src/data/funds.ts');
 const rows=[{...funds[0],id:'a',name:'同名',shortName:'同简称'},{...funds[0],id:'b',name:'同名',shortName:'同简称'}];
 assert.equal(resolveIntakeFundId({suggestedFund:'旧名',suggestedFundId:'b'},rows),'b');
 assert.equal(resolveIntakeFundId({suggestedFund:'同名'},rows),'');
 assert.equal(resolveIntakeFundId({suggestedFund:'同名',suggestedFundId:'missing'},rows),'');
 assert.equal(resolveIntakeFundId({suggestedFund:'同名'},rows.slice(0,1)),'a');
});

test('AI update and confirm payload keeps exact selected ID and cannot erase an invalid binding into a name fallback',async()=>{
 const {selectedIntakeFund}=await import('../src/lib/fundMasterTypes.ts');
 const {funds}=await import('../src/data/funds.ts');const rows=[{...funds[0],id:'a',name:'现名'}];
 assert.equal(selectedIntakeFund({suggestedFund:'现名',suggestedFundId:'missing',suggestedProject:'项目'},rows),undefined);
 assert.deepEqual(selectedIntakeFund({suggestedFund:'旧名',suggestedFundId:'a',suggestedProject:'项目'},rows),{suggestedFund:'旧名',suggestedFundId:'a',suggestedProject:'项目'});
});
