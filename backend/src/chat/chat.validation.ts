import type { ChatDecision, HandoverReason } from "../../../packages/contracts/src/contracts/chat.js";

export class ChatError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
export const reasons: HandoverReason[] = ["human_requested", "angry_customer", "unknown_answer", "ready_to_buy", "uncertain", "conversation_loop", "service_unavailable"];
export const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function messageText(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 2000) throw new ChatError("INVALID_MESSAGE");
  return value.trim();
}
export function decision(value: unknown): ChatDecision {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ChatError("INVALID_AI_RESPONSE", 502);
  const x = value as Record<string, unknown>;
  if (Object.keys(x).sort().join() !== "confidence,reason,reply" || typeof x.reply !== "string" || x.reply.length > 4000 ||
      !(x.reason === null || reasons.includes(x.reason as HandoverReason)) ||
      typeof x.confidence !== "number" || !Number.isFinite(x.confidence) || x.confidence < 0 || x.confidence > 1 ||
      (x.reason === null && !x.reply.trim())) throw new ChatError("INVALID_AI_RESPONSE", 502);
  return { reply: x.reply.trim(), reason: x.reason as HandoverReason | null, confidence: x.confidence };
}
export const decisionSchema = {
  type: "object", additionalProperties: false,
  properties: {
    reply: { type: "string" },
    reason: { type: ["string", "null"], enum: [null, ...reasons] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  }, required: ["reply", "reason", "confidence"],
};
