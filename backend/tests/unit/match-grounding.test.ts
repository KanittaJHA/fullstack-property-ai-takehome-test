import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Property } from "../../../packages/contracts/src/domain/property.js";
import { validateRanking } from "../../src/matching/match.service.js";
import { safeTransitReason } from "../../src/matching/match.reason.js";

const listings: Property[] = JSON.parse(readFileSync(new URL("../../../data/listings.json", import.meta.url), "utf8"));
const constraints = { city: null, city_evidence: null, type: null, furnished: null, max_price: null,
  bedrooms: null, min_bedrooms: null, max_bedrooms: null, near_transit: false, max_transit_distance_m: null, transit_system: null, strict_budget: false };
const raw = () => ({ intent: "property_search", constraints: { ...constraints }, summary: "Some options.", clarification: null,
  matches: ["P007", "P004", "P009"].map(id => ({ id, reason: "A property from the supplied listings." })) });

test("vague request cannot display Asok transit facts on the Chiang Mai record", () => {
  for (const locale of ["en", "th"] as const) {
    const value = raw();
    value.matches[0].reason = locale === "en"
      ? "This Chiang Mai condo costs THB 1.9 million. It is listed 300 m from BTS Asok."
      : "คอนโดเชียงใหม่ ราคา 1.9 ล้านบาท อยู่ห่างจาก BTS อโศก 300 เมตร";
    const result = validateRanking(value, listings, locale);
    assert.deepEqual(result.matches.map(m => m.property.id), ["P007", "P004", "P009"]);
    const reason = result.matches[0].reason;
    assert.doesNotMatch(reason, /Asok|อโศก|300/);
    assert.match(reason, /1,900,000/);
    assert.match(reason, locale === "en" ? /No nearby rail information/ : /ไม่มีข้อมูลรถไฟฟ้า/);
  }
});

test("rail guard checks station, network and distance while keeping valid explanations", () => {
  const asok = listings.find(p => p.id === "P001")!;
  for (const good of ["58 square metres, 300 m from BTS Asok.", "300 meters from Asok BTS station.", "ใกล้ BTS อโศก 300 เมตร", "0.3 km from BTS Asok."]) {
    assert.equal(safeTransitReason(good, asok, "en"), good);
  }
  for (const bad of ["500 m from BTS Asok.", "300 m from MRT Asok.", "300 m from BTS Thonglor.", "BTS Asok and BTS Thonglor are 300 m away."]) {
    const result = safeTransitReason(bad, asok, "en");
    assert.notEqual(result, bad);
    assert.match(result, /BTS Asok \(300m\)/);
    assert.doesNotMatch(result, /Thonglor|500|MRT/);
  }
});

test("full catalog replaces worse alternatives, keeps AI ties and uses replacement's own facts", () => {
  const value = { ...raw(), constraints: { ...constraints, city: "Bangkok", city_evidence: "Bangkok",
    max_price: 6000000, bedrooms: 2, type: "condo", furnished: true, near_transit: true, transit_system: "BTS" },
    matches: ["P001", "P002", "P009"].map(id => ({ id, reason: "Candidate explanation." })) };
  const result = validateRanking(value, listings, "en", "Furnished 2-bedroom condo in Bangkok under 6 million near BTS");
  assert.deepEqual(result.matches.map(m => m.property.id), ["P001", "P002", "P004"]);
  assert.match(result.summary, /1 meets/);
  assert.match(result.matches[1].reason, /1 bedroom instead of 2/);
  assert.doesNotMatch(result.matches[1].reason, /1 bedrooms/);
  assert.match(result.matches[2].reason, /2,300,000/);
  assert.match(result.matches[2].reason, /MRT Huai Khwang/);
  assert.doesNotMatch(result.matches[2].reason, /Bang Yai|Nonthaburi/);
  assert.ok(result.matches.slice(1).every(m => m.alternative));
});

