import type { ChatMessage, HandoverReason } from "../../../packages/contracts/src/contracts/chat.js";

const reasons: Record<HandoverReason, [string, string]> = {
  human_requested: ["Customer requested a person", "ลูกค้าขอคุยกับเจ้าหน้าที่"],
  angry_customer: ["Customer is frustrated", "ลูกค้าไม่พอใจ"],
  unknown_answer: ["Question needs information outside the business profile", "คำถามต้องใช้ข้อมูลนอกเหนือจากข้อมูลธุรกิจ"],
  ready_to_buy: ["Customer is ready to proceed", "ลูกค้าพร้อมดำเนินการต่อ"],
  uncertain: ["Assistant could not give a reliable answer", "ผู้ช่วยยังให้คำตอบที่แน่ชัดไม่ได้"],
  conversation_loop: ["Conversation needs a person to make progress", "บทสนทนาต้องการเจ้าหน้าที่ช่วยดำเนินการต่อ"],
  service_unavailable: ["Assistant service was unavailable", "บริการผู้ช่วยไม่พร้อมใช้งาน"],
};
const needs = /\bk\s*w\b|home starter|home plus|business 10|survey|budget|property|install|address|bangkok|ต้องการ|สนใจ|งบ|ติดตั้ง|สำรวจ|บ้าน|ที่อยู่|กรุงเทพ/i;
const emails = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi;
const phones = /(?:\+66|\b0)\d(?:[ -]?\d){7,8}\b/g;
// A turn counts as contact details only when it carries an actual value: an email, a phone
// number or a LINE ID. Words alone ("โทรตามสามรอบ", "contact me") and number ranges
// such as savings "3000-4500" are not contact details.
// English "line" needs "ID" or ":" ("phone line three times" is not an ID); Thai "ไลน์" may be followed directly by the ID.
const lineId = /\bline\s*(?:id\s*[:：]?|[:：])\s*@?[a-z0-9][a-z0-9._-]{2,}|ไลน์\s*(?:id\s*)?[:：]?\s*@?[a-z0-9][a-z0-9._-]{2,}/i;
const internationalPhone = /\+\d{1,3}[ -]?\d(?:[ -]?\d){6,12}\b/;
const hasContact = (text: string) => new RegExp(emails.source, "i").test(text) || new RegExp(phones.source).test(text) || internationalPhone.test(text) || lineId.test(text);
const packages = /\b(home starter|home plus)\b(?:\s*(\d+(?:\.\d+)?)\s*kw\b)?|\b(business)\s*(\d+(?:\.\d+)?)\s*kw\b|(\d+(?:\.\d+)?)\s*kw\b/gi;
const title = (name: string) => name.toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase());

/** Packages or system sizes the customer named, e.g. "Home Plus 5kW", "20kW". A bare name is
 * dropped when the same name also appears with a size. */
function packagesNamed(texts: string[]) {
  const found = new Set<string>();
  for (const match of texts.join("\n").matchAll(packages)) {
    const name = match[1] ?? match[3];
    const size = match[2] ?? match[4] ?? match[5];
    found.add([name && title(name), size && `${size}kW`].filter(Boolean).join(" "));
  }
  return [...found].filter(item => ![...found].some(other => other !== item && (other.startsWith(`${item} `) || other.endsWith(` ${item}`))));
}
const unique = (values: Iterable<string>) => [...new Set(values)];

/** An evidence brief, not generated facts. Keep contact-bearing turns intact and
 * mark other excerpts explicitly; the full transcript is always authoritative. */
export function handoverSummary(messages: ChatMessage[], reason: HandoverReason): string {
  const users = messages.filter(message => message.role === "user");
  const thai = /[\u0e00-\u0e7f]/.test(users.at(-1)?.content || "");
  const t = (en: string, th: string) => thai ? th : en;
  const seen = new Set<string>();
  const section = (title: string, selected: ChatMessage[], limit: number, empty: string, deduplicate = true) => {
    const lines = selected.filter(message => !deduplicate || !seen.has(message.id)).map(message => {
      seen.add(message.id);
      return `• ${message.content.slice(0, limit)}${message.content.length > limit ? t("… [excerpt; see transcript]", "… [ข้อความบางส่วน อ่านต่อในประวัติ]") : ""}`;
    });
    return `${title}\n${lines.length ? lines.join("\n") : empty}`;
  };
  const contactDetails = section(t("Contact / customer details (customer's words)", "ข้อมูลติดต่อ / รายละเอียดลูกค้า (ข้อความจากลูกค้า)"), users.filter(m => hasContact(m.content)).slice(-2), 2000,
    t("Not identified in the messages. Ask for a preferred contact if needed.", "ยังไม่พบข้อมูลติดต่อในข้อความ หากจำเป็นให้สอบถามช่องทางที่สะดวก"));
  const needsDiscussed = section(t("Needs / products discussed (customer's words)", "ความต้องการ / สินค้าที่กล่าวถึง (ข้อความจากลูกค้า)"), users.filter(m => needs.test(m.content)).slice(-3), 600,
    t("See customer details and recent messages.", "ดูรายละเอียดลูกค้าและข้อความล่าสุดประกอบ"));
  // Turns that matched neither pattern (e.g. a repeated question before a loop handover) still give context.
  const earlier = users.slice(0, -1).filter(message => !seen.has(message.id)).slice(-3);
  // Values copied verbatim from customer messages, so staff can act without reading every quote.
  const texts = users.map(message => message.content);
  const named = packagesNamed(texts);
  const email = unique(texts.flatMap(text => text.match(emails) ?? []));
  const phone = unique(texts.flatMap(text => text.match(phones) ?? []));
  const keyDetails = [
    t("Key details (from customer messages)", "ข้อมูลสำคัญ (จากข้อความลูกค้า)"),
    `• ${t("Package / system size", "แพ็กเกจ / ขนาดระบบ")}: ${named.length ? named.join(", ") : t("not mentioned", "ยังไม่ระบุ")}`,
    ...(email.length ? [`• ${t("Email", "อีเมล")}: ${email.join(", ")}`] : []),
    ...(phone.length ? [`• ${t("Phone", "โทร")}: ${phone.join(", ")}`] : []),
    `• ${t("Customer messages", "จำนวนข้อความจากลูกค้า")}: ${users.length}`,
  ].join("\n");
  return [
    `${t("Handover reason", "เหตุผลส่งต่อ")}: ${reasons[reason][thai ? 1 : 0]}`,
    keyDetails,
    contactDetails,
    needsDiscussed,
    ...(earlier.length ? [section(t("Earlier messages (customer's words)", "ข้อความก่อนหน้า (ข้อความจากลูกค้า)"), earlier, 300, "")] : []),
    section(t("Recent request (customer's words)", "คำขอล่าสุด (ข้อความจากลูกค้า)"), users.slice(-1), 2000,
      t("No customer message recorded.", "ยังไม่มีข้อความจากลูกค้า"), false),
    t("Next: review the full transcript and follow up. No booking or payment is confirmed by this handover.",
      "ขั้นตอนถัดไป: อ่านประวัติทั้งหมดและติดตามลูกค้า การส่งต่อนี้ไม่ได้ยืนยันการจองหรือการชำระเงิน"),
  ].join("\n\n");
}
