import assert from 'node:assert/strict';
import test from 'node:test';
import { createPostgresLedgerStore } from '../src/ledger/postgres-store.ts';
import { randomUUID } from 'node:crypto';
import type { UploadMaterialInput } from '../src/ledger/material-upload.ts';
const input: UploadMaterialInput = {
    requestId: randomUUID(), versionId: randomUUID(), name: 'test.pdf', type: '法务资料', projectId: 'project-1', sizeBytes: 10, sha256: 'a'.repeat(64), mimeType: 'application/pdf', actor: { id: 'user-admin', name: '管理员' }
};
// SQL double: validates transaction flow and failure classification, not PostgreSQL locking itself.
function databaseDouble(options: {
    failAudit?: boolean;
    ambiguousCommit?: boolean;
    duplicateName?: boolean;
    legacyMaterial?: boolean;
    failSecondVersion?: boolean;
} = {}) {
    const calls: string[] = [];
    let materials: Record<string, unknown>[] = options.legacyMaterial ? [{id:'legacy-material',project_id:'project-1',fund_id:'legacy-fund',name:input.name,category:input.type,source_material_id:'legacy-source',source:'真实物料',owner_name:'历史人员',archived_at_label:'2026-06-10',original_file_path:'docs/original.pdf',recognized_html_path:'old-v1.html',fund_relations:[{id:'legacy-fund',name:'原基金',isPrimary:true}],company_relations:[{id:'old-company',name:'原公司'}],investor_relations:[{id:'old-lp',name:'原LP'}],data_origin:'source_file'}] : [];
    let chunks:Record<string,unknown>[]=options.legacyMaterial ? [{material_id:'legacy-material',content:'old historical text'},{material_id:'legacy-source',content:'old alias text'}] : [];
    let versions: Record<string, unknown>[] = [];
    let audits: Record<string, unknown>[] = [];
    let snapshot = { materials, versions, audits, chunks };
    const store = createPostgresLedgerStore({ runWithClient: async (callback) => callback({ query: async (sql, values = []) => {
 if(sql.trim().toLowerCase()==='select record_type,record_id,project_id,data_purpose from source_record_purposes')return {rows:[]};
                const q = sql.replace(/\s+/g, ' ').trim().toLowerCase();
                calls.push(q);
                if (q === 'begin') {
                    snapshot = structuredClone({ materials, versions, audits, chunks });
                    return { rows: [] };
                }
                if (q === 'rollback') {
                    ({ materials, versions, audits, chunks } = snapshot);
                    return { rows: [] };
                }
                if (q === 'commit') {
                    if (options.ambiguousCommit)
                        throw new Error('lost commit acknowledgement');
                    return { rows: [] };
                }
                if (q.includes('pg_advisory_xact_lock'))
                    return { rows: [] };
                if (q.includes('from portfolio_companies')) return {rows:[{id:'company-1',name:'公司测试',short_name:'公司',industry:'',revision:1,data_origin:'user_input'}]};
                if(q.startsWith('insert into material_company_relations')){const m=materials.find(m=>m.id===values[0]);if(m)m.company_relations=[{id:values[1],name:'公司测试',relationType:'primary',isPrimary:true}];return {rows:[]};}
                if (q.includes('from projects p'))
                    return { rows: [{
                                id: 'project-1', fund_id: 'fund-1', name: '测试项目', short_name: '项目'
                            }] };
                if (q === 'select * from material_versions where request_id=$1')
                    return { rows: versions.filter(v => v.request_id === values[0]) };
                if (q.startsWith('select * from material_versions where material_id='))
                    return { rows: versions.filter(v => v.material_id === values[0]) };
                if (q.startsWith('select m.id from materials'))
                    return { rows: options.duplicateName ? [{id:'other-same-name-material'}] : [] };
                if (q.startsWith('select m.*'))
                    return { rows: materials.filter(m => !values.length || m.id === values[0]) };
                if (q.startsWith('insert into materials(')) {
                    materials.push({
                        id: values[0], fund_id: values[1], project_id: values[2], raw_project_label: values[3], name: values[4], category: values[5], archived_at_label: values[6], owner_name: input.actor.name, path: '项目档案 / 用户上传', source: '用户上传', status: '待复核', data_origin: 'user_input'
                    });
                    return { rows: [] };
                }
                if (q.startsWith('delete from material_text_chunks')) { chunks=chunks.filter(chunk=>!values.includes(chunk.material_id)); return {rows:[]}; }
                if (q.includes('from material_text_chunks c')) { assert.ok(q.includes('m.current_version_id is null')); return {rows:[]}; }
                if (q.includes('from funds f')) return {rows:[{id:'fund-1',name:'项目基金'},{id:'legacy-fund',name:'原基金'}]};
                if (q.startsWith('update materials set project_id=')) {Object.assign(materials.find(m=>m.id===values[0])!,{project_id:values[1],fund_id:values[2],raw_project_label:values[3]});return {rows:[]};}
                if (q.startsWith('delete from material_') || q.startsWith('insert into material_project_relations') || q.startsWith('insert into material_fund_relations'))
                    return { rows: [] };
                if (q.startsWith('select id from users'))
                    return { rows: [] };
                if (q.startsWith('insert into audit_events')) {
                    if (options.failAudit)
                        throw new Error('audit unavailable');
                    audits.push({
                        id: values[0], module: values[1], action: values[2], target_type: values[3], target_id: values[4], target_name: values[5], actor_name: values[7], event_time_label: values[8], detail: values[9], source: values[10], data_origin: values[11]
                    });
                    return { rows: [] };
                }
                if (q.includes('from audit_events a'))
                    return { rows: audits.filter(a => a.id === values[0]) };
                if (q.startsWith('insert into material_versions')) {
                    if(options.failSecondVersion && versions.length===1) throw new Error('new version persistence failed');
                    versions.push({
                        id: values[0], material_id: values[1], version: values[2], name: values[3], size_bytes: values[4], sha256: values[5], mime_type: values[6], uploaded_by: values[7], uploaded_by_id: values[8], created_at: values[9], blob_id: values[0], request_id: values[10], fingerprint: values[11], audit_event_id: values[12]
                    });
                    return { rows: [] };
                }
                if (q.startsWith('update materials set name=')) {
                    Object.assign(materials.find(m => m.id === values[0])!, {
                        preview_file_path:null,recognized_text_path:null,recognized_html_path:null,page_image_manifest_path:null,page_image_dir:null,name: values[1], category: values[2], original_file_path: values[4], size_bytes: values[5], sha256: values[6], file_extension: values[7], current_version: values[8], current_version_id: values[9]
                    });
                    return { rows: [] };
                }
                throw new Error('unexpected SQL ' + q);
            } }) });
    return { store, calls, records: () => ({ materials, versions, audits, chunks }) };
}
test('SQL double: upload, immutable version and audit commit together; retry creates nothing', async () => {
    const db = databaseDouble();
    const first = await db.store.uploadMaterial(input);
    assert.equal(first.material.currentVersion, 1);
    assert.equal(first.version.sha256, input.sha256);
    assert.equal(first.auditEvent.actor, input.actor.name);
    assert.equal(db.calls[1], "select pg_advisory_xact_lock(hashtext('material-upload'))");
    assert.equal(db.calls.at(-1), 'commit');
    const retry = await db.store.uploadMaterial({ ...input, versionId: randomUUID() });
    assert.equal(retry.created, false);
    assert.equal(retry.version.id, first.version.id);
    assert.equal(db.records().versions.length, 1);
    assert.equal(db.records().audits.length, 1);
    await assert.rejects(() => db.store.uploadMaterial({ ...input, sha256: 'b'.repeat(64) }), { message: 'upload_request_conflict' });
});
test('SQL double: ordinary transaction failure rolls back and marks uncommitted blob disposable', async () => {
    const db = databaseDouble({ failAudit: true });
    await assert.rejects(() => db.store.uploadMaterial(input), (error: unknown) => { assert.equal((error as {
        safeToDeleteBlob?: boolean;
    }).safeToDeleteBlob, true); return true; });
    assert.equal(db.calls.at(-1), 'rollback');
    assert.deepEqual(db.records(), { materials: [], versions: [], audits: [], chunks: [] });
});
test('SQL double: ambiguous COMMIT retains blob and retry recovers the committed version', async () => {
    const db = databaseDouble({ ambiguousCommit: true });
    await assert.rejects(() => db.store.uploadMaterial(input), (error: unknown) => { assert.equal((error as {
        safeToDeleteBlob?: boolean;
    }).safeToDeleteBlob, false); return true; });
    assert.equal(db.calls.at(-1), 'commit');
    assert.equal(db.records().versions.length, 1);
    // The committed record is discoverable even after a lost response.
    assert.equal((await db.store.listMaterialVersions(db.records().materials[0].id as string))[0].id, input.versionId);
});


