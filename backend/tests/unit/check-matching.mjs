// Offline contract tests. No API key, network or paid model calls.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const loaded = new Map();
function load(relative, mocks = {}) {
  const filename = path.resolve(root, relative);
  if (loaded.has(filename)) return loaded.get(filename);
  const testModule = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const resolve = (name) => {
    if (name in mocks) return mocks[name];
    if (name === "server-only") return {};
    if (name.startsWith(".")) return load(path.relative(root, path.resolve(path.dirname(filename), name.replace(/\.js$/, ".ts"))), mocks);
    if (name.startsWith("@/")) return load(`src/${name.slice(2)}.ts`, mocks);
    return require(name);
  };
  new Function("require", "module", "exports", code)(resolve, testModule, testModule.exports);
  loaded.set(filename, testModule.exports);
  return testModule.exports;
}
const { parseMatchInput, MatchError } = load("src/matching/match.validation.ts");
const { createMatcher, validateRanking } = load("src/matching/match.service.ts");
const listings = JSON.parse(fs.readFileSync(path.join(root, "../data/listings.json"), "utf8"));
const constraints = { furnished: null, strict_budget: false, city: null, city_evidence: null, max_price: null, bedrooms: null, type: null, near_transit: false, max_transit_distance_m: null, transit_system: null, min_bedrooms: null, max_bedrooms: null };
const output = () => ({ intent: "property_search", constraints: { ...constraints }, matches: [
  { id: "P004", reason: "A studio at 2.3 million baht, with MRT Huai Khwang listed 400m away." },
  { id: "P007", reason: "At 1.9 million baht, this one-bedroom condo is in Chiang Mai's Old City." },
  { id: "P009", reason: "Two bedrooms at 3.1 million baht, near MRT Bang Yai (350m)." },
], summary: "Assuming a low price is your priority; these span different cities.", clarification: "Which city and maximum budget do you prefer?" });
const input = parseMatchInput({ request: " somewhere nice and cheap " });
assert.equal(input.request, "somewhere nice and cheap");
assert.equal(parseMatchInput({ request: "คอนโดไม่เกิน 6 ล้านบาท" }).locale, "th");
for (const bad of [null, [], {}, { request: " " }, { request: 1 }, { request: "x".repeat(1001) }, { request: "home", locale: "xx" }]) {
  assert.throws(() => parseMatchInput(bad), (e) => e.status === 400);
}
assert.equal(validateRanking(output(), listings).matches[0].property.price, 2300000);
for (const mutate of [
  (v) => { v.matches[0].id = "invented"; },
  (v) => { v.matches[1].id = v.matches[0].id; },
  (v) => { v.matches[0].reason = ""; },
  (v) => { v.matches.push(v.matches[0]); },
  (v) => { v.constraints.max_price = -1; },
  (v) => { v.constraints.transit_system = "unknown"; },
  (v) => { v.constraints.min_bedrooms = 4; v.constraints.max_bedrooms = 2; },
  (v) => { v.constraints.min_bedrooms = 2; v.constraints.bedrooms = 2; },
  (v) => { v.constraints.max_bedrooms = 1.5; },
]) {
  const bad = output(); mutate(bad);
  assert.throws(() => validateRanking(bad, listings), (e) => e.code === "INVALID_AI_RESPONSE");
}
const alternatives = output();
alternatives.constraints.max_price = 100;
assert.ok(validateRanking(alternatives, listings).matches.every(m => m.alternative && m.reason.includes("Over budget")));
assert.ok(validateRanking(alternatives, listings, "th").matches.every(m => m.reason.includes("เกินงบ")));
// The server owns checked mismatches while preserving disclosures it cannot check.
const mrtBudget = output();
Object.assign(mrtBudget.constraints, { city: "Bangkok", max_price: 3000000, type: "condo", near_transit: true, transit_system: "MRT" });
mrtBudget.matches[2].reason = "This condo has 48 square metres of space. The requested private pool is not documented.";
for (const locale of ["en", "th"]) {
  const result = validateRanking(mrtBudget, listings, locale);
  const exact = result.matches.find(m => m.property.id === "P004");
  assert.equal(exact.alternative, false);
  assert.equal(exact.reason, mrtBudget.matches[0].reason);
  const alternative = result.matches.find(m => m.property.id === "P009");
  assert.equal(alternative.alternative, true);
  assert.equal(alternative.reason.split(locale === "th" ? "ข้อที่ไม่ตรง" : "unmet requirements").length - 1, 1);
  assert.ok(alternative.reason.includes("100,000"));
  assert.ok(alternative.reason.includes(locale === "th" ? "นนทบุรี" : "Nonthaburi"));
  assert.ok(alternative.reason.endsWith(mrtBudget.matches[2].reason));
}
const { thaiTransit, thaiMatchName } = load("src/matching/match.localization.ts");
assert.equal(thaiTransit("MRT Bang Yai (350m)"), "MRT บางใหญ่ (350 เมตร)");
assert.equal(thaiTransit("BTS Bang Na (1.2km)"), "BTS บางนา (1.2 กิโลเมตร)");
assert.equal(thaiTransit("none"), "ไม่มีข้อมูลรถไฟฟ้าใกล้เคียง");
assert.equal(thaiTransit("MRT Unknown (700m)"), "MRT Unknown (700 เมตร)");
assert.equal(thaiTransit("Unrecognized transit description"), "Unrecognized transit description");
assert.equal(thaiMatchName("Unknown city"), "Unknown city");
const thaiRail = structuredClone(mrtBudget);
thaiRail.constraints.transit_system = "BTS";
const thaiWarning = validateRanking(thaiRail, listings.filter(p => thaiRail.matches.some(m => m.id === p.id)), "th").matches.find(m => m.property.id === "P009").reason;
assert.ok(thaiWarning.includes("อยู่ที่ นนทบุรี ไม่ใช่ กรุงเทพฯ"));
assert.ok(thaiWarning.includes("MRT บางใหญ่ (350 เมตร)"));
// A new search without a city must allow matching properties across cities.
const exactBedsRequest = "หาคอนโด 2 ห้องนอนพอดี งบไม่เกิน 6 ล้านบาท";
const exactBeds = output();
Object.assign(exactBeds.constraints, { bedrooms: 2, max_price: 6000000, type: "condo" });
exactBeds.matches = ["P001", "P009", "P010"].map(id => ({ id, reason: "Two bedrooms within the requested budget." }));
assert.ok(validateRanking(exactBeds, listings, "th", exactBedsRequest).matches.every(m => !m.alternative));
exactBeds.summary = "Only one listing meets your requirements; the others are alternatives.";
for (const locale of ["en", "th"]) {
  const all = validateRanking(exactBeds, listings, locale, exactBedsRequest);
  assert.ok(all.summary.includes(locale === "th" ? "มี 3 รายการตรง" : "3 meet"));
  assert.ok(!all.summary.includes("Only one"));
  assert.equal(all.clarification, exactBeds.clarification);
  const mixed = structuredClone(exactBeds);
  mixed.constraints.max_price = 4000000;
  const some = validateRanking(mixed, listings, locale, exactBedsRequest);
  assert.ok(some.summary.includes(locale === "th" ? "มี 1 รายการตรง" : "1 meet"));
  assert.ok(some.summary.includes(locale === "th" ? "2 รายการเป็นตัวเลือกใกล้เคียง" : "2 are alternatives"));
  mixed.constraints.max_price = 1000000;
  assert.ok(validateRanking(mixed, listings, locale).summary.includes(locale === "th" ? "มี 0 รายการตรง" : "0 meet"));
}
assert.equal(validateRanking(output(), listings).summary, output().summary);
const noMatches = { ...output(), intent: "non_property", matches: [], summary: "Please describe a property." };
assert.equal(validateRanking(noMatches, listings).summary, noMatches.summary);

