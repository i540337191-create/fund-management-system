import {createServer} from '../../server/src/index.ts';
import {createMemoryLedgerStore} from '../../server/src/ledger/store.ts';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
const root=await mkdtemp(join(tmpdir(),'b-fund-c-')),store=createMemoryLedgerStore();
await store.masterTransaction(s=>s.schemas.fund.fields.push({id:'fundCode',label:'隔离基金编码',type:'text',enabled:true,required:false,order:0,options:[]}));
await store.insertUser({id:'b-fund-manager',name:'B隔离基金经理',email:'b-fund-c@example.invalid',role:'investment_manager',enabled:true,revision:1,passwordHash:'not-a-real-login-hash-fixture-only'});
const control={mode:'success',calls:0};
const server=createServer({ledgerStore:store,auth:{mode:'local-bypass'},materialStorageRoot:root,ai:{env:{QWEN_API_KEY:'isolated-fixture-placeholder'},fetchImpl:async(_url,init)=>{
 control.calls++;if(control.mode==='fail')return new Response('{}',{status:503});if(control.mode==='delay')await new Promise(r=>setTimeout(r,1200));
 const request=JSON.parse(String(init?.body)),sources=JSON.parse(request.messages.find((m:{role:string})=>m.role==='user').content),labels={name:'基金名称',shortName:'基金简称',scale:'规模描述',nextAction:'下一步事项','customFields.fundCode':'基金编码'},candidates=[];
 for(const source of sources)for(const [key,label]of Object.entries(labels)){const line=String(source.text).split('\n').find(l=>l.startsWith(label+'：'));if(line)candidates.push({key,value:line.slice(label.length+1).trim(),quote:line,materialId:source.materialId,page:source.page});}
 if(control.mode==='bad-source'&&candidates.length)candidates[0].quote='原件中不存在的内容';
 return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(candidates)}}]}),{status:200});
}}});
server.get('/__b_fixture/status',async()=>({mode:control.mode,calls:control.calls,fundCount:(await store.listFunds()).length,basis:'isolated in-memory, model is deterministic fixture, not AI quality evidence'}));
server.post('/__b_fixture/ai-mode',async request=>{const mode=(request.body as {mode:string}).mode;if(!['success','fail','delay','bad-source'].includes(mode))throw Error('invalid_fixture_mode');control.mode=mode;return {mode};});
await writeFile(new URL('../../../evidence/design-review-20261106/双线程交接/B/fund-c-fixture-manifest.json',import.meta.url),JSON.stringify({api:18803,frontend:15222,root,basis:'B new isolated memory; synthetic model grounded against uploaded bytes; never user/A data'},null,2));
await server.listen({host:'127.0.0.1',port:18803});console.log('B Fund C isolated fixture ready 18803');
