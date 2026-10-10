/** Web build of ./storage: localStorage, guarded for private windows and blocked site data. */
const safe = <T>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export const storage = {
  get: async (key: string): Promise<string | null> => safe(() => globalThis.localStorage?.getItem(key) ?? null, null),
  set: async (key: string, value: string): Promise<void> => safe(() => globalThis.localStorage?.setItem(key, value), undefined),
  remove: async (key: string): Promise<void> => safe(() => globalThis.localStorage?.removeItem(key), undefined),
};
