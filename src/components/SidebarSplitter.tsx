import {useLayoutEffect,useRef,useState} from 'react';
import {GripHorizontal} from 'lucide-react';
import {clampNavHeight,defaultNavHeight,minNavHeight,readNavHeight,saveNavHeight} from '../lib/sidebarHeight';

export function SidebarSplitter({storageKey}:{storageKey:string}){
 const handle=useRef<HTMLDivElement>(null),drag=useRef<{id:number;y:number;height:number}|null>(null);
 const [preferred,setPreferred]=useState(()=>readNavHeight(storageKey)),[maximum,setMaximum]=useState(defaultNavHeight),[dragging,setDragging]=useState(false);
 const height=clampNavHeight(preferred,maximum),latest=useRef(height);latest.current=height;
 useLayoutEffect(()=>{
  const side=handle.current!.parentElement!,nav=side.querySelector<HTMLElement>(':scope > .atelier-navigation')!,history=side.querySelector<HTMLElement>(':scope > .sidebar-history-scroll')!;
  const measure=()=>{
   if(!side.clientHeight)return;
   const fixed=Array.from(side.children).filter(x=>x!==nav&&x!==history).reduce((sum,x)=>sum+x.getBoundingClientRect().height,0);
   setMaximum(Math.max(minNavHeight,Math.floor(side.clientHeight-fixed-parseFloat(getComputedStyle(history).minHeight))));
  };
  const observer=new ResizeObserver(measure);observer.observe(side);
  Array.from(side.children).filter(x=>x!==nav&&x!==history).forEach(x=>observer.observe(x));measure();
  return()=>{observer.disconnect();side.style.removeProperty('--agent-nav-height');side.classList.remove('is-nav-resizing');if(drag.current)saveNavHeight(storageKey,latest.current);};
 },[storageKey]);
 useLayoutEffect(()=>{handle.current!.parentElement!.style.setProperty('--agent-nav-height',`${height}px`);},[height]);
 useLayoutEffect(()=>{handle.current!.parentElement!.classList.toggle('is-nav-resizing',dragging);},[dragging]);
 const change=(value:number,save=false)=>{const next=clampNavHeight(value,maximum);latest.current=next;setPreferred(next);if(save)saveNavHeight(storageKey,next);};
 const finish=()=>{if(!drag.current)return;drag.current=null;setDragging(false);saveNavHeight(storageKey,latest.current);};
 return <div ref={handle} className="agent-sidebar-resizer" role="separator" aria-label="调整导航与历史区域高度" aria-orientation="horizontal" aria-controls="agent-business-navigation" aria-valuemin={minNavHeight} aria-valuemax={maximum} aria-valuenow={height} aria-valuetext={`导航区域高度 ${height} 像素`} tabIndex={0} title="上下拖动调整，位置自动保存；也可使用上下方向键" data-dragging={dragging||undefined}
  onPointerDown={e=>{if(e.button!==0||!e.isPrimary)return;e.preventDefault();e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);drag.current={id:e.pointerId,y:e.clientY,height};setDragging(true);}}
  onPointerMove={e=>{const start=drag.current;if(start?.id===e.pointerId)change(start.height+e.clientY-start.y);}}
  onPointerUp={e=>{if(drag.current?.id!==e.pointerId)return;finish();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
  onPointerCancel={finish} onLostPointerCapture={finish}
  onKeyDown={e=>{const values:Record<string,number>={ArrowDown:height+24,ArrowUp:height-24,PageDown:height+80,PageUp:height-80,Home:minNavHeight,End:maximum};if(Object.prototype.hasOwnProperty.call(values,e.key)){e.preventDefault();change(values[e.key],true);}}}>
  <GripHorizontal size={16} aria-hidden="true"/>
 </div>;
}