const inventedCity = structuredClone(exactBeds);
inventedCity.constraints.city = "Bangkok";
// A city the customer did not write is not enforced: it is dropped, whatever evidence the model gives.
for (const evidence of [null, "กรุงเทพ", "คอนโด"]) {
  inventedCity.constraints.city_evidence = evidence;
  const result = validateRanking(inventedCity, listings, "th", exactBedsRequest);
  assert.equal(result.matches.length, 3);
  assert.ok(result.matches.every(m => !m.alternative && !m.reason.includes("ไม่ใช่ กรุงเทพ")));
}
inventedCity.constraints.city_evidence = "กรุงเทพ";
assert.equal(validateRanking(inventedCity, listings, "th", exactBedsRequest + " ในกรุงเทพ").matches.filter(m => !m.alternative).length, 1);
inventedCity.constraints.city_evidence = "Bangkok";
assert.equal(validateRanking(inventedCity, listings, "en", "2-bedroom condos in Bangkok under THB 6 million").matches.filter(m => !m.alternative).length, 1);
let rejectedCalls = 0;
const tooMany = structuredClone(exactBeds);
tooMany.matches.push({ id: "P002", reason: "An extra listing." });
const guardedMatcher = createMatcher({ listings: async () => listings, rank: async () => { rejectedCalls++; return tooMany; }, version: () => "count-guard" });
for (let i = 0; i < 2; i++) {
  await assert.rejects(guardedMatcher({ request: exactBedsRequest, locale: "th" }), e => e.code === "INVALID_AI_RESPONSE");
}
assert.equal(rejectedCalls, 2); // Invalid responses are not cached or automatically retried.
const ranked = output(); ranked.constraints.city = "Chiang Mai";
assert.equal(validateRanking(ranked, listings).matches[0].property.id, "P007");
const rail = output(); rail.constraints.transit_system = "BTS"; rail.constraints.near_transit = true;
rail.matches[1] = { id: "P001", reason: "BTS Asok 300m away." };
const railResult = validateRanking(rail, listings.filter(p => rail.matches.some(m => m.id === p.id)));
assert.equal(railResult.matches[0].property.id, "P001");
assert.equal(railResult.matches[0].alternative, false);
assert.ok(railResult.matches.slice(1).every(m => m.alternative && m.reason.includes("No nearby BTS")));
rail.constraints.transit_system = "MRT";
assert.equal(validateRanking(rail, listings.filter(p => rail.matches.some(m => m.id === p.id))).matches.find(m => m.property.id === "P001").alternative, true);
const minimum = output(); minimum.constraints.min_bedrooms = 2;
minimum.matches[1] = { id: "P003", reason: "Three bedrooms." };
const minimumResult = validateRanking(minimum, listings.filter(p => minimum.matches.some(m => m.id === p.id)));
assert.equal(minimumResult.matches.find(m => m.property.id === "P003").alternative, false);
assert.equal(minimumResult.matches.find(m => m.property.id === "P009").alternative, false);
assert.equal(minimumResult.matches.find(m => m.property.id === "P004").alternative, true);
minimum.constraints.max_bedrooms = 2;
assert.equal(validateRanking(minimum, listings.filter(p => minimum.matches.some(m => m.id === p.id))).matches.find(m => m.property.id === "P003").alternative, true);
// Too few model matches are completed from server-verified catalogue alternatives.
assert.equal(validateRanking({ ...output(), matches: output().matches.slice(0, 1) }, listings).matches.length, 3);
assert.equal(validateRanking({ ...output(), matches: [], summary: "No matching properties." }, listings).matches.length, 3);
let calls = 0, time = 0, version = "model:prompt1", catalog = listings;
const match = createMatcher({ listings: async () => catalog, rank: async () => { calls++; return output(); }, version: () => version, now: () => time });
const [first, concurrent] = await Promise.all([match(input), match(input)]);
assert.equal(calls, 1); assert.equal(first.cached, false); assert.equal(concurrent.cached, true);
first.matches[0].property.price = 1;
assert.equal((await match(input)).matches[0].property.price, 2300000);
await match({ ...input, locale: "th" }); assert.equal(calls, 2);
catalog = structuredClone(listings); catalog[0].price++;
await match(input); assert.equal(calls, 3);
version = "model:prompt2"; await match(input); assert.equal(calls, 4);
time += 300001; await match(input); assert.equal(calls, 5);
let attempts = 0;
const failing = createMatcher({ listings: async () => listings, version: () => "x", rank: async () => {
  if (++attempts === 1) throw new MatchError("AI_UNAVAILABLE", 503);
  return output();
} });
await assert.rejects(failing(input)); await failing(input); assert.equal(attempts, 2);
let emptyCalls = 0;
const empty = createMatcher({ listings: async () => [], version: () => "x", rank: async () => { emptyCalls++; } });
assert.equal((await empty(input)).matches.length, 0); assert.equal(emptyCalls, 0);
const limited = createMatcher({ listings: async () => listings, version: () => "x", rank: async () => output(), now: () => 0 });
for (let i = 0; i < 20; i++) await limited({ ...input, request: `query ${i}` });
await assert.rejects(limited(input), (e) => e.status === 429);

