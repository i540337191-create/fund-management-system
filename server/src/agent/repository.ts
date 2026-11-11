import {isDeepStrictEqual} from 'node:util';
import {withDbClient} from '../db/client.ts';
import {emptyAgentState,type AgentState} from './model.ts';
export class AgentRepository{
 private listeners=new Set<(owners:string[])=>void>();
 subscribe(listener:(owners:string[])=>void){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
 private changed(before:AgentState,after:AgentState){const old=new Map((before.notifications??[]).map(n=>[n.id,JSON.parse(JSON.stringify(n))]));const owners=new Set(after.notifications.filter(n=>!isDeepStrictEqual(old.get(n.id),JSON.parse(JSON.stringify(n)))).map(n=>n.ownerId));for(const n of before.notifications??[])if(!after.notifications.some(x=>x.id===n.id))owners.add(n.ownerId);if(owners.size)for(const listener of this.listeners)try{listener([...owners]);}catch{};}
 private state:AgentState=emptyAgentState();private tail:Promise<unknown>=Promise.resolve();
 private databaseUrl?:string;
 constructor(databaseUrl?:string){this.databaseUrl=databaseUrl;}
 async transaction<T>(fn:(state:AgentState)=>T|Promise<T>):Promise<T>{
  const execute=async()=>{
   // JSONB reorders object keys; compare persisted values so reads do not become writes.
   if(this.databaseUrl)return withDbClient(async client=>{await client.query('begin');try{await client.query("insert into agent_workspace_state(id,data) values ('workspace',$1::jsonb) on conflict(id) do nothing",[JSON.stringify(emptyAgentState())]);const row=await client.query("select data from agent_workspace_state where id='workspace' for update");const original=structuredClone(row.rows[0].data),state=upgradeState({...emptyAgentState(),...row.rows[0].data} as AgentState),result=await fn(state);if(!isDeepStrictEqual(JSON.parse(JSON.stringify(state)),original))await client.query("update agent_workspace_state set data=$1::jsonb,updated_at=now() where id='workspace'",[JSON.stringify(state)]);await client.query('commit');this.changed(original as AgentState,state);return structuredClone(result);}catch(e){await client.query('rollback');throw e;}},this.databaseUrl);
   const copy=upgradeState(structuredClone(this.state)),result=await fn(copy);const before=this.state;this.state=copy;this.changed(before,copy);return structuredClone(result);
  };
  const result=this.tail.then(execute);this.tail=result.catch(()=>{});return result;
 }
}

function upgradeState(state:AgentState){let changed=false;for(const skill of emptyAgentState().skills){const existing=state.skills.find(x=>x.id===skill.id);if(!existing){state.skills.push(skill);changed=true;}else if(existing.builtin&&existing.version===1){for(const key of ['title','description','tools'] as const)if(JSON.stringify(existing[key])!==JSON.stringify(skill[key])){Object.assign(existing,{[key]:skill[key]});changed=true;}}}for(const plugin of emptyAgentState().plugins){const existing=state.plugins.find(x=>x.id===plugin.id&&x.ownerId==='system'&&(x.version??1)===1);if(existing)for(const key of ['title','description'] as const)if(existing[key]!==plugin[key]){existing[key]=plugin[key];changed=true;}}for(const row of [...state.skills,...state.plugins,...state.schedules,...state.tasks,...state.reminders,...state.memories,...state.templates,...state.weeklyReports])if(row.version===undefined){row.version=1;changed=true;}if(changed)state.revision++;return state;}
