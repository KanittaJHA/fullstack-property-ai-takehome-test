import type { Conversation } from "../../../packages/contracts/src/contracts/chat.js";
import { ChatError } from "./chat.validation.js";

/** A reader can only advance their own cursor to a persisted incoming message. */
export function markRead(c: Conversation, admin: boolean, messageId: string) {
  const index = c.messages.findIndex(m => m.id === messageId);
  const message = c.messages[index];
  if (!message || (admin ? message.role !== "user" : !["human", "assistant"].includes(message.role))) {
    throw new ChatError("INVALID_READ_RECEIPT");
  }
  const field = admin ? "adminReadThrough" : "customerReadThrough";
  if (index > c.messages.findIndex(m => m.id === c[field])) c[field] = messageId;
}
