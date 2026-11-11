import {useState,type ReactNode} from 'react';
import {PrimaryButton,SectionHeader} from './ui';
import {FileText,Layers,Landmark,CalendarDays,Tag,Clock,ChevronRight,Link2,UserRound,Sparkles,CheckCircle2,Download,Search} from 'lucide-react';
import {reportCatalogue,reportFlow} from '../lib/reportCatalogue';
import type {ReportRecord} from '../data/reports';
import {ReportRegister} from './ReportRegister';
import './ReportCatalogue.css';
export function ReportCatalogue({reports,filteredReports,typeFilter,onTypeFilter,nameQuery,onNameQuery,canCreate,onCreate,onView,generationTasks}:{generationTasks?:ReactNode;reports:ReportRecord[];filteredReports:ReportRecord[];typeFilter:string;onTypeFilter:(type:string)=>void;nameQuery:string;onNameQuery:(q:string)=>void;canCreate:boolean;onCreate:(type:string)=>void;onView:(id:string)=>void}){
 const [selected,setSelected]=useState('基金季度报告');
 const current=reportCatalogue.find(r=>r.type===selected)!;
 const groupIcons=[Layers,Landmark,CalendarDays],flowIcons=[FileText,Link2,Layers,UserRound,Sparkles,CheckCircle2,Download];
 return <div className="report-catalogue-page">
  <SectionHeader title="报告中心" eyebrow="报告编制 / 审核 / 导出" action={<PrimaryButton creation disabled={!canCreate} onClick={()=>onCreate(selected)}>创建报告</PrimaryButton>}/>
  {generationTasks}
  <div className="report-catalogue-top">
   <section className="report-catalogue-index" aria-label="报告目录">{[...new Set(reportCatalogue.map(r=>r.group))].map((group,i)=>{const Icon=groupIcons[i];return <section key={group} className="report-catalogue-group"><h2><Icon size={25} strokeWidth={2.25}/>{group}</h2><div>{reportCatalogue.filter(r=>r.group===group).map(r=><div key={r.type} className="report-catalogue-row" data-selected={r.type===selected}>
    <button type="button" className="report-catalogue-select" aria-pressed={r.type===selected} onClick={()=>setSelected(r.type)}><FileText size={22} strokeWidth={2.25}/><strong>{r.type}</strong><span>适用阶段：{r.stage}</span><span>出具时机：{r.timing}</span></button>
    <PrimaryButton creation disabled={!canCreate} ariaLabel={`创建${r.type}`} onClick={()=>{setSelected(r.type);onCreate(r.type);}}>创建</PrimaryButton>
   </div>)}</div></section>;})}</section>
   <aside className="report-catalogue-guide" aria-label="所选报告出具指引" aria-live="polite"><h2><FileText size={30}/>{current.type}</h2><dl><div><Tag/><dt>适用阶段：</dt><dd>{current.stage}</dd></div><div><Clock/><dt>出具时机：</dt><dd>{current.timing}</dd></div><div><Layers/><dt>准备资料：</dt><dd>{current.materials}</dd></div></dl><h3>三步指引</h3><ol><li><b>1</b><div><h4>关联基金与报告期</h4><p>选择对应基金，明确报告期及关联项目。</p></div></li><li><b>2</b><div><h4>核对模板和资料</h4><p>选用{current.type}适用模板，核对{current.materials}。</p></div></li><li><b>3</b><div><h4>生成草稿后人工审核</h4><p>基于资料生成 AI 草稿，由责任人审核确认后导出归档。</p></div></li></ol></aside>
  </div>
  <nav className="report-catalogue-flow" aria-label="报告生成流程"><strong>报告生成流程</strong>{reportFlow.map((label,i)=>{const Icon=flowIcons[i];return <div key={label}><Icon size={25} strokeWidth={2.25}/><span>{label}<small>{['确定报告类型','选择对应基金或项目','选用模板并核对资料','明确数据责任人','生成报告草稿','业务审核与修改','导出已审核正文'][i]}</small></span>{i<6?<ChevronRight className="report-flow-arrow" size={16}/>:null}</div>;})}</nav>
  <section className="report-catalogue-saved"><header><div><FileText/><h2>我的报告</h2><p>已创建的报告，可查看、审核或导出。</p></div><div><label><select aria-label="筛选报告类型" value={typeFilter} onChange={e=>onTypeFilter(e.target.value)}>{['全部报告类型',...new Set([...reportCatalogue.map(r=>r.type),...reports.map(r=>r.type)])].map(t=><option key={t}>{t}</option>)}</select></label><label><Search size={17}/><input value={nameQuery} onChange={e=>onNameQuery(e.target.value)} placeholder="搜索报告名称、项目或基金" aria-label="搜索报告名称、项目或基金"/></label></div></header><ReportRegister reports={filteredReports} onSelect={onView}/><p className="report-catalogue-count" role="status">当前 {filteredReports.length} 份 · 全部 {reports.length} 份</p></section>
 </div>;
}
