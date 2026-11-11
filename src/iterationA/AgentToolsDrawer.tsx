import {useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {WorkflowDialog} from '../components/MaterialFileDialogs';
import '../components/ConfigurationDisclosure.css';
import './agent-tools-panel.css';
import {Layers,ChevronRight,FileText,ShieldCheck} from 'lucide-react';
import {useAgentWorkspace} from '../lib/agentWorkspaceClient';
import {navigate} from '../components/Layout';
export function AgentToolsDrawer({project,materials,disabled,onUse}:{project:string;materials:string[];disabled:boolean;onUse:(text:string)=>void}){
 const [open,setOpen]=useState(false),trigger=useRef<HTMLButtonElement>(null);
 const close=()=>setOpen(false);
 return <div className="agent-c-tools"><button ref={trigger} type="button" data-ui="secondary" aria-expanded={open} aria-controls="agent-tools-drawer" onClick={()=>setOpen(value=>!value)}><Layers size={16}/>能力与规则</button>{open&&createPortal(<WorkflowDialog title="能力与规则" className="configuration-drawer agent-tools-panel" busy={false} onClose={close}><div id="agent-tools-drawer" className="agent-tools-content"><Tools project={project} materials={materials} disabled={disabled} onUse={text=>{close();requestAnimationFrame(()=>onUse(text));}}/></div></WorkflowDialog>,document.body)}</div>;
}
function Tools({project,materials,disabled,onUse}:{project:string;materials:string[];disabled:boolean;onUse:(text:string)=>void}){
 const model=useAgentWorkspace(),[tab,setTab]=useState<'skills'|'rules'>('skills');
 const rows=tab==='skills'?model.state?.skills.filter(row=>row.enabled!==false):model.state?.memories.filter(row=>row.enabled!==false);
 return <><p className="agent-c-drawer-intro">查看当前可见的能力、工作规则与资料范围。</p><nav aria-label="能力抽屉内容"><button data-ui={tab==='skills'?'primary':'secondary'} type="button" aria-pressed={tab==='skills'} onClick={()=>setTab('skills')}>能力</button><button data-ui={tab==='rules'?'primary':'secondary'} type="button" aria-pressed={tab==='rules'} onClick={()=>setTab('rules')}>规则与记忆</button></nav><div className="agent-c-tool-list">{model.error?<p role="alert">{model.error}<button data-ui="info" type="button" onClick={()=>void model.refresh().catch(()=>{})}>重新读取</button></p>:!model.state?<p role="status">正在读取当前工作区…</p>:rows?.length?rows.map(row=><article key={row.id}><div><Layers size={19}/><h3>{row.title}</h3></div>{tab==='skills'&&row.status&&row.status!=='published'?<small>{row.status==='draft'?'草稿':row.status==='submitted'?'待审核':row.status==='rejected'?'未通过审核':'当前可见记录'}</small>:null}<p>{row.description||row.text||'尚无说明，请在管理页核对配置。'}</p>{tab==='skills'?<button data-ui="secondary" type="button" disabled={disabled} onClick={()=>onUse(`请按“${row.title}”的工作方法协助我：\n${row.instructions||row.description||''}\n\n请先核对当前范围与所需资料，涉及业务变更时先给出确认建议。`)}>写入输入框<ChevronRight size={14}/></button>:<small>{row.scope==='organization'?'团队规则':'个人记忆'} · {row.status==='published'?'已发布':row.status==='draft'?'草稿':row.status==='submitted'?'待审核':'当前可见记录'}</small>}</article>):<p>当前没有可见的启用记录，可前往管理页配置。</p>}</div><section className="agent-c-scope"><h3>本轮范围</h3><p><ShieldCheck size={15}/>{project||'全部可见项目'}</p><div><FileText size={15}/><span>{materials.length?materials.join('、'):'未指定原件，按当前授权范围检索'}</span></div><p className="agent-c-note">“写入输入框”只准备需求，发送后由数字员工处理；此处不执行任务或修改规则。</p></section><footer><button data-ui="info" type="button" onClick={()=>navigate('/ai-assistant/'+(tab==='skills'?'skills':'memory'))}>{tab==='skills'?'管理能力与工具':'管理规则与记忆'}<ChevronRight size={14}/></button></footer></>;
}
