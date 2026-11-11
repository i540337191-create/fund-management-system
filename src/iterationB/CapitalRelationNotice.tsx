export function CapitalRelationNotice({project,fund,confirmed,onConfirm}:{project:{id:string;name:string};fund:{id:string;name:string};confirmed:boolean;onConfirm:(value:boolean)=>void}){
 return <div className="md:col-span-2 rounded-lg border border-[var(--line)] bg-[var(--inset)] p-4 text-sm">
  <p className="font-semibold text-[var(--danger)]">请核对本事项的基金与项目关联</p>
  <p className="mt-2">{fund.name} 与 {project.name} 的出资或费用关系不能仅凭当前页面范围确定。联合出资与其他资金事项可保留实际关联。</p>
  <a className="mt-2 inline-block text-[var(--bronze)] underline" href={`/projects/${encodeURIComponent(project.id)}?tab=${encodeURIComponent('投资信息')}`} target="_blank" rel="noreferrer">查看该项目投资信息</a>
  <label className="mt-3 flex min-h-10 items-center gap-2"><input type="checkbox" checked={confirmed} onChange={event=>onConfirm(event.target.checked)}/>我已核对，本资金事项确实关联上述基金与项目</label>
 </div>;
}
