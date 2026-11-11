import {NoticeHelp} from './NoticeHelp';
import {ConversationHistoryMenu} from './ConversationHistoryMenu';
import {useEffect,useRef,useState} from 'react';
import {MessageSquare,PanelLeftClose,Search,RefreshCw} from 'lucide-react';
import {assistantClient,assistantError,type ConversationSummary} from '../lib/assistantClient';
import {useSourceScope} from '../lib/useSourceScope';
import {subscribeSessionInvalidation} from '../lib/sessionBoundary';
import {navigate} from './Layout';

function RunningIndicator(){
 const ring=useRef<HTMLSpanElement>(null),[visible,setVisible]=useState(false);
 useEffect(()=>{let intersecting=false;const update=()=>setVisible(intersecting&&!document.hidden),observer=new IntersectionObserver(([entry])=>{intersecting=entry.isIntersecting;update();});if(ring.current)observer.observe(ring.current);document.addEventListener('visibilitychange',update);return()=>{observer.disconnect();document.removeEventListener('visibilitychange',update);};},[]);
 return <span className="history-running-indicator" role="status" aria-label="此对话正在运行"><span ref={ring} className="history-running-ring" aria-hidden="true" style={{animationPlayState:visible?'running':'paused'}}/></span>;
}
export function ConversationHistory({visible,search,onSearch,listLoading,activeId,onOpen,onClose,onRefresh}:{visible:ConversationSummary[];search:string;onSearch:(value:string)=>void;listLoading:boolean;activeId?:string;onOpen:(id:string)=>void;onClose:()=>void;onRefresh:()=>void|Promise<void>}){
 const refresh=useRef(onRefresh);refresh.current=onRefresh;const running=visible.some(c=>c.running);
 useEffect(()=>{let pending=false;const read=async()=>{if(document.hidden||pending)return;pending=true;try{await refresh.current();}finally{pending=false;}};const resume=()=>{if(!document.hidden)void read();};const timer=running?setInterval(()=>void read(),2000):undefined;document.addEventListener('visibilitychange',resume);window.addEventListener('focus',resume);return()=>{if(timer)clearInterval(timer);document.removeEventListener('visibilitychange',resume);window.removeEventListener('focus',resume);};},[running]);
 return <aside className="assistant-history" aria-label="历史对话"><div className="agent-history-label"><MessageSquare size={14}/>历史对话</div><div className="assistant-history-top"><button className="assistant-icon assistant-mobile-only" type="button" aria-label="关闭历史对话" onClick={()=>onClose()}><PanelLeftClose size={18}/></button></div><label className="assistant-history-search"><Search size={15}/><input aria-label="搜索历史对话" value={search} onChange={e=>onSearch(e.target.value)} placeholder="搜索对话"/></label><div className="assistant-history-list">{listLoading?<p className="assistant-muted">正在读取历史对话…</p>:!visible.length?<p className="assistant-muted">{search?'没有匹配的对话':'对话会自动保存在当前账号下'}</p>:visible.map(c=><div className="history-row" key={c.id}><button type="button" className={`assistant-history-item ${activeId===c.id?'is-active':''}`} onClick={()=>onOpen(c.id)} aria-current={activeId===c.id?'true':undefined}>{c.running?<RunningIndicator/>:<MessageSquare size={15} aria-hidden="true"/>}<span><strong>{c.title}</strong><small>{new Date(c.updatedAt).toLocaleDateString('zh-CN')}{c.running?' · 运行中':''}</small></span></button><ConversationHistoryMenu conversation={c} onChanged={removed=>{window.dispatchEvent(new CustomEvent("fundapp:conversation-changed",{detail:{id:c.id,removed}}));onRefresh();}}/></div>)}</div><div className="assistant-history-bottom"><button className="assistant-icon" type="button" aria-label="刷新历史对话" onClick={()=>onRefresh()}><RefreshCw size={15}/></button></div></aside>;
}
export function SidebarConversationHistory({hide}:{hide:boolean}){
 const current=useSourceScope(String(hide));
 const [summaries,setSummaries]=useState<ConversationSummary[]>([]),[search,setSearch]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const refresh=async(quiet=false)=>{if(!quiet)setLoading(true);setError('');try{const value=await assistantClient.history();if(current())setSummaries(value.conversations);}catch(e){if(current())setError(assistantError(e));}finally{if(current())setLoading(false);}};
 useEffect(()=>{void refresh();return subscribeSessionInvalidation(()=>setSummaries([]));},[hide]);
 return <>{error?<p role="alert" className="assistant-muted">{error}<NoticeHelp message={error}/></p>:null}<ConversationHistory visible={summaries.filter(c=>c.title.toLowerCase().includes(search.trim().toLowerCase()))} search={search} onSearch={setSearch} listLoading={loading} onOpen={id=>navigate('/ai-assistant?conversation='+encodeURIComponent(id))} onClose={()=>{}} onRefresh={()=>refresh(true)}/></>;
}
