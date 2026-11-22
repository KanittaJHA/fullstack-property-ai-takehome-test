import { getListings } from "../properties/listings.repository.js";
import { createMatcher } from "./match.service.js";
import { selectedProvider } from "./match.provider.js";
import { MatchError, logMatchFailure, parseMatchInput } from "./match.validation.js";
import { matchCacheConfig } from "./match.cache.js";
import { clientKey } from "../http/client.js";
import { jsonResponse } from "../http/json-response.js";
import { createRateLimiter } from "../http/rate-limit.js";
import { MAX_BODY_BYTES } from "../http/limits.js";

const match = createMatcher({
  cache: matchCacheConfig(),
  observe: event => console.info(JSON.stringify(event)),
  listings: getListings,
  rank: (input, listings) => selectedProvider().rank(input, listings),
  version: () => selectedProvider().version,
});

// Each client may start 10 searches a minute; the service also caps AI calls for everyone (match.service.ts).
const allow = createRateLimiter();

export async function handleMatch(request: Request) {
  try {
    if (!allow(`match:${clientKey(request)}`, 10)) throw new MatchError("RATE_LIMITED", 429);
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new MatchError("INVALID_REQUEST", 415);
    // Bound streamed input too, rather than trusting Content-Length.
    const reader = request.body?.getReader();
    if (!reader) throw new MatchError("INVALID_REQUEST", 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new MatchError("REQUEST_TOO_LARGE", 413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new MatchError("INVALID_REQUEST", 400); }
    const input = parseMatchInput(body);
    if (!selectedProvider().key?.trim()) throw new MatchError("AI_NOT_CONFIGURED", 503);
    return jsonResponse(await match(input));
  } catch (error) {
    const known = error instanceof MatchError ? error : new MatchError("MATCH_UNAVAILABLE", 503);
    logMatchFailure(known);
    return jsonResponse({ error: known.code }, known.status, known.status === 429 ? { "Retry-After": "60" } : {});
  }
}
