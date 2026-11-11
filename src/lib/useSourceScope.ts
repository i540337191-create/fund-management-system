import {useEffect,useRef} from 'react';
// A request for A cannot return into a later A after the user has visited B.
export function useSourceScope(key:string){
 const current=useRef({key,token:Symbol()}),active=useRef(true);
 if(current.current.key!==key)current.current={key,token:Symbol()};
 const token=current.current.token;
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 return ()=>active.current&&current.current.token===token;
}
