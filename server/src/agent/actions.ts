import type {SessionUser} from '../auth/session.ts';
import {publicUrl} from './connectors.ts';
import {fail,object} from '../ledger/workflow.ts';
const definitions:Record<string,{capability:string;fields:string[];admin?:boolean}>={};
const define=(capability:string,names:string[],fields:string[],admin=false)=>{for(const name of names)definitions[name]={capability,fields,admin};};
define('task',['save_task'],['id','version','title','note','ownerId','dueAt','remindAheadMinutes','priority','projectId','fundId','status']);
define('task',['save_preferences'],['remindAheadMinutes']);
define('task',['save_reminder'],['id','version','title','text','dueAt']);
define('task',['cancel_reminder'],['id','version']);
define('task',['configure_task_reminder'],['id','version','remindAheadMinutes']);
define('task',['complete_task','cancel_task'],['id']);
define('task',['snooze_task'],['id','until']);
define('task',['read_notice'],['id','all']);
define('task',['snooze_notice'],['id','until']);
define('memory',['save_memory'],['id','version','title','text','scope','enabled','appliesTo','effectiveFrom','effectiveUntil','sourceMaterialIds','conflictNote']);
define('memory',['submit_memory'],['id']);
define('memory',['restore_memory'],['id','version']);
define('memory',['publish_memory'],['id'],true);
define('entity',['save_skill'],['id','version','title','description','instructions','category','tools','pluginIds','enabled','scope','materialIds']);
define('entity',['toggle_skill'],['id','enabled']);
define('entity',['test_skill'],['id','prompt']);
define('entity',['submit_skill'],['id','version','reviewedForSharing']);
define('entity',['withdraw_skill_submission'],['id','version']);
define('entity',['reject_skill_submission'],['id','version','note'],true);
define('entity',['set_shared_skill_enabled'],['id','version','enabled'],true);
define('entity',['restore_skill'],['id','version']);
define('entity',['publish_skill'],['id','reviewedForSharing'],true);
define('admin_accounts',['save_plugin'],['id','version','title','description','kind','enabled','endpoint'],true);
define('admin_accounts',['test_plugin'],['id'],true);
define('task',['save_schedule'],['id','version','title','skillId','prompt','nextAt','intervalMinutes','enabled','projectId','fundId','recurrence']);
define('task',['toggle_schedule'],['id','enabled']);
define('task',['run_schedule'],['id']);
define('template',['save_template','apply_template'],['id','version','title','objectType','stage','fields','materials','isDefault','enabled','scope'],true);
define('template',['copy_template','toggle_template','set_default_template','publish_template'],['id','enabled'],true);
define('template',['restore_template'],['id','version'],true);
define('report',['save_report_binding'],['reportId','templateId','version']);
define('weekly',['save_weekly'],['id','version','title','week','thisWeek','nextWeek','status','taskIds']);
export const allowedWorkspaceProposalActions=Object.keys(definitions);
export function workspaceActionFields(action:string){return [...(definitions[action]?.fields??[])];}
export function workspaceActionCapability(action:string){return definitions[action]?.capability;}
export function workspaceProposalInput(action:string,value:unknown,actor:SessionUser){
 const definition=Object.hasOwn(definitions,action)?definitions[action]:undefined;if(!definition)fail('unsupported_workspace_action');
 if(definition.admin&&actor.role!=='admin')fail('forbidden',403);
 const data=object(value,definition.fields);
 if(['save_template','apply_template'].includes(action)){if(data.scope!==undefined&&data.scope!=='organization')fail('template_change_not_publishable',409);if(['company','lp'].includes(String(data.objectType))&&data.stage)fail('template_stage_scope_unsupported',409);}
 if(action.startsWith('save_')&&data.scope==='organization'&&actor.role!=='admin')fail('forbidden',403);
 if(action==='save_plugin'&&typeof data.endpoint==='string'&&/^https?:/i.test(data.endpoint))publicUrl(data.endpoint);
 return data;
}
