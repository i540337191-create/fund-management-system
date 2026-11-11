import {DeepSeekHarness} from '@deepseek-ai/dsh-sdk-client';
import {createServer} from 'node:http';
import {randomUUID,timingSafeEqual} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
export function businessModelProfile(model){
 // Alibaba's published Qwen3.7 Max window is 1,000,000 tokens; this is capacity, not output allocation.
 return {contextWindow:/^qwen3\.7-max(?:$|-)/.test(model)?1000000:32768,maxTokens:8192,reasoning:false,input:['text']};
}
export function assertHarnessCompleted(result){
 const reason=result.events?.filter(e=>e.type==='turn/end').at(-1)?.data?.reason;
 const code=reason?.kind==='error'?(reason.error?.code??'HARNESS_FAILED'):reason?.kind==='max-tokens'?'MODEL_OUTPUT_LIMIT':reason?.kind==='aborted'?'HARNESS_ABORTED':!result.finalResponse?.trim()?'EMPTY_RESPONSE':null;
 if(code)throw Object.assign(new Error('Business harness did not complete'),{code});
}
// Only allowlisted hints cross the tool bridge; raw exceptions may contain private details.
export function businessToolFailure(error){
 const hints={image_not_selected:'请先让用户选择该截图，再核对资料与版本。',image_version_changed:'图片已更新，请重新读取当前版本后再查看。',image_unavailable:'当前账号或上下文不可读取该图片，请停止查看。',image_type_unsupported:'仅支持已上传的PNG、JPEG或WebP图片，请选择支持的原件。',image_integrity_failure:'图片原件无法通过完整性核验，不能声称已查看。',image_size_limit:'截图超出8MB读取限制，请使用较小的授权截图。',image_type_mismatch:'截图格式与实际原件不一致，不能读取。',vision_provider_failed:'图片理解服务未成功，不能声称已看懂截图。',vision_timeout:'图片理解超时，请重试或依据已提取文字核对。',vision_response_invalid:'图片理解结果不完整，不能作为已读取证据。',plugin_unavailable:'该信源插件未启用或未授权，请停止访问。',plugin_url_forbidden:'仅可读取本轮用户直接提供的公开网址或插件已配置的信源。',invalid_plugin_endpoint:'该网址不符合公开HTTPS读取要求，不能访问。',source_redirect_forbidden:'该公开页面发生跳转，本次未读取目标内容。',source_content_type_unsupported:'该信源返回格式不受支持，本次未读取正文。',source_too_large:'该信源超过2MB读取限制，本次未读取完整正文。',source_timeout:'公开信源读取超时，本次未获得可用正文。',source_unavailable:'公开信源读取失败，本次未获得可用正文。',invalid_weekly_tasks:'周报关联任务不在当前可见列表或数量/格式不适用，请重新读取并保持真实关联，不使用他人的私人任务。',weekly_fields_required:'周报确认卡须完整携带原title、week、thisWeek、nextWeek、status与taskIds；修改还须原id与当前version。请重新读取，不得遗漏原标题或状态。',weekly_target_required:'已有同标题同周周报，请重新读取并携带原记录id及当前version准备修改，不能遗漏目标而重复新建。',weekly_week_mismatch:'周报周次与用户明确指定的周次不一致，请回查本轮用户原文并重新核对；没有该周事实时先追问，不改成当前周。',invalid_week:'所选年份没有该ISO周次，请核对周一至周日日期后重试。',invalid_date:'日期无效，请使用真实存在的年月日并核对截止时间。',action_proposal_invalid:'确认卡结构不符合办理规则，请重新核对动作和字段。',action_limit:'本轮准备次数或记录数量达到上限，请停止本次准备并核对已有卡片。',business_context_read_required:'请先查阅当前业务记录，核对项目和负责人后再准备确认卡。',workflow_read_required:'请先读取该流程的当前详情和可办理动作。',action_object_unavailable:'所选对象未在当前可用记录中匹配，请重新查阅并使用返回的对象。',ineligible_user:'负责人不可用于此任务，请重新查阅可用人员并核对姓名。',invalid_payload:'所需字段缺失、为空或格式不正确，请按办理规则补齐，信息不足时追问。',invalid_task_payload:'任务字段不完整或状态、优先级不适用，请核对后重试。',invalid_action_payload:'确认卡参数格式不正确，请按规则重新组织。',action_context_changed:'业务记录已更新，请重新读取当前记录后准备。',forbidden:'当前没有此项办理权限，请停止该操作并说明权限限制。',unauthenticated:'登录或授权状态已变化，请停止操作并重新登录。'};
 const code=Object.hasOwn(hints,error?.code)?error.code:'business_tool_unavailable';return {error:code,message:hints[code]??'本次业务步骤未成功，不能宣称已准备或已办理；请核对当前条件后重试。'};
}
export async function runBusinessHarness({prompt,system,model,baseUrl,apiKey,signal,tools,onTool,onProgress,onDelta,maxToolCalls=12}){
 if(signal.aborted)throw Error('stopped');
 const callLimit=Number.isSafeInteger(maxToolCalls)?Math.max(1,Math.min(maxToolCalls,64)):12;
 const home=await mkdtemp(resolve(tmpdir(),'fundapp-harness-'));let harness,bridge,calls=0;const token=randomUUID();
 try{
  bridge=createServer(async(req,res)=>{try{
   const auth=Buffer.from(req.headers.authorization??''),expected=Buffer.from('Bearer '+token);
   if(req.method!=='POST'||req.url!=='/'||auth.length!==expected.length||!timingSafeEqual(auth,expected)){res.writeHead(403).end();return;}
   let raw='';for await(const part of req){raw+=part;if(raw.length>150000){res.writeHead(413).end();return;}}
   if(signal.aborted){res.writeHead(409).end();return;}
   const body=JSON.parse(raw);if(body.event==='text'){if(typeof body.text!=='string'||body.text.length>30000){res.writeHead(400).end();return;}await onDelta?.(body.text);res.writeHead(200).end('{}');return;}if(++calls>callLimit){res.writeHead(409).end();void harness.close().catch(()=>{});return;}const tool=tools.find(t=>t.name===body.name);if(!tool||!body.args||typeof body.args!=='object'||Array.isArray(body.args)){res.writeHead(400).end();return;}
   onProgress?.(tool.label);const value=await onTool(body.name,body.args);if(signal.aborted){res.writeHead(409).end();return;}res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(value));
  }catch(error){res.writeHead(409,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(businessToolFailure(error)));}});
  await new Promise((ok,bad)=>{bridge.once('error',bad);bridge.listen(0,'127.0.0.1',ok);});
  const profile=resolve(home,'profiles/sdk-minimal');await mkdir(profile,{recursive:true});
  const disabled=['deepseek-llm-api-extensions','session-log-deepseek','plugin-package-inventory-deepseek','llm-deepseek','tool-fs','tool-working-directory','persistent-bash','persistent-pwsh'];
  const patch=[...disabled.map(id=>({id,disabled:true})),{id:'system-prompt',config:{includeHarnessIdentity:false,includeRuntimeContext:false,personaPrefix:''}},{insert:[{id:'fundapp-model',name:'@deepseek-ai/dsh-llm-pi-ai',config:{providers:{'fundapp-provider':{apiKeyEnv:'FUNDAPP_MODEL_KEY',api:'openai-completions',baseURL:baseUrl,models:[{id:model,name:'业务助手',...businessModelProfile(model)}],retryPolicy:{mode:'normal',maxRetries:0},compat:{supportsStore:false,supportsDeveloperRole:false,supportsReasoningEffort:false}}}}},{id:'fundapp-business-tools',name:resolve(root,'business-tools.mjs')}]}];
  const systemPath=resolve(home,'business-system.txt');await writeFile(systemPath,system,{mode:0o600});
  const patchPath=resolve(home,'business.patch.yml');await writeFile(patchPath,JSON.stringify(patch),{mode:0o600});
  const env={PATH:process.env.PATH,TMPDIR:process.env.TMPDIR,LANG:'zh_CN.UTF-8',TZ:'Asia/Shanghai',FUNDAPP_MODEL_KEY:apiKey,FUNDAPP_SYSTEM_PROMPT_PATH:systemPath,FUNDAPP_TOOL_BRIDGE:'http://127.0.0.1:'+bridge.address().port+'/',FUNDAPP_TOOL_TOKEN:token,FUNDAPP_TOOL_DEFINITIONS:JSON.stringify(tools.map(({label,...definition})=>definition))};
  harness=new DeepSeekHarness({dshBin:resolve(root,'node_modules/@deepseek-ai/dsh/lib/bin.js'),profile:'sdk-minimal',patches:[patchPath],dshHome:home,cwd:home,processCwd:root,provider:'fundapp-provider',model,maxTokens:8192,env,initializeTimeoutMs:20000,requestTimeoutMs:120000});
  const stop=()=>{void harness.close().catch(()=>{});};signal.addEventListener('abort',stop,{once:true});
  try{if(signal.aborted)throw Error('stopped');const result=await harness.run(prompt);if(signal.aborted)throw Error('stopped');assertHarnessCompleted(result);return {text:result.finalResponse,toolCalls:calls};}finally{signal.removeEventListener('abort',stop);}
 }finally{if(harness)await harness.close();if(bridge){bridge.closeAllConnections();await new Promise(done=>bridge.close(done));}await rm(home,{recursive:true,force:true});}
}
