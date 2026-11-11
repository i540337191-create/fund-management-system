export type ComposerDraft={conversationId?:string;input:string;projectId:string;materialIds:string[]};
type DraftStorage=Pick<Storage,'getItem'|'setItem'>;
const prefix=(owner:string)=>'fundapp.agent.composer.v1:'+encodeURIComponent(owner)+':';
export function readComposerDraft(storage:DraftStorage|null,owner:string,conversationId?:string):ComposerDraft|null{
 try{
  const value=JSON.parse(storage?.getItem(prefix(owner)+encodeURIComponent(conversationId??'new'))??'null');
  return value&&value.conversationId===conversationId&&typeof value.input==='string'&&typeof value.projectId==='string'&&Array.isArray(value.materialIds)&&value.materialIds.every((id:unknown)=>typeof id==='string')?value:null;
 }catch{return null;}
}
export function lastComposerConversation(storage:DraftStorage|null,owner:string):string|undefined{
 try{const value=JSON.parse(storage?.getItem(prefix(owner)+'last')??'null');return typeof value==='string'?value:undefined;}catch{return undefined;}
}
export function writeComposerDraft(storage:DraftStorage|null,owner:string,draft:ComposerDraft):boolean{
 if(!storage)return false;
 try{storage.setItem(prefix(owner)+encodeURIComponent(draft.conversationId??'new'),JSON.stringify(draft));storage.setItem(prefix(owner)+'last',JSON.stringify(draft.conversationId??null));return true;}catch{return false;}
}
