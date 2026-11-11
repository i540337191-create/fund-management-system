import type {ReactNode} from 'react';
import {LockKeyhole} from 'lucide-react';
import {materialReferencePresentation,type MaterialReference} from '../lib/materialReference';
export function MaterialReferenceLink({material,children,className='text-gold'}:{material:MaterialReference;children?:ReactNode;className?:string}){
 const view=materialReferencePresentation(material);
 return view.href?<a className={className} href={view.href} target="_blank" rel="noreferrer">{children??view.label}</a>:<span className="inline-flex max-w-full items-baseline gap-2 text-sm leading-6 text-[var(--secondary)]" title={view.title}><LockKeyhole size={13} className="shrink-0 self-center" aria-hidden="true"/><span>{view.label}</span></span>;
}
