import {useRef} from 'react';
export const dialogNavigationEvent='fundapp:request-dialog-navigation';

type BackdropEvent={target:EventTarget;currentTarget:HTMLElement;button:number;clientX:number;clientY:number};
function outside(event:BackdropEvent){
 if(event.target!==event.currentTarget)return false;
 if(event.currentTarget.tagName!=='DIALOG')return true;
 const box=event.currentTarget.getBoundingClientRect();
 return event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom;
}
export function backdropDismissHandlers(onClose:()=>void,blocked:boolean,started:{current:boolean}){
 return {
  onPointerDown:(event:BackdropEvent)=>{started.current=event.button===0&&outside(event);},
  onPointerCancel:()=>{started.current=false;},
  onClick:(event:BackdropEvent)=>{
   const beganOutside=started.current;started.current=false;
   if(!blocked&&beganOutside&&event.button===0&&outside(event))onClose();
  },
 };
}
export function useBackdropDismiss(onClose:()=>void,blocked=false){
 return backdropDismissHandlers(onClose,blocked,useRef(false));
}
