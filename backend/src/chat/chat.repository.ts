import { markRead } from "./read-receipts.js";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { Conversation, HandoverReason } from "../../../packages/contracts/src/contracts/chat.js";
import { append, escalate, refreshHandoverSummary } from "./chat-state.js";
import { ChatError } from "./chat.validation.js";

type Row = { owner: string; document: string; lease: string | null; expires: number };
/** SQLite transactions serialize state transitions across processes sharing this file.
 * No transaction is held during network calls. A lease fences late model responses. */
export class ChatRepository {
  private db: DatabaseSync;
  constructor(file: string) {
    if (file !== ":memory:") mkdirSync(dirname(resolve(file)), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(file);
    if (file !== ":memory:") chmodSync(file, 0o600);
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY, owner TEXT NOT NULL, document TEXT NOT NULL, lease TEXT, expires INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS chats_owner ON chats(owner);
      CREATE TABLE IF NOT EXISTS chat_requests (conversation TEXT NOT NULL REFERENCES chats(id), id TEXT NOT NULL,
        input TEXT NOT NULL, PRIMARY KEY(conversation,id));`);
  }
  close() { this.db.close(); }
  private transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = fn(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  private row(id: string, owner?: string): Row {
    const row = this.db.prepare("SELECT owner,document,lease,expires FROM chats WHERE id=?").get(id) as Row | undefined;
    if (!row || (owner !== undefined && row.owner !== owner)) throw new ChatError("NOT_FOUND", 404);
    return row;
  }
  private save(c: Conversation) {
    this.db.prepare("UPDATE chats SET document=? WHERE id=?").run(JSON.stringify(c), c.id);
  }
  private recover(id: string, row: Row): Conversation {
    const c = JSON.parse(row.document) as Conversation;
    if (row.lease && row.expires < Date.now()) {
      escalate(c, "service_unavailable"); this.save(c);
      this.db.prepare("UPDATE chats SET lease=NULL,expires=0 WHERE id=?").run(id);
    }
    return c;
  }
  create(owner: string): Conversation {
    return this.transaction(() => {
      const empty = this.db.prepare("SELECT document FROM chats WHERE owner=? AND json_extract(document, '$.status')='bot_active' AND json_array_length(document, '$.messages')=0 ORDER BY rowid DESC LIMIT 1").get(owner) as { document: string } | undefined;
      if (empty) return JSON.parse(empty.document) as Conversation;
      const count = this.db.prepare("SELECT count(*) AS n FROM chats WHERE owner=?").get(owner) as { n: number };
      if (count.n >= 30) throw new ChatError("CONVERSATION_LIMIT", 429);
      const now = new Date().toISOString();
      const c: Conversation = { id: randomUUID(), status: "bot_active", messages: [], handover: false, reason: null, summary: null, confidence: null, createdAt: now, updatedAt: now };
      this.db.prepare("INSERT INTO chats(id,owner,document) VALUES(?,?,?)").run(c.id, owner, JSON.stringify(c));
      return c;
    });
  }
  get(id: string, owner?: string): Conversation {
    return this.transaction(() => this.recover(id, this.row(id, owner)));
  }
  list(owner?: string): Conversation[] {
    const rows = (owner === undefined
      ? this.db.prepare("SELECT id FROM chats ORDER BY rowid DESC LIMIT 100").all()
      : this.db.prepare("SELECT id FROM chats WHERE owner=? ORDER BY rowid DESC LIMIT 30").all(owner)) as { id: string }[];
    return rows.map(row => this.get(row.id, owner));
  }
  setPinned(id: string, owner: string | undefined, pinned: boolean): Conversation {
    return this.transaction(() => {
      const conversation = this.recover(id, this.row(id, owner));
      conversation.pinned = pinned;
      this.save(conversation);
      return conversation;
    });
  }
  markRead(id: string, owner: string | undefined, messageId: string): Conversation {
    return this.transaction(() => {
      const c = this.recover(id, this.row(id, owner));
      markRead(c, owner === undefined, messageId);
      this.save(c);
      return c;
    });
  }
  delete(id: string, owner: string) {
    this.transaction(() => {
      const conversation = JSON.parse(this.row(id, owner).document) as Conversation;
      // Several empty chats are shown as one draft in the customer history.
      const targets = conversation.status === "bot_active" && conversation.messages.length === 0
        ? this.db.prepare("SELECT id FROM chats WHERE owner=? AND json_extract(document, '$.status')='bot_active' AND json_array_length(document, '$.messages')=0").all(owner) as { id: string }[]
        : [{ id }];
      for (const target of targets) {
        this.db.prepare("DELETE FROM chat_requests WHERE conversation=?").run(target.id);
        this.db.prepare("DELETE FROM chats WHERE id=? AND owner=?").run(target.id, owner);
      }
    });
  }
  begin(id: string, owner: string, requestId: string, text: string, humanRequested: boolean) {
    return this.transaction(() => {
      const row = this.row(id, owner);
      const c = this.recover(id, row);
      const fingerprint = JSON.stringify([text, humanRequested]);
      const previous = this.db.prepare("SELECT input FROM chat_requests WHERE conversation=? AND id=?").get(id, requestId);
      if (previous) {
        if (previous.input !== fingerprint) throw new ChatError("REQUEST_ID_CONFLICT", 409);
        return { conversation: c, lease: null };
      }
      if (c.status === "closed") throw new ChatError("CONVERSATION_CLOSED", 409);
      if (row.lease && row.expires >= Date.now() && !humanRequested) throw new ChatError("TURN_IN_PROGRESS", 409);
      if (c.messages.length >= 200) throw new ChatError("MESSAGE_LIMIT", 429);
      this.db.prepare("INSERT INTO chat_requests VALUES(?,?,?)").run(id, requestId, fingerprint);
      append(c, "user", text);
      if (humanRequested) escalate(c, "human_requested");
      // Limit context rather than silently discarding earlier lead details or instructions.
      if (!c.handover && c.messages.filter(m => m.role === "user").length >= 30) escalate(c, "conversation_loop");
      refreshHandoverSummary(c);
      const lease = c.status === "bot_active" ? randomUUID() : null;
      this.save(c);
      this.db.prepare("UPDATE chats SET lease=?,expires=? WHERE id=?").run(lease, lease ? Date.now() + 60000 : 0, id);
      return { conversation: c, lease };
    });
  }
  finish(id: string, lease: string, reply: string, reason: HandoverReason | null, confidence: number | null): Conversation {
    return this.transaction(() => {
      const row = this.row(id); const c = this.recover(id, row);
      if (row.lease !== lease || c.status !== "bot_active") return c;
      c.confidence = confidence;
      if (reason) escalate(c, reason);
      else append(c, "assistant", reply);
      this.save(c);
      this.db.prepare("UPDATE chats SET lease=NULL,expires=0 WHERE id=?").run(id);
      return c;
    });
  }
  admin(id: string, action: "takeover" | "close" | "reply", text: string, requestId: string): Conversation {
    return this.transaction(() => {
      const row = this.row(id); const c = this.recover(id, row);
      const fingerprint = JSON.stringify([action, text]);
      const previous = this.db.prepare("SELECT input FROM chat_requests WHERE conversation=? AND id=?").get(id, requestId);
      if (previous) {
        if (previous.input !== fingerprint) throw new ChatError("REQUEST_ID_CONFLICT", 409);
        return c;
      }
      if (c.status === "closed" || !c.handover || (action === "reply" && c.status !== "human_active")) throw new ChatError("INVALID_TRANSITION", 409);
      if (c.messages.length >= 200) throw new ChatError("MESSAGE_LIMIT", 429);
      this.db.prepare("INSERT INTO chat_requests VALUES(?,?,?)").run(id, requestId, fingerprint);
      if (action === "reply") append(c, "human", text);
      else {
        c.status = action === "close" ? "closed" : "human_active";
        append(c, "system", action === "close" ? "Conversation closed / ปิดบทสนทนาแล้ว" : "A sales specialist has taken over / เจ้าหน้าที่รับช่วงดูแลแล้ว");
      }
      this.save(c);
      this.db.prepare("UPDATE chats SET lease=NULL,expires=0 WHERE id=?").run(id);
      return c;
    });
  }
}
