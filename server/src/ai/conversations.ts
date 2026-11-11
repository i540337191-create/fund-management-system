import type {ConversationConfirmation} from './conversation-confirmation.ts';
import type {AssistantBatch} from './batch-actions.ts';
import type {ContextMemory} from './context-memory.ts';
import type {AssistantProposal} from '../http/assistant-actions.ts';
import {randomUUID} from 'node:crypto';
import type {AccountState} from '../ledger/accounts.ts';
import {fail,requestId,string} from '../ledger/workflow.ts';
export type Citation={id:string;materialId:string;title:string;page:number;excerpt:string;location?:string;href:string};
export type AgentActivity={errorCode?:string;errorMessage?:string;id:string;label:string;status:'running'|'complete'|'error'|'stopped';startedAt:string;finishedAt?:string};
export type AssistantMessage={confirmationOffer?:ConversationConfirmation;fundId?:string;activities?:AgentActivity[];scopeIds?:string[];id:string;role:'user'|'assistant';content:string;status:'complete'|'running'|'stopped'|'error';createdAt:string;requestId?:string;inputFingerprint?:string;citations?:Citation[];model?:string;error?:string};
export type AssistantConversation={cancelledRequestIds?:string[];batchRun?:AssistantBatch;contextMemory?:ContextMemory;actionGeneration?:{token:string;requestId:string;fingerprint:string;status:'running'|'cancelled'|'complete'|'error'};actionReceipts?:Record<string,{fingerprint:string;actionIds:string[];clarification:string}>;proposals?:AssistantProposal[];id:string;title:string;includeDemo:boolean;revision:number;createdAt:string;updatedAt:string;createRequestId:string;messages:AssistantMessage[];activeRequestId?:string;fundId?:string;projectId?:string;materialIds?:string[]};
export type AssistantState=Pick<AccountState,'users'|'sessions'>&{conversations:AssistantConversation[]};
export function findConversation(s:AssistantState,id:string){const c=s.conversations.find(c=>c.id===id);if(!c)fail('conversation_not_found',404);return c;}
export function conversationRevision(c:AssistantConversation,revision:unknown){if(!Number.isSafeInteger(revision)||revision!==c.revision)fail('conversation_conflict',409);}
export function createConversation(s:AssistantState,body:Record<string,unknown>){
 const rid=requestId(body.requestId);if(body.fundId!==undefined&&(typeof body.fundId!=='string'||!body.fundId))fail('invalid_fund');if(typeof body.includeDemo!=='boolean')fail('invalid_include_demo');const prior=s.conversations.find(c=>c.createRequestId===rid);if(prior){if(prior.includeDemo!==body.includeDemo||prior.fundId!==body.fundId)fail('conversation_request_conflict',409);return prior;}
 if(s.conversations.length>=200)fail('conversation_limit',409);const now=new Date().toISOString();const c:AssistantConversation={id:randomUUID(),title:'新对话',includeDemo:body.includeDemo,revision:1,createdAt:now,updatedAt:now,createRequestId:rid,messages:[],...(typeof body.fundId==='string'?{fundId:body.fundId}:{})};s.conversations.push(c);return c;
}
export function reserveTurn(c:AssistantConversation,b:Record<string,unknown>){
 const rid=requestId(b.requestId);if(c.cancelledRequestIds?.includes(rid))fail('generation_stopped',409);const fingerprint=JSON.stringify({prompt:b.prompt,retryOf:b.retryOf,projectId:b.projectId,fundId:b.fundId??c.fundId,materialIds:b.materialIds,skillId:b.skillId}),prior=c.messages.find(m=>m.requestId===rid&&m.role==='assistant');if(prior){if(prior.inputFingerprint!==fingerprint)fail('conversation_request_conflict',409);return {message:prior,replay:true};}
 conversationRevision(c,b.expectedRevision);if(c.activeRequestId||c.actionGeneration?.status==='running'||c.batchRun?.status==='running')fail('conversation_busy',409);if(c.messages.length>=200)fail('conversation_message_limit',409);
 if(b.fundId!==undefined&&(typeof b.fundId!=='string'||!b.fundId))fail('invalid_fund');if(!c.fundId&&b.fundId&&c.messages.length)fail('conversation_fund_conflict',409);if(c.fundId&&b.fundId!==undefined&&c.fundId!==b.fundId)fail('conversation_fund_conflict',409);const fundId=typeof b.fundId==='string'?b.fundId:c.fundId;
 const now=new Date().toISOString();
 if(b.retryOf){const last=c.messages.at(-1);if(last?.role!=='assistant'||last.id!==b.retryOf||c.messages.at(-2)?.role!=='user')fail('invalid_regeneration',409);c.messages.pop();}
 else{const prompt=string(b.prompt,true,8000);c.messages.push({id:randomUUID(),role:'user',fundId,content:prompt,status:'complete',createdAt:now});if(c.messages.length===1)c.title=prompt.replace(/\s+/g,' ').slice(0,28);}
 if(b.projectId!==undefined&&typeof b.projectId!=='string')fail('invalid_project');if(b.materialIds!==undefined&&(!Array.isArray(b.materialIds)||b.materialIds.length>10||b.materialIds.some(x=>typeof x!=='string')))fail('invalid_material_selection');
 c.fundId=fundId;c.projectId=typeof b.projectId==='string'?b.projectId:undefined;c.materialIds=Array.isArray(b.materialIds)?b.materialIds as string[]:[];
 const message:AssistantMessage={id:randomUUID(),role:'assistant',fundId,content:'',status:'running',createdAt:now,requestId:rid,inputFingerprint:fingerprint};c.messages.push(message);c.activeRequestId=rid;c.revision++;c.updatedAt=now;return {message,replay:false};
}
export function finishTurn(c:AssistantConversation,rid:string,content:string,status:AssistantMessage['status'],citations:Citation[],model:string,error?:string,scopeIds?:string[]){
 if(c.activeRequestId!==rid)return;const m=c.messages.find(m=>m.role==='assistant'&&m.requestId===rid);if(!m)return;Object.assign(m,{content,status,citations,model,...(scopeIds?{scopeIds}:{}),...(error?{error}:{})});if(status!=='running'){for(const activity of m.activities??[])if(activity.status==='running'){activity.status=status==='complete'?'complete':status;activity.finishedAt=new Date().toISOString();}delete c.activeRequestId;}c.revision++;c.updatedAt=new Date().toISOString();
}
export async function* providerText(response:{body?:ReadableStream<Uint8Array>|null;text:()=>Promise<string>;headers?:{get:(name:string)=>string|null}}){
 if(!response.body||response.headers?.get('content-type')?.includes('application/json')){const body=JSON.parse(await response.text());const content=body?.choices?.[0]?.message?.content;if(typeof content!=='string'||!content)throw Error('empty_model_reply');yield content;return;}
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',done=false;
 try{while(true){const part=await reader.read();buffer=(buffer+decoder.decode(part.value,{stream:!part.done})).replace(/\r\n/g,'\n');let boundary;
  while((boundary=buffer.indexOf('\n\n'))>=0){const event=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);const data=event.split('\n').filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trimStart()).join('\n');if(!data)continue;if(data==='[DONE]'){done=true;return;}const value=JSON.parse(data);if(value.error)throw Error('model_stream_error');const choice=value.choices?.[0];if(choice?.finish_reason)done=true;if(typeof choice?.delta?.content==='string')yield choice.delta.content;}
  if(buffer.length>1024*1024)throw Error('model_event_too_large');if(part.done)break;
 }if(!done)throw Error('model_stream_interrupted');}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
