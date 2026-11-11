import test from 'node:test';
import assert from 'node:assert/strict';
import {businessModelProfile,assertHarnessCompleted} from './runner.mjs';
test('Qwen3.7 Max capacity matches its published model profile while unknown models retain their conservative default',()=>{
 assert.equal(businessModelProfile('qwen3.7-max').contextWindow,1000000);
 assert.equal(businessModelProfile('qwen3.7-max-2026-05-20').contextWindow,1000000);
 assert.equal(businessModelProfile('other-model').contextWindow,32768);
 assert.equal(businessModelProfile('qwen3.7-max').maxTokens,8192);
});
test('provider success text cannot hide a local context failure or a truncated answer',()=>{
 const result=(reason,text='partial answer')=>({finalResponse:text,events:[{type:'turn/end',data:{reason}}]});
 assert.throws(()=>assertHarnessCompleted(result({kind:'error',error:{code:'CONTEXT_WINDOW_EXCEEDED',message:'private data'}})),{code:'CONTEXT_WINDOW_EXCEEDED'});
 assert.throws(()=>assertHarnessCompleted(result({kind:'max-tokens'})),{code:'MODEL_OUTPUT_LIMIT'});
 assert.throws(()=>assertHarnessCompleted(result({kind:'aborted'})),{code:'HARNESS_ABORTED'});
 assert.doesNotThrow(()=>assertHarnessCompleted(result({kind:'stop'},'complete answer')));
 assert.throws(()=>assertHarnessCompleted(result({kind:'stop'},'')),{code:'EMPTY_RESPONSE'});
});
test('business system text keeps Chinese and English template markers literal',async()=>{
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{resolve}=await import('node:path'),{apply}=await import('./business-tools.mjs');const dir=await mkdtemp(resolve(tmpdir(),'fundapp-literal-')),path=resolve(dir,'system.txt'),text='业务规则：模板使用{{企业名称}}、{{company_name}}，不展开为引擎变量。',prior=process.env.FUNDAPP_SYSTEM_PROMPT_PATH,defs=process.env.FUNDAPP_TOOL_DEFINITIONS;let section;
 try{await writeFile(path,text);process.env.FUNDAPP_SYSTEM_PROMPT_PATH=path;process.env.FUNDAPP_TOOL_DEFINITIONS='[]';apply({systemPrompt:{section:value=>{section=value;}},tools:{register(){}},on(){}});assert.equal(section.text,text);assert.equal(section.interpolate,false);}finally{if(prior===undefined)delete process.env.FUNDAPP_SYSTEM_PROMPT_PATH;else process.env.FUNDAPP_SYSTEM_PROMPT_PATH=prior;if(defs===undefined)delete process.env.FUNDAPP_TOOL_DEFINITIONS;else process.env.FUNDAPP_TOOL_DEFINITIONS=defs;await rm(dir,{recursive:true,force:true});}
});
