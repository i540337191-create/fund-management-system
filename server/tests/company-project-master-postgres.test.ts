import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {createPostgresLedgerStore} from '../src/ledger/postgres-store.ts';
import {writeCompany,writeProjectMaster} from '../src/ledger/company-project-master.ts';
const actor={id:'actual-actor',name:'同名管理员'};
// SQL double verifies atomic writes and SQL boundaries; root runs actual PostgreSQL locking separately.
function databaseDouble(fail?:'audit'|'receipt'){
 let companies:Record<string,unknown>[]=[],receipts:Record<string,unknown>[]=[],audits:Record<string,unknown>[]=[];
 let projects:Record<string,unknown>[]=[{id:'p-1',fund_id:'f-1',name:'原项目',short_name:'原',industry:'科技',description:'原描述',company_id:null,master_revision:1,fund_name:'基金',stage:'尽调',status:'拟投',owner_actor_id:'governed',manager_name:'原负责人',manager_label:'原负责人',amount_label:'尚未确认',risk_level:'中',latest:'审批结果',thesis:'论点',next_action:'下一步',updated_at_label:'2026-10-30',todo_count:1,data_origin:'source_file'}];
 let snapshot={companies,projects,receipts,audits};const calls:{sql:string;values:unknown[]}[]=[];
 const store=createPostgresLedgerStore({runWithClient:async callback=>callback({query:async(sql,values=[])=>{
 if(sql.trim().toLowerCase()==='select record_type,record_id,project_id,data_purpose from source_record_purposes')return {rows:[]};
 const q=sql.replace(/\s+/g,' ').trim().toLowerCase();calls.push({sql:q,values});
 if(q==='select object_type,payload from custom_field_schemas')return {rows:[]};
 if(q==='update custom_field_schemas set payload=$2::jsonb where object_type=$1')return {rows:[]};
 if(q==='update portfolio_companies set custom_fields=$2::jsonb,schema_revision=$3 where id=$1'){Object.assign(companies.find(c=>c.id===values[0])!,{custom_fields:JSON.parse(String(values[1])),schema_revision:values[2]});return {rows:[]};}
 if(q==='update projects set custom_fields=$2::jsonb,schema_revision=$3 where id=$1'){Object.assign(projects.find(c=>c.id===values[0])!,{custom_fields:JSON.parse(String(values[1])),schema_revision:values[2]});return {rows:[]};}

 if(q==='begin'){snapshot=structuredClone({companies,projects,receipts,audits});return {rows:[]};}
 if(q==='rollback'){({companies,projects,receipts,audits}=snapshot);return {rows:[]};}
 if(q==='commit'||q.includes('pg_advisory_xact_lock'))return {rows:[]};
 if(q.includes('from portfolio_companies order by'))return {rows:structuredClone(companies)};
 if(q.includes('from projects p'))return {rows:structuredClone(projects)};
 if(q.includes('from funds f'))return {rows:[{id:'f-1',name:'基金',short_name:'基金',revision:1}]};
 if(q.includes('from master_write_requests'))return {rows:structuredClone(receipts)};
 if(q==='select id from users where id = $1')return {rows:[{id:values[0]}]};
 if(q.startsWith('insert into portfolio_companies')){companies.push({id:values[0],name:values[1],short_name:values[2],industry:values[3],revision:values[4],data_origin:values[5],owner_actor_id:values[6]});return {rows:[]};}
 if(q.startsWith('update portfolio_companies')){Object.assign(companies.find(c=>c.id===values[0])!,{name:values[1],short_name:values[2],industry:values[3],revision:values[4],owner_actor_id:values[5]});return {rows:[]};}
 if(q.startsWith('update projects set name=')){Object.assign(projects.find(p=>p.id===values[0])!,{name:values[1],short_name:values[2],industry:values[3],description:values[4],company_id:values[5],master_revision:values[6]});return {rows:[]};}
 if(q.startsWith('insert into projects(')){projects.push({id:values[0],fund_id:values[1],company_id:values[2],master_revision:values[3],name:values[4],short_name:values[5],industry:values[6],description:values[7],manager_label:values[8],manager_name:values[8],owner_actor_id:values[9],collaborators:values[10],source_channel:values[11],status:values[12],stage:values[13],amount_label:values[14],risk_level:values[15],latest:values[16],thesis:values[17],next_action:values[18],data_origin:values[19],fund_name:'基金',updated_at_label:'2026-10-30',todo_count:0});return {rows:[]};}
 if(q.startsWith('insert into audit_events')){if(fail==='audit')throw Error('audit persistence failed');audits.push({id:values[0],module:values[1],action:values[2],target_type:values[3],target_id:values[4],target_name:values[5],actor_user_id:values[6],actor_name:values[7],event_time_label:values[8],detail:values[9],source:values[10],data_origin:values[11]});return {rows:[]};}
 if(q.includes('from audit_events a'))return {rows:audits.filter(a=>a.id===values[0])};
 if(q.startsWith('insert into master_write_requests')){if(fail==='receipt')throw Error('receipt persistence failed');receipts.push({request_id:values[0],fingerprint:values[1],result:JSON.parse(String(values[2]))});return {rows:[]};}
 throw Error(`Unexpected SQL: ${q}`);
 }})});
 return {store,calls,state:()=>structuredClone({companies,projects,receipts,audits})};
}
const company=()=>({requestId:randomUUID(),name:'企业',shortName:'企',industry:'科技'});
const patch=()=>({requestId:randomUUID(),expectedRevision:1,name:'新项目名称',shortName:'新',industry:'制造',description:'新描述'});

