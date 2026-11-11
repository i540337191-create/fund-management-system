import type {CustomField,CustomSchema} from './customFields.ts';
const fieldKeys=['label','type','order','required','enabled'] as const;
export function mergeSchemaDraft(base:CustomSchema,draft:CustomField[],latest:CustomSchema){
 const original=new Map(base.fields.map(f=>[f.id,f])),local=new Map(draft.map(f=>[f.id,f]));
 const fields=latest.fields.map(remote=>{const before=original.get(remote.id),edit=local.get(remote.id);if(!before||!edit)return structuredClone(remote);const next=structuredClone(remote);for(const key of fieldKeys)if(edit[key]!==before[key])Object.assign(next,{[key]:edit[key]});
  const oldOptions=new Map(before.options.map(o=>[o.id,o]));const edits=new Map(edit.options.map(o=>[o.id,o]));
  next.options=remote.options.map(option=>{const prior=oldOptions.get(option.id),changed=edits.get(option.id);return prior&&changed?{...option,...(changed.label!==prior.label?{label:changed.label}:{}),...(changed.enabled!==prior.enabled?{enabled:changed.enabled}:{})}:{...option};});
  const remoteIds=new Set(remote.options.map(o=>o.id));next.options.push(...edit.options.filter(o=>!remoteIds.has(o.id)).map(o=>({...o})));return next;
 });
 const latestIds=new Set(latest.fields.map(f=>f.id));fields.push(...draft.filter(f=>!latestIds.has(f.id)).map(f=>structuredClone(f)));
 return fields.sort((a,b)=>a.order-b.order).map((f,order)=>({...f,order}));
}
export function schemaDraftSignature(fields:CustomField[]){return JSON.stringify(fields.map(f=>[f.id,f.label,f.type,f.order,f.required,f.enabled,f.options.map(o=>[o.id,o.label,o.enabled])]));}
