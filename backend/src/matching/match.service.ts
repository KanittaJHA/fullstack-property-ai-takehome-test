import { createHash } from "node:crypto";
import type { Property } from "../../../packages/contracts/src/domain/property.js";
import type { MatchInput, MatchResult } from "../../../packages/contracts/src/contracts/matching.js";
import { MatchError } from "./match.validation.js";
import { groundedReason, safeTransitReason } from "./match.reason.js";
import { thaiMatchName, thaiTransit } from "./match.localization.js";
import { MatchCache, matchCacheConfig } from "./match.cache.js";

type MatchPayload = Omit<MatchResult, "cached" | "cacheStatus">;
export type MatchCacheEvent = {
  event: "match_completed"; cacheStatus: NonNullable<MatchResult["cacheStatus"]>;
  outcome: "success" | "error"; durationMs: number;
  totals: { requests: number; hits: number; misses: number; coalesced: number; bypasses: number; errors: number; aiCalls: number; aiCallsAvoided: number };
};
export type MatchDependencies = {
  listings: () => Promise<Property[]>;
  rank: (input: MatchInput, listings: Property[]) => Promise<unknown>;
  version: () => string;
  now?: () => number;
  cache?: { capacity: number; ttlMs: number };
  observe?: (event: MatchCacheEvent) => void;
};

