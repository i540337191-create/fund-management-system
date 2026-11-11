import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoLedgerState } from '../src/ledger/demo-data.ts';

test('public demo is synthetic, linked and has useful relative deadlines', () => {
  const state = createDemoLedgerState(new Date('2026-11-11T06:00:00Z'));
  assert.equal(state.funds.length, 4);
  assert.equal(state.projects.length, 6);
  assert.equal(state.tasks.length, 10);
  assert.equal(state.investors.length, 8);
  for (const p of state.projects) assert(state.funds.some(f => f.id === p.fundId));
  for (const t of state.tasks) assert(state.projects.some(p => p.id === t.projectId));
  for (const f of state.funds) assert.equal(f.projectCount, state.projects.filter(p => p.fundId === f.id).length);
  assert(state.tasks.some(t => t.dueDate < '2026-11-11'));
  assert(state.tasks.some(t => t.dueDate === '2026-11-11'));
  assert(state.tasks.some(t => t.dueDate > '2026-11-11'));
  for (const rows of [state.funds, state.projects, state.tasks, state.investors, state.risks!]) for (const row of rows) assert.equal(row.dataOrigin, 'seed_demo');
  assert.equal(state.tasks.find(t => t.name === '跟进退出交割安排')?.projectId, 'demo-project-6');
  assert.equal(state.tasks.find(t => t.name === '准备投决会议材料')?.stage, '投决');
  assert.equal(state.funds[1].invested, '0 元');
  for (const fund of state.funds) assert.equal(fund.riskCount, state.risks!.filter(r => r.fundId === fund.id).length);
  for (const risk of state.risks!) assert(state.funds.some(f => f.id === risk.fundId));
  assert.equal(state.materials.length, 0);
  assert.equal(state.aiIntakeItems.length, 0);
  const future = createDemoLedgerState(new Date('2027-01-02T06:00:00Z'));
  assert(future.tasks.some(t => t.dueDate === '2027-01-02'));
  assert.notDeepEqual(state.tasks, future.tasks);
});
