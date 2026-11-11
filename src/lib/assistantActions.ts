import {internalBusinessPath} from './internalNavigation.ts';
import type {Conversation} from './assistantClient.ts';
export type AssistantActionCard={batchEligible?:boolean;id:string;title:string;details:{label:string;before:unknown;after:unknown}[];state:'pending'|'applied'|'cancelled';result?:unknown;resultHref?:string;createdAt:string};
export type AssistantOperation={kind:'propose'|'confirm'|'cancel'|'stop'|'refresh';body?:{requestId:string;expectedRevision:number;instruction:string;projectId?:string;materialIds?:string[]};actionId?:string;accepted?:boolean;clarification?:string};
export function actionText(value:unknown,empty='未设置'):string{
 if(value===null||value===undefined||value==='')return empty;if(typeof value==='boolean')return value?'是':'否';if(typeof value==='number')return Number.isFinite(value)?String(value):'待核对';if(Array.isArray(value))return value.every(x=>['string','number','boolean'].includes(typeof x))?value.map(x=>actionText(x)).join('、')||'无':'详见业务档案';if(typeof value!=='string')return '详见业务档案';
 return value.replace(/\b(?:user|project|fund|task|material|audit|conversation|action)-[A-Za-z0-9_.:-]+\b/g,'所选对象').replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,'所选对象');
}
export function actionCards(value:unknown):AssistantActionCard[]{if(!Array.isArray(value))return [];return value.filter((x):x is AssistantActionCard=>Boolean(x&&typeof x==='object'&&typeof x.id==='string'&&typeof x.title==='string'&&['pending','applied','cancelled'].includes(x.state)&&Array.isArray(x.details))).map(x=>({...x,details:x.details.filter(d=>d&&typeof d.label==='string'&&!/^(?:id|.*Id|.*_id|requestId|revision|fingerprint|payload)$/i.test(d.label))}));}
export function actionPresentation(card:AssistantActionCard){
 const name=card.details.find(d=>['名称','标题'].includes(d.label)&&typeof d.after==='string'&&d.after.trim());
 // A changed existing name stays in the field list so its previous value remains visible.
 const fields=card.details.filter(d=>d!==name||Boolean(d.before&&d.before!=='未填写'&&d.before!==d.after));
 const extra=card.title==='创建任务'?fields.filter(d=>!['项目','基金','负责人','责任人','截止日期','优先级'].includes(d.label)&&!(d.before&&d.before!=='未填写'&&d.before!==d.after)):[];
 return {heading:actionText(name?.after??card.title),fields:fields.filter(d=>!extra.includes(d)),extra};
}
export function actionFailure(error:unknown){const {status,code}=(error??{}) as {status?:number;code?:string};if(status===401||code==='client_session_changed'||code==='session_context_changed')return '登录身份已变化，请重新打开对话后核对办理结果。';if(status===403)return '当前账号没有办理此项业务的权限，请核对对象与授权范围。';if(status===409)return '业务记录或对话已更新，请刷新记录后重新核对确认卡。';if(status===400)return '办理指令尚不完整或不适用，请核对对象、字段和具体要求。';return '暂未确认办理结果。请保留本次操作并原样重试，避免重复办理。';}
// Once a mutation is acknowledged, retries only refresh its persisted result; they never propose a second request.
export async function runAssistantOperation(op:AssistantOperation,io:{mutate:()=>Promise<unknown>;refresh:()=>Promise<{conversation:Conversation;actions:AssistantActionCard[]}>;current:()=>boolean;apply:(value:{conversation:Conversation;actions:AssistantActionCard[]})=>Promise<void>|void}){
 if(!op.accepted){const receipt=await io.mutate();op.accepted=true;if(receipt&&typeof receipt==='object'&&typeof (receipt as {clarification?:unknown}).clarification==='string')op.clarification=(receipt as {clarification:string}).clarification;}
 if(!io.current())return;const result=await io.refresh();if(!io.current())return;await io.apply(result);
}

export function actionResultLink(href:unknown,origin:string){if(typeof href!=='string')return null;if(/^\/api\/ai\/conversations\/[0-9a-f-]+\/actions\/[0-9a-f-]+\/document$/i.test(href))return {href,download:true};const path=internalBusinessPath(href,origin);return path?{href:path,download:false}:null;}
