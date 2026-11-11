import {useState} from 'react';
import type {Fund} from '../data/funds';
import {DocumentTemplatesPanel} from './DocumentTemplatesPanel';
import {navigate} from './Layout';
export function DocumentTemplateSettings({funds,role,loading=false,unavailable=false}:{funds:Fund[];role?:string;loading?:boolean;unavailable?:boolean}){
 const initial=new URLSearchParams(window.location.search).get('templateFund')??'';
 const [selected,setSelected]=useState(initial);
 const fund=funds.find(f=>f.id===selected)??(!selected?funds[0]:undefined);
 return <section className="document-template-settings space-y-5" aria-label="基金文档模板配置">
  <header className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">基金文档模板配置</h2>{fund?<button type="button" data-ui="secondary" onClick={()=>navigate(`/funds/${encodeURIComponent(fund.id)}?tab=${encodeURIComponent('募集档案')}`)}>返回本基金募集档案</button>:null}</header>
  <label className="block max-w-xl text-sm font-medium">配置所属基金<select disabled={loading||unavailable} className="mt-2 block w-full" value={fund?.id??''} onChange={e=>{setSelected(e.target.value);const url=new URL(window.location.href);url.searchParams.set('templateFund',e.target.value);history.replaceState(history.state,'',url.pathname+url.search);}}><option value="">请选择基金</option>{funds.map(f=><option value={f.id} key={f.id}>{f.name}</option>)}</select></label>
  {unavailable?<p role="alert">基金列表暂未读取成功。<button type="button" data-ui="secondary" onClick={()=>navigate('/funds')}>返回基金账本重试</button></p>:loading?<p role="status">正在读取可配置的基金…</p>:fund?<DocumentTemplatesPanel key={fund.id} mode="manage" fundId={fund.id} role={role}/>:<p role="status">{funds.length?'当前基金不可用，请重新选择。':'暂无可配置的基金。'}</p>}
 </section>;
}