const originalFetch = globalThis.fetch;
const originalKey = process.env.ANTHROPIC_API_KEY;
const originalProvider = process.env.AI_PROVIDER;
process.env.AI_PROVIDER = "anthropic";
try {
  delete process.env.ANTHROPIC_API_KEY;
  const { rankWithClaude } = load("src/matching/claude.provider.ts");
  await assert.rejects(rankWithClaude(input, listings), (e) => e.code === "AI_NOT_CONFIGURED");
  process.env.ANTHROPIC_API_KEY = "offline-test-only";
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.anthropic.com/v1/messages");
    const body = JSON.parse(options.body);
    assert.equal(body.output_config.format.type, "json_schema");
    assert.match(body.system, /Thai/);
    assert.equal(JSON.parse(body.messages[0].content).catalog.length, 10);
    return Response.json({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(output()) }] });
  };
  assert.equal((await rankWithClaude(input, listings)).matches.length, 3);
  for (const status of [400, 401, 429, 500]) {
    globalThis.fetch = async () => new Response("sensitive provider details", { status });
    await assert.rejects(rankWithClaude(input, listings), (e) => e.code === (status === 429 ? "RATE_LIMITED" : "AI_UNAVAILABLE"));
  }
  globalThis.fetch = async () => { throw new DOMException("timeout", "TimeoutError"); };
  await assert.rejects(rankWithClaude(input, listings), (e) => e.status === 504);
  for (const payload of [
    { stop_reason: "max_tokens", content: [] },
    { stop_reason: "refusal", content: [] },
    { stop_reason: "end_turn", content: [{ type: "text", text: "not json" }] },
  ]) {
    globalThis.fetch = async () => Response.json(payload);
    await assert.rejects(rankWithClaude(input, listings), (e) => e.status === 502);
  }
  let reads = 0;
  const { handleMatch: POST } = load("src/matching/match.handler.ts", { "../properties/listings.repository.js": { getListings: async () => { reads++; return listings; } } });
  const request = (body, contentType = "application/json") => new Request("http://localhost/match", { method: "POST", headers: { "Content-Type": contentType }, body });
  assert.equal((await POST(request("{}", "text/plain"))).status, 415);
  assert.equal((await POST(request("{"))).status, 400);
  assert.equal((await POST(request(JSON.stringify({ request: " " })))) .status, 400);
  assert.equal((await POST(request(" ".repeat(8193)))).status, 413);
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal((await POST(request(JSON.stringify(input)))).status, 503);
  assert.equal(reads, 0);
  process.env.ANTHROPIC_API_KEY = "offline-test-only";
  globalThis.fetch = async () => Response.json({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(output()) }] });
  const response = await POST(request(JSON.stringify(input)));
  assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal((await response.json()).matches.length, 3);
} finally {
  globalThis.fetch = originalFetch;
  if (originalProvider === undefined) delete process.env.AI_PROVIDER; else process.env.AI_PROVIDER = originalProvider;
  if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = originalKey;
}
console.log("PASS (offline): input/API validation, ranking guards, DB-backed fields, Thai detection, cache/expiry/invalidation/coalescing, rate limit, provider failures. Real AI quality is not tested.");