test('SQL double: durable company and master receipt retries preserve IDs and audit actor; metadata SQL excludes workflow state',async()=>{
 const db=databaseDouble(),body=company();const first=await writeCompany(db.store,body,actor),c=first.company!;assert.equal(c.ownerId,actor.id);assert.equal(db.state().companies[0].owner_actor_id,actor.id);assert.equal((await db.store.listCompanies())[0].ownerId,actor.id);
 assert.deepEqual(await writeCompany(db.store,body,actor),{...first,created:false});
 const changed=await writeProjectMaster(db.store,'p-1',{...patch(),companyId:c.id},actor);assert.equal(changed.project!.companyId,c.id);
 const state=db.state(),p=state.projects[0];assert.equal(p.id,'p-1');assert.equal(p.owner_actor_id,'governed');assert.equal(p.stage,'尽调');assert.equal(p.status,'拟投');assert.equal(p.amount_label,'尚未确认');assert.equal(p.latest,'审批结果');assert.equal(p.data_origin,'source_file');
 const update=db.calls.find(c=>c.sql.startsWith('update projects set'))!.sql;for(const field of ['owner_actor_id','manager_label','stage=','status=','latest=','amount_label','fund_id='])assert.equal(update.includes(field),false);
 assert.deepEqual(state.audits.map(a=>a.actor_user_id),[actor.id,actor.id]);assert.equal(state.receipts.length,2);
 const locks=db.calls.filter(c=>c.sql.includes('pg_advisory_xact_lock')).slice(0,4);assert.deepEqual(locks.map(c=>c.values[0]??c.sql),['workflow',"select pg_advisory_xact_lock(hashtext('material-upload'))",'fund-master','accounts']);
 assert.equal(db.calls.at(-1)!.sql,'commit');
 const counts=JSON.stringify(db.state());await assert.rejects(writeProjectMaster(db.store,'p-1',patch(),actor),{code:'project_revision_conflict'});assert.equal(JSON.stringify(db.state()),counts);
});
for(const failure of ['audit','receipt'] as const){
 test(`SQL double: ${failure} failure rolls back new company, project binding, audits and durable receipt`,async()=>{
 const db=databaseDouble(failure),before=db.state();await assert.rejects(writeProjectMaster(db.store,'p-1',{...patch(),newCompany:{name:'新企业',shortName:'企业',industry:''}},actor),new RegExp(`${failure} persistence failed`));assert.deepEqual(db.state(),before);assert.equal(db.calls.at(-1)!.sql,'rollback');assert.equal(db.calls.some(c=>c.sql==='commit'),false);
 });
 test(`SQL double: ${failure} failure rolls back company plus newly-created project without orphan`,async()=>{
 const db=databaseDouble(failure),before=db.state();await assert.rejects(db.store.createProject({requestId:randomUUID(),fundId:'f-1',name:'新项目',shortName:'项目',industry:'科技',manager:'',collaborators:'',sourceChannel:'',description:'',newCompany:{name:'新企业',shortName:'企业',industry:''}},actor),new RegExp(`${failure} persistence failed`));assert.deepEqual(db.state(),before);assert.equal(db.calls.at(-1)!.sql,'rollback');
 });
}

test('SQL double: same-name company edit is a conflict, never an upsert or merge',async()=>{
 const db=databaseDouble();const first=(await writeCompany(db.store,company(),actor)).company!;const second=(await writeCompany(db.store,{...company(),name:'第二企业'},actor)).company!;const before=db.state();
 await assert.rejects(writeCompany(db.store,{...company(),expectedRevision:1},actor,second.id),{code:'company_name_conflict'});assert.deepEqual(db.state(),before);assert.equal(db.state().companies.find(c=>c.id===first.id)!.name,'企业');
 assert.equal(db.calls.some(c=>/on conflict|delete from|update fund_company_investments/i.test(c.sql)),false);
});