test("a studio alternative is called a studio, not 0 bedrooms, in both languages", () => {
  const value = () => ({ ...raw(), constraints: { ...constraints, city: "Bangkok", city_evidence: "Bangkok",
    max_price: 6000000, bedrooms: 2, type: "condo", furnished: true, near_transit: true, transit_system: "BTS" },
    matches: ["P001", "P002", "P004"].map(id => ({ id, reason: "Candidate explanation." })) });
  const request = "Furnished 2-bedroom condo in Bangkok under 6 million near BTS";
  const studioReason = (locale: "en" | "th") => {
    const studio = validateRanking(value(), listings, locale, request).matches.find(m => m.property.id === "P004");
    assert.ok(studio, "the studio P004 is one of the alternatives");
    return studio.reason;
  };
  const studioEn = studioReason("en");
  const studioTh = studioReason("th");
  assert.match(studioEn, /Studio instead of 2/);
  assert.match(studioTh, /เป็นห้องสตูดิโอ แทนที่ต้องการ 2 ห้องนอน/);
  for (const reason of [studioEn, studioTh]) assert.doesNotMatch(reason, /\b0 bedrooms|มี 0 ห้องนอน/);
});

test("full catalog correction cannot introduce over-budget listings", () => {
  for (const [budget, ids] of [[1000000, []], [2000000, ["P007"]], [2500000, ["P007", "P004"]], [5000000, ["P007", "P004", "P009"]]] as const) {
    const value = { ...raw(), constraints: { ...constraints, max_price: budget, strict_budget: true, type: "house" },
      matches: ids.map(id => ({ id, reason: "Candidate explanation." })) };
    const result = validateRanking(value, listings);
    assert.equal(result.matches.length, ids.length);
    assert.ok(result.matches.every(m => m.property.price <= budget && m.alternative));
  }
});

test("rail distance participates in ranking, inclusive boundary, summary and bilingual disclosures", () => {
  for (const locale of ["en", "th"] as const) {
    const value = { ...raw(), constraints: { ...constraints, near_transit: true, transit_system: "BTS", max_transit_distance_m: 300 },
      matches: ["P002", "P003", "P008"].map(id => ({ id, reason: "Candidate explanation." })) };
    const result = validateRanking(value, listings, locale);
    assert.deepEqual(result.matches.map(m => m.property.id), ["P001", "P005", "P002"]);
    assert.deepEqual(result.matches.map(m => m.alternative), [false, false, true]);
    assert.match(result.matches[2].reason, /500/);
    assert.match(result.matches[2].reason, /300/);
    assert.match(result.summary, locale === "th" ? /ระยะทางรถไฟฟ้าสูงสุด/ : /maximum listed rail distance/);
    const tooClose = { ...value, constraints: { ...value.constraints, max_transit_distance_m: 100 } };
    assert.ok(validateRanking(tooClose, listings, locale).matches.every(m => m.alternative));
  }
});

test("unknown rail distance cannot match; kilometre catalog distances convert; wrong network still fails", () => {
  const records = structuredClone(listings.filter(p => ["P001", "P004", "P007"].includes(p.id)));
  records.find(p => p.id === "P001")!.near_transit = "BTS Asok (0.3km)";
  const value = { ...raw(), constraints: { ...constraints, near_transit: true, transit_system: "BTS", max_transit_distance_m: 400 },
    matches: records.map(p => ({ id: p.id, reason: "Candidate explanation." })) };
  const result = validateRanking(value, records);
  assert.equal(result.matches.find(m => m.property.id === "P001")!.alternative, false);
  assert.match(result.matches.find(m => m.property.id === "P004")!.reason, /No nearby BTS/);
  assert.match(result.matches.find(m => m.property.id === "P007")!.reason, /No listed rail distance/);
  for (const distance of [-1, 0.5, "300", undefined, Infinity]) {
    assert.throws(() => validateRanking({ ...value, constraints: { ...value.constraints, max_transit_distance_m: distance } }, records));
  }
  assert.throws(() => validateRanking({ ...value, constraints: { ...value.constraints, near_transit: false } }, records));
});