// Validate all model output at the trust boundary; never accept model-made property data.
export function validateRanking(value: unknown, listings: Property[], locale: "en" | "th" = "en", request?: string): MatchPayload {
  const invalid = (reason: string) => { throw new MatchError("INVALID_AI_RESPONSE", 502, `ranking.${reason}`); };
  if (!value || typeof value !== "object") return invalid("object");
  const data = value as Record<string, unknown>;
  const text = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
  if (!text(data.summary, 1600) || !(data.clarification === null || text(data.clarification, 600)) ||
    !Array.isArray(data.matches)) return invalid("summary_clarification_or_matches");
  if (!data.constraints || typeof data.constraints !== "object") return invalid("constraints.object");
  const constraints = { ...data.constraints as Record<string, unknown> };
  let correctedCountry = false;
  if (!(constraints.city === null || text(constraints.city, 100)) ||
    !(constraints.type === null || ["condo", "house", "villa"].includes(String(constraints.type))) ||
    typeof constraints.near_transit !== "boolean" || typeof constraints.strict_budget !== "boolean") return invalid("constraints.basic_fields");
  if (constraints.furnished !== null && typeof constraints.furnished !== "boolean") return invalid("constraints.furnished");
  if (![null, "BTS", "MRT"].includes(constraints.transit_system as string | null)) return invalid("constraints.transit_system");
  // Verify provenance before trusting a model-supplied location constraint. A city the
  // customer never wrote (e.g. inferred from "beachfront") is not enforced as a
  // requirement: it is dropped and every listing is checked without it below.
  if (request !== undefined && constraints.city !== null) {
    const evidence = constraints.city_evidence;
    if ((constraints.city as string).trim().toLowerCase() === "null" || !text(evidence, 100) ||
      !request.normalize("NFC").toLowerCase().includes(evidence.normalize("NFC").toLowerCase())) {
      constraints.city = null;
      constraints.city_evidence = null;
    }
  }
  if (request !== undefined && constraints.city !== null) {
    const evidence = constraints.city_evidence as string;
    const aliases: Record<string, string[]> = {
      bangkok: ["bangkok", "กรุงเทพ", "กรุงเทพฯ", "กรุงเทพมหานคร", "กทม", "กทม."],
      "chiang mai": ["chiang mai", "เชียงใหม่"],
      nonthaburi: ["nonthaburi", "นนทบุรี"],
      pattaya: ["pattaya", "พัทยา"],
    };
    const knownAliases = aliases[(constraints.city as string).toLowerCase()];
    // Evidence that is not the city's own name (e.g. a district such as "Asok") is also an inference.
    if (knownAliases && !knownAliases.includes(evidence.trim().toLowerCase())) {
      constraints.city = null;
      constraints.city_evidence = null;
    }
    const thailand = ["thailand", "ไทย", "ประเทศไทย", "ราชอาณาจักรไทย"];
    if (constraints.city !== null && thailand.includes((constraints.city as string).trim().toLowerCase())) {
      if (!thailand.includes(evidence.trim().toLowerCase())) return invalid("constraints.country_evidence_alias");
      // Do not silently discard a city requirement when the model extracted only its country.
      const query = request.normalize("NFC").toLowerCase();
      if (Object.values(aliases).flat().some(alias => query.includes(alias))) return invalid("constraints.country_instead_of_city");
      // All records in this application's catalog are in Thailand.
      constraints.city = null;
      constraints.city_evidence = null;
      correctedCountry = true;
    }

  }
  for (const key of ["max_price", "bedrooms", "min_bedrooms", "max_bedrooms"]) {
    const number = constraints[key];
    if (number !== null && (typeof number !== "number" || !Number.isSafeInteger(number) || number < 0)) return invalid(`constraints.${key}`);
  }
  if (constraints.min_bedrooms !== null && constraints.max_bedrooms !== null &&
    (constraints.min_bedrooms as number) > (constraints.max_bedrooms as number)) return invalid("constraints.bedroom_range");
  if (constraints.bedrooms !== null && (constraints.min_bedrooms !== null || constraints.max_bedrooms !== null)) return invalid("constraints.bedroom_conflict");
  if (constraints.strict_budget && constraints.max_price === null) return invalid("constraints.strict_budget_without_price");
  if (!["property_search", "non_property"].includes(data.intent as string)) return invalid("intent");
  const maxDistance = constraints.max_transit_distance_m;
  if (maxDistance !== null && (typeof maxDistance !== "number" || !Number.isSafeInteger(maxDistance) || maxDistance < 0)) return invalid("constraints.max_transit_distance_m");
  if (maxDistance !== null && !constraints.near_transit) return invalid("constraints.distance_without_transit");
  if (data.intent === "non_property") {
    const nullable = ["city", "city_evidence", "max_price", "bedrooms", "min_bedrooms", "max_bedrooms", "type", "furnished", "transit_system", "max_transit_distance_m"];
    if (data.matches.length || !text(data.clarification, 600) || constraints.strict_budget || constraints.near_transit || nullable.some(key => constraints[key] !== null)) return invalid("non_property.contract");
    return { matches: [], summary: data.summary.trim(), clarification: (data.clarification as string).trim() };
  }
  const eligible = constraints.strict_budget
    ? listings.filter(p => p.price <= (constraints.max_price as number))
    : listings;
  // Explicit budget prohibitions override the default top-three fallback. Too few model
  // picks are completed below from server-verified catalogue alternatives; too many is invalid.
  const expected = Math.min(3, eligible.length);
  if (data.matches.length > expected) {
    throw new MatchError("INVALID_AI_RESPONSE", 502, "ranking.matches.count", {
      expectedCount: expected, actualCount: data.matches.length,
    });
  }
  const ids = new Set<string>();
  const modelMatches = data.matches.map((item: unknown) => {
    if (!item || typeof item !== "object") return invalid("matches.item");
    const match = item as Record<string, unknown>;
    if (typeof match.id !== "string" || !text(match.reason, 1200) || ids.has(match.id)) return invalid("matches.id_reason_or_duplicate");
    const property = listings.find((p) => p.id === match.id);
    if (!property || (constraints.strict_budget && property.price > (constraints.max_price as number))) return invalid("matches.unknown_id_or_strict_budget");
    ids.add(property.id);
    return { property, reason: correctedCountry ? groundedReason(property, locale) : match.reason.trim() };
  });
  const evaluate = (property: Property, reason: string) => {
    const tradeoffs: string[] = [];
    const th = locale === "th";
    // A studio has 0 bedrooms; say "studio" rather than "0 bedrooms".
    const has = th
      ? (property.bedrooms === 0 ? "เป็นห้องสตูดิโอ" : `มี ${property.bedrooms} ห้องนอน`)
      : (property.bedrooms === 0 ? "Studio" : `${property.bedrooms} bedroom${property.bedrooms === 1 ? "" : "s"}`);
    if (constraints.city !== null && property.city.toLowerCase() !== (constraints.city as string).toLowerCase()) {
      tradeoffs.push(th ? `อยู่ที่ ${thaiMatchName(property.city)} ไม่ใช่ ${thaiMatchName(constraints.city as string)}` : `Located in ${property.city}, not ${constraints.city}`);
    }
    if (constraints.type !== null && property.type !== constraints.type) {
      tradeoffs.push(th ? `ประเภท ${thaiMatchName(property.type)} ไม่ใช่ ${thaiMatchName(constraints.type as string)}` : `Type is ${property.type}, not ${constraints.type}`);
    }
    if (constraints.max_price !== null && property.price > (constraints.max_price as number)) {
      const excess = (property.price - (constraints.max_price as number)).toLocaleString("en-US");
      tradeoffs.push(th ? `เกินงบ ${excess} บาท` : `Over budget by THB ${excess}`);
    }
    if (constraints.bedrooms !== null && property.bedrooms !== constraints.bedrooms) {
      tradeoffs.push(th
        ? `${has} แทนที่ต้องการ ${constraints.bedrooms === 0 ? "ห้องสตูดิโอ" : `${constraints.bedrooms} ห้องนอน`}`
        : `${has} instead of ${constraints.bedrooms === 0 ? "a studio" : constraints.bedrooms}`);
    }
    if (constraints.min_bedrooms !== null && property.bedrooms < (constraints.min_bedrooms as number)) {
      tradeoffs.push(th ? `${has} ต่ำกว่าขั้นต่ำ ${constraints.min_bedrooms} ห้องนอน` : `${has}, below the minimum of ${constraints.min_bedrooms}`);
    }
    if (constraints.max_bedrooms !== null && property.bedrooms > (constraints.max_bedrooms as number)) {
      tradeoffs.push(th ? `${has} มากกว่าสูงสุด ${constraints.max_bedrooms} ห้องนอน` : `${has}, above the maximum of ${constraints.max_bedrooms}`);
    }
    if (constraints.furnished !== null && property.furnished !== constraints.furnished) {
      tradeoffs.push(th
        ? (constraints.furnished ? "ไม่มีเฟอร์นิเจอร์ แต่ต้องการพร้อมเฟอร์นิเจอร์" : "พร้อมเฟอร์นิเจอร์ แต่ต้องการไม่มีเฟอร์นิเจอร์")
        : (constraints.furnished ? "Unfurnished, but furnished is required" : "Furnished, but unfurnished is required"));
    }
    if (constraints.transit_system !== null && !new RegExp(`\\b${constraints.transit_system}\\b`, "i").test(property.near_transit)) {
      tradeoffs.push(th ? `ไม่มีข้อมูลว่าใกล้ ${constraints.transit_system} (ข้อมูลระบุ: ${thaiTransit(property.near_transit)})` : `No nearby ${constraints.transit_system} listed (listing information: ${property.near_transit})`);
    } else if (constraints.near_transit && property.near_transit === "none") {
      tradeoffs.push(th ? "ไม่มีข้อมูลรถไฟฟ้าใกล้เคียง" : "No nearby rail information listed");
    }
    if (maxDistance !== null) {
      const rail = /^(BTS|MRT)\s+.+?\s*\((\d+(?:\.\d+)?)\s*(km|m)\)$/i.exec(property.near_transit.trim());
      const distance = rail ? Number(rail[2]) * (rail[3].toLowerCase() === "km" ? 1000 : 1) : null;
      if (distance === null || !Number.isFinite(distance)) {
        tradeoffs.push(th ? `ไม่มีข้อมูลระยะทางรถไฟฟ้าเพื่อยืนยันว่าไม่เกิน ${maxDistance} เมตร` : `No listed rail distance to verify the ${maxDistance} m limit`);
      } else if (distance > (maxDistance as number)) {
        tradeoffs.push(th ? `ระยะทางรถไฟฟ้าที่ระบุ ${distance} เมตร เกินระยะสูงสุด ${maxDistance} เมตร` : `Listed rail distance ${distance} m exceeds the ${maxDistance} m limit`);
      }
    }
    const facts = safeTransitReason(reason, property, locale);
    return {
      property,
      reason: tradeoffs.length
        ? `${th ? "ตัวเลือกใกล้เคียง — ข้อที่ไม่ตรง" : "Alternative — unmet requirements"}: ${tradeoffs.join("; ")}. ${facts}`
        : facts,
      alternative: tradeoffs.length > 0,
      unmetCount: tradeoffs.length,
    };
  };
  // Compare the full price-eligible catalog. Preserve AI preference for ties;
  // only replace a selected record when another has fewer verified mismatches,
  // and fill any slots the model left empty. Non-property responses returned above.
  const candidates = [
    ...modelMatches.map(m => evaluate(m.property, m.reason)),
    ...eligible.filter(p => !ids.has(p.id)).map(p => evaluate(p, groundedReason(p, locale))),
  ];
  candidates.sort((a, b) => a.unmetCount - b.unmetCount);
  const matches = candidates.slice(0, expected).map(({ unmetCount: _count, ...match }) => match);
  // Count only returned listings against the checks above. Do not claim that
  // unstructured preferences (e.g. amenities) were verified here.
  const th = locale === "th";
  const checked: string[] = [];
  if (constraints.city !== null) checked.push(th ? "จังหวัด/เมือง" : "city");
  if (constraints.max_price !== null) checked.push(th ? "งบประมาณ" : "budget");
  if (constraints.furnished !== null) checked.push(th ? "เฟอร์นิเจอร์" : "furnishing status");
  if (constraints.type !== null) checked.push(th ? "ประเภทอสังหาฯ" : "property type");
  if ([constraints.bedrooms, constraints.min_bedrooms, constraints.max_bedrooms].some(v => v !== null)) {
    checked.push(th ? "จำนวนห้องนอน" : "bedroom count");
  }
  if (constraints.transit_system !== null || constraints.near_transit) {
    checked.push(th ? "ข้อมูลรถไฟฟ้าใกล้เคียง" : "listed nearby rail information");
  }
  if (maxDistance !== null) checked.push(th ? "ระยะทางรถไฟฟ้าสูงสุด" : "maximum listed rail distance");
  let summary = data.summary.trim();
  if (matches.length && checked.length) {
    const matched = matches.filter(m => !m.alternative).length;
    const alternatives = matches.length - matched;
    const scope = checked.join(th ? " / " : ", ");
    summary = th
      ? `จาก ${matches.length} รายการที่แสดง มี ${matched} รายการตรงตามเงื่อนไข${scope}${alternatives ? ` และ ${alternatives} รายการเป็นตัวเลือกใกล้เคียงที่มีข้อไม่ตรง` : ""} ดูรายละเอียดและข้อจำกัดของแต่ละรายการประกอบ`
      : `Of the ${matches.length} listings shown, ${matched} ${matched === 1 ? "meets" : "meet"} the criteria for ${scope}${alternatives ? `; ${alternatives} ${alternatives === 1 ? "is an alternative" : "are alternatives"} with unmet criteria` : ""}. See each listing's explanation for its details and limitations.`;
  }
  let clarification = data.clarification as string | null;
  if (constraints.strict_budget && !matches.length) {
    const budget = (constraints.max_price as number).toLocaleString("en-US");
    summary = th
      ? `ไม่พบอสังหาฯ ในฐานข้อมูลที่ราคาไม่เกิน ${budget} บาท จึงไม่แสดงรายการเกินงบตามที่คุณระบุ`
      : `No listings in the database are priced at or below THB ${budget}. Over-budget listings are excluded as requested.`;
    clarification = th
      ? "หากต้องการเพิ่มงบ โปรดระบุงบใหม่พร้อมเงื่อนไขเดิมในช่องค้นหา แล้วค้นหาอีกครั้ง"
      : "If you want to increase your budget, enter the new budget together with your other requirements and search again.";
  }
  return { matches, summary, clarification };
}

