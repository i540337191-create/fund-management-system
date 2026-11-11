import {useEffect,useState} from 'react';
import {useAgentWorkspace} from '../lib/agentWorkspaceClient';
import {clientSessionEpoch,subscribeSessionInvalidation} from '../lib/sessionBoundary';
let draft:{epoch:number;value:string}|null=null;
subscribeSessionInvalidation(()=>{draft=null;});
if(typeof window!=='undefined')window.addEventListener('beforeunload',event=>{if(draft?.epoch===clientSessionEpoch()){event.preventDefault();event.returnValue='';}});
export function PersonalReminderPreferences(){const model=useAgentWorkspace(),[value,setValue]=useState(()=>draft?.epoch===clientSessionEpoch()?draft.value:null),[notice,setNotice]=useState('');const saved=model.state?.preferences?.remindAheadMinutes??2880,current=value??String(saved);
 useEffect(()=>subscribeSessionInvalidation(()=>{setValue(null);setNotice('登录身份已变化，请重新读取个人偏好。');}),[]);
 const edit=(value:string)=>{setValue(value);draft=value===String(saved)?null:{epoch:clientSessionEpoch(),value};setNotice('');};
 return <section className="agent-workspace"><h3>个人提醒偏好</h3><p className="aw-meta">设置本人的默认提前提醒时间，未保存的输入在本次登录内保留。</p><form className="aw-preferences" onSubmit={async e=>{e.preventDefault();const epoch=clientSessionEpoch(),submitted=current;if(await model.act('save_preferences',{remindAheadMinutes:Number(submitted)})){if(epoch!==clientSessionEpoch())return;draft=null;setValue(null);setNotice('提醒偏好已保存。');}}}><label>默认提前提醒（分钟）<input name="remindAheadMinutes" type="number" min="0" max="525600" required disabled={!model.state||model.busy||model.pending} value={current} onChange={e=>edit(e.target.value)}/></label><button data-ui="primary" disabled={model.busy||!model.state}>{model.busy?'正在保存…':model.pending?'原样重试提醒偏好':'保存提醒偏好'}</button>{draft?<button data-ui="secondary" type="button" disabled={model.busy||model.pending} onClick={()=>{draft=null;setValue(null);setNotice('已恢复已保存的提醒偏好。');}}>恢复已保存值</button>:null}</form><div className="reminder-feedback">{!model.state&&!model.error?<p role="status">正在读取个人偏好…</p>:null}{draft?<p role="status">有未保存的输入，切换页面后仍会保留。</p>:null}{notice?<p role="status">{notice}</p>:null}{model.error?<p role="alert">{model.error}</p>:null}</div></section>;
}
