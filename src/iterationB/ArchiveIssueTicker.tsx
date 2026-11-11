import {useEffect,useState} from 'react';
import {Megaphone,ChevronLeft,ChevronRight,Pause,Play} from 'lucide-react';
import {RefreshButton} from '../iterationA/RefreshButton';
import {WorkflowDialog} from '../components/MaterialFileDialogs';
import './archiveIssueTicker.css';
export type ArchiveIssue={id:string;label:string;detail?:string;source?:string;open:()=>void};
export function ArchiveIssueTicker({label,items,status,busy,onRefresh,viewLabel='查看提醒'}:{viewLabel?:string;label:string;items:ArchiveIssue[];status:string;busy:boolean;onRefresh:()=>void}){
 const [index,setIndex]=useState(0),[paused,setPaused]=useState(false),[hover,setHover]=useState(false),[expanded,setExpanded]=useState(false),[reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 useEffect(()=>{const q=matchMedia('(prefers-reduced-motion: reduce)'),update=()=>setReduced(q.matches);q.addEventListener('change',update);return()=>q.removeEventListener('change',update);},[]);
 const signature=items.map(i=>i.id).join('|');useEffect(()=>setIndex(0),[signature]);
 useEffect(()=>{if(paused||hover||reduced||items.length<2)return;const timer=setInterval(()=>setIndex(i=>(i+1)%items.length),8000);return()=>clearInterval(timer);},[paused,hover,reduced,items.length]);
 const row=items[index%Math.max(1,items.length)];
 return <><section className="archive-issue-ticker" aria-label={label} onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)} onFocusCapture={()=>setHover(true)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget))setHover(false);}}>
 <strong><Megaphone size={16} aria-hidden="true"/>{label}</strong><div className="archive-issue-message">{row?<button key={row.id} type="button" title={`${row.source??''} ${row.label}\n${row.detail??''}`} onClick={()=>setExpanded(true)}>{row.source?`${row.source} · `:''}{row.label}</button>:<p role="status">{status}</p>}</div>
 <div className="archive-issue-controls">{row?<><span>{index%items.length+1}/{items.length}</span><button type="button" aria-label="上一条重点提醒" disabled={items.length<2} onClick={()=>setIndex(i=>(i+items.length-1)%items.length)}><ChevronLeft size={14}/></button><button type="button" aria-label={paused||reduced?'播放重点提醒':'暂停重点提醒'} onClick={()=>{if(reduced){setReduced(false);setPaused(false);}else setPaused(p=>!p);}}>{paused||reduced?<Play size={14}/>:<Pause size={14}/>}</button><button type="button" aria-label="下一条重点提醒" disabled={items.length<2} onClick={()=>setIndex(i=>(i+1)%items.length)}><ChevronRight size={14}/></button><button type="button" onClick={()=>setExpanded(true)}>{viewLabel}</button></>:null}<RefreshButton aria-label={`重新核查${label}`} disabled={busy} onClick={onRefresh}/></div>
 </section>{expanded?<WorkflowDialog title={label} busy={false} onClose={()=>setExpanded(false)}><p className="text-sm text-[var(--secondary)]">{status}</p>{items.map(item=><article key={item.id} className="archive-issue-detail"><strong>{item.source} · {item.label}</strong>{item.detail?<p>{item.detail}</p>:null}<button type="button" data-ui="secondary" onClick={()=>{setExpanded(false);item.open();}}>前往处理</button></article>)}</WorkflowDialog>:null}</>;
}