// Strict budgets may return fewer than three, but never over-budget properties.
for (const locale of ["th", "en"]) {
  const strict = output();
  Object.assign(strict.constraints, { strict_budget: true, max_price: 1000000 });
  strict.matches = [];
  const empty = validateRanking(strict, listings, locale);
  assert.equal(empty.matches.length, 0);
  assert.ok(empty.summary.includes("1,000,000"));
  assert.ok(empty.clarification);
  strict.matches = output().matches;
  assert.throws(() => validateRanking(strict, listings, locale), e => e.code === "INVALID_AI_RESPONSE");
  strict.constraints.max_price = 2000000;
  strict.matches = [output().matches[1]];
  assert.equal(validateRanking(strict, listings, locale).matches[0].property.id, "P007");
  strict.constraints.max_price = 2500000;
  strict.matches = output().matches.slice(0, 2);
  assert.equal(validateRanking(strict, listings, locale).matches.length, 2);
  strict.matches[0] = output().matches[2];
  assert.throws(() => validateRanking(strict, listings, locale), e => e.code === "INVALID_AI_RESPONSE");
  strict.constraints.max_price = null;
  assert.throws(() => validateRanking(strict, listings, locale), e => e.code === "INVALID_AI_RESPONSE");
}

const strictEmpty = output();
Object.assign(strictEmpty.constraints, { strict_budget: true, max_price: 1000000 });
strictEmpty.matches = [];
let strictCalls = 0;
const strictMatcher = createMatcher({
  listings: async () => listings,
  rank: async () => { strictCalls++; return strictEmpty; },
  version: () => "strict-budget-test",
});
const strictInput = parseMatchInput({ request: "หาอสังหาฯ งบ 1 ล้านบาท ห้ามเกินงบ" });
assert.equal((await strictMatcher(strictInput)).matches.length, 0);
assert.equal((await strictMatcher(strictInput)).cached, true);
assert.equal(strictCalls, 1);

