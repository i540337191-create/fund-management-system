import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresLedgerStore } from '../src/ledger/postgres-store.ts';
import { audit, idempotent, newTask } from '../src/ledger/workflow.ts';
const actor = {
    id: 'user-1', name: '负责人', email: 'owner@example.local', role: 'investment_manager' as const
};
// SQL double verifies transaction behavior; real PostgreSQL locking is tested separately.
function fixture() {
    let data = {
        project: {
            id: 'p', fund_id: 'f', name: '项目', short_name: '项目', fund_name: '基金', industry: '制造', status: '拟投', stage: '初筛', manager_name: '负责人', owner_actor_id: 'user-1'
        }, deals: [] as any[], diligence: null as any, tasks: [] as any[], rounds: [] as any[], receipts: [] as any[], audits: [] as any[]
    };
    let tail = Promise.resolve();
    let failAudit = false;
    const calls: string[] = [];
    const store = createPostgresLedgerStore({
        runWithClient: async (callback) => {
            let release: () => void = () => {
            };
            let snapshot = structuredClone(data);
            return callback({
                query: async (sql, values = []) => {
 if(sql.trim().toLowerCase()==='select record_type,record_id,project_id,data_purpose from source_record_purposes')return {rows:[]};
                    const q = sql.replace(/\s+/g, ' ').trim().toLowerCase();
                    calls.push(q);
                    if (q === 'begin')
                        return {
                            rows: []
                        };
                    if (q.includes('pg_advisory_xact_lock')) {
                        const previous = tail;
                        tail = new Promise<void>(r => release = r);
                        await previous;
                        snapshot = structuredClone(data);
                        return {
                            rows: []
                        };
                    }
                    if (q === 'commit') {
                        release();
                        return {
                            rows: []
                        };
                    }
                    if (q === 'rollback') {
                        data = snapshot;
                        release();
                        return {
                            rows: []
                        };
                    }
                    if(q.startsWith('update projects set owner_actor_id')) {Object.assign(data.project,{owner_actor_id:values[1],manager_name:values[2],stage:values[3],latest:values[4],next_action:values[5],status:values[6]});return {rows:[]};}
                if (q.includes('from projects p'))
                        return {
                            rows: [data.project]
                        };
                    if (q.includes('from tasks t'))
                        return {
                            rows: data.tasks
                        };
                    if(q.startsWith('select payload from post_investment_states')) return {rows:(data as any).post?[{payload:(data as any).post}]:[]};
                    if(q.startsWith('insert into post_investment_states')) {(data as any).post=JSON.parse(String(values[1]));return {rows:[]};}
                    if(q.startsWith('select payload from deal_batches')) return {rows:data.deals.map(d=>({payload:d}))};
                    if(q.startsWith('insert into deal_batches')) { const d=JSON.parse(String(values[2]));data.deals=data.deals.filter(v=>v.id!==d.id);data.deals.push(d);return {rows:[]}; }
                    if(q.startsWith('select payload from diligence_cases')) return {rows:data.diligence?[{payload:data.diligence}]:[]};
                    if(q.startsWith('insert into diligence_cases')) { data.diligence=JSON.parse(String(values[1]));return {rows:[]}; }
                    if (q.startsWith('select payload from approval_rounds'))
                        return {
                            rows: data.rounds
                        };
                    if (q.startsWith('select request_id,fingerprint,result'))
                        return {
                            rows: data.receipts
                        };
                    if (q.startsWith('insert into tasks')) {
                        const row = {
                            id: values[0], project_id: values[1], name: values[2], type: values[3], stage: values[4], owner_actor_id: values[5], owner_name: values[6], due_date_label: values[7], status: values[8], priority: values[9], relation: values[10], note: values[11], kind: values[12], approval_round_id: values[13], revision: values[14], completed_at: values[15], data_origin:values[16], updated_at_label: '2026-10-29'
                        };
                        data.tasks = data.tasks.filter(t => t.id !== row.id);
                        data.tasks.push(row);
                        return {
                            rows: []
                        };
                    }
                    if (q.startsWith('insert into approval_rounds')) {
                        data.rounds.push({
                            payload: JSON.parse(String(values[2]))
                        });
                        return {
                            rows: []
                        };
                    }
                    if (q.startsWith('insert into workflow_requests')) {
                        data.receipts.push({
                            request_id: values[0], fingerprint: values[2], result: JSON.parse(String(values[3]))
                        });
                        return {
                            rows: []
                        };
                    }
                    if (q.startsWith('select id from users'))
                        return {
                            rows: [{
                                    id: actor.id
                                }]
                        };
                    if (q.startsWith('insert into audit_events')) {
                        if (failAudit)
                            throw new Error('audit_write_failure');
                        data.audits.push({
                            id: values[0], module: values[1], action: values[2], target_type: values[3], target_id: values[4], target_name: values[5], actor_name: values[7], event_time_label: values[8], detail: values[9], source: values[10]
                        });
                        return {
                            rows: []
                        };
                    }
                    if (q.includes('from audit_events a'))
                        return {
                            rows: data.audits.filter(a => a.id === values[0])
                        };
                    throw new Error('Unhandled SQL ' + q);
                }
            });
        }
    });
    return {
        store, calls, records: () => structuredClone(data), fail: () => failAudit = true
    };
}
test('SQL double: concurrent request retries write one task/audit/receipt and preserve event identity', async () => {
    const f = fixture();
    const write = () => f.store.workflowTransaction('p', async (s) => idempotent(s, 'request', actor, {
        action: 'task'
    }, async () => {
        const task = newTask(s, actor, {
            name: '核验', dueDate: '2026-11-01'
        });
        return {
            task, auditEvent: audit(s, actor, '创建任务', task, task.id)
        };
    }));
    const results = await Promise.all([write(), write()]);
    assert.equal(results.filter(r => r.created).length, 1);
    assert.equal(f.records().tasks.length, 1);
    assert.equal(f.records().audits.length, 1);
    assert.equal(f.records().receipts.length, 1);
    assert.equal(f.records().audits[0].id, results[0].auditEvent.id);
    assert.equal(results[0].task.id, results[1].task.id);
    assert.equal(f.calls.filter(q => q === 'commit').length, 2);
});
test('SQL double: audit failure rolls back task and receipt, allowing clean retry', async () => {
    const f = fixture();
    f.fail();
    await assert.rejects(f.store.workflowTransaction('p', async (s) => idempotent(s, 'request', actor, {}, async () => {
        const task = newTask(s, actor, {
            name: '核验', dueDate: '2026-11-01'
        });
        return {
            task, auditEvent: audit(s, actor, '创建任务', task)
        };
    })), /audit_write_failure/);
    assert.equal(f.records().tasks.length, 0);
    assert.equal(f.records().receipts.length, 0);
    assert.equal(f.records().audits.length, 0);
    assert.equal(f.calls.at(-1), 'rollback');
});

