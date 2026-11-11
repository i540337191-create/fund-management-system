import {useEffect,useRef,type ReactNode} from 'react';
import {capitalHashTarget,revealCapitalTarget} from './capitalNavigation';
import {ChevronDown} from 'lucide-react';
import './capital.css';

// Native disclosure keeps mounted business forms and their close guards intact.
export function CapitalSection({title,description,children,initialOpen=false,id}:{title:string;description:string;children:ReactNode;initialOpen?:boolean;id:string}){
 const section=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{
  const reveal=(hash:string)=>{
   const target=capitalHashTarget(hash);
   const node=target?document.getElementById(target):null;
   if(node&&section.current?.contains(node))revealCapitalTarget(target);
  };
  const syncHash=()=>reveal(window.location.hash);
  const followLink=(event:MouseEvent)=>{
   if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
   const link=event.target instanceof Element?event.target.closest('a[href]'):null;
   if(!(link instanceof HTMLAnchorElement)||link.hasAttribute('download')||link.target&&link.target!=='_self')return;
   const url=new URL(link.href,window.location.href);
   if(url.origin===window.location.origin&&url.pathname===window.location.pathname&&url.search===window.location.search)reveal(url.hash);
  };
  syncHash();
  window.addEventListener('hashchange',syncHash);
  window.addEventListener('popstate',syncHash);
  document.addEventListener('click',followLink);
  return()=>{window.removeEventListener('hashchange',syncHash);window.removeEventListener('popstate',syncHash);document.removeEventListener('click',followLink);};
 },[]);
 return <details ref={section} id={id} className="capital-business-section" open={initialOpen}>
  <summary><ChevronDown size={20} aria-hidden="true"/><strong>{title}</strong><span className="capital-business-description">{description}</span><span className="capital-business-toggle"><span className="capital-when-closed">展开</span><span className="capital-when-open">收起</span></span></summary>
  <div className="capital-business-content">{children}</div>
 </details>;
}
