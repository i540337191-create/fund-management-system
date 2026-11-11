import {useState,type ReactNode} from 'react';
import {ChevronRight} from 'lucide-react';
import {WorkflowDialog} from './MaterialFileDialogs';
import './ConfigurationDisclosure.css';

// Keep controls mounted so closing the drawer retains drafts and form validation.
export function ConfigurationDisclosure({title,summary,children,className='',busy=false,initialOpen=false,open:controlledOpen,onOpenChange}:{open?:boolean;onOpenChange?:(open:boolean)=>void;title:string;summary?:ReactNode;children:ReactNode;className?:string;busy?:boolean;initialOpen?:boolean}){
 const [localOpen,setLocalOpen]=useState(initialOpen);
 const open=controlledOpen??localOpen,setOpen=onOpenChange??setLocalOpen;
 return <div className={`configuration-disclosure ${className}`}>
  <button className="configuration-trigger" data-ui="secondary" type="button" disabled={busy} aria-expanded={open} onClick={()=>setOpen(true)}><ChevronRight size={16} aria-hidden="true"/>{summary??title}</button>
  <WorkflowDialog open={open} title={title} className="configuration-drawer" busy={busy} onClose={()=>setOpen(false)}><div className="configuration-drawer-content" onInvalidCapture={event=>{event.preventDefault();const field=event.target as HTMLInputElement;const first=field.form?.querySelector('input:invalid,select:invalid,textarea:invalid');if(first&&first!==field)return;setOpen(true);requestAnimationFrame(()=>{field.focus();field.scrollIntoView({block:'center'});});}}>{children}</div></WorkflowDialog>
 </div>;
}
