import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from '../src/index.ts';
import { createDemoLedgerStore } from '../src/ledger/demo-data.ts';
import { seedDemoWorkspace } from '../src/ledger/demo-workspace.ts';

test('demo uploads real synthetic text files and creates a visible weekly draft', async () => {
  const storage = await mkdtemp(join(tmpdir(), 'fund-demo-test-'));
  const server = createServer({ auth: { mode: 'local-bypass' }, ledgerStore: createDemoLedgerStore(), materialStorageRoot: storage, materialPreviewProjectRoot: resolve(import.meta.dirname, '../..') });
  try {
    await server.ready();
    await seedDemoWorkspace(server);
    const managers = (await server.inject('/api/funds/managers')).json().users;
    assert.equal(managers.length, 1);
    assert.equal(managers[0].id, 'user-admin');
    const response = await server.inject('/api/materials');
    assert.equal(response.statusCode, 200);
    const materials = response.json().materials;
    assert.equal(materials.length, 3);
    assert(materials.every((m: { name: string }) => m.name.startsWith('Demo-')));
    const workspace = (await server.inject('/api/agent-workspace')).json();
    assert.equal(workspace.weeklyReports.length, 1);
    assert.match(workspace.weeklyReports[0].title, /demo/);
    assert.equal(workspace.weeklyReports[0].status, 'draft');
    const material = materials[0];
    const versions = (await server.inject(`/api/materials/${material.id}/versions`)).json().versions;
    assert(versions.length > 0);
  } finally {
    await server.close();
    await rm(storage, { recursive: true, force: true });
  }
});