// Furniture requirements affect notices, exact-first ordering and verified counts.
for (const locale of ["en", "th"]) {
  for (const required of [true, false, null]) {
    const raw = output();
    raw.constraints.furnished = required;
    raw.matches = [raw.matches[2], raw.matches[0], raw.matches[1]];
    const result = validateRanking(raw, listings.filter(p => raw.matches.some(m => m.id === p.id)), locale);
    const expected = required === null ? 3 : required ? 2 : 1;
    assert.equal(result.matches.filter(m => !m.alternative).length, expected);
    assert.ok(result.matches.slice(0, expected).every(m => !m.alternative));
    for (const match of result.matches) {
      assert.equal(match.alternative, required !== null && match.property.furnished !== required);
      if (match.alternative) {
        assert.ok(match.reason.includes(locale === "th" ? "เฟอร์นิเจอร์" : "required"));
        assert.equal(match.reason.split(locale === "th" ? "ข้อที่ไม่ตรง" : "unmet requirements").length - 1, 1);
      }
    }
    if (required !== null) {
      assert.ok(result.summary.includes(locale === "th" ? `มี ${expected} รายการ` : `${expected} meet`));
      assert.ok(result.summary.includes(locale === "th" ? "เฟอร์นิเจอร์" : "furnishing status"));
    } else assert.equal(result.summary, raw.summary);
  }
}
for (const badValue of [undefined, "false", 0, {}, []]) {
  const raw = output(); raw.constraints.furnished = badValue;
  assert.throws(() => validateRanking(raw, listings), e => e.code === "INVALID_AI_RESPONSE");
}
const furnitureBudget = output();
Object.assign(furnitureBudget.constraints, { strict_budget: true, max_price: 2000000, furnished: false });
furnitureBudget.matches = [output().matches[1]];
const furnitureBudgetResult = validateRanking(furnitureBudget, listings);
assert.equal(furnitureBudgetResult.matches[0].alternative, true);
assert.ok(furnitureBudgetResult.summary.includes("0 meet"));

// No house is in budget, but price-eligible condos must still fill three places.
const houseBudget = output();
Object.assign(houseBudget.constraints, { strict_budget: true, max_price: 5000000, type: "house" });
for (const locale of ["th", "en"]) {
  const result = validateRanking(houseBudget, listings, locale);
  assert.equal(result.matches.length, 3);
  assert.ok(result.matches.every(m => m.property.price <= 5000000 && m.alternative));
  assert.ok(result.matches.every(m => m.reason.includes(locale === "th" ? "ไม่ใช่ บ้าน" : "not house")));
  assert.ok(result.summary.includes(locale === "th" ? "มี 0 รายการตรง" : "0 meet"));
}
for (const count of [0, 1, 2]) {
  const short = structuredClone(houseBudget);
  short.matches = ["P002", "P004", "P007"].slice(0, count).map(id => ({ id, reason: "In-budget condo." }));
  const result = validateRanking(short, listings);
  assert.equal(result.matches.length, 3);
  assert.ok(result.matches.every(m => m.property.price <= 5000000 && m.alternative));
}
const overfull = structuredClone(houseBudget);
overfull.matches = ["P002", "P004", "P007", "P009"].map(id => ({ id, reason: "In-budget condo." }));
assert.throws(() => validateRanking(overfull, listings), e => e.diagnostic === "ranking.matches.count" &&
  e.counts.expectedCount === 3 && e.counts.actualCount === 4);
