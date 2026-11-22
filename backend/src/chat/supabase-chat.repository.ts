import { markRead } from "./read-receipts.js";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Conversation, HandoverReason } from "../../../packages/contracts/src/contracts/chat.js";
import { DEMO_BUSINESS_ID } from "../business/business-profile.repository.js";
import type { ChatStore } from "./chat-store.js";
import { append, escalate, refreshHandoverSummary } from "./chat-state.js";
import { ChatError } from "./chat.validation.js";

interface Snapshot {
  conversation: Conversation;
  revision: number;
  lease: string | null;
  expires: number;
  requests: Record<string, string>;
}

/** Each commit is a PostgreSQL transaction guarded by the revision read earlier.
 * AI calls happen between begin/finish; the persisted lease fences late replies. */
export class SupabaseChatRepository implements ChatStore {
  private client: SupabaseClient;
  constructor(client?: SupabaseClient) {
    if (client) { this.client = client; return; }
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new ChatError("CHAT_DATABASE_CONFIG_MISSING", 503);
    this.client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  }
  private async rpc<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await this.client.rpc("graspia_chat_store", {
      p_action: action, p_business: DEMO_BUSINESS_ID, p_payload: payload,
    }).abortSignal(AbortSignal.timeout(10000));
    if (error) {
      if (error.message === "NOT_FOUND") throw new ChatError("NOT_FOUND", 404);
      if (error.message === "REVISION_CONFLICT") throw new ChatError("REVISION_CONFLICT", 409);
      if (error.message === "CONVERSATION_LIMIT") throw new ChatError("CONVERSATION_LIMIT", 429);
      if (error.code === "PGRST202") throw new ChatError("CHAT_DATABASE_MIGRATION_REQUIRED", 503);
      throw new ChatError("CHAT_DATABASE_UNAVAILABLE", 503);
    }
    return data as T;
  }
  private async mutate(id: string, owner: string | undefined, change: (state: Snapshot) => void): Promise<Snapshot> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const state = await this.rpc<Snapshot>("get", { id, owner });
      // Recovery is also committed through CAS, never a blind write.
      if (state.lease && state.expires < Date.now()) {
        escalate(state.conversation, "service_unavailable");
        state.lease = null; state.expires = 0;
      }
      change(state);
      try { return await this.rpc<Snapshot>("commit", { id, owner, ...state }); }
      catch (error) {
        if (!(error instanceof ChatError) || error.code !== "REVISION_CONFLICT") throw error;
      }
    }
    throw new ChatError("TURN_IN_PROGRESS", 409);
  }
  async create(owner: string) { return (await this.rpc<Snapshot>("create", { owner })).conversation; }
  async get(id: string, owner?: string) {
    const state = await this.rpc<Snapshot>("get", { id, owner });
    if (state.lease && state.expires < Date.now()) return (await this.mutate(id, owner, () => {})).conversation;
    return state.conversation;
  }
  async list(owner?: string) {
    const states = await this.rpc<Snapshot[]>("list", { owner });
    return Promise.all(states.map(state => state.lease && state.expires < Date.now()
      ? this.get(state.conversation.id, owner) : state.conversation));
  }
  async setPinned(id: string, owner: string | undefined, pinned: boolean) {
    return (await this.mutate(id, owner, state => { state.conversation.pinned = pinned; })).conversation;
  }
  async markRead(id: string, owner: string | undefined, messageId: string) {
    return (await this.mutate(id, owner, state => {
      markRead(state.conversation, owner === undefined, messageId);
    })).conversation;
  }
  async delete(id: string, owner: string) { await this.rpc("delete", { id, owner }); }
  async begin(id: string, owner: string, requestId: string, text: string, humanRequested: boolean) {
    let acquired: string | null = null;
    const state = await this.mutate(id, owner, state => {
      acquired = null;
      const c = state.conversation;
      const fingerprint = JSON.stringify([text, humanRequested]);
      if (state.requests[requestId] !== undefined) {
        if (state.requests[requestId] !== fingerprint) throw new ChatError("REQUEST_ID_CONFLICT", 409);
        return;
      }
      if (c.status === "closed") throw new ChatError("CONVERSATION_CLOSED", 409);
      if (state.lease && !humanRequested) throw new ChatError("TURN_IN_PROGRESS", 409);
      if (c.messages.length >= 200) throw new ChatError("MESSAGE_LIMIT", 429);
      state.requests[requestId] = fingerprint;
      append(c, "user", text);
      if (humanRequested) escalate(c, "human_requested");
      if (!c.handover && c.messages.filter(m => m.role === "user").length >= 30) escalate(c, "conversation_loop");
      refreshHandoverSummary(c);
      acquired = c.status === "bot_active" ? randomUUID() : null;
      state.lease = acquired; state.expires = acquired ? Date.now() + 60000 : 0;
    });
    return { conversation: state.conversation, lease: acquired };
  }
  async finish(id: string, lease: string, reply: string, reason: HandoverReason | null, confidence: number | null) {
    return (await this.mutate(id, undefined, state => {
      const c = state.conversation;
      if (state.lease !== lease || c.status !== "bot_active") return;
      c.confidence = confidence;
      if (reason) escalate(c, reason); else append(c, "assistant", reply);
      state.lease = null; state.expires = 0;
    })).conversation;
  }
  async admin(id: string, action: "takeover" | "close" | "reply", text: string, requestId: string) {
    return (await this.mutate(id, undefined, state => {
      const c = state.conversation;
      const fingerprint = JSON.stringify([action, text]);
      if (state.requests[requestId] !== undefined) {
        if (state.requests[requestId] !== fingerprint) throw new ChatError("REQUEST_ID_CONFLICT", 409);
        return;
      }
      if (c.status === "closed" || !c.handover || (action === "reply" && c.status !== "human_active")) throw new ChatError("INVALID_TRANSITION", 409);
      if (c.messages.length >= 200) throw new ChatError("MESSAGE_LIMIT", 429);
      state.requests[requestId] = fingerprint;
      if (action === "reply") append(c, "human", text);
      else {
        c.status = action === "close" ? "closed" : "human_active";
        append(c, "system", action === "close" ? "Conversation closed / ปิดบทสนทนาแล้ว" : "A sales specialist has taken over / เจ้าหน้าที่รับช่วงดูแลแล้ว");
      }
      state.lease = null; state.expires = 0;
    })).conversation;
  }
  /** Used only by the explicit, offline SQLite import command. Existing IDs are never overwritten. */
  async importConversation(owner: string, conversation: Conversation, requests: Record<string, string>) {
    return this.rpc<boolean>("import", { owner, conversation, requests });
  }
}
