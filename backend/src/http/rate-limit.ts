/** Fixed one-minute windows per key, kept in this process's memory. Returns false once `max` is used up. */
export function createRateLimiter(windowMs = 60_000) {
  const windows = new Map<string, { count: number; until: number }>();
  return (key: string, max: number): boolean => {
    const now = Date.now();
    for (const [id, window] of windows) if (window.until <= now) windows.delete(id);
    const window = windows.get(key) ?? { count: 0, until: now + windowMs };
    if (window.count >= max) return false;
    window.count++;
    windows.set(key, window);
    return true;
  };
}
