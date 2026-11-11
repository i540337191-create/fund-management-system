export function projectStageCounts(projects:{stage:string}[]){
 const counts=new Map<string,number>();for(const p of projects){const stage=p.stage.trim()||'未登记阶段';counts.set(stage,(counts.get(stage)??0)+1);}
 const order=['初筛','立项','尽调','投决','投后','投后管理','退出','已退出'];
 return [...counts].map(([label,count])=>({label,count})).sort((a,b)=>{const ai=order.indexOf(a.label),bi=order.indexOf(b.label);return (ai<0?order.length:ai)-(bi<0?order.length:bi);});
}
export const agingBuckets=[{id:'future',label:'尚未到期',tone:'info'},{id:'late30',label:'逾期1–30天',tone:'warning'},{id:'late90',label:'逾期31–90天',tone:'bronze'},{id:'lateLong',label:'逾期90天以上',tone:'danger'}] as const;
export function capitalAgeBucket(item:{status:string;dueDate:string},today:string){
 if(item.status==='已收')return 'settled';
 const day=Date.parse(item.dueDate),now=Date.parse(today);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(item.dueDate)||!Number.isFinite(day)||new Date(day).toISOString().slice(0,10)!==item.dueDate)return 'unknown';
 const days=Math.floor((now-day)/86400000);return days<=0?'future':days<=30?'late30':days<=90?'late90':'lateLong';
}
