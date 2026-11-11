import {reportWeekRange} from './report-week.ts';
const fail=(code:string,status=409):never=>{throw Object.assign(new Error(code),{code,status});};
// AI proposals are complete snapshots. Derived scope/owner/time fields stay server-owned.
export function validateWeeklyProposal(data:Record<string,unknown>,view:{weeklyReports:any[];tasks:any[]},requestedWeek?:string){
 if(typeof data.week!=='string'||!reportWeekRange(data.week))fail('invalid_week');
 if(requestedWeek&&data.week!==requestedWeek)fail('weekly_week_mismatch');
 const keys=['id','version','title','week','thisWeek','nextWeek','status','taskIds'];
 if(Object.keys(data).some(k=>!keys.includes(k)))fail('weekly_fields_required');
 for(const[key,max]of [['title',160],['thisWeek',16000],['nextWeek',16000]] as const)if(typeof data[key]!=='string'||!data[key].trim()||data[key].length>max)fail('weekly_fields_required');
 if(!['draft','published'].includes(String(data.status)))fail('weekly_fields_required');
 if(!Array.isArray(data.taskIds)||data.taskIds.length>100||new Set(data.taskIds).size!==data.taskIds.length||data.taskIds.some(id=>typeof id!=='string'||!id||!view.tasks.some(t=>t.id===id)))fail('invalid_weekly_tasks',403);
 if(data.id!==undefined){if(typeof data.id!=='string'||!data.id||data.id.length>200)fail('weekly_target_required');const current=view.weeklyReports.find(w=>w.id===data.id);if(!current)fail('weekly_target_required');if(!Number.isInteger(data.version)||data.version!==current.version)fail('weekly_target_required');}
 else {if(data.version!==undefined||view.weeklyReports.some(w=>w.week===data.week&&w.title===data.title))fail('weekly_target_required');}
 return data;
}
