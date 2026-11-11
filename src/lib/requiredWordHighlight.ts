// Paint the word without replacing React-owned text nodes or changing stored content.
export function initializeRequiredWordHighlight(){
 if(typeof Highlight==='undefined'||!CSS.highlights)return()=>{};
 const highlight=new Highlight();
 CSS.highlights.set('required-word',highlight);
 let frame=0;
 const refresh=()=>{
  frame=0;highlight.clear();
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  let node:Node|null;
  while((node=walker.nextNode())){
   if(node.parentElement?.closest('script,style,textarea,input,[contenteditable="true"]'))continue;
   const text=node.textContent??'';
   for(let start=text.indexOf('必填');start!==-1;start=text.indexOf('必填',start+2)){
    const range=document.createRange();range.setStart(node,start);range.setEnd(node,start+2);highlight.add(range);
   }
  }
 };
 const observer=new MutationObserver(()=>{if(!frame)frame=requestAnimationFrame(refresh);});
 observer.observe(document.body,{childList:true,characterData:true,subtree:true});refresh();
 return()=>{observer.disconnect();cancelAnimationFrame(frame);CSS.highlights.delete('required-word');};
}
