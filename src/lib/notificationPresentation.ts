import type {WorkspaceRecord} from './agentWorkspaceClient';
export function notificationGroups(records:WorkspaceRecord[],onlyUnread:boolean,now:number,expandedId:string|null=null){
 const visible=records.filter(n=>!n.snoozedUntil||Date.parse(n.snoozedUntil)<=now);
 return ([['red','需要立即处理'],['yellow','今日关注'],['green','进展通知']] as const).map(([tone,label])=>({tone,label,unread:visible.filter(n=>n.tone===tone&&!n.read).length,items:visible.filter(n=>(n.tone===tone||tone==='green'&&!['red','yellow','green'].includes(n.tone))&&(!onlyUnread||!n.read||n.id===expandedId)).sort((a,b)=>(Number.isFinite(Date.parse(b.createdAt))?Date.parse(b.createdAt):0)-(Number.isFinite(Date.parse(a.createdAt))?Date.parse(a.createdAt):0)||a.id.localeCompare(b.id))}));
}
export function notificationTime(value:string,now:number){
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return '时间待核对';
 const day=(d:Date)=>d.toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
 return day(date)===day(new Date(now))?date.toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false}):date.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
}
