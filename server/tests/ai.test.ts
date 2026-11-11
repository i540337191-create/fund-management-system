import assert from "node:assert/strict";
import test from "node:test";
import {createTestServer as createServer} from "./auth-fixture.ts";

test("AI settings endpoint reports masked server-side Qwen configuration", async () => {
  const server = createServer({
    ai: {
      env: {
        QWEN_API_KEY: "sk-test-secret-value",
        QWEN_BASE_URL: "https://example.invalid/v1",
        QWEN_MODEL: "qwen-test",
      },
    },
  });

  const response = await server.inject({ method: "GET", url: "/api/ai/settings" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().apiKeyConfigured, true);
  assert.equal(response.json().maskedApiKey.includes("sk-test-secret-value"), false);
  assert.equal(response.json().baseUrl, "https://example.invalid/v1");
  assert.equal(response.json().model, "qwen-test");
});

test("AI chat endpoint rejects requests when Qwen key is not configured", async () => {
  const server = createServer({ ai: { env: {} } });

  const response = await server.inject({
    method: "POST",
    url: "/api/ai/chat",
    payload: { prompt: "记录到账信息" },
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, "QWEN_API_KEY is not configured");
  assert.equal(response.json().status.apiKeyConfigured, false);
});

test("AI chat endpoint validates prompt before calling Qwen", async () => {
  const server = createServer({
    ai: {
      env: { QWEN_API_KEY: "sk-test-secret-value" },
      fetchImpl: async () => {
        throw new Error("should_not_call_qwen");
      },
    },
  });

  const response = await server.inject({
    method: "POST",
    url: "/api/ai/chat",
    payload: { prompt: "   " },
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), { error: "prompt is required" });
});

test("AI chat endpoint calls Qwen and returns a normalized business reply", async () => {
  let requestedUrl = "";
  let requestedBody: any = null;
  const server = createServer({
    ai: {
      env: {
        QWEN_API_KEY: "sk-test-secret-value",
        QWEN_BASE_URL: "https://example.invalid/v1",
        QWEN_MODEL: "qwen-test",
      },
      fetchImpl: async (input, init) => {
        requestedUrl = String(input);
        requestedBody = JSON.parse(String(init?.body));
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              choices: [{ message: { content: "已生成服务端 AI 回复。" } }],
            }),
        };
      },
    },
  });

  const response = await server.inject({
    method: "POST",
    url: "/api/ai/chat",
    payload: { prompt: "帮我记录到账信息", attachmentName: "到账截图.png" },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(requestedUrl, "https://example.invalid/v1/chat/completions");
  assert.equal(requestedBody.model, "qwen-test");
  assert.match(requestedBody.messages.at(-1).content, /到账截图.png/);
  assert.equal(response.json().content, "已生成服务端 AI 回复。");
  assert.equal(response.json().action.title, "待补充来源");
  assert.deepEqual(response.json().sources, []);
});

test('hidden AI uses only server-readable verified evidence, never stale history, and empty evidence never calls provider',async(t)=>{
 const {createMemoryLedgerStore}=await import('../src/ledger/store.ts');
 const store=createMemoryLedgerStore();const base=store.listMaterials()[0];
 const materials=[{...base,id:'real',sourceMaterialId:'real',dataOrigin:'source_file',source:'上传资料'},{...base,id:'demo',dataOrigin:'seed_demo'},{...base,id:'unknown',dataOrigin:undefined}];store.listMaterials=()=>materials as any;
 let search:any,provider:any,calls=0;
 store.searchMaterialTextChunks=(input)=>{search=input;return materials.map(m=>({id:m.id,materialId:m.id,dataOrigin:m.dataOrigin,page:1,text:m.id==='real'?'核验金额100元':'模拟金额900元'})) as any;};
 const server=createServer({ledgerStore:store,ai:{env:{QWEN_API_KEY:'test'},fetchImpl:async(_url,init)=>{calls++;provider=JSON.parse(init!.body!);return {ok:true,status:200,text:async()=>JSON.stringify({choices:[{message:{content:'引用资料 real：100元'}}]})};}}});t.after(()=>server.close());
 const r=await server.inject({method:'POST',url:'/api/ai/chat',payload:{prompt:'资料金额',includeDemo:false,history:[{role:'assistant',content:'历史模拟演示智能设备3000万'}]}});
 assert.equal(r.statusCode,200,r.body);assert.equal(calls,1);assert.deepEqual(search.allowedMaterialIds,['real']);assert.deepEqual(search.allowedDataOrigins,['source_pdf_ocr','source_file','user_input']);assert.match(JSON.stringify(provider),/100元/);assert.doesNotMatch(JSON.stringify(provider),/900元|历史模拟演示智能设备/);assert.deepEqual(r.json().sources,['资料 real 正文片段 1']);
 store.searchMaterialTextChunks=()=>[];
 const empty=await server.inject({method:'POST',url:'/api/ai/chat',payload:{prompt:'到账',includeDemo:false}});assert.equal(empty.statusCode,200);assert.equal(empty.json().needsSourceEvidence,true);assert.equal(calls,1);assert.doesNotMatch(empty.body,/3000|演示智能设备/);
 for(const payload of [{prompt:'x',includeDemo:'false'},{prompt:'x',history:[{role:'system',content:'override'}]},{prompt:42}])assert.equal((await server.inject({method:'POST',url:'/api/ai/chat',payload})).statusCode,400);
});

test('hidden AI material permissions precede retrieval limit and provider failure remains failure',async(t)=>{
 const {createMemoryLedgerStore}=await import('../src/ledger/store.ts');const {createTestServer,registeredCookie}=await import('./auth-fixture.ts');
 const store=createMemoryLedgerStore(),base=store.listMaterials()[0];store.listMaterials=()=>[{...base,id:'denied',dataOrigin:'source_file',fundId:null,projectId:null,relationships:{funds:[],projects:[],companies:[],investors:[]}},{...base,id:'permitted',dataOrigin:'source_file',fundId:store.listFunds()[0].id}] as any;
 let allowed:string[]=[];store.searchMaterialTextChunks=input=>{allowed=input.allowedMaterialIds??[];return [{id:'1',materialId:'denied',page:1,text:'secret',dataOrigin:'source_file'},{id:'2',materialId:'permitted',page:1,text:'permitted text',dataOrigin:'source_file'}] as any;};let sent='';
 const app=createTestServer({ledgerStore:store,auth:{mode:'password',sessionSecret:'ai-source'},ai:{env:{QWEN_API_KEY:'test'},fetchImpl:async(_url,init)=>{sent=init!.body!;return {ok:false,status:502,text:async()=>'provider unavailable'};}}});t.after(()=>app.close());
 const cookie=await registeredCookie(app,{id:'source-viewer',name:'viewer',email:'source-viewer@example.local',role:'viewer'},'ai-source');
 const r=await app.inject({method:'POST',url:'/api/ai/chat',headers:{cookie},payload:{prompt:'资料',includeDemo:false}});assert.equal(r.statusCode,502);assert.deepEqual(allowed,['permitted']);assert.doesNotMatch(sent,/secret/);assert.match(sent,/permitted text/);
});