test('SQL double: explicit material id skips name collision while new identities still conflict', async () => {
    const options = { duplicateName: false };
    const db = databaseDouble(options);
    const first = await db.store.uploadMaterial(input);
    options.duplicateName = true;
    const checksBefore = db.calls.filter(sql => sql.startsWith('select m.id from materials')).length;
    const version = await db.store.uploadMaterial({ ...input, requestId: randomUUID(), versionId: randomUUID(), materialId: first.material.id, expectedVersion: 1 });
    assert.equal(version.material.currentVersion, 2);
    assert.equal(db.calls.filter(sql => sql.startsWith('select m.id from materials')).length, checksBefore);
    assert.equal(db.records().versions.length, 2);
    await assert.rejects(() => db.store.uploadMaterial({ ...input, requestId: randomUUID(), versionId: randomUUID() }), { message: 'material_name_conflict' });
});

test('SQL double: project materials require a primary or explicit project id and never claim name-only history', async () => {
    let materialSql = '';
    let materialValues: unknown[] = [];
    const store = createPostgresLedgerStore({ runWithClient: async callback => callback({ query: async (sql, values = []) => {
 if(sql.trim().toLowerCase()==='select record_type,record_id,project_id,data_purpose from source_record_purposes')return {rows:[]};
        const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
        if (normalized.includes('from projects p')) return { rows: [{ id: 'project-b', name: '同名项目', short_name: '同名', fund_id: 'fund-1' }] };
        if (normalized.includes('from materials m')) { materialSql = normalized; materialValues = values; }
        return { rows: [] };
    } }) });
    await store.getProjectDetail('project-b');
    assert.deepEqual(materialValues, ['project-b']);
    assert.match(materialSql, /m\.project_id=\$1 or exists\(select 1 from material_project_relations mr where mr\.material_id=m\.id and mr\.project_id=\$1\)/);
    assert.equal(materialSql.includes('raw_project_label ='), false);
});


