import {useEffect, type RefObject} from 'react';

export function menuDismissHandlers(element:HTMLElement,onClose:()=>void){
 return {
  pointerdown:(event:PointerEvent)=>{if(event.button===0&&!element.contains(event.target as Node))onClose();},
  keydown:(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();element.querySelector<HTMLElement>('summary,button,input')?.focus({preventScroll:true});}},
  scroll:(event:Event)=>{if(!element.contains(event.target as Node)){onClose();element.querySelector<HTMLElement>('summary,button,input')?.focus({preventScroll:true});}},
 };
}
export function useMenuDismiss(ref:RefObject<HTMLElement>,onClose:()=>void,open:boolean){
 useEffect(()=>{
  const element=ref.current;if(!open||!element)return;
  const handlers=menuDismissHandlers(element,onClose),doc=element.ownerDocument;
  doc.addEventListener('pointerdown',handlers.pointerdown,true);
  doc.addEventListener('keydown',handlers.keydown,true);
  doc.addEventListener('scroll',handlers.scroll,true);
  return()=>{doc.removeEventListener('pointerdown',handlers.pointerdown,true);doc.removeEventListener('keydown',handlers.keydown,true);doc.removeEventListener('scroll',handlers.scroll,true);};
 },[ref,onClose,open]);
}
