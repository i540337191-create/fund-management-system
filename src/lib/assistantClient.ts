import type {AssistantActionCard} from './assistantActions.ts';
import type {ApiMaterial} from './apiClient';
import {fetchInSession,clientSessionEpoch,assertSessionEpoch} from './sessionBoundary.ts';
export type Citation={id:string;materialId:string;title:string;page:number;excerpt:string;location?:string;href:string};
export {materialCitationLocation as citationLocation} from './materialCitationLocation.ts';
export type AgentActivity={errorCode?:string;errorMessage?:string;id:string;label:string;status:'running'|'complete'|'error'|'stopped';startedAt:string;finishedAt?:string};
export type AssistantMessage={activities?:AgentActivity[];id:string;role:'user'|'assistant';content:string;status:'complete'|'running'|'stopped'|'error';createdAt:string;requestId?:string;citations?:Citation[];model?:string;error?:string};
export type Conversation={id:string;title:string;includeDemo:boolean;revision:number;createdAt:string;updatedAt:string;messages:AssistantMessage[];activeRequestId?:string;projectId?:string;materialIds?:string[]};
export type ConversationSummary=Pick<Conversation,'id'|'title'|'revision'|'updatedAt'>&{messageCount:number;running:boolean};
export function mergeConversationHistory(groups:ConversationSummary[][]){return [...new Map(groups.flat().map(c=>[c.id,c])).values()].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));}
const base='/api/ai/conversations';
export function assistantError(error:unknown){const {code,status}=(error??{}) as {code?:string;status?:number};if(status===401||code==='client_session_changed')return '登录身份已变化，请重新打开对话。';return ({model_not_configured:'AI服务暂未启用，请联系管理员。',confirmation_scope_changed:'当前项目或参考资料已切换，请回到原范围重新核对变更后确认。',conversation_conflict:'对话已被其他窗口更新，请刷新后继续，输入内容仍保留。',conversation_busy:'本对话仍在生成，请先停止或等待本次回复。',conversation_not_found:'对话不存在或当前账号无权访问，请新建对话。',material_unavailable:'所选资料当前不可读取，请重新选择有权限的资料。',material_not_in_current_scope:'所选资料不在当前项目或来源范围内，请调整选择。',model_unavailable:'AI服务暂不可用，可重新生成；已有内容已保留。',conversation_limit:'历史对话数量已达上限，请删除不需要的对话后继续。',conversation_message_limit:'本次对话过长，请新建对话继续。',stream_interrupted:'连接已中断，已保留收到的内容，请刷新记录或重新生成。'} as Record<string,string>)[code??'']??'暂时无法连接服务，请重试。输入内容仍保留。';}
async function failure(response:Response):Promise<never>{let code='assistant_unavailable';try{code=(await response.json()).error??code;}catch{}throw Object.assign(new Error(code),{code,status:response.status});}
async function json<T>(url:string,init:RequestInit={}):Promise<T>{const epoch=clientSessionEpoch(),response=await fetchInSession(fetch,url,{...init,headers:{'Content-Type':'application/json',...init.headers}});if(!response.ok)return failure(response);const body=await response.json();assertSessionEpoch(epoch);return body;}
export const assistantClient={
 batch:(id:string)=>json<{batch:{id:string;actionIds:string[];status:'running'|'complete'|'interrupted';completed:number;error?:string}|null}>(base+'/'+encodeURIComponent(id)+'/actions/batch'),
 stopBatch:(id:string)=>json<unknown>(base+'/'+encodeURIComponent(id)+'/actions/batch/stop',{method:'POST',body:'{}'}),
 runBatch:(id:string,requestId:string,actionIds:string[])=>json<unknown>(base+'/'+encodeURIComponent(id)+'/actions/batch',{method:'POST',body:JSON.stringify({requestId,actionIds,confirmed:true})}),
 actions:(id:string)=>json<{actions:AssistantActionCard[]}>(base+'/'+encodeURIComponent(id)+'/actions'),
 proposeActions:(id:string,body:{requestId:string;expectedRevision:number;instruction:string;projectId?:string;materialIds?:string[]})=>json<{actions:AssistantActionCard[];clarification?:string}>(base+'/'+encodeURIComponent(id)+'/actions',{method:'POST',body:JSON.stringify(body)}),
 confirmAction:(id:string,actionId:string)=>json<unknown>(base+'/'+encodeURIComponent(id)+'/actions/'+encodeURIComponent(actionId)+'/confirm',{method:'POST',body:JSON.stringify({confirmed:true})}),
 cancelAction:(id:string,actionId:string)=>json<unknown>(base+'/'+encodeURIComponent(id)+'/actions/'+encodeURIComponent(actionId)+'/cancel',{method:'POST',body:'{}'}),
 materials:(projectId:string,includeDemo:boolean)=>json<{materials:ApiMaterial[]}>(`/api/ai/materials?includeDemo=${includeDemo}&projectId=${encodeURIComponent(projectId)}`),
 history:async()=>{const groups=await Promise.all([true,false].map(value=>json<{conversations:ConversationSummary[]}>(base+'?includeDemo='+value)));return {conversations:mergeConversationHistory(groups.map(x=>x.conversations))};},
 list:(includeDemo:boolean)=>json<{conversations:ConversationSummary[]}>(base+'?includeDemo='+includeDemo),
 create:(requestId:string,includeDemo:boolean)=>json<Conversation>(base,{method:'POST',body:JSON.stringify({requestId,includeDemo})}),
 get:(id:string)=>json<Conversation>(base+'/'+encodeURIComponent(id)),
 rename:(c:Conversation,title:string)=>json<Conversation>(base+'/'+c.id,{method:'PATCH',body:JSON.stringify({title,expectedRevision:c.revision})}),
 remove:(c:Conversation)=>json<{ok:true}>(base+'/'+c.id,{method:'DELETE',body:JSON.stringify({expectedRevision:c.revision})}),
 stop:(id:string,requestId?:string)=>json<Conversation>(base+'/'+id+'/stop',{method:'POST',body:JSON.stringify(requestId?{requestId}:{})}),
};
export async function readAssistantEvents(response:Response,onEvent:(event:string,data:any)=>void,check:()=>void=()=>{}){
 if(!response.body)throw Object.assign(new Error('Empty stream'),{code:'stream_interrupted'});const reader=response.body.getReader(),decoder=new TextDecoder();let pending='',completed=false;
 try{while(true){const chunk=await reader.read();check();pending=(pending+decoder.decode(chunk.value,{stream:!chunk.done})).replace(/\r\n/g,'\n');let boundary;
  while((boundary=pending.indexOf('\n\n'))>=0){const frame=pending.slice(0,boundary);pending=pending.slice(boundary+2);const event=frame.split('\n').find(x=>x.startsWith('event:'))?.slice(6).trim()??'message';const text=frame.split('\n').filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trimStart()).join('\n');if(text){check();onEvent(event,JSON.parse(text));if(event==='done'){completed=true;return;}}}
  if(pending.length>3*1024*1024)throw Error('Reply too large');if(chunk.done)break;
 }if(!completed)throw Object.assign(new Error('Incomplete stream'),{code:'stream_interrupted'});}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export async function streamAssistantTurn(c:Conversation,body:Record<string,unknown>,signal:AbortSignal,onEvent:(event:string,data:any)=>void){
 const epoch=clientSessionEpoch(),response=await fetchInSession(fetch,base+'/'+c.id+'/turns',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});if(!response.ok)return failure(response);
 if(response.headers.get('Content-Type')?.includes('application/json')){const value=await response.json();assertSessionEpoch(epoch);onEvent('done',value);return;}
 await readAssistantEvents(response,onEvent,()=>assertSessionEpoch(epoch));
}