const legacySeed = () => ({id:randomUUID(),blobId:randomUUID(),name:input.name,sizeBytes:20,sha256:'b'.repeat(64),mimeType:'application/pdf',uploadedBy:'历史人员',uploadedById:'',createdAt:'2026-06-10T00:00:00.000Z',requestId:randomUUID(),fingerprint:'legacy:'+'b'.repeat(64)});
test('SQL double: adoption preserves V1 and V2 together, clears old derivatives and chunks',async()=>{
    const db=databaseDouble({legacyMaterial:true});const seed=legacySeed();seed.blobId=seed.id;
    const result=await db.store.uploadMaterial({...input,materialId:'legacy-material',expectedVersion:0,legacyVersion:seed});
    assert.equal(result.material.currentVersion,2);assert.equal(db.records().versions.length,2);assert.equal(db.records().versions[0].uploaded_by,'历史人员');assert.equal(db.records().versions[0].created_at,seed.createdAt);assert.equal(result.material.recognizedHtmlPath,null);assert.deepEqual(db.records().chunks,[]);
    assert.equal((await db.store.searchMaterialTextChunks({query:'historical'})).length,0);
    const replay=await db.store.uploadMaterial({...input,materialId:'legacy-material',expectedVersion:0});assert.equal(replay.created,false);assert.equal(replay.version.id,result.version.id);
});
test('SQL double: failed V2 insertion rolls back historical adoption and retains original index',async()=>{
    const db=databaseDouble({legacyMaterial:true,failSecondVersion:true});const before=structuredClone(db.records());
    await assert.rejects(()=>db.store.uploadMaterial({...input,materialId:'legacy-material',expectedVersion:0,legacyVersion:legacySeed()}),/new version persistence failed/);
    assert.deepEqual(db.records(),before);assert.equal(db.calls.at(-1),'rollback');
});
test('SQL double: legacy project association preserves original fund and unrelated relation tables',async()=>{
    const db=databaseDouble({legacyMaterial:true});const result=await db.store.setMaterialProjects('legacy-material',['project-1'],input.actor);
    assert.equal(result.material.fundId,'legacy-fund');assert.equal(result.material.dataOrigin,'source_file');assert.equal(result.material.relationships!.investors[0].id,'old-lp');assert.equal(result.material.relationships!.companies[0].id,'old-company');
    assert.ok(db.calls.includes('delete from material_project_relations where material_id=$1'));
    for(const kind of ['fund','company','investor']) assert.equal(db.calls.some(sql=>sql.startsWith(`delete from material_${kind}_relations`)),false);
});

test('SQL double: company-only upload preserves nullable fund/project and company relation',async()=>{
 const db=databaseDouble();const result=await db.store.uploadMaterial({...input,requestId:randomUUID(),versionId:randomUUID(),projectId:undefined,companyId:'company-1'});assert.equal(result.material.fundId,null);assert.equal(result.material.projectId,null);assert.equal(result.material.relationships?.companies[0].id,'company-1');
});
