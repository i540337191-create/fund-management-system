export type BusinessEntry={label:string;href:string};
// These links open existing forms; they never execute a mutation.
export function businessEntryFooter(text:string,entries:BusinessEntry[],objects:BusinessEntry[]=[]){
 if(!/补充|补齐|缺少|缺件|上传|新增|新建|创建|编辑|修改|删除|恢复|查看|查询|审核|办理|入口/.test(text))return '';
 const selected=objects.filter(x=>text.includes(x.label)).slice(0,4);
 for(const [pattern,label] of [[/资料|原件|附件|文件/,'上传与管理资料'],[/任务|待办/,'任务办理'],[/报告/,'报告审核与正文'],[/项目/,'项目管理'],[/基金/,'基金管理'],[/纪要|会议/,'会议纪要'],[/收件|识别|归档/,'收件识别与归档'],[/资金|费用|到账/,'资金与费用'],[/风险/,'风险监控'],[/账号|设置/,'账号与系统设置']] as const){if(selected.length>=4)break;const entry=entries.find(e=>e.label===label);if(pattern.test(text)&&entry&&!selected.some(x=>x.href===entry.href))selected.push(entry);if(selected.length>=4)break;}
 const missing=selected.filter(x=>!text.includes(`](${x.href})`));return missing.length?'\n\n'+missing.map(x=>`[${x.label.replace(/[\[\]\\\r\n]/g,' ')}](${x.href})`).join(' · '):'';
}
export function requestedBusinessEntry(prompt:string,previousReply:string,objects:BusinessEntry[]=[],projectId?:string){
 if(/草稿|未完成|接着|进展|摘要|总结|分析|是什么|接下来|核对|核查|检查|评估|判断|梳理|列出|缺什么|缺哪些|为什么|为何|比较|整理|归纳|对比|说明|查阅|计算|生成|起草/.test(prompt))return null;
 if(!/入口|链接|哪里.{0,8}(上传|录入|补)|在哪.{0,8}(上传|录入|补)/.test(prompt))return null;
 const catalog=[{label:'资料库 / 文件列表',pattern:/资料库|文件列表|文档管理|上传资料|补(?:齐|充)?资料/,href:'/materials'},{label:'报告中心',pattern:/报告/,href:'/reports'},{label:'任务中心',pattern:/任务|待办/,href:'/tasks'},{label:'项目管理',pattern:/项目详情|项目管理|项目档案/,href:'/projects'},{label:'基金管理',pattern:/基金/,href:'/funds'},{label:'会议纪要',pattern:/纪要|会议/,href:'/meetings'},{label:'AI 收件箱',pattern:/收件|识别归档/,href:'/ai-inbox'},{label:'资金与费用',pattern:/资金|费用|到账/,href:'/capital'},{label:'系统设置',pattern:/账号|设置/,href:'/settings'}];
 const named=objects.filter(x=>prompt.includes(x.label));if(named.length===1)return `点击[打开${named[0].label.replace(/[\[\]\\\r\n]/g,' ')}](${named[0].href})，进入后可按当前权限查看和补全。`;
 const explicit=catalog.filter(x=>x.pattern.test(prompt));
 const priorObjects=objects.filter(x=>previousReply.includes(x.label)&&(!explicit.length||explicit.some(e=>x.href.startsWith(e.href))));
 if(named.length>1||!named.length&&priorObjects.length>1&&explicit.length<=1){const options=(named.length>1?named:priorObjects).slice(0,4).map(x=>x.label).join('、');return `你想打开${options}中的哪个入口？明确后我会给你直达该记录的链接。`;}
 if(!named.length&&priorObjects.length===1){const target=priorObjects[0];return `点击[打开${target.label.replace(/[\[\]\\\r\n]/g,' ')}](${target.href})进入对应记录，核对后可在页面补全。`;}
 const inferred=explicit.length?explicit:catalog.filter(x=>x.pattern.test(previousReply));
 if(inferred.length!==1)return `你想打开${inferred.length?inferred.map(x=>x.label).join('、')+'中的哪个入口':'哪个入口'}？请说明要查看或补全的事项，我会给你对应的可点击入口。`;
 const target=inferred[0];if(target.href==='/materials'){const upload='/materials?upload=1'+(projectId?'&projectId='+encodeURIComponent(projectId):'');return `点击[资料库 / 文件列表](/materials)查看原件；需要补资料，可直接点击[上传并补充资料](${upload})，打开上传表单后核对归属并保存。`;}
 return `点击[${target.label}](${target.href})打开对应业务页面，按当前权限查看、录入或补全；保存与删除仍需在页面确认。`;
}
