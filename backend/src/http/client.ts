/** Set by server.ts from the TCP connection; any copy sent by a client is overwritten. */
export const REMOTE_ADDRESS_HEADER = "x-remote-address";

/**
 * Who is calling, for per-client rate limits. Behind a proxy that appends the caller's address to
 * X-Forwarded-For (most hosts), set TRUSTED_PROXY=true and the last hop is used; otherwise the
 * connection address. Locally every request arrives from the Next.js proxy, so all share one key.
 */
export function clientKey(request: Request): string {
  if (process.env.TRUSTED_PROXY === "true") {
    const hops = request.headers.get("x-forwarded-for")?.split(",").map(hop => hop.trim()).filter(Boolean);
    if (hops?.length) return hops[hops.length - 1];
  }
  return request.headers.get(REMOTE_ADDRESS_HEADER) || "unknown";
}
