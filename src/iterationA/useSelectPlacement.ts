import {useEffect} from 'react';
export function useSelectPlacement(){
 useEffect(()=>{
  if(!CSS.supports('appearance','base-select'))return;
  const prepare=(event:Event)=>{
   const select=event.target;if(!(select instanceof HTMLSelectElement)||select.multiple||select.matches(':open'))return;
   if(event instanceof KeyboardEvent&&!['ArrowDown','ArrowUp',' ','Enter','F4'].includes(event.key))return;
   const minimum=Math.min(200,window.innerHeight/3);
   if(window.innerHeight-select.getBoundingClientRect().bottom<minimum)select.scrollIntoView({block:'center',behavior:'instant'});
   select.style.setProperty('--business-picker-height',Math.max(80,Math.min(320,window.innerHeight-select.getBoundingClientRect().bottom-12))+'px');
  };
  document.addEventListener('pointerdown',prepare,true);document.addEventListener('keydown',prepare,true);
  return()=>{document.removeEventListener('pointerdown',prepare,true);document.removeEventListener('keydown',prepare,true);};
 },[]);
}
