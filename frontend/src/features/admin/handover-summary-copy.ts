import type { HandoverReason } from "@contracts/contracts/chat";

type Translate = (en: string, th: string) => string;

const reasons: Record<HandoverReason, [string, string]> = {
  human_requested: ["Customer requested a person", "ลูกค้าขอคุยกับเจ้าหน้าที่"],
  angry_customer: ["Customer is frustrated", "ลูกค้าไม่พอใจ"],
  unknown_answer: ["Question needs information outside the business profile", "คำถามต้องใช้ข้อมูลนอกเหนือจากข้อมูลธุรกิจ"],
  ready_to_buy: ["Customer is ready to proceed", "ลูกค้าพร้อมดำเนินการต่อ"],
  uncertain: ["Assistant could not give a reliable answer", "ผู้ช่วยยังให้คำตอบที่แน่ชัดไม่ได้"],
  conversation_loop: ["Conversation needs a person to make progress", "บทสนทนาต้องการเจ้าหน้าที่ช่วยดำเนินการต่อ"],
  service_unavailable: ["Assistant service was unavailable", "บริการผู้ช่วยไม่พร้อมใช้งาน"],
};

// Older summaries in the database use this wording; they are shown with the current text.
const legacyReasons: [[string, string], HandoverReason][] = [
  [["Assistant is not confident enough to answer", "ผู้ช่วยไม่มั่นใจในคำตอบ"], "uncertain"],
];

const headings: [string, string][] = [
  ["Key details (from customer messages)", "ข้อมูลสำคัญ (จากข้อความลูกค้า)"],
  ["Contact / customer details (customer's words)", "ข้อมูลติดต่อ / รายละเอียดลูกค้า (ข้อความจากลูกค้า)"],
  ["Needs / products discussed (customer's words)", "ความต้องการ / สินค้าที่กล่าวถึง (ข้อความจากลูกค้า)"],
  ["Earlier messages (customer's words)", "ข้อความก่อนหน้า (ข้อความจากลูกค้า)"],
  ["Recent request (customer's words)", "คำขอล่าสุด (ข้อความจากลูกค้า)"],
];
const keyLabels: [string, string][] = [
  ["Package / system size", "แพ็กเกจ / ขนาดระบบ"],
  ["Email", "อีเมล"],
  ["Phone", "โทร"],
  ["Customer messages", "จำนวนข้อความจากลูกค้า"],
];
const notMentioned: [string, string] = ["not mentioned", "ยังไม่ระบุ"];
const notes: [string, string][] = [
  ["Not identified in the messages. Ask for a preferred contact if needed.", "ยังไม่พบข้อมูลติดต่อในข้อความ หากจำเป็นให้สอบถามช่องทางที่สะดวก"],
  ["See customer details and recent messages.", "ดูรายละเอียดลูกค้าและข้อความล่าสุดประกอบ"],
  ["Included above.", "แสดงไว้ด้านบนแล้ว"],
];
const next: [string, string] = [
  "Next: review the full transcript and follow up. No booking or payment is confirmed by this handover.",
  "ขั้นตอนถัดไป: อ่านประวัติทั้งหมดและติดตามลูกค้า การส่งต่อนี้ไม่ได้ยืนยันการจองหรือการชำระเงิน",
];

// Localize the known template only; retain saved customer quotes and legacy summaries.
export function localizeHandoverSummary(summary: string, t: Translate): string {
  let result = summary;
  const known: [[string, string], [string, string]][] = [
    ...Object.values(reasons).map(reason => [reason, reason] as [[string, string], [string, string]]),
    ...legacyReasons.map(([saved, key]) => [saved, reasons[key]] as [[string, string], [string, string]]),
  ];
  for (const [saved, reason] of known) {
    for (const line of [`Handover reason: ${saved[0]}`, `เหตุผลส่งต่อ: ${saved[1]}`]) {
      if (result.startsWith(line + "\n\n")) {
        result = `${t("Handover reason", "เหตุผลส่งต่อ")}: ${t(...reason)}` + result.slice(line.length);
      }
    }
  }
  for (const heading of headings) {
    for (const label of heading) {
      const marker = "\n\n" + label + "\n";
      const index = result.indexOf(marker);
      if (index < 0) continue;
      const start = index + marker.length;
      let body = result.slice(start);
      for (const note of notes) {
        for (const value of note) {
          if (body.startsWith(value + "\n\n")) body = t(...note) + body.slice(value.length);
        }
      }
      result = result.slice(0, index) + "\n\n" + t(...heading) + "\n" + body;
      break;
    }
  }
  // Key-detail labels sit at the start of a bullet line; the values after them are customer data.
  for (const label of keyLabels) {
    for (const value of label) result = result.replace(`\n• ${value}: `, `\n• ${t(...label)}: `);
  }
  for (const value of notMentioned) {
    result = result.replace(`\n• ${t(...keyLabels[0])}: ${value}\n`, `\n• ${t(...keyLabels[0])}: ${t(...notMentioned)}\n`);
  }
  for (const value of next) {
    if (result.endsWith("\n\n" + value)) result = result.slice(0, -value.length) + t(...next);
  }
  return result;
}
