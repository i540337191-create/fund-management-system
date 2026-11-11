import {LanguageSwitcher, DemoNotice} from "../i18n/LanguageSwitcher";
import './ModuleHeadingTint.css';
import {useSelectPlacement} from '../iterationA/useSelectPlacement';
import {GlobalSearch,type SearchTarget} from '../iterationA/GlobalSearch';
import {SidebarWidth} from '../iterationA/SidebarWidth';
import '../iterationA/global-interactions.css';
import {WorkflowDialog} from './MaterialFileDialogs';
import {navigationOrder,moveNavigation} from '../lib/navigationOrder';
import {NotificationCenter} from './NotificationCenter';
import {inPageBusinessPath} from '../lib/internalNavigation';
import {usePageScrollRetention} from '../lib/usePageScrollRetention';
import {useBackdropDismiss,dialogNavigationEvent} from '../lib/useBackdropDismiss';
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Layers, CalendarClock, Archive, Bell, Bot, Building2, FileText, Gauge, Inbox, Landmark, WalletCards, ListChecks, MessageSquareText, Settings, ShieldAlert, Search, Menu, X, LogOut, Plus } from "lucide-react";
import { SidebarConversationHistory } from './ConversationHistory';
import { SidebarSplitter } from "./SidebarSplitter";
import { ColorModeSwitcher } from "./ColorModeSwitcher";
const caravan = new URL("../../assets/agent-sidebar-caravan.png", import.meta.url).href;
const logoMark = new URL("../../assets/fund-management-symbol.svg", import.meta.url).href;
const navSections = [{title:"业务导航",items:[
 {label:"工作台",path:"/dashboard",icon:Gauge},
 {label:"基金管理",path:"/funds",icon:Landmark},
 {label:"项目账本",path:"/projects",icon:Building2},
 {label:"资金与费用",path:"/capital",icon:WalletCards},
 {label:"资料库",path:"/materials",icon:Archive},
 {label:"任务中心",path:"/tasks",icon:ListChecks},
 {label:"风险监控",path:"/monitoring",icon:ShieldAlert},
 {label:"会议纪要",path:"/meetings",icon:MessageSquareText},
 {label:"报告中心",path:"/reports",icon:FileText},
 {label:"系统设置",path:"/settings",icon:Settings},
]}];
export const assistantNewConversationEvent="fundapp:assistant-new-conversation";
export function navigate(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  const hash=new URL(path,window.location.href).hash;if(hash){let id:string;try{id=decodeURIComponent(hash.slice(1));}catch{return;}requestAnimationFrame(()=>document.getElementById(id)?.scrollIntoView({block:'start'}));}
}
export function Layout({ children, sessionUser, onLogout, currentPath, searchItems=[],meetingWorkspace,pendingInbox=0 }: {
  searchItems?:SearchTarget[];meetingWorkspace?:ReactNode;pendingInbox?:number;
  children: ReactNode;
  sessionUser: { id?:string; name: string; email: string; role: string } | null;
  onLogout: () => Promise<void>;
  currentPath: string;
}) {
  useSelectPlacement();
  useEffect(()=>{const follow=async(event:MouseEvent)=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.defaultPrevented)return;const link=event.target instanceof Element?event.target.closest('a[href]'):null;if(!link)return;const path=inPageBusinessPath(link.getAttribute('href')??'',window.location.origin,link.getAttribute('target'));if(!path)return;event.preventDefault();event.stopPropagation();const dialog=link.closest('dialog');if(dialog?.getAttribute('aria-busy')==='true')return;if(dialog?.open){const closed=await new Promise<boolean>(resolve=>{const unhandled=dialog.dispatchEvent(new CustomEvent(dialogNavigationEvent,{cancelable:true,detail:{resolve}}));if(unhandled){dialog.dispatchEvent(new Event('cancel',{cancelable:true}));setTimeout(()=>resolve(!dialog.isConnected||!dialog.open),0);}});if(!closed)return;}navigate(path);};document.addEventListener('click',follow);return()=>document.removeEventListener('click',follow);},[]);
  const [logoutBusy,setLogoutBusy]=useState(false),[logoutError,setLogoutError]=useState('');
  const exiting=useRef(false);
  const exit=async()=>{if(exiting.current)return;exiting.current=true;setLogoutBusy(true);setLogoutError('');try{await onLogout();}catch{setLogoutError('退出未完成，暂未确认账号已退出。请检查连接后重试。');}finally{exiting.current=false;setLogoutBusy(false);}};
  const [meetingsOpen,setMeetingsOpen]=useState(false);
  useEffect(()=>{const show=()=>setMeetingsOpen(true);window.addEventListener('fundapp:open-meetings',show);return()=>window.removeEventListener('fundapp:open-meetings',show);},[]);
  const mobileNav = useRef<HTMLDialogElement>(null);
  const dismissMobile=useBackdropDismiss(()=>mobileNav.current?.close());
  const agentPage = currentPath.startsWith('/ai-assistant'),chatPage=currentPath==='/ai-assistant';
  const main=useRef<HTMLElement>(null);usePageScrollRetention(main,!agentPage,currentPath);
  const startNewConversation=()=>{mobileNav.current?.close();if(chatPage)window.dispatchEvent(new Event(assistantNewConversationEvent));else navigate('/ai-assistant?new=1');};
  const newConversationButton=<button type="button" onClick={startNewConversation}><Plus size={18}/>新对话</button>;

  const splitKey=`fundapp.agent.nav-height.v1:${encodeURIComponent(sessionUser?.id??sessionUser?.email??'guest')}:${sessionUser?.role??'guest'}`;
  const orderKey=sessionUser?.id?`fundapp.navigation-order.v1:${encodeURIComponent(sessionUser.id)}`:null;
  const items=navSections.flatMap(section=>section.items),available=items.map(item=>item.path);
  const [ordering,setOrdering]=useState<{key:string|null;paths:string[]}>({key:null,paths:[]});
  const [dragging,setDragging]=useState<string|null>(null),[dropTarget,setDropTarget]=useState<string|null>(null),[orderError,setOrderError]=useState('');
  const gesture=useRef<{path:string;pointerId:number;x:number;y:number;timer:ReturnType<typeof setTimeout>;active:boolean;lastTarget?:string;original:string[]}|null>(null);
  const suppressClick=useRef(false);
  useEffect(()=>{let saved:unknown;try{saved=orderKey?JSON.parse(localStorage.getItem(orderKey)||'null'):null;}catch{setOrderError('菜单顺序暂无法读取，本次使用默认顺序。');}setOrdering({key:orderKey,paths:navigationOrder(available,saved)});return()=>{if(gesture.current)clearTimeout(gesture.current.timer);gesture.current=null;};},[orderKey]);
  const paths=ordering.key===orderKey?navigationOrder(available,ordering.paths):available;
  const finishOrder=(cancel=false)=>{const g=gesture.current;if(!g)return;clearTimeout(g.timer);gesture.current=null;setDragging(null);setDropTarget(null);if(!g.active)return;suppressClick.current=true;if(cancel){setOrdering({key:orderKey,paths:g.original});return;}const next=g.lastTarget?moveNavigation(g.original,g.path,g.lastTarget):g.original;setOrdering({key:orderKey,paths:next});try{if(orderKey)localStorage.setItem(orderKey,JSON.stringify(next));}catch{setOrderError('本次菜单已排序，但无法保存；重新打开后可能恢复原顺序。');}};
  const renderNav = (desktop=false) => <nav id={desktop?'agent-business-navigation':undefined} className="atelier-navigation" aria-label="主导航" tabIndex={desktop?0:undefined} onKeyDown={event=>{if(event.key==='Escape'&&gesture.current){event.preventDefault();finishOrder(true);}}}>
    <div className="navigation-section">{paths.map(path=>{const {label,icon:Icon}=items.find(item=>item.path===path)!;
      const active = path === "/dashboard" ? currentPath === "/" || currentPath === "/dashboard" : path === "/ai-assistant" ? currentPath.startsWith(path)&&currentPath!=='/ai-assistant/weekly' : currentPath.startsWith(path);
      return <button key={path} data-nav-path={path} className={active ? "active" : ""} aria-current={active ? "page" : undefined} title="长按2秒拖动排序；Alt+方向键调整顺序" style={dragging===path?{outline:'2px solid var(--bronze)',cursor:'grabbing'}:dropTarget===path?{boxShadow:'inset 0 3px 0 var(--bronze)'}:undefined} onKeyDown={event=>{if(!orderKey||!event.altKey||!['ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const target=paths[paths.indexOf(path)+(event.key==='ArrowUp'?-1:1)];if(!target)return;const next=moveNavigation(paths,path,target);setOrdering({key:orderKey,paths:next});try{localStorage.setItem(orderKey,JSON.stringify(next));}catch{setOrderError('菜单顺序暂无法保存。');}}}
       onPointerDown={event=>{if(event.button!==0||!orderKey)return;suppressClick.current=false;const g={path,pointerId:event.pointerId,x:event.clientX,y:event.clientY,active:false,original:paths,timer:setTimeout(()=>{if(gesture.current===g){g.active=true;setDragging(path);}},2000)};gesture.current=g;event.currentTarget.setPointerCapture(event.pointerId);}}
       onPointerMove={event=>{const g=gesture.current;if(!g)return;if(!g.active){if(Math.hypot(event.clientX-g.x,event.clientY-g.y)>8){clearTimeout(g.timer);gesture.current=null;suppressClick.current=true;}return;}event.preventDefault();const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-nav-path]')?.getAttribute('data-nav-path');if(target&&target!==g.path){g.lastTarget=target;setDropTarget(target);}}}
       onPointerUp={()=>finishOrder()} onPointerCancel={()=>finishOrder(true)} onLostPointerCapture={()=>{if(gesture.current)finishOrder(true);}}
       onClick={() => {if(suppressClick.current){suppressClick.current=false;return;} mobileNav.current?.close(); navigate(path); }}><Icon size={19} /><span>{label}</span></button>;
    })}</div>{orderError?<p role="status">{orderError}</p>:null}</nav>;
  return <div className={`atelier-theme fundapp-shell min-h-screen ${agentPage ? 'agent-shell' : ''}`}>
    <aside className="atelier-sidebar"><div className="atelier-brand"><img src={logoMark} alt="基金管理系统标志" /><strong>基金管理系统</strong></div>{renderNav(true)}
      <SidebarSplitter key={splitKey} storageKey={splitKey}/><div className="sidebar-new-conversation">{newConversationButton}</div><div className="sidebar-history-scroll"><div id="agent-history-slot">{!chatPage?<SidebarConversationHistory key={splitKey} hide={false}/>:null}</div></div><div className="agent-sidebar-user"><div className="agent-sidebar-caravan" aria-hidden="true"><img src={caravan} alt=""/></div><a className="sidebar-account-avatar" href={'/settings?section='+encodeURIComponent('账号与登录管理')} aria-label={`${sessionUser?.name??'当前账号'}：账号与登录管理`} title="账号与登录管理">{sessionUser?.name.slice(0,1) ?? '访'}</a><strong>{sessionUser?.name ?? '未登录'}</strong><button type="button" disabled={logoutBusy} aria-label={logoutBusy?"正在退出账号":"退出账号"} title={logoutBusy?"正在退出账号":"退出账号"} onClick={()=>void exit()}><LogOut size={17}/></button></div>
    </aside>
    {logoutError?<WorkflowDialog title="退出未完成" busy={false} onClose={()=>setLogoutError('')}><p role="alert">{logoutError}</p><div className="mt-4 flex justify-end gap-3"><button data-ui="secondary" onClick={()=>setLogoutError('')}>返回</button><button data-ui="primary" disabled={logoutBusy} onClick={()=>void exit()}>重试退出</button></div></WorkflowDialog>:null}
    <SidebarWidth key={splitKey} storageKey={splitKey.replace('nav-height','sidebar-width')}/>
    <div className="atelier-body"><header className="atelier-topbar">
      <button className="atelier-mobile-menu" aria-label="打开主导航" onClick={() => mobileNav.current?.showModal()}><Menu size={22} /></button>
      <GlobalSearch key={sessionUser?.id??'guest'} items={searchItems}/>
      <div className="atelier-top-actions"><DemoNotice/><LanguageSwitcher/><ColorModeSwitcher />
        <button type="button" className="aw-bell" aria-label={`AI收件箱，${pendingInbox}项待处理`} title="AI收件箱" onClick={()=>navigate('/ai-inbox')}><Inbox size={19}/>{pendingInbox>0?<span className="aw-bell-count">{pendingInbox}</span>:null}</button>
        <NotificationCenter/>
      </div>
    </header><main ref={main} className="atelier-main" data-header-tint={agentPage||['/capital','/materials','/tasks','/meetings','/reports','/settings'].includes(currentPath.split('?')[0])||undefined}><div key={currentPath || "/"}>{children}</div></main></div>
    {meetingsOpen&&meetingWorkspace?<WorkflowDialog className="business-meeting-dialog" title="会议纪要" busy={false} onClose={()=>setMeetingsOpen(false)}><div className="dashboard-meeting-workspace">{meetingWorkspace}</div></WorkflowDialog>:null}
    <dialog {...dismissMobile} ref={mobileNav} className="atelier-mobile-dialog" aria-label="移动主导航"><div className="atelier-dialog-title"><strong>基金管理系统</strong><button aria-label="关闭主导航" onClick={() => mobileNav.current?.close()}><X size={20} /></button></div><div className="sidebar-new-conversation">{newConversationButton}</div>{renderNav()}</dialog>
  </div>;
}