test('SQL double: company metadata is never inferred or overwritten by a name-only material relation',async()=>{
 const calls:string[]=[];let material:Record<string,unknown>={},audit:Record<string,unknown>={};
 const store=createPostgresLedgerStore({runWithClient:async action=>action({query:async(sql,values=[])=>{
 if(sql.trim().toLowerCase()==='select record_type,record_id,project_id,data_purpose from source_record_purposes')return {rows:[]};
 const q=sql.replace(/\s+/g,' ').trim().toLowerCase();calls.push(q);
 if(['begin','commit','rollback'].includes(q))return {rows:[]};
 if(q.includes('from projects p')||q.startsWith('select id from users'))return {rows:[]};
 if(q.startsWith('insert into materials')){material={id:values[0],name:values[5],category:values[6],company_id:null,raw_project_label:'OCR旧名',fund_id:null,project_id:null};return {rows:[]};}
 if(q.includes('from materials m'))return {rows:[material]};
 if(q.startsWith('insert into audit_events')){audit={id:values[0],module:values[1],action:values[2],target_type:values[3],target_id:values[4],target_name:values[5],actor_name:values[7],event_time_label:values[8],detail:values[9]};return {rows:[]};}
 if(q.includes('from audit_events a'))return {rows:[audit]};
 throw Error(`Unexpected SQL ${q}`);
 }})});
 const result=await store.archiveMaterial({name:'历史资料',type:'其他资料',uploader:'旧人',time:'2026-10-30',source:'历史',status:'待复核',quotes:'0',project:'OCR旧名',relationships:{projects:[],funds:[],investors:[],companies:[{id:'',name:'企业旧名'}]}});
 assert.equal(result.material.companyId,null);assert.equal(calls.some(q=>/^(insert into|update|delete from) portfolio_companies/.test(q)),false);assert.equal(calls.some(q=>q.startsWith('insert into material_company_relations')),false);
});

test('SQL double: capital explicit id overrides old labels, null stays unbound, missing and ambiguous references roll back',async()=>{
 const calls:{sql:string;values:unknown[]}[]=[];let capital:Record<string,unknown>[]=[];let snapshot=capital;let audit:Record<string,unknown>={};
 const projectRows=[{id:'p-a',fund_id:'f-a',name:'同名项目',short_name:'同名',industry:'科技'},{id:'p-b',fund_id:'f-b',name:'同名项目',short_name:'同名',industry:'科技'}];
 const store=createPostgresLedgerStore({runWithClient:async action=>action({query:async(sql,values=[])=>{
 if(sql.trim().toLowerCase()==='select record_type,record_id,project_id,data_purpose from source_record_purposes')return {rows:[]};
 const q=sql.replace(/\s+/g,' ').trim().toLowerCase();calls.push({sql:q,values});
 if(q==='select object_type,payload from custom_field_schemas')return {rows:[]};
 if(q==='update custom_field_schemas set payload=$2::jsonb where object_type=$1')return {rows:[]};
 if(q==='update portfolio_companies set custom_fields=$2::jsonb,schema_revision=$3 where id=$1'){Object.assign(companies.find(c=>c.id===values[0])!,{custom_fields:JSON.parse(String(values[1])),schema_revision:values[2]});return {rows:[]};}
 if(q==='update projects set custom_fields=$2::jsonb,schema_revision=$3 where id=$1'){Object.assign(projects.find(c=>c.id===values[0])!,{custom_fields:JSON.parse(String(values[1])),schema_revision:values[2]});return {rows:[]};}

 if(q.startsWith('select pg_advisory_xact_lock'))return {rows:[]};
 if(q==='begin'){snapshot=structuredClone(capital);return {rows:[]};}if(q==='rollback'){capital=snapshot;return {rows:[]};}if(q==='commit')return {rows:[]};
 if(q.includes('from projects p'))return {rows:projectRows};if(q.includes('from funds f'))return {rows:[{id:'chosen-fund',name:'选择的基金'}]};if(q.startsWith('select id from users'))return {rows:[]};
 if(q.startsWith('insert into capital_records')){capital.push({id:values[0],fund_id:values[1],project_id:values[2],company:values[3],received_label:values[4],received_date_label:values[5],rule:values[6],receivable_label:values[7],due_date_label:values[8],status:values[9],source:values[10],confirmation_status:values[11],data_origin:'user_input'});return {rows:[]};}
 if(q.includes('from capital_records c'))return {rows:capital.filter(c=>c.id===values[0])};
 if(q.startsWith('insert into audit_events')){audit={id:values[0],module:values[1],action:values[2],target_type:values[3],target_id:values[4],target_name:values[5],actor_name:values[7],event_time_label:values[8],detail:values[9]};return {rows:[]};}if(q.includes('from audit_events a'))return {rows:[audit]};
 throw Error(`Unexpected SQL ${q}`);
 }})});
 const base={company:'同名项目',fund:'基金',fundId:'chosen-fund',received:'0',date:'2026-10-30',rule:'规则',receivable:'1000 元',dueDate:'2026-10-31',status:'未收'};
 const first=await store.createCapitalRecord({...base,projectId:'p-b',company:'历史公司标签'});assert.equal(first.capitalRecord.projectId,'p-b');assert.equal(first.capitalRecord.fundId,'chosen-fund');assert.equal(first.capitalRecord.company,'历史公司标签');
 assert.equal((await store.createCapitalRecord({...base,projectId:null})).capitalRecord.projectId,null);
 const before=structuredClone(capital);await assert.rejects(store.createCapitalRecord({...base,projectId:'missing'}),{code:'project_not_found'});assert.deepEqual(capital,before);assert.equal(calls.at(-1)!.sql,'rollback');
 await assert.rejects(store.createCapitalRecord(base),{code:'project_ambiguous'});assert.deepEqual(capital,before);assert.equal(calls.at(-1)!.sql,'rollback');
 assert.equal(calls.some(c=>c.sql.includes('p.name = $1')&&c.sql.includes('limit 1')),false);
});

