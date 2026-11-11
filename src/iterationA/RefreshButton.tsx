import {RefreshCw} from 'lucide-react';
import type {ComponentPropsWithoutRef} from 'react';
export function RefreshButton({children,className='',...props}:ComponentPropsWithoutRef<'button'>){
 const label=props['aria-label']??(typeof children==='string'?children:'刷新');
 return <button type="button" {...props} aria-label={label} title={props.title??label} className={'business-refresh '+className}><RefreshCw size={18} aria-hidden="true"/></button>;
}
