import test from 'node:test';
import assert from 'node:assert/strict';
import {createApiClient} from '../src/lib/apiClient.ts';
import type {AccountAction,OwnPasswordChange} from '../src/lib/accountTypes.ts';

test('account disable and protected bootstrap revocation preserve false/null revisions and exact retry body',async()=>{
 const seen:{url:string;body?:string}[]=[];
 const api=createApiClient({fetchImpl:async(url,init)=>{seen.push({url:String(url),body:init?.body as string});return new Response('{}',{headers:{'content-type':'application/json'}});}});
 const disable:AccountAction={action:'update',requestId:'same-operation',expectedRevision:4,enabled:false,role:'viewer'};
 await api.actOnAccount('person /一',disable);await api.actOnAccount('person /一',disable);
 assert.equal(seen[0].url,'/api/admin/users/person%20%2F%E4%B8%80/actions');assert.equal(seen[0].body,seen[1].body);assert.deepEqual(JSON.parse(seen[0].body!),disable);
 const revoke:AccountAction={action:'revoke_sessions',requestId:'bootstrap-revoke',expectedRevision:null};await api.actOnAccount('user-admin',revoke);assert.deepEqual(JSON.parse(seen[2].body!),revoke);
 await api.revokeOwnSessions({requestId:'self-revoke',expectedRevision:3});assert.equal(seen[3].url,'/api/session/revoke-sessions');assert.deepEqual(JSON.parse(seen[3].body!),{requestId:'self-revoke',expectedRevision:3});
});

test('own password verification stays in POST body with stable request identity, never URL',async()=>{
 const seen:{url:string;method?:string;body?:string}[]=[];
 const api=createApiClient({fetchImpl:async(url,init)=>{seen.push({url:String(url),method:init?.method,body:init?.body as string});return new Response('{}',{headers:{'content-type':'application/json'}});}});
 const change:OwnPasswordChange={requestId:'password-retry',expectedRevision:3,currentPassword:'test-only-current-value',newPassword:'test-only-new-value'};
 await api.changeOwnPassword(change);await api.changeOwnPassword(change);
 assert.equal(seen[0].url,'/api/session/password');assert.equal(seen[0].method,'POST');assert.equal(seen[0].body,seen[1].body);assert.deepEqual(JSON.parse(seen[0].body!),change);
 assert.equal(seen.some(x=>x.url.includes(change.currentPassword)||x.url.includes(change.newPassword)),false);
});
