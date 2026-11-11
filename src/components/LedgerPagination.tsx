import {ChevronLeft,ChevronRight} from 'lucide-react';
import {ledgerPageNumbers,ledgerPageSize} from '../lib/ledgerPagination';
import './LedgerPagination.css';
export function LedgerPagination({total,page,onChange,className='',label,statusText,pageSize=ledgerPageSize}:{total:number;page:number;onChange:(page:number)=>void;className?:string;label:string;statusText?:string;pageSize?:number}){
 const pages=Math.max(1,Math.ceil(total/pageSize)),current=Math.max(1,Math.min(page,pages));
 return <nav className={'ledger-pagination '+className} aria-label={label}><span>{statusText??`共 ${total} 条 · 共 ${pages} 页 · 每页 ${pageSize} 条`}</span><div><button type="button" data-ui="secondary" aria-label="上一页" disabled={current===1} onClick={()=>onChange(current-1)}><ChevronLeft size={16}/></button>{ledgerPageNumbers(total,current,pageSize).map((n,i)=>n==='gap'?<span className="ledger-page-gap" key={'gap'+i}>…</span>:<button type="button" data-ui="secondary" key={n} aria-label={`第 ${n} 页`} aria-current={n===current?'page':undefined} onClick={()=>onChange(n)}>{n}</button>)}<button type="button" data-ui="secondary" aria-label="下一页" disabled={current===pages} onClick={()=>onChange(current+1)}><ChevronRight size={16}/></button></div></nav>;
}
