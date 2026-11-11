import {useState} from 'react';
import {ArrowRight,Check,ChevronDown,ChevronUp,Clock} from 'lucide-react';
import type {useAgentWorkspace} from '../lib/agentWorkspaceClient';
import {internalBusinessPath} from '../lib/internalNavigation';
import {navigate} from './Layout';
import {notificationGroups,notificationTime} from '../lib/notificationPresentation';
import './NotificationFeed.css';

type Model=Pick<ReturnType<typeof useAgentWorkspace>,'state'|'error'|'busy'|'act'|'pending'|'retry'|'refresh'>;
export function NotificationFeed({model,onNavigate}:{model:Model;onNavigate:()=>void}){
 const {state,error,busy,act,pending,retry,refresh}=model;
 const [onlyUnread,setOnlyUnread]=useState(false),[expanded,setExpanded]=useState<string|null>(null),[more,setMore]=useState<string[]>([]),[linkError,setLinkError]=useState('');
 const blocked=busy||Boolean(pending);
 const groups=notificationGroups(state?.notifications??[],onlyUnread,Date.now(),expanded);
 const expand=async(n:(typeof groups)[number]['items'][number])=>{
  if(expanded===n.id){setExpanded(null);return;}
  setExpanded(n.id);
  if(!n.read)await act('read_notice',{id:n.id});
 };
 const handle=async(n:(typeof groups)[number]['items'][number])=>{
  setLinkError('');
  const path=n.href?internalBusinessPath(n.href,window.location.origin):null;
  if(!path){setLinkError('该提醒的办理入口不可用，请核对原业务记录。');return;}
  if(!n.read&&!await act('read_notice',{id:n.id}))return;
  onNavigate();navigate(path);
 };
 return <div className="notice-feed">
  <div className="notice-feed-toolbar"><div role="group" aria-label="通知阅读状态"><button aria-pressed={!onlyUnread} onClick={()=>{setOnlyUnread(false);setExpanded(null);}}>全部</button><button aria-pressed={onlyUnread} onClick={()=>{setOnlyUnread(true);setExpanded(null);}}>未读</button></div><label className="notice-unread-switch">仅看未读<input type="checkbox" role="switch" checked={onlyUnread} onChange={e=>{setOnlyUnread(e.target.checked);setExpanded(null);}}/></label></div>
  <div className="notice-feed-feedback" role={error||linkError?'alert':'status'}>{error||linkError||(!state?'正在读取通知…':'')}{pending?<button data-ui="primary" disabled={busy} onClick={()=>void retry()}>原样重试</button>:error?<button data-ui="secondary" disabled={busy} onClick={()=>void refresh().catch(()=>{})}>重试</button>:null}</div>
  <div className="notice-feed-scroll">{groups.map(group=>{
   const limit=group.tone==='red'?2:3,visible=more.includes(group.tone)?group.items:group.items.slice(0,limit);
   return <section className="notice-feed-group" key={group.tone} data-tone={group.tone} aria-label={group.label}>
    <h3><i aria-hidden="true"/>{group.label}<span>{state?group.unread:'—'}</span></h3>
    {!state?<p className="notice-group-empty">{error?'通知尚未读取成功':'正在读取通知…'}</p>:!group.items.length?<p className="notice-group-empty">{onlyUnread?'暂无未读':'暂无'}{group.label==='进展通知'?'进展通知':group.label==='今日关注'?'待关注通知':'需立即处理的通知'}</p>:visible.map(n=>{
     const open=expanded===n.id,owner=state.users?.find(u=>u.id===n.ownerId)?.name??'当前账号',source=state.tasks.find(t=>t.id===n.taskId)?.source??(n.dedupe?.startsWith('reminder:')?'自定义提醒':n.href?.startsWith('/ai-assistant')?'能力执行':'系统提醒');
     return <article className="notice-feed-item" key={n.id} data-read={Boolean(n.read)} data-expanded={open}>
      <button className="notice-feed-trigger" disabled={blocked} aria-expanded={open} aria-controls={'notice-detail-'+n.id} onClick={()=>void expand(n)}><i className="notice-item-dot" aria-hidden="true"/><span className="notice-item-heading"><strong>{n.title}</strong><small>{open?`${owner} · ${source}`:n.text!==n.title?n.text:`${owner} · ${source}`}</small></span><time dateTime={n.createdAt} title={new Date(n.createdAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}>{notificationTime(n.createdAt,Date.now())}</time>{open?<ChevronUp size={17}/>:<ChevronDown size={17}/>}</button>
      {open?<div id={'notice-detail-'+n.id} className="notice-feed-detail">{n.text!==n.title?<p>{n.text}</p>:null}<time dateTime={n.createdAt}>{new Date(n.createdAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}</time><div className="notice-feed-actions">{n.read?<span className="notice-read-state"><Check size={16}/>已读</span>:<button className="notice-mark-read" disabled={blocked} onClick={()=>void act('read_notice',{id:n.id})}><Check size={16}/>标为已读</button>}<button className="notice-snooze" disabled={blocked} onClick={()=>void act('snooze_notice',{id:n.id,until:new Date(Date.now()+3600000).toISOString()})}><Clock size={16}/>一小时后提醒</button>{n.href?<button className="notice-handle" data-ui="primary" data-action="create" disabled={blocked} onClick={()=>void handle(n)}>前往处理<ArrowRight size={16}/></button>:null}</div></div>:null}
     </article>;
    })}
    {state&&group.items.length>limit?<button className="notice-show-more" onClick={()=>setMore(values=>values.includes(group.tone)?values.filter(t=>t!==group.tone):[...values,group.tone])}>{more.includes(group.tone)?'收起':`查看其余 ${group.items.length-limit} 条`}<ArrowRight size={15}/></button>:null}
   </section>;
  })}</div>
 </div>;
}
