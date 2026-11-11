import React from 'react';
import {renderToString} from 'react-dom/server';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
test('workspace client preserves retry identity, exposes conflicts and keeps read separate from completion',async()=>{const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:{port:30000+process.pid%20000}},appType:'custom'});const previousFetch=globalThis.fetch,previousWindow=globalThis.window;try{const client=await server.ssrLoadModule('/src/lib/agentWorkspaceClient.ts');const events=new EventTarget();globalThis.window=Object.assign(events,{location:{origin:'http://localhost'}}) as any;const calls:{url:any;init:any}[]=[];let mode='ok',changed=0;events.addEventListener('fundapp:agent-workspace-changed',()=>changed++);globalThis.fetch=async(url:any,init:any)=>{calls.push({url,init});if(mode==='offline')throw new TypeError('offline');return new Response(JSON.stringify(mode==='conflict'?{error:'workspace_revision_conflict'}:{revision:4,notifications:[],result:{id:'exact-created-record'}}),{status:mode==='conflict'?409:200});};assert.equal((await client.loadAgentWorkspace()).revision,4);assert.equal(calls[0].init.credentials,'include');const original={requestId:'same-request',expectedRevision:3,action:'read_notice',data:{id:'notice-a'}};mode='offline';await assert.rejects(client.actAgentWorkspace(original));mode='ok';assert.equal((await client.actAgentWorkspace(original)).result.id,'exact-created-record');assert.equal(calls[1].init.body,calls[2].init.body);assert.equal(changed,1);mode='conflict';await assert.rejects(client.actAgentWorkspace(original),(e:any)=>e.status===409);assert.equal(changed,1);mode='ok';await client.actAgentWorkspace({...original,action:'snooze_notice',data:{id:'notice-a',until:'2026-11-06T00:00:00Z'}});const final=JSON.parse(calls.at(-1)!.init.body);assert.equal(final.action,'snooze_notice');assert.equal(final.data.read,undefined);assert.equal(final.data.status,undefined);assert.ok(!calls.some(c=>c.init?.body&&JSON.parse(c.init.body).action==='complete_task'));}finally{globalThis.fetch=previousFetch;globalThis.window=previousWindow;await server.close();}});

test('workspace reads coalesce, recover after failure, and never reuse another session snapshot',async()=>{
 const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:{port:30001+process.pid%20000}},appType:'custom'});
 const previousFetch=globalThis.fetch;
 try{
  const client=await server.ssrLoadModule('/src/lib/agentWorkspaceClient.ts');
  const session=await server.ssrLoadModule('/src/lib/sessionBoundary.ts');
  const probe=()=>renderToString(React.createElement(()=>React.createElement('span',null,client.useAgentWorkspace().state?.revision??'empty')));
  let calls=0,release!:()=>void;
  globalThis.fetch=async()=>{calls++;await new Promise<void>(resolve=>{release=resolve;});return new Response(JSON.stringify({revision:4}));};
  const a=client.loadAgentWorkspace(),b=client.loadAgentWorkspace();assert.equal(calls,1);release();await Promise.all([a,b]);assert.match(probe(),/>4</);
  session.acceptClientSession();assert.match(probe(),/>empty</);
  globalThis.fetch=async()=>{throw Error('offline');};await assert.rejects(client.loadAgentWorkspace());
  globalThis.fetch=async()=>new Response(JSON.stringify({revision:2}));assert.equal((await client.loadAgentWorkspace()).revision,2);assert.match(probe(),/>2</);
  session.acceptClientSession();let finish!:()=>void;
  globalThis.fetch=async()=>{await new Promise<void>(r=>{finish=r;});return new Response(JSON.stringify({revision:99}));};
  const stale=client.loadAgentWorkspace();session.acceptClientSession();finish();await assert.rejects(stale);assert.match(probe(),/>empty</);
 }finally{globalThis.fetch=previousFetch;await server.close();}
});
