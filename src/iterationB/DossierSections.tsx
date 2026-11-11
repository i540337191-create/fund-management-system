import {useEffect,useId,useState,type ReactNode} from 'react';

export type DossierSection={id:string;label:string;content:ReactNode};

// Keep visited sections mounted so switching the directory preserves drafts and dialogs.
export function DossierSections({label,items,initial,queryKey,value,onSelect}: {label:string;items:DossierSection[];initial?:string|(()=>string);queryKey?:string;value?:string;onSelect?:(id:string)=>void}){
 const read=()=>{const fallback=typeof initial==='function'?initial():initial;return queryKey?new URLSearchParams(window.location.search).get(queryKey)??fallback??items[0]?.id:fallback??items[0]?.id;};
 const prefix=useId(),[selected,setSelected]=useState(read),[visited,setVisited]=useState(()=>new Set([read()]));
 useEffect(()=>{if(!queryKey){if(initial){const id=read();setSelected(id);setVisited(previous=>new Set([...previous,id]));}return;}const sync=()=>{const id=read();setSelected(id);setVisited(previous=>new Set([...previous,id]));};window.addEventListener('popstate',sync);return()=>window.removeEventListener('popstate',sync);},[queryKey,initial]);
 useEffect(()=>{if(value)setVisited(previous=>new Set([...previous,value]));},[value]);
 const current=value??selected;
 const active=items.some(item=>item.id===current)?current:items[0]?.id;
 return <div className="dossier-sections">
  <nav className="dossier-section-directory" aria-label={label}>
   {items.map(item=><button key={item.id} type="button" data-ui="navigation" aria-current={active===item.id?'page':undefined} aria-controls={`${prefix}-${item.id}`} onClick={()=>{onSelect?.(item.id);setSelected(item.id);setVisited(previous=>new Set([...previous,item.id]));if(queryKey){const url=new URL(window.location.href);url.searchParams.set(queryKey,item.id);history.replaceState({},'',url);}}}>{item.label}</button>)}
  </nav>
  <div className="dossier-section-panels">{items.map(item=><section key={item.id} id={`${prefix}-${item.id}`} aria-label={item.label} hidden={active!==item.id}>{active===item.id||visited.has(item.id)?item.content:null}</section>)}</div>
 </div>;
}
