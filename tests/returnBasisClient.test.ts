import test from 'node:test';
import assert from 'node:assert/strict';
import {createApiClient} from '../src/lib/apiClient.ts';
import {knownAtLocal,knownAtUtc,returnTaskHref,returnTaskSource,returnReason} from '../src/lib/returnBasisView.ts';
import type {ReturnAction} from '../src/lib/returnBasisTypes.ts';
test('return requests preserve exact manual expectations and cutoff identities across unchanged retries',async()=>{
 const seen:{url:string;body?:string}[]=[];const api=createApiClient({fetchImpl:async(url,init)=>{seen.push({url:String(url),body:init?.body as string});return new Response('{}',{headers:{'content-type':'application/json'}});}});
 const input:ReturnAction={action:'create_sample',requestId:'same',expectedRevision:7,dealId:'deal',fundId:'fund',evidence:[{materialId:'m',versionId:'v'}],sample:{basisId:'b',basisVersion:2,basisContentHash:'a'.repeat(64),origin:'finance_independent',cashflows:[{date:'2025-01-01',amount:'9007199254740993.01',direction:'outflow',kind:'investment_payment',currency:'CNY'}],terminalValue:null,expected:{irr:null,irrUnit:'annual_fraction',moic:null,resultStatus:'not_applicable',tolerance:'0.000000000000000001'},derivationText:'独立人工推导，缺值不是零'}};
 await api.actOnReturnBasis('p /一',input);await api.actOnReturnBasis('p /一',input);assert.deepEqual(JSON.parse(seen[0].body!),input);assert.equal(seen[0].body,seen[1].body);
 await api.getReturnBasis('p /一',{dealId:'d /一',fundId:'f /甲',asOfDate:'2026-10-30',knownAt:'2026-10-30T01:00:00.123Z'});const url=new URL(seen[2].url,'http://localhost');assert.equal(url.pathname,'/api/projects/p%20%2F%E4%B8%80/returns');assert.equal(url.searchParams.get('knownAt'),'2026-10-30T01:00:00.123Z');assert.equal(url.searchParams.get('fundId'),'f /甲');
});
test('Beijing cutoff input round-trips across UTC midnight without borrowing bank dates',()=>{
 assert.equal(knownAtLocal('2026-10-29T16:00:01Z'),'2026-10-30T00:00:01');assert.equal(knownAtUtc('2026-10-30T00:00:01'),'2026-10-29T16:00:01.000Z');assert.throws(()=>knownAtUtc('not-a-date'));
});
test('return task navigation binds exact historical version/hash and encodes same-name identifiers',()=>{
 const task={id:'task /1',kind:'review',relation:'returns',note:JSON.stringify({sourceType:'cashflow_review',sourceId:'record /一',sourceVersion:2,contentHash:'b'.repeat(64),dealId:'deal /一',fundId:'fund /甲'})};
 const path=returnTaskHref('project /一',task)!;const u=new URL(path,'http://localhost');assert.equal(u.pathname,'/projects/project%20%2F%E4%B8%80');assert.equal(u.searchParams.get('tab'),'投资信息');assert.equal(u.searchParams.get('returnRecordId'),'record /一');assert.equal(u.searchParams.get('returnVersion'),'2');assert.equal(u.searchParams.get('returnHash'),'b'.repeat(64));assert.equal(u.searchParams.get('returnFundId'),'fund /甲');assert.equal(u.searchParams.get('taskId'),'task /1');
 assert.equal(returnTaskSource({...task,note:'{broken'}),null);assert.equal(returnTaskHref('p',{...task,kind:'manual'}),null);assert.equal(returnTaskSource({...task,note:JSON.stringify({sourceType:'cashflow_review',sourceId:'r',sourceVersion:1,contentHash:'unverified'})}),null);
 assert.match(returnReason('terms.inconsistent_terminal_policy'),/终值不适用须同时选定/);assert.match(returnReason('unknown_currency'),/尚未核验/);assert.match(returnReason('terms.cashflowMapping.project_fee'),/项目费用/);
});
