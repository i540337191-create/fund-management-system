import {useLayoutEffect,useRef,type RefObject} from 'react';

export function retainedPageHeight(scrollY:number,viewportHeight:number,mainTop:number){
 return Math.max(0,Math.ceil(Math.max(0,scrollY)+viewportHeight-mainTop));
}

export function usePageScrollRetention(main:RefObject<HTMLElement|null>,enabled:boolean,pageKey:string){
 const position=useRef({x:typeof window==='undefined'?0:window.scrollX,y:typeof window==='undefined'?0:window.scrollY});
 const previousPage=useRef(pageKey);
 useLayoutEffect(()=>{
  if(previousPage.current!==pageKey){position.current={x:0,y:0};previousPage.current=pageKey;window.scrollTo({left:0,top:0,behavior:'instant'});}
  const element=main.current;if(!element||!enabled)return;
  const previousHeight=element.style.minHeight,previousAnchor=element.style.overflowAnchor;
  const reserve=(y:number)=>{const top=element.getBoundingClientRect().top+window.scrollY;element.style.minHeight=retainedPageHeight(y,window.innerHeight,top)+'px';};
  // Keep enough document height for the viewport while a panel briefly renders a loading/empty state.
  const remember=()=>{position.current={x:window.scrollX,y:window.scrollY};reserve(position.current.y);};
  element.style.overflowAnchor='none';reserve(position.current.y);
  window.scrollTo({left:position.current.x,top:position.current.y,behavior:'instant'});
  window.addEventListener('scroll',remember,{passive:true});window.addEventListener('resize',remember);
  document.addEventListener('pointerdown',remember,true);document.addEventListener('click',remember,true);
  return()=>{window.removeEventListener('scroll',remember);window.removeEventListener('resize',remember);document.removeEventListener('pointerdown',remember,true);document.removeEventListener('click',remember,true);element.style.minHeight=previousHeight;element.style.overflowAnchor=previousAnchor;};
 },[enabled,main,pageKey]);
}
