import type {Conversation,ConversationSummary} from './assistantClient.ts';

export function conversationHistoryRows(rows:ConversationSummary[],active:Conversation|null,busy:boolean):ConversationSummary[]{
 if(!active)return rows;
 const prior=rows.find(c=>c.id===active.id),row:ConversationSummary={id:active.id,title:active.title==='新对话'?(active.messages.find(m=>m.role==='user')?.content.replace(/\s+/g,' ').slice(0,28)??active.title):active.title,revision:active.revision,updatedAt:active.updatedAt,messageCount:active.messages.length,running:busy||Boolean(active.activeRequestId)||Boolean(prior?.running)};
 return prior?rows.map(c=>c.id===active.id?row:c):[row,...rows];
}