test("short property output is completed from verified alternatives; too many is rejected; non-property needs neutral constraints", () => {
  const filled = validateRanking({ ...raw(), constraints: { ...constraints, city: "Phuket", city_evidence: "Phuket" }, matches: [] }, listings, "en", "5-bedroom house in Phuket");
  assert.equal(filled.matches.length, 3);
  assert.ok(filled.matches.every(m => m.alternative && /not Phuket/.test(m.reason)), "Server-filled listings disclose unmet criteria");
  const strict = { ...raw(), constraints: { ...constraints, bedrooms: 2, max_price: 3500000, strict_budget: true }, matches: [{ id: "P009", reason: "2 bedrooms near MRT Bang Yai for THB 3.1 million." }] };
  const completed = validateRanking(strict, listings, "en", "2 bedrooms, strictly no more than 3.5 million baht");
  assert.equal(completed.matches[0].property.id, "P009");
  assert.deepEqual(completed.matches.slice(1).map(m => m.property.id).sort(), ["P004", "P007"]);
  assert.ok(completed.matches.every(m => m.property.price <= 3500000), "Filling never breaks a strict budget");
  assert.ok(!completed.matches[0].alternative && completed.matches.slice(1).every(m => m.alternative));
  const tooMany = { ...raw(), matches: ["P007", "P004", "P009", "P002"].map(id => ({ id, reason: "A listing." })) };
  assert.throws(() => validateRanking(tooMany, listings), { diagnostic: "ranking.matches.count" });
  assert.throws(() => validateRanking({ ...raw(), intent: undefined }, listings), { diagnostic: "ranking.intent" });
  const unrelated = { ...raw(), intent: "non_property", matches: [], clarification: "What property are you looking for?" };
  assert.equal(validateRanking(unrelated, listings).matches.length, 0);
  assert.throws(() => validateRanking({ ...unrelated, clarification: null }, listings));
  assert.throws(() => validateRanking({ ...unrelated, matches: raw().matches }, listings));
  assert.throws(() => validateRanking({ ...unrelated, constraints: { ...constraints, max_price: 1000000 } }, listings));
  // Vague property requests still return three, and a genuinely empty catalog permits zero.
  assert.equal(validateRanking(raw(), listings, "en", "somewhere nice and cheap").matches.length, 3);
  assert.equal(validateRanking({ ...raw(), matches: [] }, []).matches.length, 0);
});

test("Thailand is not a city mismatch in strict-budget searches; counts remain 0/1/2", () => {
  for (const [city, evidence, request, locale] of [
    ["Thailand", "ไทย", "หาที่อยู่อาศัยในไทย ห้ามเกินงบ", "th"],
    ["ประเทศไทย", "ประเทศไทย", "หาที่อยู่อาศัยในประเทศไทย ห้ามเกินงบ", "th"],
    ["Thailand", "Thailand", "Find a home in Thailand, strict budget", "en"],
  ] as const) {
    for (const [budget, ids] of [[1000000, []], [2000000, ["P007"]], [2500000, ["P007", "P004"]]] as [number, string[]][]) {
      const value = { ...raw(), constraints: { ...constraints, city, city_evidence: evidence, strict_budget: true, max_price: budget },
        matches: ids.map(id => ({ id, reason: "Located in a different city from Thailand." })) };
      const result = validateRanking(value, listings, locale, request);
      assert.equal(result.matches.length, ids.length);
      assert.ok(result.matches.every(m => m.property.price <= budget && !m.alternative));
      assert.ok(result.matches.every(m => !m.reason.includes("different city")));
      assert.doesNotMatch(result.summary, /จังหวัด\/เมือง|criteria for city/);
      assert.equal(value.constraints.city, city); // No mutation of provider output.
    }
  }
});

test("country correction must not erase an explicitly requested city or accept invented evidence", () => {
  const value = { ...raw(), constraints: { ...constraints, city: "Thailand", city_evidence: "Thailand" } };
  assert.throws(() => validateRanking(value, listings, "en", "Find a home in Bangkok, Thailand"), { diagnostic: "ranking.constraints.country_instead_of_city" });
  // A city the customer never wrote is dropped rather than enforced or fatal.
  const inferred = validateRanking({ ...value, constraints: { ...value.constraints, city: "Pattaya", city_evidence: "Pattaya" } }, listings, "en", "Beachfront condo I can rent out");
  assert.equal(inferred.matches.length, 3);
  assert.ok(inferred.matches.every(m => !/not Pattaya/.test(m.reason)));
  const district = validateRanking({ ...value, constraints: { ...value.constraints, city: "Bangkok", city_evidence: "Asok" } }, listings, "en", "Condo near Asok");
  assert.equal(district.matches.length, 3);
  const bangkok = { ...value, constraints: { ...value.constraints, city: "Bangkok", city_evidence: "Bangkok" } };
  assert.ok(validateRanking(bangkok, listings, "en", "Find a home in Bangkok, Thailand").matches.every(m => m.property.city === "Bangkok"));
});
