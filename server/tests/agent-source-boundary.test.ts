import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {publicSource,publicUrl,privateAddress,explicitPublicUrls,readPlugin} from '../src/agent/connectors.ts';
const plugin={id:'p',ownerId:'u',scope:'personal',title:'Source',description:'',kind:'public-feed',enabled:true,connected:true,endpoint:'https://example.com/news'} as const;
function io(body='current public report',headers:Record<string,string>={'content-type':'text/html'},statusCode=200){
 let requested:URL|undefined,pinned:any;
 return {get requested(){return requested;},get pinned(){return pinned;},lookup:async()=>[{address:'8.8.8.8',family:4}],request:((url:URL,options:any,callback:any)=>{requested=url;options.lookup('example.com',{},(_e:any,ip:any)=>{pinned=ip;});const req=new EventEmitter() as any;req.end=()=>queueMicrotask(()=>{const res=Readable.from([Buffer.from(body)]) as any;res.headers=headers;res.statusCode=statusCode;callback(res);});return req;}) as any};
}
test('source boundary denies private/reserved addresses including IPv6 transition ranges',()=>{
 for(const ip of ['127.0.0.1','0.1.2.3','10.0.0.2','100.64.1.2','169.254.169.254','172.31.1.1','192.168.2.1','192.0.0.9','198.18.0.1','198.51.100.1','203.0.113.3','224.0.0.1','::1','::ffff:8.8.8.8','2002:0808:0808::1','2001:db8::1','fe90::1','fc00::1'])assert.equal(privateAddress(ip),true,ip);
 assert.equal(privateAddress('8.8.8.8'),false);assert.equal(privateAddress('192.2.1.1'),false);assert.equal(privateAddress('2606:4700:4700::1111'),false);
});
test('explicit authorizer accepts only direct public HTTPS user URLs and rejects secret query parameters',()=>{
 assert.deepEqual(explicitPublicUrls('请查 https://example.com/news。以及 https://example.com/?token=secret'),['https://example.com/news']);
 for(const url of ['http://example.com','https://user:secret@example.com','https://example.com:8443','https://example.com?api_key=secret'])assert.throws(()=>publicUrl(url));
});
test('pinned HTTPS source returns bounded public text without appending business query or forwarding auth',async()=>{
 const fake=io();assert.equal(await publicSource('https://example.com/news',fake as any),'current public report');assert.equal(fake.pinned,'8.8.8.8');assert.equal(fake.requested?.href,'https://example.com/news');
});
test('source rejects mixed DNS records before request and DNS deadline includes stalled resolution',async()=>{
 const fake=io();await assert.rejects(publicSource('https://example.com',{...fake,lookup:async()=>[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}]} as any),/plugin_private_address_forbidden/);assert.equal(fake.requested,undefined);
 await assert.rejects(publicSource('https://example.com',{lookup:()=>new Promise(resolve=>setTimeout(()=>resolve([{address:'8.8.8.8',family:4}]),30)),timeoutMs:10} as any),/source_timeout/);
});
test('source denies redirects, non-text payloads, compression and excessive size',async()=>{
 for(const fake of [io('redirect',{'content-type':'text/html'},302),io('binary',{'content-type':'image/png'}),io('compressed',{'content-type':'text/html','content-encoding':'gzip'}),io('big',{'content-type':'text/plain','content-length':'3000000'}),io('x'.repeat(2*1024*1024+1),{'content-type':'text/plain'})])await assert.rejects(publicSource('https://example.com',fake as any),/source_(?:redirect_forbidden|content_type_unsupported|too_large)/);
});
test('disabled and unselected source access fails before any network request',async()=>{
 await assert.rejects(readPlugin({...plugin,enabled:false}),/plugin_unavailable/);
 await assert.rejects(readPlugin(plugin,'private business data',{url:'https://other.example/page',authorizedUrls:['https://example.com/']}),/plugin_url_forbidden/);
});

test('local library stays within authorized root, skips links/binary/oversize and limits evidence',async()=>{
 const {mkdtemp,writeFile,rm,symlink,mkdir}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{resolve}=await import('node:path'),root=await mkdtemp(resolve(tmpdir(),'agent-library-')),previous=process.env.AGENT_LIBRARY_ROOT;
 try{const target=resolve(root,'allowed');await mkdir(target);process.env.AGENT_LIBRARY_ROOT=target;await writeFile(resolve(root,'private.txt'),'private outside data');await symlink(resolve(root,'private.txt'),resolve(target,'linked.txt'));await writeFile(resolve(target,'match.md'),'matching evidence');await writeFile(resolve(target,'large.txt'),'x'.repeat(1024*1024+1));await writeFile(resolve(target,'image.png'),'binary');const library={...plugin,kind:'local-library' as const,endpoint:target};const result=await readPlugin(library,'matching');assert.deepEqual(result.sources,[{title:'match.md',text:'matching evidence'}]);await assert.rejects(readPlugin({...library,endpoint:root}),/library_outside_authorized_root/);}
 finally{if(previous===undefined)delete process.env.AGENT_LIBRARY_ROOT;else process.env.AGENT_LIBRARY_ROOT=previous;await rm(root,{recursive:true,force:true});}
});
