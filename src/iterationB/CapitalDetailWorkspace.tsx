import {Children,isValidElement,useEffect,useRef,useState,type ReactNode} from 'react';
import {WorkflowDialog} from '../components/MaterialFileDialogs';
import {capitalHashTarget,capitalDetailEvent} from './capitalNavigation';
const tabs=[['capital-investment-ledger','投资批次'],['capital-payments','付款与凭证'],['capital-funds','资金余额与预留'],['capital-returns','退出与回款'],['capital-matters','资金事项']];
function targetPanel(id:string){return tabs.find(([key])=>key===id)?.[0]??(id==='capital-items'||id.startsWith('capital-record-')?'capital-matters':'');}
export function CapitalDetailWorkspace({children,tools,locked}:{children:ReactNode;tools:ReactNode;locked:boolean}){
 const [active,setActive]=useState(()=>targetPanel(capitalHashTarget(window.location.hash))),opener=useRef<HTMLElement|null>(null);
 useEffect(()=>{
  const reveal=(id:string,event?:Event)=>{const target=targetPanel(id);if(!target)return;if(locked&&target!==active){event?.preventDefault();return;}if(event?.type===capitalDetailEvent)history.replaceState({},'',location.pathname+location.search+'#'+id);if(target!==active)if(document.activeElement instanceof HTMLElement&&!document.activeElement.closest('dialog'))opener.current=document.activeElement;setActive(target);requestAnimationFrame(()=>document.getElementById(id)?.scrollIntoView({block:'start'}));};
  const requested=(event:Event)=>reveal((event as CustomEvent<string>).detail,event);
  const hash=()=>{const id=capitalHashTarget(window.location.hash);if(!id&&!locked){setActive('');return;}reveal(id);};
  window.addEventListener(capitalDetailEvent,requested);window.addEventListener('hashchange',hash);window.addEventListener('popstate',hash);
  return()=>{window.removeEventListener(capitalDetailEvent,requested);window.removeEventListener('hashchange',hash);window.removeEventListener('popstate',hash);};
 },[active,locked]);
 useEffect(()=>{const id=capitalHashTarget(window.location.hash);if(targetPanel(id))requestAnimationFrame(()=>document.getElementById(id)?.scrollIntoView({block:'start'}));},[]);
 const close=()=>{if(locked)return;setActive('');if(targetPanel(capitalHashTarget(window.location.hash)))history.replaceState({},'',location.pathname+location.search);requestAnimationFrame(()=>opener.current?.isConnected&&opener.current.focus());};
 const choices=<div className="capital-detail-tabs" role="group" aria-label="选择业务明细">{tabs.map(([id,label])=><button key={id} data-ui="secondary" aria-pressed={active===id} disabled={locked} aria-controls={id} onClick={()=>{if(document.activeElement instanceof HTMLElement&&!document.activeElement.closest('dialog'))opener.current=document.activeElement;if(active===id){close();return;}history.replaceState({},'',location.pathname+location.search+'#'+id);setActive(id);}}>{label}</button>)}</div>;
 return <section className="capital-detail-workspace" aria-label="资金明细办理"><header><strong>财务明细</strong>{choices}<div className="capital-detail-tools">{tools}</div></header><WorkflowDialog title={tabs.find(([id])=>id===active)?.[1]??'财务明细'} open={Boolean(active)} busy={locked} onClose={close} className="capital-finance-drawer">{choices}{locked?<p className="portfolio-note">请先完成或关闭当前办理窗口。</p>:null}{Children.map(children,child=>isValidElement<{id:string}>(child)?<div hidden={child.props.id!==active} className="capital-detail-content">{child}</div>:child)}</WorkflowDialog></section>;
}
