import {createHash} from 'node:crypto';
import type {AssistantMessage} from './conversations.ts';
export type ContextMemory={version:1;fingerprint:string;summary:string;sourceCount:number;throughId:string;updatedAt:string};
export async function compactContext(messages:AssistantMessage[],scope:string,cached:ContextMemory|undefined,summarize:(source:string)=>Promise<string>){
 const complete=messages.filter(m=>m.status==='complete');
 if(complete.length<=25&&complete.reduce((n,m)=>n+m.content.length,0)<=12000)return {recent:complete,compacted:false as const};
 let cut=Math.max(0,complete.length-13);while(cut<complete.length-1&&complete.slice(cut).reduce((n,m)=>n+m.content.length,0)>12000)cut++;if(complete[cut]?.role==='assistant'&&cut<complete.length-1)cut++;const older=complete.slice(0,cut),recent=complete.slice(cut);
 if(!older.length)return {recent,compacted:false as const};
 const source=JSON.stringify(older.map(m=>({id:m.id,role:m.role,content:m.content}))),fingerprint=createHash('sha256').update(scope+'\n'+source).digest('hex');
 if(cached?.version===1&&cached.fingerprint===fingerprint)return {recent,memory:cached,compacted:true as const};
 const matchesPrefix=cached?.version===1&&cached.sourceCount<=older.length&&createHash('sha256').update(scope+'\n'+JSON.stringify(older.slice(0,cached.sourceCount).map(m=>({id:m.id,role:m.role,content:m.content})))).digest('hex')===cached.fingerprint;
 let summary=matchesPrefix?cached!.summary:'';
 for(let start=matchesPrefix?cached!.sourceCount:0;start<older.length;start+=10){
  const input=JSON.stringify({previousMemory:summary,note:'长消息仅摘取前4000字，完整原文保留，可通过历史检索回查。',messages:older.slice(start,start+10).map(m=>({role:m.role,content:m.content.slice(0,4000)}))});
  summary=(await summarize(input)).trim();if(!summary||summary.length>8000)throw Error('context_summary_invalid');
 }
 return {recent,memory:{version:1 as const,fingerprint,summary,sourceCount:older.length,throughId:older.at(-1)!.id,updatedAt:new Date().toISOString()},compacted:true as const};
}
