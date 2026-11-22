import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { ChatRepository } from "../../src/chat/chat.repository.js";
import { ChatService } from "../../src/chat/chat.service.js";

test("read cursors are reader-scoped, monotonic and preserve the transcript", async () => {
  const repo = new ChatRepository(":memory:");
  try {
    const service = new ChatService(repo, async () => JSON.parse(readFileSync(new URL("../../../data/business-profile.json", import.meta.url), "utf8")), async () => ({ reply: "Hello", reason: null, confidence: .95 }));
    const draft = repo.create("alice");
    const first = await service.send(draft.id, "alice", randomUUID(), "Hello");
    const user = first.messages[0];
    const assistant = first.messages[1];
    assert.throws(() => repo.markRead(draft.id, "bob", assistant.id), /NOT_FOUND/);
    assert.throws(() => repo.markRead(draft.id, "alice", user.id), /INVALID_READ_RECEIPT/);
    assert.throws(() => repo.markRead(draft.id, undefined, assistant.id), /INVALID_READ_RECEIPT/);
    repo.markRead(draft.id, "alice", assistant.id);
    const read = repo.markRead(draft.id, undefined, user.id);
    assert.equal(read.customerReadThrough, assistant.id);
    assert.equal(read.adminReadThrough, user.id);
    assert.deepEqual(read.messages, first.messages);
    assert.equal(read.status, first.status);
    const second = await service.send(draft.id, "alice", randomUUID(), "Again");
    repo.markRead(draft.id, undefined, second.messages[2].id);
    const older = repo.markRead(draft.id, undefined, user.id);
    assert.equal(older.adminReadThrough, second.messages[2].id);
  } finally { repo.close(); }
});
