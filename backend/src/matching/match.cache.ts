/** Process-local LRU cache. Reads refresh recency, never the fixed TTL. */
export class MatchCache<T> {
  private readonly entries = new Map<string, { expires: number; value: T }>();
  constructor(private readonly capacity: number, private readonly ttlMs: number, private readonly now = Date.now) {
    if (!Number.isSafeInteger(capacity) || capacity < 1 || !Number.isSafeInteger(ttlMs) || ttlMs < 1) {
      throw new Error("Match cache capacity and TTL must be positive safe integers");
    }
  }
  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    if (entry.expires <= this.now()) return undefined;
    this.entries.set(key, entry);
    return structuredClone(entry.value);
  }
  set(key: string, value: T): void {
    const time = this.now();
    for (const [id, entry] of this.entries) if (entry.expires <= time) this.entries.delete(id);
    this.entries.delete(key);
    if (this.entries.size >= this.capacity) this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(key, { expires: time + this.ttlMs, value: structuredClone(value) });
  }
}

export function matchCacheConfig(env: NodeJS.ProcessEnv = process.env) {
  const positive = (name: string, fallback: number) => {
    const raw = env[name];
    if (raw === undefined) return fallback;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid ${name}: expected a positive integer`);
    return value;
  };
  return { capacity: positive("MATCH_CACHE_MAX_ENTRIES", 100), ttlMs: positive("MATCH_CACHE_TTL_MS", 300000) };
}
