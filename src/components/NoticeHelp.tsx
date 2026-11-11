import {useEffect,useState} from 'react';
export function NoticeHelp({message,projectId,fundId,href,targetId,onResolve,label}:{message:unknown;projectId?:string;fundId?:string;href?:string;targetId?:string;onResolve?:()=>void;label?:string}){
 const [detail,setDetail]=useState('');useEffect(()=>setDetail(''),[message]);
 if(typeof message!=='string'||!message.trim())return null;
 let destination=href,action=label;
 if(!destination&&!targetId&&!onResolve&&/原件|资料库|材料.*关联|关联.*材料/.test(message)&&(projectId||fundId)){destination=projectId?`/projects/${encodeURIComponent(projectId!)}?tab=${encodeURIComponent('资料文件')}`:`/funds/${encodeURIComponent(fundId!)}?tab=${encodeURIComponent('资料档案')}`;action??='查看当前对象的原件与关联';}
 else if(!destination&&!targetId&&!onResolve&&/三会审批/.test(message)&&projectId){destination=`/projects/${encodeURIComponent(projectId)}?tab=${encodeURIComponent('三会审批')}`;action??='处理当前项目审批';}
 else if(!destination&&!targetId&&!onResolve&&/尽调/.test(message)&&projectId){destination=`/projects/${encodeURIComponent(projectId)}?tab=${encodeURIComponent('尽调分析')}`;action??='处理当前项目尽调';}
 else if(!destination&&!targetId&&!onResolve&&/权限|授权|登录|账号/.test(message)){destination='/settings?section='+encodeURIComponent('账号与登录管理')+'#accounts';action??='查看当前账号与登录资格';}
 if(destination)return <a className="notice-inline-help" href={destination} data-ui="navigation">{action??'处理具体问题'} →</a>;
 return <span className="notice-inline-help"><button type="button" data-ui="danger" onClick={event=>{if(onResolve){onResolve();return;}const local=event.currentTarget.closest('form')??event.currentTarget.closest('dialog,[role=dialog]')??event.currentTarget.closest('section');const target=targetId?document.getElementById(targetId):local?.querySelector<HTMLElement>('[aria-invalid="true"],input:invalid,select:invalid,textarea:invalid');if(target instanceof HTMLElement){target.scrollIntoView({block:'center'});target.focus({preventScroll:true});if(target instanceof HTMLInputElement||target instanceof HTMLSelectElement||target instanceof HTMLTextAreaElement)target.reportValidity();setDetail('已定位需要核对的字段，当前填写保留。');}else setDetail('当前没有可自动定位的无效字段，请核对上方具体原因；填写内容仍保留。');}}>{action??'定位当前表单问题'}</button>{detail?<span role="status">{detail}</span>:null}</span>;
}
