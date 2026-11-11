import type {ReportRecord} from '../data/reports';
import {StatusBadge} from './ui';
import {DeleteRecordButton} from './RecordManagement';
import {dataOriginLabel} from '../lib/dataOrigin';
import './ReportRegister.css';
export function ReportRegister({reports,selectedId,onSelect}:{reports:ReportRecord[];selectedId?:string;onSelect:(id:string)=>void}){
 return <div className="report-register-rows" role="region" aria-label="报告列表，可横向滚动" tabIndex={0}><table className="report-register-table"><thead><tr>{['报告名称','关联对象','报告类型','状态','创建人','更新时间','操作'].map(title=><th key={title}>{title}</th>)}</tr></thead><tbody>{reports.map(report=><tr className="report-register-row" data-selected={(report.id??report.name)===selectedId} key={report.id??report.name}>
  <td><button className="report-name-button" type="button" title={report.name} onClick={()=>onSelect(report.id??report.name)}>{report.name}</button><p className="report-row-provenance">{dataOriginLabel(report.dataOrigin)}{report.dataPurpose==='engineering_fixture'?' · 工程测试':''}</p></td>
  <td><span className="report-target-text" title={report.target}>{report.target}</span></td><td>{report.type}</td><td><StatusBadge status={report.status}/></td><td>{report.owner}</td><td><time dateTime={report.updatedAt}>{report.updatedAt.slice(0,10)}<br/>{report.updatedAt.slice(11,16)}</time></td>
  <td><div className="report-register-row-actions"><button data-ui="navigation" aria-label={`查看报告：${report.name}`} onClick={()=>onSelect(report.id??report.name)}>查看</button><DeleteRecordButton kind="report" id={report.id} title={report.name}/></div></td>
 </tr>)}</tbody></table>{!reports.length?<p className="report-register-empty">没有符合当前筛选的报告，可调整筛选或创建报告。</p>:null}</div>;
}
