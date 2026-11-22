export type HandoverReason = "human_requested" | "angry_customer" | "unknown_answer" | "ready_to_buy" | "uncertain" | "conversation_loop" | "service_unavailable";
export type ChatStatus = "bot_active" | "awaiting_human" | "human_active" | "closed";
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "human" | "system";
  content: string;
  createdAt: string;
}
export interface Conversation {
  adminReadThrough?: string | null;
  customerReadThrough?: string | null;
  title?: string;
  pinned?: boolean;
  id: string;
  status: ChatStatus;
  messages: ChatMessage[];
  handover: boolean;
  reason: HandoverReason | null;
  summary: string | null;
  confidence: number | null;
  createdAt: string;
  updatedAt: string;
}
export interface ChatDecision {
  reply: string;
  reason: HandoverReason | null;
  confidence: number;
}
