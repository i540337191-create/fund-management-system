import {mkdtemp,rm,readdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import test from 'node:test';import assert from 'node:assert/strict';import {createPostgresLedgerStore}from'../src/ledger/postgres-store.ts';import {createMemoryLedgerStore,createSeedLedgerState}from'../src/ledger/store.ts';
function databaseDouble(owner:{id:string;name:string;persisted:boolean}, failure?:'version'|'commit'){
 const calls:{sql:string;values:unknown[]}[]=[],tasks:any[]=[],audits:any[]=[],versions:any[]=[];let archiveFields:any={};let archived=false,material=false,failedOnce=false;let snapshot:any;
 const meeting={id:'meeting-owner-case',project_id:'owner-project',raw_project_label:'QA项目',title:'QA负责人会议',date_label:'2026-11-05',task_due_date_label:'2026-11-12',attendees:'QA',summary:'QA确认待办',revision:1,status:'待确认',todo_items:['核对QA资料'],conclusions:[],risk_items:[],todos_count:1,risks_count:0,data_origin:'user_input'};
 const store=createPostgresLedgerStore({runWithClient:async fn=>fn({query:async(sql,values=[])=>{const q=sql.replace(/\s+/g,' ').trim().toLowerCase();calls.push({sql:q,values});
 if(q.includes('from source_record_purposes'))return{rows:[]};if(q==='begin'){snapshot=structuredClone({tasks,audits,versions,archiveFields,archived,material});return{rows:[]};}
 if(q==='commit'){snapshot=undefined;if(failure==='commit'&&!failedOnce){failedOnce=true;throw Error('commit response lost after success');}return{rows:[]};}
 if(q==='rollback'){if(snapshot){tasks.splice(0,tasks.length,...snapshot.tasks);audits.splice(0,audits.length,...snapshot.audits);versions.splice(0,versions.length,...snapshot.versions);archiveFields=snapshot.archiveFields;archived=snapshot.archived;material=snapshot.material;}return{rows:[]};}
 if(q.includes('pg_advisory_xact_lock'))return{rows:[]};
 if(q.includes('from meetings m'))return{rows:[{...meeting,status:archived?'已归档':'待确认',revision:archived?2:1}]};
 if(q.includes('from projects p')){assert.ok(q.includes('coalesce(p.owner_actor_id,p.manager_user_id) as "ownerid"'));return{rows:[{id:'owner-project',fundId:'fund-qa',name:'QA项目',shortName:'QA',stage:'初筛',manager:owner.name,ownerId:owner.id}]};}
 if(q.startsWith('select id from users'))return{rows:[{id:'confirming-user'}]};
 if(q.startsWith('select to_char(now()'))return{rows:[{value:'2026-11-05'}]};
 if(q.startsWith('insert into materials')){material=true;return{rows:[]};}
 if(q.startsWith('select m.*'))return{rows:material?[{id:'material-meeting-'+meeting.id,fund_id:'fund-qa',project_id:'owner-project',name:'QA负责人会议.docx',category:'会议资料',source:'会议纪要',...archiveFields,status:'已摘要',data_origin:'user_input'}]:[]};
 if(q.startsWith('update materials set original_file_path')){archiveFields={original_file_path:values[1],size_bytes:values[2],sha256:values[3],current_version_id:values[4],current_version:1,file_extension:'docx',source:'会议纪要生成'};return{rows:[]};}
 if(q.startsWith('insert into material_versions')){if(failure==='version'&&!failedOnce){failedOnce=true;throw Error('injected version write failure');}versions.push(values);return{rows:[]};}
 if(q.startsWith('insert into tasks')){assert.ok(q.includes('owner_actor_id, owner_label'));assert.ok(q.includes('(select id from users where id=$6)'));if(!tasks.some(t=>t.id===values[0]))tasks.push({id:values[0],project_id:values[1],name:values[2],type:values[3],stage:values[4],owner_user_id:owner.persisted?values[5]:null,owner_actor_id:values[5],owner_label:values[13],due_date_label:values[6],status:values[7],priority:values[8],relation:values[9],note:values[10],data_origin:values[11],source_basis:JSON.parse(String(values[12]))});return{rows:[]};}
 if(q.includes('from tasks t'))return{rows:tasks.filter(t=>!q.includes('where t.id =')||t.id===values[0]).map(t=>({...t,owner_name:t.owner_label,updated_at_label:'2026-11-05 17:00'}))};
 if(q.startsWith('update meetings')){archived=true;return{rows:[]};}
 if(q.startsWith('insert into audit_events')){audits.push({id:values[0],module:values[1],action:values[2],target_type:values[3],target_id:values[4],target_name:values[5],actor_name:values[7],detail:values[9],source:values[10]});return{rows:[]};}
 if(q.includes('from audit_events a'))return{rows:audits.filter(a=>a.id===values[0])};
 throw Error('unhandled query: '+q);
 }} )});return{store,calls,tasks,versions};
}
for(const owner of [{id:'user-admin',name:'管理员',persisted:false},{id:'real-manager-user',name:'QA普通经理',persisted:true}])test(`SQL double: meeting tasks preserve project manager ${owner.name} identity and never substitute confirmer`,async t=>{
 const root=await mkdtemp(join(tmpdir(),'meeting-owner-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const db=databaseDouble(owner),confirmer={id:'confirming-user',name:'QA确认人'};const confirmed=await db.store.confirmMeeting('meeting-owner-case',confirmer,1,root);assert.ok(confirmed);assert.equal(confirmed.tasks[0].owner,owner.name);assert.equal(confirmed.tasks[0].ownerId,owner.id);assert.equal(confirmed.tasks[0].dueDate,'2026-11-12');assert.equal(db.tasks[0].owner_user_id,owner.persisted?owner.id:null);assert.equal(db.tasks[0].owner_actor_id,owner.id);assert.equal(db.calls.some(c=>c.sql.startsWith('insert into users')),false);
 db.tasks[0].owner_actor_id='human-reassigned';db.tasks[0].owner_label='QA人工改派';db.tasks[0].owner_user_id=null;db.tasks.push({...db.tasks[0],id:'meeting-owner-project-other-meeting-1'});const replay=await db.store.confirmMeeting('meeting-owner-case',confirmer,1,root);assert.equal(replay!.tasks.length,1);assert.equal(replay!.tasks[0].ownerId,'human-reassigned');assert.equal(replay!.tasks[0].owner,'QA人工改派');assert.equal(db.calls.filter(c=>c.sql.startsWith('insert into tasks')).length,1);assert.equal(db.versions.length,1);assert.equal(db.versions[0][0],confirmed.material.currentVersionId);assert.match(db.versions[0][12],/^meeting-generated:/);assert.equal((await readdir(root)).length,1);
});
test('memory meeting tasks carry the same project owner actor id as PostgreSQL',async t=>{const root=await mkdtemp(join(tmpdir(),'meeting-memory-owner-'));t.after(()=>rm(root,{recursive:true,force:true}));const state=createSeedLedgerState();state.projects[0].manager='QA项目负责人';state.projects[0].ownerId='project-owner';const store=createMemoryLedgerStore(state),p=(await store.listProjects())[0];const meeting=await store.createMeeting({id:'meeting-memory-owner',projectId:p.id,project:p.name,title:'QA归属',date:'2026-11-05',attendees:'QA',summary:'QA记录',conclusions:[],todoItems:['核对QA资料'],riskItems:[],todos:1,risks:0,status:'待确认',taskDueDate:'2026-11-12',dataOrigin:'user_input'},{id:'other-confirmer',name:'另一确认人'});const result=await store.confirmMeeting(meeting.id,{id:'other-confirmer',name:'另一确认人'},meeting.revision,root);assert.equal(result!.tasks[0].ownerId,'project-owner');assert.equal(result!.tasks[0].owner,'QA项目负责人');});

for(const failure of ['version','commit'] as const)test(`SQL double: ${failure} failure and retry retain atomic archive and correct staged-file handling`,async t=>{
 const root=await mkdtemp(join(tmpdir(),'meeting-tx-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const db=databaseDouble({id:'user-admin',name:'管理员',persisted:false},failure),actor={id:'confirming-user',name:'QA确认人'};
 await assert.rejects(db.store.confirmMeeting('meeting-owner-case',actor,1,root));
 assert.equal(db.versions.length,failure==='version'?0:1);assert.equal(db.tasks.length,failure==='version'?0:1);assert.equal((await readdir(root)).length,failure==='version'?0:1);
 const retry=await db.store.confirmMeeting('meeting-owner-case',actor,1,root);assert.equal(retry!.material.currentVersionId,db.versions[0][0]);assert.equal(db.versions.length,1);assert.equal(db.tasks.length,1);assert.equal((await readdir(root)).length,1);
});
