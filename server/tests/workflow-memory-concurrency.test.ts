import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryLedgerStore } from '../src/ledger/store.ts';
import { audit } from '../src/ledger/workflow.ts';
const actor={id:'user-admin',name:'管理员',email:'admin@example.local',role:'admin' as const};
for(const kind of ['meeting','intake'] as const){
 test(`memory transaction and concurrent legacy ${kind} creation preserve both tasks and audit`,async()=>{
  const store=createMemoryLedgerStore();const project=store.listProjects()[0];
  let entered!:()=>void,release!:()=>void;
  const started=new Promise<void>(resolve=>entered=resolve);
  const gate=new Promise<void>(resolve=>release=resolve);
  const workflow=store.workflowTransaction(project.id,async state=>{entered();await gate;audit(state,actor,'并发工作流','事务提交');return state.project.id;});
  await started;
  const source=kind==='meeting'?store.listMeetings().find(meeting=>meeting.projectId===project.id || meeting.project===project.name)!:store.listAiIntakeItems().find(item=>item.suggestedProject===project.name && item.generatedTasks.length)!;
  const mutation=kind==='meeting'?store.confirmMeeting(source.id,actor):store.archiveAiIntakeItem(source.id,actor);
  release();
  const [,created]=await Promise.all([workflow,mutation]);assert.ok(created);if(kind==='meeting')assert.ok(created.tasks.length>0);else assert.equal(created.tasks.length,0);
  for(const task of created.tasks)assert.deepEqual(store.listTasks(project.id).find(existing=>existing.id===task.id),task);
  const events=store.listAuditEvents();assert.ok(events.some(event=>event.action==='并发工作流'));
  for(const event of created.auditEvents)assert.ok(events.some(existing=>existing.id===event.id));
  assert.equal(kind==='meeting'?store.listMeetings().find(item=>item.id===source.id)!.status:store.listAiIntakeItems().find(item=>item.id===source.id)!.status,'已归档');
 });
}
