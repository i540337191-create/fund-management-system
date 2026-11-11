import {randomUUID} from 'node:crypto';
export type BusinessNotice={id:string;sourceKey:string;recipientId:string;kind:'assigned'|'result'|'settled';token?:string;recovered?:boolean;title:string;text:string;tone:'red'|'yellow'|'green';href:string;taskId?:string;projectId?:string;fundId?:string;lpSensitive?:boolean;actorId:string;createdAt:string};
const staged=new WeakMap<object,BusinessNotice[]>();
export function stageNotices(state:object,events:Omit<BusinessNotice,'id'|'createdAt'>[]){if(events.length)staged.set(state,[...(staged.get(state)??[]),...events.map(e=>({...e,id:randomUUID(),createdAt:new Date().toISOString()}))]);}
export function takeNotices(state:object){const events=staged.get(state)??[];staged.delete(state);return events;}
