import { randomUUID } from "node:crypto";
import { handoverSummary } from "./handover-summary.js";
import type { Conversation, ChatMessage, HandoverReason } from "../../../packages/contracts/src/contracts/chat.js";

export function append(c: Conversation, role: ChatMessage["role"], content: string) {
  c.updatedAt = new Date().toISOString();
  c.messages.push({ id: randomUUID(), role, content, createdAt: c.updatedAt });
}
/** Rebuild the staff brief from every customer message so details sent after the handover
 * (a phone number, an email) reach staff without reading the transcript. The handover reason
 * stays the one recorded at handover. No AI call: the brief is extracted from the messages. */
export function refreshHandoverSummary(c: Conversation) {
  if (c.handover && c.reason) c.summary = handoverSummary(c.messages, c.reason);
}
export function escalate(c: Conversation, reason: HandoverReason) {
  if (c.handover) return;
  c.handover = true; c.status = "awaiting_human"; c.reason = reason;
  const users = c.messages.filter(m => m.role === "user");
  c.summary = handoverSummary(c.messages, reason);
  const thai = /[\u0e00-\u0e7f]/.test(users.at(-1)?.content || "");
  append(c, "system", thai
    ? "ส่งบทสนทนาให้ทีมฝ่ายขายแล้ว ผู้ช่วย AI หยุดตอบ คุณฝากข้อความหรือข้อมูลติดต่อเพิ่มเติมได้ เจ้าหน้าที่จะเข้ามาดูแลต่อเมื่อพร้อม ยังไม่มีการยืนยันนัดหรือรับชำระเงิน"
    : "This conversation is queued for the sales team. The AI has stopped replying. You may leave additional details or a preferred contact. A person will follow up when available; no appointment or payment is confirmed.");
}