test('SQL double: successful company-bound creation persists an unrecorded investment label without altering historical labels',async()=>{
 const db=databaseDouble();const before=db.state().projects[0];
 const base={requestId:randomUUID(),fundId:'f-1',name:'金额未录入项目',shortName:'未录入',industry:'科技',manager:'',collaborators:'',sourceChannel:'',description:''};
 const first=await db.store.createProject({...base,newCompany:{name:'金额企业',shortName:'企业',industry:''}},actor);assert.equal(first.project.amount,'未录入');
 const second=await db.store.createProject({...base,requestId:randomUUID(),companyId:first.project.companyId!},actor);assert.equal(second.project.amount,'未录入');
 assert.equal(db.state().projects.find(p=>p.id===first.project.id)!.amount_label,'未录入');assert.equal(db.state().projects.find(p=>p.id===second.project.id)!.amount_label,'未录入');assert.deepEqual(db.state().projects.find(p=>p.id==='p-1'),before);
});

test('SQL double: asynchronous master callback rejection rolls back before any persistence and resumes synchronous callbacks',async()=>{
 const db=databaseDouble(),before=db.state();await assert.rejects(db.store.masterTransaction(async s=>{s.companies.push({id:'async-company',name:'异步企业',shortName:'异',industry:'',revision:1,customFields:{v:'value'}});s.schemas.company.schemaRevision=99;await Promise.resolve();throw Error('async callback failure');}),/async callback failure/);
 assert.deepEqual(db.state(),before);assert.equal(db.calls.at(-1)!.sql,'rollback');assert.equal(db.calls.some(c=>c.sql.startsWith('insert ')||c.sql.startsWith('update ')),false);
 const result=await writeCompany(db.store,company(),actor);assert.equal(result.company!.revision,1);assert.equal(db.calls.at(-1)!.sql,'commit');
});

test('SQL double: asynchronous master callback resolves before core/custom persistence and result cloning',async()=>{
 const db=databaseDouble();const result=await db.store.masterTransaction(async s=>{await Promise.resolve();s.companies.push({id:'async-company',name:'异步企业',shortName:'异',industry:'',revision:1,customFields:{v:'value'},schemaRevision:0});return {id:'async-company'};});
 assert.deepEqual(result,{id:'async-company'});const row=db.state().companies.find(c=>c.id==='async-company')!;assert.equal(row.name,'异步企业');assert.deepEqual(row.custom_fields,{v:'value'});assert.equal(db.calls.at(-1)!.sql,'commit');
});

test('SQL double: renaming an existing company preserves its persisted creator',async()=>{
 const db=databaseDouble(),created=(await writeCompany(db.store,company(),actor)).company!;
 const renamed=await writeCompany(db.store,{...company(),name:'Renamed owner company',expectedRevision:1},actor,created.id);
 assert.equal(renamed.company!.ownerId,actor.id);assert.equal(db.state().companies[0].owner_actor_id,actor.id);assert.equal((await db.store.listCompanies())[0].ownerId,actor.id);
 const update=db.calls.find(c=>c.sql.startsWith('update portfolio_companies set name='))!;assert.match(update.sql,/owner_actor_id=\$6/);assert.equal(update.values[5],actor.id);
});
