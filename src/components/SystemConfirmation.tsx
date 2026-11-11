import {createRoot} from 'react-dom/client';
import {WorkflowDialog} from './MaterialFileDialogs';
import {clientSessionEpoch,subscribeSessionInvalidation} from '../lib/sessionBoundary';

let pending=false;
export function confirmAction(message:string):Promise<boolean>{
 if(pending)return Promise.resolve(false);
 pending=true;
 const epoch=clientSessionEpoch(),host=document.createElement('div');host.dataset.systemConfirm='true';document.body.append(host);
 const root=createRoot(host);
 return new Promise(resolve=>{
  let settled=false;
  const finish=(accepted:boolean)=>{if(settled)return;settled=true;queueMicrotask(()=>{unsubscribe();root.unmount();host.remove();pending=false;resolve(accepted&&clientSessionEpoch()===epoch);});};
  const unsubscribe=subscribeSessionInvalidation(()=>finish(false));
  root.render(<WorkflowDialog title="请确认操作" busy={false} onClose={()=>finish(false)}><div className="system-confirm-body"><p>{message}</p><footer><button data-ui="secondary" autoFocus onClick={()=>finish(false)}>取消返回</button><button data-ui="danger" onClick={()=>finish(true)}>确认继续</button></footer></div></WorkflowDialog>);
 });
}

const replaying=new WeakSet<HTMLElement>();
export function confirmNavigation(event:MouseEvent,message:string){
 const target=event.target instanceof Element?event.target.closest<HTMLElement>('button,a'):null;
 if(!target||target.closest('[data-system-confirm]')||replaying.has(target))return;
 event.preventDefault();event.stopImmediatePropagation();
 void confirmAction(message).then(accepted=>{
  if(!accepted||!target.isConnected)return;
  replaying.add(target);
  try{target.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window,ctrlKey:event.ctrlKey,shiftKey:event.shiftKey,altKey:event.altKey,metaKey:event.metaKey,button:event.button}));}finally{replaying.delete(target);}
 });
}
