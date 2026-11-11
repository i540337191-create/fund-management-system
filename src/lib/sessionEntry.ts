// An explicit exit must not be undone by the local development auto-login handshake.
type EntryStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const key='fundapp.session.explicit-signout.v1';
export function createSessionEntry(storage:()=>EntryStorage,search:()=>string){
 let exited=false;
 return {
  isSignedOut(){
   if(exited||new URLSearchParams(search()).get('signedOut')==='1')return true;
   try{return storage().getItem(key)==='1';}catch{return false;}
  },
  signOut(){
   exited=true;
   try{storage().setItem(key,'1');return '/';}catch{return '/?signedOut=1';}
  },
  resume(){exited=false;try{storage().removeItem(key);}catch{/* The URL fallback is removed by the successful login navigation. */}}
 };
}
export const sessionEntry=createSessionEntry(()=>window.sessionStorage,()=>window.location.search);
