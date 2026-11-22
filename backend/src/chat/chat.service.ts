import type { BusinessProfile } from "../../../packages/contracts/src/domain/business-profile.js";
import type { ChatDecision, ChatMessage } from "../../../packages/contracts/src/contracts/chat.js";
import type { ChatStore } from "./chat-store.js";
import { productFactErrors } from "./product-facts.js";
import { expectedReplyLanguage, replyLanguageErrors } from "./reply-language.js";
import { decision } from "./chat.validation.js";
import { repeatsEarlierReply } from "./repeated-reply.js";

/** An AI answer below this self-reported confidence goes to a human (reason "uncertain"). Mirrored in the admin UI. */
import { HANDOVER_CONFIDENCE_THRESHOLD } from "./handover-threshold.js";
export { HANDOVER_CONFIDENCE_THRESHOLD };

export class ChatService {
  private active = 0;
  constructor(readonly repository: ChatStore,
    private profile: () => Promise<BusinessProfile>,
    private model: (profile: BusinessProfile, messages: ChatMessage[], correction?: { errors: string[]; timeoutMs: number }) => Promise<ChatDecision>) {}

  async send(id: string, owner: string, requestId: string, text: string, humanRequested = false) {
    const { conversation, lease } = await this.repository.begin(id, owner, requestId, text, humanRequested);
    if (!lease) return conversation;
    if (this.active >= 3) return this.repository.finish(id, lease, "", "service_unavailable", null);
    this.active++;
    try {
      const startedAt = Date.now();
      const profile = await this.profile();
      let result = decision(await this.model(profile, conversation.messages));
      const request = conversation.messages.filter(message => message.role === "user").at(-1)?.content ?? "";
      const language = expectedReplyLanguage(conversation.messages);
      const check = (reply: string) => [...productFactErrors(profile, reply, request), ...replyLanguageErrors(language, reply)];
      if (!result.reason && result.confidence >= HANDOVER_CONFIDENCE_THRESHOLD) {
        const errors = check(result.reply);
        if (errors.length) {
          const timeoutMs = 50_000 - (Date.now() - startedAt);
          if (timeoutMs < 1000) return this.repository.finish(id, lease, "", "uncertain", result.confidence);
          result = decision(await this.model(profile, conversation.messages, { errors, timeoutMs: Math.min(timeoutMs, 20_000) }));
          if (!result.reason && check(result.reply).length) {
            return this.repository.finish(id, lease, "", "uncertain", result.confidence);
          }
        }
      }
      const reason = result.reason || (result.confidence < HANDOVER_CONFIDENCE_THRESHOLD ? "uncertain" : null);
      // Going in circles: never send the customer the same answer again; a person takes over instead.
      if (!reason && repeatsEarlierReply(result.reply, conversation.messages)) {
        return this.repository.finish(id, lease, "", "conversation_loop", result.confidence);
      }
      return this.repository.finish(id, lease, result.reply, reason, result.confidence);
    } catch {
      // A saved user turn must not disappear or be replaced with a fabricated answer.
      return this.repository.finish(id, lease, "", "service_unavailable", null);
    } finally { this.active--; }
  }
}
