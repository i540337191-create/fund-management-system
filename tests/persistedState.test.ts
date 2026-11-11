import assert from "node:assert/strict";
import test from "node:test";
import {
  createPersistentStateStore,
  FUND_MANAGEMENT_BUSINESS_STATE_KEY,
  FUND_MANAGEMENT_BUSINESS_STATE_VERSION,
  type PersistentStorage,
} from "../src/lib/persistedState.ts";

function createMemoryStorage(initial: Record<string, string> = {}): PersistentStorage {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

test("saves and loads the versioned business snapshot", () => {
  const storage = createMemoryStorage();
  const store = createPersistentStateStore<{ auditEvents: string[]; tasks: Record<string, string[]> }>({
    key: FUND_MANAGEMENT_BUSINESS_STATE_KEY,
    version: FUND_MANAGEMENT_BUSINESS_STATE_VERSION,
    storage,
  });

  store.save({
    auditEvents: ["确认资料归档"],
    tasks: { "demo-robotics": ["核查条款"] },
  });

  const loaded = store.load({
    auditEvents: [],
    tasks: {},
  });

  assert.deepEqual(loaded, {
    auditEvents: ["确认资料归档"],
    tasks: { "demo-robotics": ["核查条款"] },
  });
});

test("merges saved state with defaults so new keys get safe defaults", () => {
  const storage = createMemoryStorage({
    [FUND_MANAGEMENT_BUSINESS_STATE_KEY]: JSON.stringify({
      version: FUND_MANAGEMENT_BUSINESS_STATE_VERSION,
      state: { auditEvents: ["生成报告导出包"] },
    }),
  });
  const store = createPersistentStateStore<{ auditEvents: string[]; reportExports: string[] }>({
    key: FUND_MANAGEMENT_BUSINESS_STATE_KEY,
    version: FUND_MANAGEMENT_BUSINESS_STATE_VERSION,
    storage,
  });

  const loaded = store.load({
    auditEvents: [],
    reportExports: [],
  });

  assert.deepEqual(loaded, {
    auditEvents: ["生成报告导出包"],
    reportExports: [],
  });
});

test("falls back to defaults for invalid json or version mismatch", () => {
  const defaults = { auditEvents: ["初始审计"], tasks: {} };
  const brokenStore = createPersistentStateStore<typeof defaults>({
    key: FUND_MANAGEMENT_BUSINESS_STATE_KEY,
    version: FUND_MANAGEMENT_BUSINESS_STATE_VERSION,
    storage: createMemoryStorage({ [FUND_MANAGEMENT_BUSINESS_STATE_KEY]: "{bad-json" }),
  });
  const oldStore = createPersistentStateStore<typeof defaults>({
    key: FUND_MANAGEMENT_BUSINESS_STATE_KEY,
    version: FUND_MANAGEMENT_BUSINESS_STATE_VERSION,
    storage: createMemoryStorage({
      [FUND_MANAGEMENT_BUSINESS_STATE_KEY]: JSON.stringify({ version: 0, state: { auditEvents: ["旧数据"], tasks: {} } }),
    }),
  });

  assert.deepEqual(brokenStore.load(defaults), defaults);
  assert.deepEqual(oldStore.load(defaults), defaults);
});
