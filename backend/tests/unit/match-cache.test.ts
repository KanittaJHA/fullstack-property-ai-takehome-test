import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { MatchCache, matchCacheConfig } from "../../src/matching/match.cache.js";
import { createMatcher, type MatchCacheEvent } from "../../src/matching/match.service.js";
import type { Property } from "../../../packages/contracts/src/domain/property.js";

const catalog: Property[] = JSON.parse(readFileSync(new URL("../../../data/listings.json", import.meta.url), "utf8"));
const raw = () => ({ intent: "property_search", constraints: { city: null, city_evidence: null, type: null, furnished: null, max_price: null, bedrooms: null, min_bedrooms: null, max_bedrooms: null, near_transit: false, max_transit_distance_m: null, transit_system: null, strict_budget: false }, summary: "Some options.", clarification: null, matches: ["P007", "P004", "P009"].map(id => ({ id, reason: "A property from the supplied listings." })) });
const input = { request: "Somewhere nice", locale: "en" as const };

test("LRU evicts least recently read; reads do not extend TTL; values are isolated", () => {
  let time = 0;
  const cache = new MatchCache<{ n: number }>(2, 10, () => time);
  const value = { n: 1 };
  cache.set("a", value); value.n = 9;
  cache.set("b", { n: 2 });
  time = 5;
  const read = cache.get("a")!; assert.equal(read.n, 1); read.n = 8;
  cache.set("c", { n: 3 });
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("a")!.n, 1);
  time = 10;
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("c")!.n, 3);
});

test("expired entries are removed before evicting live entries and config rejects invalid values", () => {
  let time = 0;
  const cache = new MatchCache<number>(2, 10, () => time);
  cache.set("old", 1); time = 5; cache.set("live", 2); cache.get("old");
  time = 10; cache.set("new", 3);
  assert.equal(cache.get("live"), 2);
  assert.deepEqual(matchCacheConfig({}), { capacity: 100, ttlMs: 300000 });
  assert.deepEqual(matchCacheConfig({ MATCH_CACHE_MAX_ENTRIES: "2", MATCH_CACHE_TTL_MS: "20" }), { capacity: 2, ttlMs: 20 });
  for (const value of ["", "0", "-1", "1.5", "NaN", "Infinity"]) assert.throws(() => matchCacheConfig({ MATCH_CACHE_TTL_MS: value }));
});

test("five concurrent requests share one AI call, report statuses and retain no query in telemetry", async () => {
  const events: MatchCacheEvent[] = [];
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const match = createMatcher({ listings: async () => catalog, version: () => "test", observe: e => events.push(e), rank: async () => { calls++; await gate; return raw(); } });
  const requests = Array.from({ length: 5 }, () => match(input));
  release();
  const results = await Promise.all(requests);
  assert.equal(calls, 1);
  assert.deepEqual(results.map(r => r.cacheStatus), ["miss", "coalesced", "coalesced", "coalesced", "coalesced"]);
  assert.equal((await match(input)).cacheStatus, "hit");
  assert.deepEqual(events.at(-1)!.totals, { requests: 6, hits: 1, misses: 1, coalesced: 4, bypasses: 0, errors: 0, aiCalls: 1, aiCallsAvoided: 5 });
  assert.ok(events.every(e => e.durationMs >= 0));
  assert.ok(!JSON.stringify(events).includes(input.request));
});

test("catalog order and surrounding whitespace reuse cache; data, locale, version and TTL invalidate", async () => {
  let records = structuredClone(catalog), version = "v1", time = 0, calls = 0;
  const match = createMatcher({ listings: async () => records, version: () => version, now: () => time, cache: { capacity: 10, ttlMs: 10 }, rank: async () => { calls++; return raw(); } });
  await match(input);
  records.reverse();
  assert.equal((await match({ ...input, request: ` ${input.request} ` })).cacheStatus, "hit");
  records[0].price++;
  assert.equal((await match(input)).cacheStatus, "miss");
  await match({ ...input, locale: "th" });
  version = "v2"; await match(input);
  time = 10; await match(input);
  assert.equal(calls, 5);
});

test("shared failures are not cached; pending slot clears; logging failures do not affect results", async () => {
  let calls = 0;
  const events: MatchCacheEvent[] = [];
  const match = createMatcher({ listings: async () => catalog, version: () => "test", observe: e => { events.push(e); throw new Error("logger unavailable"); }, rank: async () => { if (++calls === 1) throw new Error("provider unavailable"); return raw(); } });
  const failed = await Promise.allSettled([match(input), match(input)]);
  assert.ok(failed.every(r => r.status === "rejected"));
  assert.equal((await match(input)).cacheStatus, "miss");
  assert.equal((await match(input)).cacheStatus, "hit");
  assert.equal(calls, 2);
  assert.equal(events.at(-1)!.totals.errors, 2);
  assert.equal(events.at(-1)!.totals.aiCallsAvoided, 1);
});

test("invalid property output (too many matches) is rejected and never cached", async () => {
  let calls = 0;
  const match = createMatcher({ listings: async () => catalog, version: () => "v19", rank: async () => { calls++; return { ...raw(), matches: ["P007", "P004", "P009", "P002"].map(id => ({ id, reason: "A listing." })) }; } });
  await assert.rejects(match(input), { code: "INVALID_AI_RESPONSE", diagnostic: "ranking.matches.count" });
  await assert.rejects(match(input), { code: "INVALID_AI_RESPONSE" });
  assert.equal(calls, 2);
});
