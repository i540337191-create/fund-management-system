import test from 'node:test';import assert from 'node:assert/strict';
import {createApiClient} from '../src/lib/apiClient.ts';
import {exitSettlementError} from '../src/lib/exitSettlementTypes.ts';
test('settlement requests preserve exact cent strings and encode project/fund scope',async()=>{
 const seen:{url:string;body?:string}[]=[];
 const api=createApiClient({fetchImpl:async(url,init)=>{seen.push({url:String(url),body:init?.body as string});return new Response(JSON.stringify({created:true,settlement:{revision:2}}),{status:200,headers:{'content-type':'application/json'}});}});
 const input={requestId:'id',expectedRevision:1,action:'receive' as const,executionId:'exec',fundId:'fund',date:'2026-10-30',amount:'9007199254740993.01',principal:'9007199254740993.00',income:'0.01',bankAccount:'account',bankReference:'reference',note:'真实凭证',evidence:[{materialId:'m',versionId:'v'}]};
 await api.actOnExitSettlement('project /1',input);assert.match(seen[0].url,/project%20%2F1/);assert.deepEqual(JSON.parse(seen[0].body!),input);
 await api.getExitSettlementLedger({fundId:'f /1'});assert.equal(new URL(seen[1].url,'http://localhost').searchParams.get('fundId'),'f /1');
 assert.match(exitSettlementError({status:409,code:'post_revision_conflict'}),/输入已保留/);
});