test('SQL double: project audit reads filter exact project/task IDs without project-name fallback', async()=>{
 const calls:{sql:string;values:unknown[]}[]=[];
 const store=createPostgresLedgerStore({runWithClient:async callback=>callback({query:async(sql,values=[])=>{
 if(sql.trim().toLowerCase()==='select record_type,record_id,project_id,data_purpose from source_record_purposes')return {rows:[]};calls.push({sql,values});return {rows:[]};}})});
 await store.listAuditEvents('project-A');
 assert.equal(calls.length,1);assert.deepEqual(calls[0].values,['project-A']);assert.match(calls[0].sql,/a\.target_id = \$1 or a\.target_id in \(select id from tasks where project_id = \$1\)/);assert.doesNotMatch(calls[0].sql,/target_name like/);
});

test('SQL double: derived review/supplement and manual task provenance survives database refresh',async()=>{
 const f=fixture();const created=await f.store.workflowTransaction('p',async state=>[
  newTask(state,actor,{name:'审批',dueDate:'2026-11-01',kind:'review'}),
  newTask(state,actor,{name:'补件',dueDate:'2026-11-01',kind:'supplement'}),
  newTask(state,actor,{name:'手工',dueDate:'2026-11-01'})
 ]);
 const reloaded=await f.store.listTasks('p');
 for(const task of created){assert.equal(reloaded.find(stored=>stored.id===task.id)?.dataOrigin,task.dataOrigin);assert.equal(f.records().tasks.find(stored=>stored.id===task.id).data_origin,task.kind==='manual'?'user_input':'system_generated');}
 assert.ok(f.calls.filter(sql=>sql.startsWith('insert into tasks')).every(sql=>sql.includes('now(),$17)') && !sql.includes("now(),'user_input')")));
});


