import {AsyncLocalStorage} from 'node:async_hooks';
// Reentrant within one operation; unrelated HTTP requests must wait for ACL changes and writes in order.
export function objectLock(acquire?:()=>Promise<()=>Promise<void>>){
 const active=new AsyncLocalStorage<boolean>();let tail=Promise.resolve();
 return async<T>(action:()=>Promise<T>):Promise<T>=>{
  if(active.getStore())return action();
  if(acquire){const release=await acquire();try{return await active.run(true,action);}finally{await release();}}
  let release!:()=>void;const next=new Promise<void>(r=>{release=r;}),prior=tail;tail=next;
  await prior;try{return await active.run(true,action);}finally{release();}
 };
}
