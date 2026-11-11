import {lifecycleFilterOptions} from '../lib/lifecycleLabels';
import type {CustomSchema} from '../lib/customFields';
export function LifecycleLabelFilter({schema,value,onChange,hideLabel=false}:{hideLabel?:boolean;schema?:CustomSchema;value:string;onChange:(value:string)=>void}){
 const options=lifecycleFilterOptions(schema);if(!options.length)return null;
 return <label className="text-sm">{hideLabel?null:"生命周期标签"}<select aria-label="筛选生命周期标签" className="ml-2 min-h-10 rounded-md border border-[var(--line)] bg-[var(--inset)] px-3 py-2" value={value} onChange={e=>onChange(e.target.value)}><option value="">全部标签（含历史）</option>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
}
