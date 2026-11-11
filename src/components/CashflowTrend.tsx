import type {InvestmentCashflow} from '../lib/investmentCashflowTypes';
import {cashflowTrend} from '../lib/cashflowTrend';
export function CashflowTrend({rows,onlyConfirmed}:{rows:InvestmentCashflow[];onlyConfirmed:boolean}){
 const data=cashflowTrend(rows,onlyConfirmed);
 if(!data.length)return null;
 const monthIndex=(month:string)=>Number(month.slice(0,4))*12+Number(month.slice(5));
 const first=monthIndex(data[0].month),span=monthIndex(data[data.length-1].month)-first;
 const x=(i:number)=>48+(monthIndex(data[i].month)-first)*704/span,y=(v:number)=>142-v*110;
 const points=data.map((d,i)=>`${x(i)},${y(d.height)}`).join(' ');
 return <figure className="cashflow-trend"><figcaption><div><h4>实际付款金额走势</h4><p>投资、费用与税款的有效登记合计 · 人民币元</p></div><span>峰值 {data.find(d=>d.height===1)?.amount??data[0].amount} 元</span></figcaption><svg viewBox="0 0 800 185" role="img" aria-label={data.map(d=>`${d.month} ${d.amount}元`).join('；')}><path className="cashflow-grid" d="M48 32H752 M48 87H752 M48 142H752"/><polygon className="cashflow-area" points={`48,142 ${points} 752,142`}/><polyline className="cashflow-line" points={points}/>{data.map((d,i)=><g key={d.month}><circle cx={x(i)} cy={y(d.height)} r="4"/><title>{d.month}：{d.amount} 元</title>{(data.length<=8||i===0||i===data.length-1)?<text x={x(i)} y="173" textAnchor={i===0?'start':i===data.length-1?'end':'middle'}>{d.month}</text>:null}</g>)}</svg><details><summary>查看逐月金额与统计口径</summary><p>排除冲销与当前范围不允许计入的来源；无记录月份未补零，不表示完整基金支出或银行实时流水。</p><dl>{data.map(d=><div key={d.month}><dt>{d.month}</dt><dd>{d.amount} 元</dd></div>)}</dl></details></figure>;
}
