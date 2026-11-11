import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createMemoryLedgerStore, createSeedLedgerState } from '../src/ledger/store.ts';
import { meetingFileTransaction } from '../src/ledger/meeting-file.ts';
import { createTestServer, registeredCookie } from './auth-fixture.ts';
async function fixture(t:any) {
  const root=await mkdtemp(join(tmpdir(),'meeting-archive-test-'));
  const state=createSeedLedgerState(),store=createMemoryLedgerStore(state),project=state.projects[0];
  const meeting=await store.createMeeting({id:'meeting-file-fixture',projectId:project.id,project:project.name,title:'合成测试会议',date:'2026-11-09',attendees:'合成参会人',summary:'原始摘要<&>',conclusions:['待核实结论'],todoItems:['复核资料'],riskItems:['信息不完整'],todos:1,risks:1,status:'待确认',taskDueDate:'2026-11-12',dataOrigin:'user_input'},{id:'user-admin',name:'管理员'});
  const server=createTestServer({ledgerStore:store,materialStorageRoot:root,auth:{mode:'password',sessionSecret:'meeting-files-fixture'}});
  const cookie=await registeredCookie(server,{id:'user-admin',name:'管理员',email:'admin',role:'admin'},'meeting-files-fixture');
  t.after(async()=>{await server.close();await rm(root,{recursive:true,force:true});});
  return {root,store,meeting,server,cookie,call:(method:any,url:string,payload?:unknown)=>server.inject({method,url,payload,headers:{cookie}})};
}
function xml(bytes:Buffer){return execFileSync('python3',['-c',"import sys,zipfile,io; print(zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())).read('word/document.xml').decode())"],{input:bytes}).toString();}
test('new confirmation persists real immutable DOCX and concurrent retries preserve human task edits',async t=>{
  const f=await fixture(t),url=`/api/meetings/${f.meeting.id}/confirm`;
  const out=await Promise.all([f.call('POST',url,{expectedRevision:1}),f.call('POST',url,{expectedRevision:1})]);
  out.forEach(r=>assert.equal(r.statusCode,200,r.body));
  const material=out[0].json().material,versions=await f.store.listMaterialVersions(material.id);
  assert.equal(versions.length,1);assert.equal(material.currentVersionId,versions[0].id);assert.equal(material.source,'会议纪要生成');
  const bytes=await readFile(join(f.root,versions[0].blobId));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),versions[0].sha256);assert.equal(bytes.length,versions[0].sizeBytes);
  const content=xml(bytes);assert.match(content,/原始摘要&lt;&amp;&gt;/);assert.match(content,/信息不完整/);assert.match(content,/非外部上传原件/);
  const download=await f.call('GET','/'+material.originalFilePath);assert.equal(download.statusCode,200);assert.deepEqual(download.rawPayload,bytes);
  const task=(await f.store.listTasks()).find(v=>v.id===out[0].json().tasks[0].id)!;task.status='已完成';task.owner='人工改派';
  const replay=await f.call('POST',url,{expectedRevision:1});assert.equal(replay.json().tasks[0].status,'已完成');assert.equal(replay.json().tasks[0].owner,'人工改派');
  assert.equal((await readdir(f.root)).filter(v=>!v.includes('.')).length,1);
  await writeFile(join(f.root,versions[0].blobId),'tampered');assert.equal((await f.call('GET','/'+material.originalFilePath)).statusCode,404);
});
test('generation failure leaves meeting, materials, versions, tasks and audit untouched',async t=>{
  const f=await fixture(t),before=JSON.stringify([await f.store.listMeetings(),await f.store.listMaterials(),await f.store.listTasks(),await f.store.listAuditEvents()]);
  const prior=process.env.DOCUMENT_PYTHON;process.env.DOCUMENT_PYTHON=join(f.root,'missing-python');
  try{const r=await f.call('POST',`/api/meetings/${f.meeting.id}/confirm`,{expectedRevision:1});assert.equal(r.statusCode,503,r.body);}finally{if(prior===undefined)delete process.env.DOCUMENT_PYTHON;else process.env.DOCUMENT_PYTHON=prior;}
  assert.equal(JSON.stringify([await f.store.listMeetings(),await f.store.listMaterials(),await f.store.listTasks(),await f.store.listAuditEvents()]),before);assert.equal((await readdir(f.root)).length,0);
});
test('historical download is a labelled generated derivative and never changes records or creates a version',async t=>{
  const f=await fixture(t),m=(await f.store.listMeetings()).find(m=>m.id===f.meeting.id)!;m.status='已归档';
  await f.store.archiveMaterial({id:`material-meeting-${m.id}`,name:m.title+'.docx',type:'会议资料',uploader:'原经办人',time:m.date,source:'会议纪要',status:'已摘要',quotes:'0',project:m.project,projectId:m.projectId,fundId:(await f.store.listProjects())[0].fundId,path:'会议档案'} as any);
  // archiveMaterial generates its own id, so use a seeded historical material to preserve the actual legacy identity.
  const material=(await f.store.listMaterials()).find(v=>v.name===m.title+'.docx')!;material.id=`material-meeting-${m.id}`;
  const before=JSON.stringify([await f.store.listMeetings(),await f.store.listMaterials(),await f.store.listTasks(),await f.store.listAuditEvents()]);
  const r=await f.call('GET',`/api/meetings/${m.id}/document`);assert.equal(r.statusCode,200,r.body);assert.match(xml(r.rawPayload),/非上传原件/);assert.equal(r.headers['x-document-provenance'],'generated-from-stored-meeting');
  const view=(await f.call('GET','/api/materials')).json().materials.find((v:any)=>v.id===material.id);assert.equal(view.originalFilePath,undefined);assert.equal(view.generatedDocumentHref,`/api/meetings/${m.id}/document`);
  assert.equal((await f.store.listMaterialVersions(material.id)).length,0);assert.equal(JSON.stringify([await f.store.listMeetings(),await f.store.listMaterials(),await f.store.listTasks(),await f.store.listAuditEvents()]),before);assert.equal((await readdir(f.root)).length,0);
  const user=await registeredCookie(f.server,{id:'private-viewer',name:'无授权测试用户',email:'private-viewer@example.invalid',role:'viewer'},'meeting-files-fixture');
  await f.store.accessTransaction(s=>{s.data.projects[m.projectId!]={visibility:'members',memberIds:[],revision:1};});
  assert.equal((await f.server.inject({method:'GET',url:`/api/meetings/${m.id}/document`,headers:{cookie:user}})).statusCode,403);
});
test('staged file cleanup distinguishes rollback from ambiguous commit',async t=>{
  const f=await fixture(t);
  await assert.rejects(meetingFileTransaction(f.root,async stage=>{await stage(f.meeting,{id:'user-admin',name:'管理员'});throw Object.assign(Error('transaction rollback'),{safeToDeleteBlob:true});}));
  assert.equal((await readdir(f.root)).length,0);
  await assert.rejects(meetingFileTransaction(f.root,async stage=>{await stage(f.meeting,{id:'user-admin',name:'管理员'});throw Error('commit outcome unknown');}));
  assert.equal((await readdir(f.root)).length,1);
});
