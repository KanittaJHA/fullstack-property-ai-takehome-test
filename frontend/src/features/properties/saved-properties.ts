// Only public listing IDs are persisted. Never store credentials or listing data.
const KEY = "property-saved-v1";
const CHANGE = "property-saved-change";
let fallback = "[]";
let memoryOnly = false;
const validId = (id: unknown): id is string =>
  typeof id === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(id);

export function parseSaved(raw: string): string[] {
  try {
    if (raw.length > 110_000) return [];
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value)
      ? [...new Set(value.filter(validId))].slice(0, 1000)
      : [];
  } catch {
    return [];
  }
}

export const serverSaved = () => "[]";
export function readSaved(): string {
  if (memoryOnly) return fallback;
  try {
    return window.localStorage.getItem(KEY) ?? "[]";
  } catch {
    return fallback;
  }
}

export function subscribeSaved(callback: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) callback();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE, callback);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE, callback);
  };
}

export function toggleSaved(id: string) {
  if (!validId(id)) return;
  const current = parseSaved(readSaved());
  const next = current.includes(id)
    ? current.filter(value => value !== id)
    : [...current, id].slice(-1000);
  fallback = JSON.stringify(next);
  try {
    window.localStorage.setItem(KEY, fallback);
    memoryOnly = false;
  } catch {
    // Bookmarks still work for this page session when storage is blocked/full.
    memoryOnly = true;
  }
  window.dispatchEvent(new Event(CHANGE));
}
