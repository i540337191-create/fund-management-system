import {useState} from 'react';
import {auditActionLabel,type AuditEvent} from '../lib/auditTrail';
import {LedgerPagination} from '../components/LedgerPagination';

export function FundAuditJournal({events}:{events:AuditEvent[]}){
 const [query,setQuery]=useState(''),[page,setPage]=useState(0);
 const rows=events.filter(event=>`${event.actor} ${event.module} ${event.action} ${auditActionLabel(event.action)} ${event.detail}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 const current=Math.min(page,Math.max(0,Math.ceil(rows.length/10)-1));
 return <section className="dossier-audit" aria-label="基金操作记录">
  <div className="dossier-journal-toolbar"><label>查找操作记录<input type="search" value={query} placeholder="操作、经办人或内容" onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label><span>共 {rows.length} 条记录</span></div>
  <ol>{rows.slice(current*10,current*10+10).map(event=><li key={event.id}><div className="dossier-journal-row"><time>{event.time}</time><strong>{auditActionLabel(event.action)}</strong><span>{event.actor} · {event.module}</span></div>{event.detail?<details><summary>查看记录详情</summary><p>{event.detail}</p></details>:null}</li>)}</ol>
  {!rows.length?<p className="dossier-empty">{query?'没有符合检索条件的记录。':'暂无该基金的审计事件。'}</p>:null}
  <LedgerPagination pageSize={10} total={rows.length} page={current} onChange={setPage} label="基金操作记录分页"/>
 </section>;
}
