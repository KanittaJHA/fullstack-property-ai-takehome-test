import type { Conversation, HandoverReason } from "../../../packages/contracts/src/contracts/chat.js";
type Result<T> = T | Promise<T>;
export interface ChatStore {
  create(owner: string): Result<Conversation>;
  get(id: string, owner?: string): Result<Conversation>;
  list(owner?: string): Result<Conversation[]>;
  setPinned(id: string, owner: string | undefined, pinned: boolean): Result<Conversation>;
  markRead(id: string, owner: string | undefined, messageId: string): Result<Conversation>;
  delete(id: string, owner: string): Result<void>;
  begin(id: string, owner: string, requestId: string, text: string, humanRequested: boolean): Result<{ conversation: Conversation; lease: string | null }>;
  finish(id: string, lease: string, reply: string, reason: HandoverReason | null, confidence: number | null): Result<Conversation>;
  admin(id: string, action: "takeover" | "close" | "reply", text: string, requestId: string): Result<Conversation>;
}
