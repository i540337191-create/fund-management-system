import test from 'node:test';
import assert from 'node:assert/strict';
import {createApiClient} from '../src/lib/apiClient.ts';
import type {InvestmentCashflowAction} from '../src/lib/investmentCashflowTypes.ts';

test('actual payment transport preserves cents, evidence, correction identity and unchanged retry',async()=>{
 const requests:{url:string;body?:string;credentials?:RequestCredentials}[]=[];
 const api=createApiClient({fetchImpl:async(url,init)=>{requests.push({url:String(url),body:init?.body as string,credentials:init?.credentials});return new Response('{}',{headers:{'content-type':'application/json'}});}});
 const input:InvestmentCashflowAction={action:'post',requestId:'stable-payment',expectedRevision:7,dealId:'deal',fundId:'fund',kind:'investment_payment',currency:'CNY',amount:'9007199254740993.01',date:'2026-01-01',bankAccount:'bank',bankReference:'ref',note:'预付款凭证，不以交割日替代银行日',evidence:[{materialId:'material',versionId:'frozen-version'}]};
 await api.actOnInvestmentCashflows('project /一',input);await api.actOnInvestmentCashflows('project /一',input);
 assert.equal(requests[0].url,'/api/projects/project%20%2F%E4%B8%80/investment-cashflows/actions');
 assert.equal(requests[0].credentials,'include');assert.equal(requests[0].body,requests[1].body);assert.deepEqual(JSON.parse(requests[0].body!),input);
 const correction:InvestmentCashflowAction={action:'reverse',requestId:'correction',expectedRevision:8,cashflowId:'original-payment',reason:'登记纠错，非银行退款',evidence:input.evidence};
 await api.actOnInvestmentCashflows('project',correction);assert.deepEqual(JSON.parse(requests[2].body!),correction);
 await api.getInvestmentCashflows('project /一');assert.equal(requests[3].url,'/api/projects/project%20%2F%E4%B8%80/investment-cashflows');
 await api.getInvestmentCashflowLedger({fundId:'fund /甲',projectId:'project /一'});const query=new URL(requests[4].url,'http://localhost').searchParams;
 assert.equal(query.get('fundId'),'fund /甲');assert.equal(query.get('projectId'),'project /一');
});
