import {useRef,useState} from 'react';
import {Search} from 'lucide-react';
import {useMenuDismiss} from '../lib/useMenuDismiss';
import {navigate} from '../components/Layout';
export type SearchTarget={title:string;kind:string;href:string;keywords?:string};
export const moduleTargets:SearchTarget[]=[['工作台','/dashboard','首页'],['基金管理','/funds','募集 LP 基金'],['项目管理','/projects','企业 投资 项目'],['资金与费用','/capital','账户 资金 费用 收款 付款'],['资料库','/materials','文件 文档 原件 资料'],['任务中心','/tasks','待办 任务 提醒'],['风险监控','/monitoring','风险 预警'],['报告中心','/reports','报告'],['系统设置','/settings','设置 账号 模板 字段'],['会议纪要','/meetings','会议 纪要'],['AI收件箱','/ai-inbox','收件箱 收件'],['工作周报','/ai-assistant/weekly','周报']].map(([title,href,keywords])=>({title,href,keywords,kind:'业务模块'}));
export function searchTargets(items:SearchTarget[],query:string){const terms=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);return terms.length?items.filter(item=>terms.every(term=>`${item.title} ${item.keywords??''} ${item.kind}`.toLocaleLowerCase().includes(term))):[];}
export function GlobalSearch({items}:{items:SearchTarget[]}){
 const [query,setQuery]=useState(''),[open,setOpen]=useState(false),[index,setIndex]=useState(0);const host=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null);
 const results=searchTargets([...moduleTargets,...items],query),shown=results.slice(0,30);
 const close=()=>setOpen(false);useMenuDismiss(host,close,open);
 const go=(target:SearchTarget)=>{close();navigate(target.href);input.current?.blur();};
 return <div className="global-business-search" ref={host}><form className="atelier-search" role="search" aria-label="系统业务搜索" onSubmit={event=>{event.preventDefault();if(shown[index])go(shown[index]);else setOpen(true);}}><Search size={17} aria-hidden="true"/><input ref={input} value={query} aria-label="搜索系统业务" aria-expanded={open} aria-controls="business-search-results" placeholder="搜索基金、项目、资料或模块" onFocus={()=>{if(query.trim())setOpen(true);}} onChange={event=>{setQuery(event.target.value);setIndex(0);setOpen(Boolean(event.target.value.trim()));}} onKeyDown={event=>{if(event.key==='Escape'){close();input.current?.focus();}if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();setOpen(true);setIndex(value=>Math.max(0,Math.min(shown.length-1,value+(event.key==='ArrowDown'?1:-1))));}}}/></form>{open&&<div id="business-search-results" className="business-search-results" aria-label="业务搜索结果"><p role="status">{results.length?`找到 ${results.length} 项${results.length>30?'，请缩小关键词查看其余结果':''}`:'未找到匹配业务，请调整关键词。'}</p>{shown.map((item,i)=><button type="button" key={item.href+item.title} data-active={i===index} onMouseEnter={()=>setIndex(i)} onClick={()=>go(item)}><span>{item.title}</span><small>{item.kind}</small></button>)}</div>}</div>;
}