test('SQL double: diligence aggregate, managed task, receipt and audit commit together and survive reload',async()=>{
 const f=fixture();const result=await f.store.workflowTransaction('p',async s=>idempotent(s,'dd-request',actor,{action:'dd'},async()=>{
  s.diligence={id:'dd',projectId:'p',ownerId:actor.id,reviewers:[actor],revision:1,status:'active',note:'',createdBy:actor,createdAt:'2026-10-29',items:[],findings:[],reports:[],supplements:[]};
  const task=newTask(s,actor,{name:'尽调',kind:'diligence',dueDate:'2026-11-01'});return {diligence:s.diligence,task,auditEvent:audit(s,actor,'尽调操作',{})};
 }));
 assert.equal(result.diligence.id,'dd');const read=await f.store.workflowTransaction('p',async s=>s.diligence);assert.deepEqual(read,result.diligence);assert.equal(f.records().tasks[0].kind,'diligence');
 f.fail();await assert.rejects(f.store.workflowTransaction('p',async s=>idempotent(s,'dd-fail',actor,{},async()=>{s.diligence!.revision++;newTask(s,actor,{name:'回滚',kind:'diligence',dueDate:'2026-11-01'});return {auditEvent:audit(s,actor,'失败',{})};})),/audit_write_failure/);
 assert.equal(f.records().diligence.revision,1);assert.equal(f.records().tasks.length,1);assert.equal(f.records().receipts.length,1);assert.equal(f.records().audits.length,1);
});
test('SQL double: deal batches persist and audit failure rolls back closing, stage, task and receipt together', async()=>{
 const f=fixture();
 await f.store.workflowTransaction('p',async s=>{s.deals=[{id:'deal',revision:1,status:'active'} as any];});
 assert.equal((await f.store.workflowTransaction('p',async s=>s.deals![0])).id,'deal');
 f.fail();
 await assert.rejects(f.store.workflowTransaction('p',async s=>idempotent(s,'close-deal',actor,{},async()=>{
  s.deals![0].status='closed';s.deals![0].revision++;s.project.stage='投后';s.project.status='已投';newTask(s,actor,{name:'投后周期',dueDate:'2027-01-31'});return {auditEvent:audit(s,actor,'交易交割',{})};
 })),/audit_write_failure/);
 assert.equal(f.records().deals[0].status,'active');assert.equal(f.records().project.stage,'初筛');assert.equal(f.records().project.status,'拟投');assert.equal(f.records().tasks.length,0);assert.equal(f.records().receipts.length,0);
});

test('SQL double: committed closing project status and stage both survive reload',async()=>{ const f=fixture(); await f.store.workflowTransaction('p',async s=>{s.project.stage='投后';s.project.status='已投';}); const p=await f.store.workflowTransaction('p',async s=>s.project);assert.equal(p.stage,'投后');assert.equal(p.status,'已投'); });

test('SQL double: post state, warning task, receipt and audit commit/reload together and rollback atomically',async()=>{
 const f=fixture();
 await f.store.workflowTransaction('p',async s=>idempotent(s,'post-save',actor,{resource:'post'},async()=>{s.postInvestment={revision:2,financials:[],visits:[],archives:[],clauses:[]};newTask(s,actor,{name:'条款预警',kind:'post_clause',dueDate:'2026-11-01'});return {postInvestment:s.postInvestment,auditEvent:audit(s,actor,'投后保存',{})};}));
 const before=structuredClone(await f.store.workflowTransaction('p',async s=>({post:s.postInvestment,tasks:s.tasks,receipts:s.receipts})));assert.equal(before.post?.revision,2);assert.equal(before.tasks[0].kind,'post_clause');assert.ok(before.receipts['post-save']);
 f.fail();await assert.rejects(f.store.workflowTransaction('p',async s=>idempotent(s,'post-fail',actor,{},async()=>{s.postInvestment!.revision++;newTask(s,actor,{name:'不应写入',kind:'post_clause',dueDate:'2026-11-02'});return {auditEvent:audit(s,actor,'失败',{})};})),/audit_write_failure/);
 assert.deepEqual(await f.store.workflowTransaction('p',async s=>({post:s.postInvestment,tasks:s.tasks,receipts:s.receipts})),before);
});

test('SQL double: new and legacy transaction options load both banking directions inside global lock and persist payment rows atomically',async()=>{
 const f=fixture();
 await f.store.workflowTransaction('p',async s=>{s.postInvestment={revision:1,financials:[],visits:[],archives:[],clauses:[],exitPayments:[{fundId:'f',bankAccount:'ACCOUNT',bankReference:'IN',status:'posted'} as any],investmentCashflows:[{id:'out',fundId:'f',bankAccount:'ACCOUNT',bankReference:'OUT',status:'posted'} as any]};});
 for(const options of [{bankEventIdentities:true},{exitPaymentIdentities:true}]){
  const start=f.calls.length;
  const data=await f.store.workflowTransaction('p',async s=>({all:s.bankEventIdentities,legacy:s.exitPaymentIdentities}),options);
  assert.equal(data.all!.length,2);assert.ok(data.all!.some(v=>v.bankReference==='OUT'));assert.equal(data.legacy?.length,options.exitPaymentIdentities?1:undefined);
  const calls=f.calls.slice(start),lock=calls.findIndex(q=>q.includes('pg_advisory_xact_lock')),bank=calls.indexOf('select payload from post_investment_states');assert.ok(lock>=0&&bank>lock);
 }
 const before=structuredClone(await f.store.workflowTransaction('p',async s=>s.postInvestment));f.fail();
 await assert.rejects(f.store.workflowTransaction('p',async s=>idempotent(s,'cashfail',actor,{},async()=>{s.postInvestment!.investmentCashflows![0].status='reversed';s.postInvestment!.revision++;audit(s,actor,'实际投资付款登记',{action:'reverse'});return {};}),{bankEventIdentities:true}),/audit_write_failure/);
 assert.deepEqual(await f.store.workflowTransaction('p',async s=>s.postInvestment),before);
});
