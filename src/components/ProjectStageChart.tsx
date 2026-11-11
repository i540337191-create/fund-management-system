import '../iterationB/projectStage.css';
import {projectStageCounts} from '../lib/chartModels';

export function ProjectStageChart({projects,selected,onSelect}:{projects:{stage:string}[];selected:string;onSelect:(stage:string)=>void}){
  const data=projectStageCounts(projects);
  return <section className="project-ledger-overview" aria-label="项目阶段分布">
    <div className="project-ledger-landscape">
      <button type="button" className="project-ledger-total" aria-label={`查看全部${projects.length}个项目`} onClick={()=>onSelect('')}><strong>{projects.length}</strong><span>个可见项目</span></button>
      <div className="project-ledger-stages" role="group" aria-label="按投资阶段筛选项目">
        {data.map(d=><button type="button" key={d.label} aria-pressed={selected===d.label} onClick={()=>onSelect(selected===d.label?'':d.label)}><span>{d.label}</span><strong><span className="project-stage-number">{d.count}</span><small> 项</small></strong><span className="project-ledger-share">占比 {Math.round(d.count/projects.length*100)}%</span></button>)}
      </div>
    </div>
    <div className="project-ledger-distribution">
      <span>项目阶段分布</span>
      <div className="project-ledger-band" aria-label="阶段占比，非投资金额比例">{data.map((d,i)=><button key={d.label} type="button" data-stage-tone={i%4} style={{flexGrow:d.count}} aria-label={`${d.label} ${d.count}个项目，占比${Math.round(d.count/projects.length*100)}%`} aria-pressed={selected===d.label} onClick={()=>onSelect(selected===d.label?'':d.label)} />)}</div>
      <button type="button" data-ui="secondary" onClick={()=>onSelect('')} aria-pressed={!selected}>{selected?'查看全部阶段':'全部阶段'}</button>
    </div>
    {!data.length?<p className="project-ledger-empty">暂无可统计的项目阶段，可通过“新建项目”建立项目主档。</p>:null}
  </section>;
}
