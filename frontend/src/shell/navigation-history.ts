// Remembers the previous in-app page, so a page can tell "arrived by an in-app link"
// from "opened or reloaded directly" (previousPath is null on a fresh page load).
let currentPath: string | null = null;
let lastPath: string | null = null;

export function recordPath(pathname: string) {
  if (pathname === currentPath) return;
  lastPath = currentPath;
  currentPath = pathname;
}

export function previousPath() {
  return lastPath;
}
