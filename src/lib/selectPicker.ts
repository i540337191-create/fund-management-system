// Keep the native picker below its trigger, including the last field of a scrollable form.
export function initializeSelectPicker(){
 if(!CSS.supports('appearance','base-select'))return;
 let restore:(()=>void)|undefined;
 const prepare=(event:Event)=>{
  const select=event.target;if(!(select instanceof HTMLSelectElement)||select.multiple||select.size>1||select.disabled||!select.options.length||select.matches(':open'))return;
  if(event instanceof KeyboardEvent&&!(event.key===' '||event.key==='Enter'||event.key==='ArrowDown'||event.key==='ArrowUp'))return;
  restore?.();
  const needed=320,gap=innerHeight-select.getBoundingClientRect().bottom-8;if(gap>=needed)return;
  let container:HTMLElement|null=select.parentElement;
  while(container&&!( /auto|scroll/.test(getComputedStyle(container).overflowY)&&container.scrollHeight>container.clientHeight))container=container.parentElement;
  container??=document.scrollingElement as HTMLElement;
  const target=container,prior=target.style.getPropertyValue('padding-bottom'),priority=target.style.getPropertyPriority('padding-bottom'),scrollTop=target.scrollTop;
  target.style.setProperty('padding-bottom',`${parseFloat(getComputedStyle(target).paddingBottom)+needed+8}px`,'important');
  const offset=Math.max(0,select.getBoundingClientRect().bottom+needed+8-innerHeight),capacity=target.scrollHeight-target.clientHeight-target.scrollTop;
  if(offset>capacity)target.style.setProperty('padding-bottom',`${parseFloat(getComputedStyle(target).paddingBottom)+offset-capacity}px`,'important');
  target.scrollTop+=Math.max(0,select.getBoundingClientRect().bottom+needed+8-innerHeight);
  let frame=0,opened=false,checks=0;
  const cleanup=()=>{cancelAnimationFrame(frame);if(prior)target.style.setProperty('padding-bottom',prior,priority);else target.style.removeProperty('padding-bottom');target.scrollTop=scrollTop;restore=undefined;};
  restore=cleanup;
  const observe=()=>{const open=select.isConnected&&select.matches(':open');opened||=open;if((opened&&!open)||!select.isConnected||++checks>120&&!open)cleanup();else frame=requestAnimationFrame(observe);};
  frame=requestAnimationFrame(observe);
 };
 document.addEventListener('pointerdown',prepare,true);document.addEventListener('keydown',prepare,true);
 window.addEventListener('pagehide',()=>restore?.());
}
