type DatedTask={dueDate:string;status:string};
export function isOpenTask(task:DatedTask){return !['已完成','已取消'].includes(task.status);}
export function isOverdueTask(task:DatedTask,today:string){return isOpenTask(task)&&/^\d{4}-\d{2}-\d{2}$/.test(task.dueDate)&&task.dueDate<today;}
export function taskDeadlineSummary(tasks:DatedTask[],today:string){
 const open=tasks.filter(isOpenTask);
 const days=Array.from({length:7},(_,i)=>{const date=new Date(`${today}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+i);const day=date.toISOString().slice(0,10);return {date:day,count:open.filter(t=>t.dueDate===day).length};});
 return {overdue:open.filter(t=>isOverdueTask(t,today)).length,days};
}
