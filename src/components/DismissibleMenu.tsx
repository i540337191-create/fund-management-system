import {useRef,useState,type ReactNode} from 'react';
import {useMenuDismiss} from '../lib/useMenuDismiss';

export function DismissibleMenu({className,children}:{className?:string;children:ReactNode}){
 const menu=useRef<HTMLDetailsElement>(null),[open,setOpen]=useState(false);
 const close=()=>{if(menu.current)menu.current.open=false;};
 useMenuDismiss(menu,close,open);
 return <details ref={menu} className={'dismissible-menu '+(className??'')} onToggle={event=>setOpen(event.currentTarget.open)} onClick={event=>{if((event.target as Element).closest('button,a'))close();}}>{children}</details>;
}
