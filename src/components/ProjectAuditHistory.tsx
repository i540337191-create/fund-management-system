import type {AuditEvent} from '../lib/auditTrail';
import {auditActionLabel} from '../lib/auditTrail';
import {auditDetailPresentation} from '../lib/auditDetailPresentation';
import './ProjectAuditHistory.css';
export function ProjectAuditHistory({events}:{events:AuditEvent[]}){
 return <section className="project-audit-history" aria-label="项目操作记录列表"><p className="project-audit-counts"><span>操作记录 <strong>{events.length}</strong> 条</span><span>涉及模块 <strong>{new Set(events.map(e=>e.module)).size}</strong> 个</span><span>操作人 <strong>{new Set(events.map(e=>e.actor)).size}</strong> 位</span></p>{events.length?<ol>{events.map(event=>{const detail=auditDetailPresentation(event.detail);return <li key={event.id}><header><time>{event.time}</time><strong>{auditActionLabel(event.action)}</strong><span className="project-audit-actor">操作人：{event.actor}</span></header><p className="project-audit-object"><span>{event.module}</span><span>对象：{event.targetName||event.targetId}</span></p>{detail.structured?<details><summary>查看变更详情</summary><pre>{detail.text}</pre></details>:detail.text?<p className="project-audit-description">{detail.text}</p>:null}</li>;})}</ol>:<p className="project-audit-empty">当前项目暂无操作记录。</p>}</section>;
}
