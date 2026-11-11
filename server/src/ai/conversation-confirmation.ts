import {createHash} from 'node:crypto';
import {batchEligible} from './batch-actions.ts';
import type {AssistantProposal} from '../http/assistant-actions.ts';
import type {AgentProposal} from '../agent/model.ts';

export type ConfirmationItem={kind:'business'|'workspace';id:string;fingerprint:string;title:string;summary:string};
export type ConversationConfirmation={sourceRequestId:string;scope:string;items:ConfirmationItem[]};
export function confirmationIntent(prompt:unknown){
 if(typeof prompt!=='string')return null;
 const text=prompt.trim().replace(/[。！!]+$/u,'');
 if(['确认执行以上变更','确认执行这些操作','确认保存以上修改','确认发布以上模板变更'].includes(text))return 'confirm' as const;
 if(['取消以上变更','取消这些操作','取消本次修改'].includes(text))return 'cancel' as const;
 return null;
}
export function confirmationScope(value:{fundId?:unknown;projectId?:unknown;materialIds?:unknown}){
 return JSON.stringify({fundId:value.fundId??null,projectId:value.projectId??'',materialIds:Array.isArray(value.materialIds)?[...value.materialIds].sort():[]});
}
function canonical(value:unknown):unknown{
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>[key,canonical(v)]));
 return value;
}
export function confirmationFingerprint(kind:ConfirmationItem['kind'],proposal:AssistantProposal|AgentProposal){
 const p=proposal as any;
 const content=kind==='business'?{kind:p.kind,title:p.title,path:p.path,method:p.method,body:p.body,details:p.details,dependencies:p.dependencies}:{action:p.action,title:p.title,data:p.data,preview:p.preview,sourceConversationId:p.sourceConversationId,sourceRequestId:p.sourceRequestId};
 return createHash('sha256').update(JSON.stringify(canonical(content))).digest('hex');
}
const workspaceActions=new Set(['apply_template']);
const fieldLabels:Record<string,string>={title:'名称',objectType:'业务对象',stage:'适用阶段',fields:'字段',materials:'材料要求',dueAt:'截止时间',nextAt:'执行时间',recurrence:'重复安排',intervalMinutes:'间隔分钟',note:'说明',text:'内容',description:'说明',instructions:'工作方法',prompt:'执行要求',week:'周次',thisWeek:'本周工作',nextWeek:'下周计划',enabled:'启用',scope:'共享范围',appliesTo:'适用范围',effectiveFrom:'生效时间',effectiveUntil:'失效时间'};
function display(value:unknown):string{
 if(value===null||value===undefined)return '无';if(typeof value==='boolean')return value?'是':'否';
 if(Array.isArray(value))return value.map(display).join('；');
 if(typeof value==='object')return Object.entries(value).filter(([key])=>!['id','version','schemaRevision','expectedSchemaRevision'].includes(key)).map(([key,v])=>`${({label:'字段名',title:'名称',type:'类型',required:'必填',enabled:'启用',options:'选项',condition:'适用条件',instructions:'说明'} as Record<string,string>)[key]??key}：${display(v)}`).join('，');
 return ({organization:'团队',personal:'个人',project:'项目',fund:'基金',company:'企业',lp:'投资者',report:'报告',text:'文字',number:'数字',date:'日期',boolean:'是/否',choice:'选择'} as Record<string,string>)[String(value)]??String(value);
}
export function workspaceConfirmationSummary(p:AgentProposal){
 if(p.preview)return `模板名称：${String(p.data.title??p.title)}；当前版本：${p.preview.previousVersion??'新建'}；发布后启用：是；默认模板：${display(p.data.isDefault===true)}\n适用：${display(p.preview.objectType)} / ${p.preview.stage}（该业务类型的对应阶段，不仅限当前项目）\n`+p.preview.changes.map(c=>`${c.before===null?'新增':c.after===null?'移除':'修改'}${c.kind}：${display(c.before)} → ${display(c.after)}`).join('\n')+'\n'+p.preview.impact;
 return Object.entries(p.data).filter(([key])=>Object.hasOwn(fieldLabels,key)).map(([key,value])=>`${fieldLabels[key]}：${display(value)}`).join('\n');
}
export function createConfirmationOffer(sourceRequestId:string,scope:string,business:AssistantProposal[],workspace:AgentProposal[]){
 const items:ConfirmationItem[]=[...business.filter(p=>p.state==='pending'&&batchEligible(p)).map(p=>({kind:'business' as const,id:p.id,title:p.title,fingerprint:confirmationFingerprint('business',p),summary:p.details.map(d=>`${d.label}：${d.before} → ${d.after}`).join('\n')})),...workspace.filter(p=>p.state==='pending'&&workspaceActions.has(p.action)&&!!p.preview).map(p=>({kind:'workspace' as const,id:p.id,title:p.title,fingerprint:confirmationFingerprint('workspace',p),summary:workspaceConfirmationSummary(p)}))];
 // Large or unresolved changes stay on the existing individual confirmation cards.
 if(!items.length||items.length>8||items.some(x=>!x.summary)||JSON.stringify(items).length>16000)return undefined;
 return {sourceRequestId,scope,items};
}
export function confirmationOfferText(offer:ConversationConfirmation){
 const escape=(text:string)=>text.replace(/[\\`*_{}\[\]()<>!|#]/g,'\\$&');
 return '\n\n待你确认的变更：\n'+offer.items.map((x,i)=>`${i+1}. ${escape(x.title)}\n${escape(x.summary)}`).join('\n\n')+'\n\n核对后可回复“确认执行以上变更”，或回复“取消以上变更”。这只适用于上面列出的内容；审批决定、银行操作、权限变更等仍需逐项确认。';
}
