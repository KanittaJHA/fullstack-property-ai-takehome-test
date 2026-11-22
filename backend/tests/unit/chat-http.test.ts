import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../../src/app.js";
import { ChatRepository } from "../../src/chat/chat.repository.js";
import { ChatService } from "../../src/chat/chat.service.js";
import { createChatHandler } from "../../src/chat/chat.handler.js";

test("integrated app routes persist handover and enforce origin, owner and admin session", async () => {
  const dir = mkdtempSync(join(tmpdir(), "graspia-http-"));
  const old = { ...process.env };
  process.env.ADMIN_ACCESS_CODE = "test1234";
  process.env.ADMIN_SESSION_SECRET = "isolated-chat-http-test-secret-at-least-32";
  process.env.FRONTEND_ORIGIN = "http://localhost:3100";
  const repositories: ChatRepository[] = [];
  const makeApp = () => {
    const repository = new ChatRepository(join(dir, "chat.sqlite"));
    repositories.push(repository);
    const unavailable = async (): Promise<never> => { throw new Error("No live model in HTTP tests"); };
    return createApp({ chat: createChatHandler(new ChatService(repository, unavailable, unavailable)) });
  };
  const app = makeApp();
  const request = (path: string, body?: unknown, cookie = "", origin = "http://localhost:3100") => new Request(`http://localhost:4000${path}`, {
    method: body === undefined ? "GET" : "POST", headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  try {
    assert.equal((await app(request("/chat/session", {}, "", "https://evil.invalid"))).status, 403);
    const session = await app(request("/chat/session", {}));
    const cookie = session.headers.get("set-cookie")!.split(";")[0];
    const create = await app(request("/chat/conversations", {}, cookie)); assert.equal(create.status, 201);
    const c = await create.json();
    const handover = await app(request(`/chat/conversations/${c.id}/handover`, { requestId: randomUUID() }, cookie));
    const result = await handover.json();
    assert.equal(result.handover, true); assert.equal(result.reason, "human_requested"); assert.ok(result.summary);
    const restarted = makeApp();
    const restored = await restarted(request(`/chat/conversations/${c.id}`, undefined, cookie));
    assert.equal((await restored.json()).status, "awaiting_human");
    const forged = `graspia-visitor=${"b".repeat(64)}.${"c".repeat(64)}`;
    assert.equal((await app(request(`/chat/conversations/${c.id}`, undefined, forged))).status, 401, "a made-up visitor cookie is not an identity");
    const other = (await app(request("/chat/session", {}))).headers.get("set-cookie")!.split(";")[0];
    assert.equal((await app(request(`/chat/conversations/${c.id}`, undefined, other))).status, 404, "another real visitor cannot read this chat");
    const login = await app(request("/auth/login", { code: "test1234" }));
    const admin = login.headers.get("set-cookie")!.split(";")[0];
    const takeoverPath = `/chat/admin/conversations/${c.id}/takeover`;
    assert.equal((await app(request(takeoverPath, { requestId: randomUUID() }, cookie))).status, 401);
    assert.equal((await app(request(takeoverPath, { requestId: randomUUID() }, admin))).status, 200);
    const reply = await app(request(`/chat/admin/conversations/${c.id}/reply`, { requestId: randomUUID(), message: "A real human test reply" }, admin));
    assert.equal(reply.status, 200);
    const read = await app(request(`/chat/conversations/${c.id}`, undefined, cookie));
    assert.equal((await read.json()).messages.at(-1).role, "human");
  } finally {
    for (const key of ["ADMIN_ACCESS_CODE", "ADMIN_SESSION_SECRET", "FRONTEND_ORIGIN"]) {
      if (old[key] === undefined) delete process.env[key]; else process.env[key] = old[key];
    }
    repositories.forEach(repository => repository.close());
    rmSync(dir, { recursive: true, force: true });
  }
});
