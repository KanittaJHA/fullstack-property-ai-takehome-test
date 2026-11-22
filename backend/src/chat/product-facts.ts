import type { BusinessProfile } from "../../../packages/contracts/src/domain/business-profile.js";

const normalize = (value: string) => value.toLowerCase()
  .replace(/[๐-๙]/g, digit => String(digit.charCodeAt(0) - 0x0e50))
  .replace(/[,\u200b*]/g, "").replace(/[–—−]/g, "-");
const monthly = /ต่อเดือน|\/\s*เดือน|เดือนละ|per month|a month|monthly|\/\s*month/;
const duration = /^\s*(?:วัน|days?|ปี|years?|ชั่วโมง|hours?|months?)/;

/** Savings ranges, whether the monthly marker comes after ("3000-4500 บาทต่อเดือน")
 * or before ("ประหยัดต่อเดือน 3000-4500 บาท"). Durations such as "1-2 วัน" are not savings. */
function savingsRanges(section: string) {
  return [...section.matchAll(/(\d+)\s*(?:-|to|ถึง)\s*(\d+)/g)].filter(match => {
    const start = match.index ?? 0;
    const after = section.slice(start + match[0].length);
    if (duration.test(after)) return false;
    return new RegExp(`^\\s*(?:บาท|thb|baht)?\\s*(?:${monthly.source})`).test(after)
      || /ประหยัด|sav/.test(section.slice(Math.max(0, start - 40), start))
      || monthly.test(section.slice(Math.max(0, start - 25), start));
  });
}

/** Savings ranges anywhere in the reply (not only after a product name). A range whose closest
 * preceding keyword is the customer's bill ("ถ้าค่าไฟ 3000-4000 บาทต่อเดือน") is not a savings claim. */
function savingsClaims(text: string) {
  return savingsRanges(text).filter(match => {
    const before = text.slice(Math.max(0, (match.index ?? 0) - 60), match.index);
    const saving = Math.max(...[...before.matchAll(/ประหยัด|ลด|sav|reduc|cut/g)].map(m => m.index!), -1);
    const bill = Math.max(...[...before.matchAll(/(?<!ประหยัด|ลด)ค่าไฟ(?!ได้)|บิล|bill|electricity cost|you pay/g)].map(m => m.index!), -1);
    return saving > bill;
  });
}

/** Conservative checks for explicit catalog claims; not a general fact verifier. */
export function productFactErrors(profile: BusinessProfile, reply: string, request: string): string[] {
  const text = normalize(reply);
  const products = profile.products.map(product => ({ ...product, key: normalize(product.name) }));
  const mentions = products.flatMap(product => [...text.matchAll(new RegExp(product.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))]
    .map(match => ({ product, start: match.index! }))).sort((a, b) => a.start - b.start);
  const errors = new Set<string>();
  // Every savings range must be one package's published range: never a merged range across
  // packages (e.g. 1500-9000 from Home Starter's minimum and Business 10kW's maximum) or an invented one.
  const published = new Set(profile.products.map(product => normalize(product.saves_per_month_thb)));
  // Ranges after a package name are checked against that package below; this covers the rest.
  const firstMention = mentions[0]?.start ?? Infinity;
  for (const match of savingsClaims(text)) {
    if ((match.index ?? 0) < firstMention && !published.has(`${match[1]}-${match[2]}`)) errors.add(`UNPUBLISHED_SAVINGS_RANGE:${match[1]}-${match[2]} is not a package range; state each package's own range next to its name`);
  }
  if (/(?:รับประกัน|warrant(?:y|ies))[^.!?;\n]{0,15}\d+\s*(?:และ|and|[,/])\s*\d+/.test(text)) {
    errors.add("AMBIGUOUS_WARRANTY:state each product warranty separately");
  }
  for (const [index, mention] of mentions.entries()) {
    const { product } = mention;
    const section = text.slice(mention.start + product.key.length, mentions[index + 1]?.start);
    for (const match of section.matchAll(/(?:ราคา|costs?|priced? at|price\s*:?)[\s฿]*(\d+(?:\.\d+)?)/g)) {
      if (Number(match[1]) !== product.price_thb) errors.add(`PRICE:${product.name}`);
    }
    const savings = savingsRanges(section);
    for (const match of savings) {
      if (`${match[1]}-${match[2]}` !== normalize(product.saves_per_month_thb)) errors.add(`SAVINGS:${product.name}`);
    }
    if (/(?:ประหยัด|savings?|save)[^.!?;\n\d]{0,45}\d/.test(section) && !savings.length) {
      errors.add(`SAVINGS_RANGE_REQUIRED:${product.name}`);
    }
    for (const match of section.matchAll(/(?:รับประกัน|warranty\s*:?)[\s]*(\d+)\s*(?:ปี|years?)|(\d+)[ -]*(?:years?|ปี)[ -]*(?:warranty|รับประกัน)/g)) {
      if (Number(match[1] ?? match[2]) !== product.warranty_years) errors.add(`WARRANTY:${product.name}`);
    }
  }
  if (/เปรียบเทียบ|compare|comparison|versus|\bvs\b/i.test(request)) {
    for (const product of products) {
      if (normalize(request).includes(product.key) && !text.includes(product.key)) errors.add(`MISSING_PRODUCT:${product.name}`);
    }
  }
  // Whether solar pays off depends on the customer's bill and the site survey; the profile never
  // promises it. "ยิ่งค่าไฟสูงยิ่งคุ้มมากขึ้น" (more worthwhile with a higher bill) is allowed.
  if (/คุ้ม(?:ค่า)?\s*(?:มาก(?!ขึ้น)|แน่|ชัวร์|สุดๆ|ที่สุด)|(?:definitely|certainly|absolutely|always|very|really|totally) worth|worth it for sure|guaranteed to (?:pay off|be worth)|(?:will|always) pay (?:for )?itself/.test(text)) {
    errors.add("UNSUPPORTED_VALUE_CLAIM:do not say solar is definitely or very worth it; say it depends on the electricity bill and the site survey");
  }
  return [...errors];
}
