import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseChatRepository } from "../../src/chat/supabase-chat.repository.js";
import { ChatService } from "../../src/chat/chat.service.js";
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || "@electric-sql/pglite");
const pg = new PGlite();
const owner = "a".repeat(64), other = "b".repeat(64);
try {
  await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table public.business_profiles (id text primary key); insert into public.business_profiles values ('sunpro-solar');`);
  for (const name of ["003-conversations.sql", "004-chat-runtime.sql", "004-chat-runtime.sql"]) {
    await pg.exec(readFileSync(new URL(`../../../database/migrations/${name}`, import.meta.url), "utf8"));
  }
  await pg.exec("set role anon");
  await assert.rejects(pg.query("select public.graspia_chat_store('list','sunpro-solar','{}')"), /permission denied/);
  await assert.rejects(pg.query("select * from public.messages"), /permission denied/);
  await pg.exec("reset role; set role service_role");
  let collide = false;
  const client = { rpc: (_name: string, args: Record<string, unknown>) => ({ abortSignal: async () => {
    try {
      if (collide && args.p_action === "commit") {
        collide = false;
        await pg.query("update public.conversations set revision=revision+1, pinned=true where id=$1", [(args.p_payload as { id: string }).id]);
      }
      const result = await pg.query("select public.graspia_chat_store($1,$2,$3) as result", [args.p_action, args.p_business, args.p_payload]);
      return { data: result.rows[0].result, error: null };
    } catch (error) { return { data: null, error: { message: (error as Error).message } }; }
  } }) } as unknown as SupabaseClient;
  const repo = new SupabaseChatRepository(client);
  const c = await repo.create(owner);
  assert.equal((await repo.create(owner)).id, c.id);
  await assert.rejects(repo.get(c.id, other), /NOT_FOUND/);
  await assert.rejects(repo.setPinned(c.id, other, true), /NOT_FOUND/);
  const request = randomUUID();
  const turn = await repo.begin(c.id, owner, request, "What is the price?", false);
  assert.ok(turn.lease);
  assert.equal((await repo.begin(c.id, owner, request, "What is the price?", false)).lease, null);
  await assert.rejects(repo.begin(c.id, owner, request, "different", false), /REQUEST_ID_CONFLICT/);
  await assert.rejects(repo.begin(c.id, owner, randomUUID(), "parallel", false), /TURN_IN_PROGRESS/);
  collide = true;
  const done = await repo.finish(c.id, turn.lease!, "The price is in the profile.", null, .9);
  assert.equal(done.pinned, true); assert.equal(done.messages.length, 2);
  const wait = await repo.begin(c.id, owner, randomUUID(), "Please get a human", true);
  assert.equal(wait.conversation.status, "awaiting_human");
  assert.equal((await repo.finish(c.id, turn.lease!, "late", null, 1)).messages.length, 4);
  await repo.admin(c.id, "takeover", "", randomUUID());
  const replyId = randomUUID();
  await repo.admin(c.id, "reply", "Hello from sales", replyId);
  await repo.admin(c.id, "reply", "Hello from sales", replyId);
  const restored = await new SupabaseChatRepository(client).get(c.id, owner);
  assert.equal(restored.messages.filter(m => m.content === "Hello from sales").length, 1);
  assert.equal(restored.pinned, true);
  assert.equal((await pg.query("select count(*)::int n from public.messages where conversation_id=$1", [c.id])).rows[0].n, restored.messages.length);
  await repo.admin(c.id, "close", "", randomUUID());
  await assert.rejects(repo.begin(c.id, owner, randomUUID(), "closed", false), /CONVERSATION_CLOSED/);
  const fresh = await repo.create(owner);
  const active = await repo.begin(fresh.id, owner, randomUUID(), "hello", false);
  await pg.query("update public.conversations set lease_expires_at=1 where id=$1", [fresh.id]);
  assert.equal((await repo.get(fresh.id, owner)).reason, "service_unavailable");
  assert.equal((await repo.finish(fresh.id, active.lease!, "late", null, 1)).status, "awaiting_human");
  const copy = { ...restored, id: randomUUID(), messages: restored.messages.map(m => ({ ...m, id: randomUUID() })) };
  assert.equal(await repo.importConversation(owner, copy, {}), true);
  assert.equal(await repo.importConversation(owner, copy, {}), false);
  assert.deepEqual(await repo.get(copy.id, owner), copy);
  await repo.delete(copy.id, owner);
  await assert.rejects(repo.get(copy.id, owner), /NOT_FOUND/);
  const draft = await repo.create(other); await repo.delete(draft.id, other);
  assert.equal((await repo.list(other)).length, 0); assert.ok((await repo.list(owner)).length);
  const profile = JSON.parse(readFileSync(new URL("../../../data/business-profile.json", import.meta.url), "utf8"));
  const service = new ChatService(repo, async () => profile, async () => ({ reply: "Profile answer", reason: null, confidence: .95 }));
  const normal = await repo.create(owner);
  assert.equal((await service.send(normal.id, owner, randomUUID(), "price")).messages.length, 2);
  console.log("PASS: PostgreSQL migration/rerun, grants, ownership, messages/pins, CAS retry, idempotency, handover, leases, admin, import, delete, async service.");
} finally { await pg.close(); }
