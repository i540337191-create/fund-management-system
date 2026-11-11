export const capitalDetailEvent='fundapp:capital-detail';
export function revealCapitalTarget(id:string){
 const event=new CustomEvent(capitalDetailEvent,{detail:id,cancelable:true});
 if(!window.dispatchEvent(event))return;
 const target=document.getElementById(id);
 if(!target)return;
 let parent:HTMLElement|null=target;
 while(parent){
  if(parent instanceof HTMLDetailsElement)parent.open=true;
  parent=parent.parentElement;
 }
 target.scrollIntoView({block:'start'});
}

export function capitalHashTarget(hash:string){
 try{return decodeURIComponent(hash.replace(/^#/,''));}catch{return '';}
}
