import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {imageCapability,inspectSelectedImage} from '../src/ai/selected-image.ts';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5v8AAAAASUVORK5CYII=','base64');
async function fixture(run:(options:any,state:any)=>Promise<void>){
 const root=await mkdtemp(resolve(tmpdir(),'agent-vision-')),blobId=randomUUID(),versionId=randomUUID();
 const material={id:'m',name:'template screenshot',currentVersionId:versionId,dataOrigin:'user_input',fundId:'f'};
 const version={id:versionId,materialId:'m',blobId,name:'screen.png',mimeType:'image/png',sizeBytes:png.length,sha256:createHash('sha256').update(png).digest('hex')};
 await writeFile(resolve(root,blobId),png);
 const state={calls:0,material,version,payload:null as any};
 const options={store:{listMaterials:async()=>[state.material],listMaterialVersions:async()=>[state.version]},storageRoot:root,actor:{id:'u',name:'Actor',role:'admin'},selectedMaterialIds:['m'],materialId:'m',versionId,question:'模板的标题在哪？',includeDemo:false,provider:{model:'qwen3.7-max',visionModel:'qwen3-vl-plus',baseUrl:'https://provider.example/compatible-mode/v1',apiKey:'private-key'},signal:new AbortController().signal,assertCurrent:async()=>{},fetchImpl:async(url:string,init:any)=>{state.calls++;state.payload=JSON.parse(init.body);assert.equal(url,'https://provider.example/compatible-mode/v1/chat/completions');assert.equal(init.redirect,'error');return {ok:true,status:200,text:async()=>JSON.stringify({choices:[{finish_reason:'stop',message:{content:'标题位于左上；需用户核对。'}}]})};}};
 try{await run(options,state);}finally{await rm(root,{recursive:true,force:true});}
}
test('vision readiness does not infer images for qwen3.7-max or silently switch models',()=>{
 assert.equal(imageCapability({model:'qwen3.7-max',baseUrl:'',apiKey:'key'}).ready,false);
 const plus=imageCapability({model:'qwen3.7-max',visionModel:'qwen3.7-plus',baseUrl:'',apiKey:'key'});assert.equal(plus.ready,true);assert.equal(plus.model,'qwen3.7-plus');assert.equal(plus.mode,'vision');
 assert.equal(imageCapability({model:'qwen3.7-max-2026-05-20',baseUrl:'',apiKey:'key'}).ready,false);
 assert.equal(imageCapability({model:'qwen3.7-max-2026-06-08',baseUrl:'',apiKey:'key'}).ready,true);
 assert.equal(imageCapability({model:'qwen3.7-max',visionModel:'qwen3-vl-plus',baseUrl:'',apiKey:'key'}).ready,true);
 assert.equal(imageCapability({model:'qwen-vl-max',baseUrl:''}).reason,'vision_provider_not_configured');
});
test('authorized current image crosses configured provider boundary as actual inline bytes; output never carries raw image or key',async()=>fixture(async(o,state)=>{
 const result=await inspectSelectedImage(o);assert.equal(result.visualRead,true);assert.equal(state.calls,1);
 const image=state.payload.messages[1].content.find((p:any)=>p.type==='image_url');assert.equal(image.image_url.url,'data:image/png;base64,'+png.toString('base64'));
 assert.equal(state.payload.model,'qwen3-vl-plus');assert.ok(!JSON.stringify(result).includes(png.toString('base64')));assert.ok(!JSON.stringify(result).includes('private-key'));assert.equal(result.evidence.versionId,o.versionId);
}));
test('unconfigured text-only model produces explicit OCR-only result without sending raw screenshot',async()=>fixture(async(o,state)=>{
 delete o.provider.visionModel;const result=await inspectSelectedImage(o);assert.equal(result.visualRead,false);assert.equal(result.status,'unavailable');assert.equal(state.calls,0);assert.equal(result.ocrStatus,'not_extracted');
}));
test('unselected, denied actor, stale version and integrity failures never reach provider',async()=>{
 for(const change of [(o:any)=>o.selectedMaterialIds=[],(o:any)=>o.actor.role='guest',(o:any)=>o.versionId=randomUUID(),(_o:any,s:any)=>s.version.sha256='a'.repeat(64),(_o:any,s:any)=>s.version.blobId='../secret'])await fixture(async(o,s)=>{change(o,s);await assert.rejects(inspectSelectedImage(o));assert.equal(s.calls,0);});
});
test('image MIME, byte signature, size, source-purpose and unreadable blob fail before provider',async()=>{
 for(const change of [(_o:any,s:any)=>s.version.mimeType='application/pdf',(_o:any,s:any)=>s.version.mimeType='image/jpeg',(_o:any,s:any)=>s.version.sizeBytes=9*1024*1024,(_o:any,s:any)=>s.version.dataPurpose='engineering_fixture',async(o:any,s:any)=>rm(resolve(o.storageRoot,s.version.blobId))])await fixture(async(o,s)=>{await change(o,s);await assert.rejects(inspectSelectedImage(o));assert.equal(s.calls,0);});
});
test('provider failure is sanitized; late response for superseded version is discarded',async()=>{
 await fixture(async(o)=>{o.fetchImpl=async()=>{throw Error('private-key/raw-material');};await assert.rejects(inspectSelectedImage(o),/vision_provider_failed/);});
 await fixture(async(o,s)=>{const fetch=o.fetchImpl;o.fetchImpl=async(...args:any[])=>{const response=await fetch(...args);s.material.currentVersionId=randomUUID();return response;};await assert.rejects(inspectSelectedImage(o),/image_version_changed/);});
 await fixture(async(o)=>{o.fetchImpl=async()=>({ok:true,text:async()=>JSON.stringify({choices:[{finish_reason:'length',message:{content:'partial'}}]})});await assert.rejects(inspectSelectedImage(o),/vision_response_invalid/);});
});

test('provider streaming output keeps split UTF8 text and enforces response limit',async()=>{
 await fixture(async(o)=>{const raw=Buffer.from(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'截图标题在左上。'}}]})),index=raw.indexOf(Buffer.from('图'))+1;o.fetchImpl=async()=>({ok:true,body:new ReadableStream({start(c){c.enqueue(raw.subarray(0,index));c.enqueue(raw.subarray(index));c.close();}})});assert.equal((await inspectSelectedImage(o)).analysis,'截图标题在左上。');});
 await fixture(async(o)=>{o.fetchImpl=async()=>({ok:true,body:new ReadableStream({start(c){c.enqueue(new Uint8Array(256001));c.close();}})});await assert.rejects(inspectSelectedImage(o),/vision_response_limit/);});
});
