import type {ReactNode} from 'react';
import {ChevronsRight,ExternalLink,ClipboardList} from 'lucide-react';
import type {Project} from '../data/projects';
import './projectArchiveHeader.css';
export function ProjectHeaderA({project,stage,stages,badges,logs,onOpen,companyAction,onCompanyOpen}:{companyAction?:ReactNode;onCompanyOpen?:()=>void;project:Project;stage:string;stages:string[];badges:ReactNode;logs:string[];onOpen:(tab:string)=>void}){
 const current=stages.findIndex(value=>value===stage||stage.startsWith(value));
 return <header className="project-header-a" data-risk={project.risk}>
  <div className="project-header-a-title"><h2>{onCompanyOpen?<button type="button" onClick={onCompanyOpen} aria-label={`查阅${project.name}的企业档案`}>{project.name}<ExternalLink size={16}/></button>:project.name}</h2><div className="project-header-a-tools"><button type="button" data-ui="secondary" onClick={()=>onOpen('审计日志')}><ClipboardList size={15}/>操作记录</button>{companyAction}</div></div>
  <div className="project-header-a-meta"><dl>{[['基金',project.fund],['行业',project.industry],['项目负责人',project.manager]].map(([label,value])=><div key={label}><dt>{label}：</dt><dd>{value||'未录入'}</dd></div>)}</dl><div className="project-header-a-badges"><span>状态：</span>{badges}</div><span className="project-header-a-updated">更新：<time>{project.updatedAt||'未录入'}</time></span></div>
  <ol className="project-header-a-stages" aria-label="项目登记阶段" title="项目主档登记阶段；不代表各环节的审批结果">{stages.map((item,index)=><li key={item} aria-current={index===current?'step':undefined}><span className="project-stage-label"><b>{String(index+1).padStart(2,'0')}</b>{item}{index===current?<small>当前</small>:null}</span>{index<stages.length-1?<ChevronsRight size={18} aria-hidden="true"/>:null}</li>)}</ol>
  {current<0?<p className="project-header-a-stage-note">当前登记阶段：{stage||'未录入'}</p>:null}
  {logs.length?<div className="project-header-a-logs">{logs.slice(0,2).map((log,index)=><p key={index}>{log}</p>)}</div>:null}
 </header>;
}