export function createMatcher(deps: MatchDependencies) {
  const now = deps.now ?? Date.now;
  const config = deps.cache ?? matchCacheConfig();
  const cache = new MatchCache<MatchPayload>(config.capacity, config.ttlMs, now);
  const pending = new Map<string, Promise<MatchPayload>>();
  const totals = { requests: 0, hits: 0, misses: 0, coalesced: 0, bypasses: 0, errors: 0, aiCalls: 0, aiCallsAvoided: 0 };
  let windowStart = now();
  let calls = 0;
  return async (original: MatchInput): Promise<MatchResult> => {
    const started = now();
    const input = { ...original, request: original.request.trim() };
    let cacheStatus: MatchCacheEvent["cacheStatus"] = "bypass";
    let outcome: MatchCacheEvent["outcome"] = "error";
    totals.requests++;
    try {
      // Canonical order is also supplied to ranking so ties have consistent semantics.
      const listings = [...await deps.listings()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      if (!listings.length) {
        outcome = "success";
        return { matches: [], summary: input.locale === "th" ? "ยังไม่มีอสังหาฯ ในฐานข้อมูล" : "No properties are available yet.", clarification: null, cached: false, cacheStatus };
      }
      const key = createHash("sha256").update(JSON.stringify([deps.version(), input, listings])).digest("hex");
      const hit = cache.get(key);
      if (hit) {
        cacheStatus = "hit";
        totals.hits++;
        totals.aiCallsAvoided++;
        outcome = "success";
        return { ...hit, cached: true, cacheStatus };
      }
      const running = pending.get(key);
      if (running) {
        cacheStatus = "coalesced";
        totals.coalesced++;
        const result = structuredClone(await running);
        totals.aiCallsAvoided++;
        outcome = "success";
        return { ...result, cached: true, cacheStatus };
      }
      cacheStatus = "miss";
      totals.misses++;
      if (now() - windowStart >= 60000) { windowStart = now(); calls = 0; }
      if (calls >= 20 || pending.size >= 3) throw new MatchError("RATE_LIMITED", 429);
      calls++;
      totals.aiCalls++;
      const operation = Promise.resolve().then(() => deps.rank(input, listings)).then(raw => validateRanking(raw, listings, input.locale, input.request));
      pending.set(key, operation);
      try {
        const result = await operation;
        cache.set(key, result);
        outcome = "success";
        return { ...structuredClone(result), cached: false, cacheStatus };
      } finally { pending.delete(key); }
    } finally {
      if (cacheStatus === "bypass") totals.bypasses++;
      if (outcome === "error") totals.errors++;
      // Observability must not turn a successful match into an API failure.
      try { deps.observe?.({ event: "match_completed", cacheStatus, outcome, durationMs: Math.max(0, now() - started), totals: { ...totals } }); } catch { /* best effort */ }
    }
  };
}
