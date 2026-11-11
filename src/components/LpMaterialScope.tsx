const kinds=[['natural','自然人'],['institution','机构'],['product','产品']] as const;
export function LpMaterialScope({value=[],onChange}:{value?:string[];onChange:(value:string[])=>void}){
 return <fieldset className="aw-field"><legend>适用LP类别</legend><div className="aw-tool-options">{kinds.map(([id,label])=><label className="aw-checkbox" key={id}><input type="checkbox" checked={value.includes(id)} onChange={e=>onChange(e.target.checked?[...value,id]:value.filter(v=>v!==id))}/>{label}</label>)}</div><small>未选类别或填写附加条件时，募集导入须逐项确认适用；不自动要求提交。</small></fieldset>;
}
