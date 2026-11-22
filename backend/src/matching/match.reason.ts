import type { Property } from "../../../packages/contracts/src/domain/property.js";
import { thaiMatchName, thaiTransit } from "./match.localization.js";

// Used for a server-selected replacement or an ungrounded rail explanation.
// Never borrow another record's facts or infer that missing rail data means no service.
export function groundedReason(p: Property, locale: "en" | "th"): string {
  const price = p.price.toLocaleString("en-US");
  if (locale === "th") {
    return `${thaiMatchName(p.type)}${p.bedrooms === 0 ? "แบบสตูดิโอ" : ` ${p.bedrooms} ห้องนอน`} ที่${thaiMatchName(p.area)} ${thaiMatchName(p.city)} ราคา ${price} บาท พื้นที่ใช้สอย ${p.size_sqm} ตารางเมตร ${p.furnished ? "พร้อมเฟอร์นิเจอร์" : "ไม่มีเฟอร์นิเจอร์"} ข้อมูลรถไฟฟ้า: ${thaiTransit(p.near_transit)}`;
  }
  const layout = p.bedrooms === 0 ? "studio" : `${p.bedrooms}-bedroom`;
  const rail = p.near_transit === "none" ? "No nearby rail information is listed." : `Listed nearby rail: ${p.near_transit}.`;
  return `This ${layout} ${p.type} in ${p.area}, ${p.city} is listed at THB ${price}, with ${p.size_sqm} square metres of space. It is ${p.furnished ? "furnished" : "unfurnished"}. ${rail}`;
}

// Rejects a reason that cites a station or distance that is not in this listing's own record.
// This is not a general factual verifier for arbitrary model-written prose.
export function safeTransitReason(reason: string, p: Property, locale: "en" | "th"): string {
  const mentionsRail = /\b(BTS|MRT|rail|station|train|subway)\b|รถไฟ|สถานี/i.test(reason);
  if (!mentionsRail) return reason;
  const listed = /^(BTS|MRT)\s+(.+?)\s*\((\d+(?:\.\d+)?)\s*(km|m)\)$/i.exec(p.near_transit.trim());
  if (!listed) {
    // Missing data cannot support any station or distance claim. Render the
    // complete known facts rather than attempting to edit an unsafe sentence.
    return groundedReason(p, locale);
  }
  const [, network, station, distance, unit] = listed;
  const names = [station, thaiMatchName(station)].map(s => s.toLowerCase());
  const lower = reason.toLowerCase();
  const networks = [...reason.matchAll(/\b(?:BTS|MRT)\b/gi)];
  const stationsMatch = networks.every(m => {
    if (m[0].toLowerCase() !== network.toLowerCase()) return false;
    const before = lower.slice(0, m.index).trimEnd();
    const after = lower.slice(m.index + m[0].length).trimStart();
    return names.some(name => before.endsWith(name) || after.startsWith(name));
  });
  const distances = [...reason.matchAll(/(?<![\d.])(\d+(?:\.\d+)?)\s*(kilometres?|kilometers?|km|metres?|meters?|m\b|กิโลเมตร|เมตร)/gi)]
    // Floor area is not a transit distance (e.g. "48 square metres").
    .map(m => Number(m[1]) * (/^(?:k|กิโล)/i.test(m[2]) ? 1000 : 1));
  const expected = Number(distance) * (unit.toLowerCase() === "km" ? 1000 : 1);
  if (!names.some(name => lower.includes(name)) ||
      !stationsMatch ||
      distances.some(d => Math.abs(d - expected) > 0.001)) {
    return groundedReason(p, locale);
  }
  return reason;
}
