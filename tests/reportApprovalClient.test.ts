import test from 'node:test';
import assert from 'node:assert/strict';
import {createApiClient} from '../src/lib/apiClient.ts';
test('report approval sends the displayed version token unchanged in POST body',async()=>{
 const calls:{url:string;method?:string;body?:string}[]=[];const api=createApiClient({fetchImpl:async(url,init)=>{calls.push({url:String(url),method:init?.method,body:init?.body as string});return new Response('{}',{headers:{'content-type':'application/json'}});}});
 const token='2026-11-02T04:00:00.123456Z';await api.approveReport('报告 / 甲',token);assert.equal(calls[0].method,'POST');assert.equal(calls[0].url,'/api/reports/%E6%8A%A5%E5%91%8A%20%2F%20%E7%94%B2/approve');assert.deepEqual(JSON.parse(calls[0].body!),{expectedUpdatedAt:token});
});
