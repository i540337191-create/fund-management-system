export const FUND_MANAGEMENT_BUSINESS_STATE_KEY = "fund-management-ai-platform-business-state";
export const FUND_MANAGEMENT_BUSINESS_STATE_VERSION = 1;

export type PersistentStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

type PersistedPayload<TState> = {
  version: number;
  savedAt?: string;
  state: Partial<TState>;
};

export function createPersistentStateStore<TState extends Record<string, unknown>>({
  key,
  version,
  storage,
  enabled,
}: {
  key: string;
  version: number;
  storage: PersistentStorage | null | undefined;
  enabled?: boolean;
}) {
  const canUseStorage = enabled ?? true;

  return {
    load(defaultState: TState): TState {
      if (!storage || !canUseStorage) return defaultState;

      try {
        const raw = storage.getItem(key);
        if (!raw) return defaultState;
        const parsed = JSON.parse(raw) as PersistedPayload<TState>;
        if (!isPersistedPayload(parsed) || parsed.version !== version || !isRecord(parsed.state)) {
          return defaultState;
        }

        return {
          ...defaultState,
          ...parsed.state,
        };
      } catch {
        return defaultState;
      }
    },
    save(state: TState) {
      if (!storage || !canUseStorage) return;

      try {
        storage.setItem(
          key,
          JSON.stringify({
            version,
            savedAt: new Date().toISOString(),
            state,
          } satisfies PersistedPayload<TState>),
        );
      } catch {
        // Local browser storage can be unavailable or full. The prototype should keep running.
      }
    },
    reset() {
      if (!storage || !canUseStorage) return;

      try {
        storage.removeItem(key);
      } catch {
        // Ignore storage failures for the same reason as save().
      }
    },
  };
}

function isPersistedPayload(value: unknown): value is PersistedPayload<Record<string, unknown>> {
  return isRecord(value) && typeof value.version === "number" && isRecord(value.state);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
