import type {ReactNode} from 'react';
import {Users,Layers3,SlidersHorizontal,FileText,ArrowUpRight} from 'lucide-react';
import './SettingsOverview.css';
import './SettingsDetails.css';

type Props={role?:string;account?:{name:string;email:string;role:string;managedBy?:string}|null;accountRoleLabel?:string;auditCount?:number;onOpen:(tab:string)=>void;onAuditExport:()=>void;onRevoke:()=>void;reminders:ReactNode};
const entries=[
  {title:'账号与登录管理',description:'维护登录账号与角色，恢复账号，核对本人会话。',action:'管理账号',icon:Users},
  {title:'基金与项目可见范围',description:'按基金或项目指定可见成员；可见范围与办理权限分别管理。',action:'设置可见范围',icon:Layers3,admin:true},
  {title:'自定义业务字段',description:'补充项目、企业、基金字段；停用字段保留历史值。',action:'管理业务字段',icon:SlidersHorizontal},
  {title:'业务模板管理',description:'先核对业务环节与生效表单，再管理草稿、材料和版本。',action:'管理业务模板',icon:FileText},
];

export function SettingsOverview({role,account,accountRoleLabel,auditCount,onOpen,onAuditExport,onRevoke,reminders}:Props){
  return <div className="settings-home settings-home-c">
    <div className="settings-home-main">
      <div className="settings-home-entries" aria-label="账号与业务配置">
        {entries.filter(entry=>!entry.admin||role==='admin').map(({title,description,action,icon:Icon,admin})=><section className="settings-home-row" key={title} aria-label={title}>
          <span className="settings-home-icon-tile"><Icon className="settings-home-icon" size={36} aria-hidden="true"/></span>
          <div className="settings-home-row-copy"><h3>{title}{admin?<span className="settings-home-scope">仅管理员</span>:null}</h3><p>{description}</p></div>
          <button data-ui="primary" type="button" onClick={()=>onOpen(title)}>{action}<ArrowUpRight size={14} aria-hidden="true"/></button>
        </section>)}
      </div>
      <section className="settings-home-audit" aria-label="操作记录">
        <h2>操作记录</h2>
        <p>核对关键业务操作与修改记录，保留审计轨迹。{auditCount===undefined?'可前往查看记录。':`当前可见 ${auditCount} 条记录。`}</p>
        <div className="settings-home-audit-actions"><button data-ui="primary" type="button" onClick={()=>onOpen('操作记录')}>查看记录<ArrowUpRight size={14} aria-hidden="true"/></button><button data-ui="info" type="button" onClick={onAuditExport}>导出操作记录</button></div>
      </section>
    </div>
    <aside className="settings-home-aside" aria-label="当前账号与个人偏好">
      <section className="settings-home-account" aria-label="当前登录账号">
        <h2>登录账号</h2>
        {account?<><div className="settings-home-account-name"><Users size={28} aria-hidden="true"/><strong>{account.name}</strong><span className="settings-home-status is-enabled">当前登录</span></div><p className="settings-home-account-detail">{accountRoleLabel??account.role} · {account.managedBy==='configuration'?'主管理员':'普通账号'}<br/>{account.email}</p></>:<p role="status">正在读取账号资料…</p>}
        <button data-ui="secondary" type="button" onClick={onRevoke}>管理本人会话<ArrowUpRight size={14} aria-hidden="true"/></button>
      </section>
      <section className="settings-reminder-home" aria-label="个人提醒偏好">{reminders}</section>

    </aside>
  </div>;
}
