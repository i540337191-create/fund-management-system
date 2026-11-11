import {useRef,useState} from 'react';
import {WorkflowDialog} from './MaterialFileDialogs';
import {confirmAction} from './SystemConfirmation';
import type {useAgentWorkspace} from '../lib/agentWorkspaceClient';
import type {Fund} from '../data/funds';
import type {Project} from '../data/projects';
export function DashboardScheduleDialog({model,funds,projects,onClose}:{model:ReturnType<typeof useAgentWorkspace>;funds:Fund[];projects:Project[];onClose:()=>void}){
 const [value,setValue]=useState({title:'',fundId:'',projectId:'',note:'',priority:'normal'}),[error,setError]=useState('');
 const dirty=useRef(false),working=useRef(false);
 const blocked=model.busy||model.pending;
 const update=(key:keyof typeof value,next:string)=>{dirty.current=true;setError('');setValue(v=>({...v,[key]:next}));};
 const close=async()=>{if(blocked)return;if(dirty.current&&!await confirmAction('日程尚未保存，确认关闭？'))return;onClose();};
 return <WorkflowDialog title="添加日程" busy={blocked} onClose={close}><form className="agent-workspace aw-form" onSubmit={async e=>{
  e.preventDefault();if(working.current||model.busy||!model.state)return;working.current=true;setError('');
  try{
   if(model.pending){if(await model.retry()){dirty.current=false;onClose();}return;}
   const when=new Date(String(new FormData(e.currentTarget).get('dueAt')??''));
   if(!value.title.trim()||!Number.isFinite(when.getTime())){setError('请填写日程内容和有效时间。');return;}
   const saved=await model.act('save_task',{title:value.title.trim(),dueAt:when.toISOString(),ownerId:model.state.currentUserId,fundId:value.fundId||undefined,projectId:value.projectId||undefined,note:value.note,priority:value.priority});
   if(saved){dirty.current=false;onClose();}
  }finally{working.current=false;}
 }}>
  <fieldset disabled={blocked}>
   <label className="aw-field">日程内容<input required maxLength={200} value={value.title} onChange={e=>update('title',e.target.value)}/></label>
   <label className="aw-field">时间<input name="dueAt" type="datetime-local" required onChange={()=>{dirty.current=true;}}/></label>
   <label className="aw-field">关联基金<select value={value.fundId} onChange={e=>update('fundId',e.target.value)}><option value="">不限定</option>{funds.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
   <label className="aw-field">关联项目<select value={value.projectId} onChange={e=>{update('projectId',e.target.value);const p=projects.find(p=>p.id===e.target.value);if(p?.fundId&&funds.some(f=>f.id===p.fundId))update('fundId',p.fundId);}}><option value="">不限定</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
   <label className="aw-field">优先级<select value={value.priority} onChange={e=>update('priority',e.target.value)}><option value="normal">普通</option><option value="high">高</option><option value="urgent">紧急</option></select></label>
   <label className="aw-field">说明<textarea rows={3} maxLength={4000} value={value.note} onChange={e=>update('note',e.target.value)}/></label>
  </fieldset>
  <div className="aw-notice-feedback" role={error||model.error?'alert':'status'}>{error||model.error||''}</div>
  <div className="aw-actions"><button data-ui="primary" type="submit" disabled={model.busy||!model.state}>{model.busy?'正在保存…':model.pending?'原样重试':'保存日程'}</button><button data-ui="secondary" type="button" disabled={blocked} onClick={()=>void close()}>取消</button></div>
 </form></WorkflowDialog>;
}
