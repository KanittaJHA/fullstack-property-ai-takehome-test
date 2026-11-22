import { createHash, createHmac, randomBytes } from "node:crypto";
import { equal, hasAdminSession } from "../auth/admin-session.js";
import { clientKey } from "../http/client.js";
import { readCookie, secureFlag } from "../http/cookies.js";
import { createRateLimiter } from "../http/rate-limit.js";
import { getBusinessProfile } from "../business/business-profile.repository.js";
import { jsonResponse } from "../http/json-response.js";
import { MAX_BODY_BYTES } from "../http/limits.js";
import { SupabaseChatRepository } from "./supabase-chat.repository.js";
import { ChatService } from "./chat.service.js";
import { respond } from "./chat.provider.js";
import { ChatError, messageText, uuid } from "./chat.validation.js";

const cookieName = "graspia-visitor";
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
// The visitor cookie is "<random id>.<signature>": a made-up value is not an identity, so it cannot read
// other chats or dodge the per-visitor limits. Signed with ADMIN_SESSION_SECRET; without it, a key that
// lasts until the server restarts.
const fallbackKey = randomBytes(32);
const visitorSignature = (id: string) =>
  createHmac("sha256", process.env.ADMIN_SESSION_SECRET || fallbackKey).update(`visitor:${id}`).digest("hex");
const newVisitorToken = () => { const id = randomBytes(32).toString("hex"); return `${id}.${visitorSignature(id)}`; };
function visitor(request: Request) {
  const [id, signature, extra] = readCookie(request, cookieName)?.split(".") ?? [];
  if (extra !== undefined || !/^[0-9a-f]{64}$/.test(id ?? "") || !/^[0-9a-f]{64}$/.test(signature ?? "")) return null;
  return equal(signature, visitorSignature(id)) ? `${id}.${signature}` : null;
}

export function createChatHandler(injected?: ChatService) {
  let service = injected;
  const allow = createRateLimiter();
  const limit = (key: string, max: number) => { if (!allow(key, max)) throw new ChatError("RATE_LIMITED", 429); };
  function getService() {
    // Lazy: unrelated routes and tests do not need database credentials.
    return service ??= new ChatService(new SupabaseChatRepository(), getBusinessProfile, respond);
  }
  return async (request: Request): Promise<Response> => {
    try {
      const path = new URL(request.url).pathname;
      const admin = path.startsWith("/chat/admin/");
      if (admin && !hasAdminSession(request)) throw new ChatError("UNAUTHORIZED", 401);
      if (path === "/chat/session" && request.method === "POST") {
        limit("sessions", 60); limit(`sessions:${clientKey(request)}`, 10);
        const token = visitor(request) || newVisitorToken();
        return jsonResponse({ ready: true }, 200, { "Set-Cookie": `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${secureFlag()}` });
      }
      const token = visitor(request);
      if (!admin && !token) throw new ChatError("SESSION_REQUIRED", 401);
      const owner = token ? hash(token) : "";
      const repository = getService().repository;
      const prefix = admin ? "/chat/admin/conversations" : "/chat/conversations";
      if (path === prefix && request.method === "GET") {
        return jsonResponse({ conversations: (await repository.list(admin ? undefined : owner)).map(({ messages, ...c }) => ({ ...c, title: messages.find(m => m.role === "user")?.content.slice(0, 120), messages: messages.slice(-1) })) });
      }
      if (path === prefix && request.method === "POST" && !admin) {
        limit("create", 30); limit(`create:${owner}`, 5); limit(`create:${clientKey(request)}`, 10);
        return jsonResponse(await repository.create(owner), 201);
      }
      const parts = path.slice(prefix.length).split("/").filter(Boolean);
      if (!path.startsWith(prefix + "/") || !uuid(parts[0])) throw new ChatError("NOT_FOUND", 404);
      const id = parts[0];
      if (parts.length === 1 && request.method === "GET") return jsonResponse(await repository.get(id, admin ? undefined : owner));
      if (request.method !== "POST") throw new ChatError("METHOD_NOT_ALLOWED", 405);
      limit("writes", 120); limit(`writes:${admin ? "admin" : owner}`, 20); if (!admin) limit(`writes:${clientKey(request)}`, 30);
      let body: Record<string, unknown>;
      try {
        const raw = await request.text();
        if (Buffer.byteLength(raw) > MAX_BODY_BYTES) throw new Error();
        body = JSON.parse(raw);
        if (!body || Array.isArray(body) || typeof body !== "object") throw new Error();
      } catch { throw new ChatError("INVALID_REQUEST"); }
      if (!uuid(body.requestId)) throw new ChatError("INVALID_REQUEST_ID");
      if (parts.length !== 2) throw new ChatError("NOT_FOUND", 404);
      if (parts[1] === "read") {
        if (!uuid(body.messageId)) throw new ChatError("INVALID_READ_RECEIPT");
        return jsonResponse(await repository.markRead(id, admin ? undefined : owner, body.messageId));
      }
      if (admin) {
        const action = parts[1];
        if (action === "pin") {
          if (typeof body.pinned !== "boolean") throw new ChatError("INVALID_REQUEST");
          return jsonResponse(await repository.setPinned(id, undefined, body.pinned));
        }
        if (action !== "reply" && action !== "takeover" && action !== "close") throw new ChatError("NOT_FOUND", 404);
        return jsonResponse(await repository.admin(id, action, action === "reply" ? messageText(body.message) : "", body.requestId));
      }
      if (parts[1] === "pin") {
        if (typeof body.pinned !== "boolean") throw new ChatError("INVALID_REQUEST");
        return jsonResponse(await repository.setPinned(id, owner, body.pinned));
      }
      if (parts[1] === "delete") {
        await repository.delete(id, owner);
        return jsonResponse({ deleted: true });
      }
      if (parts[1] !== "messages" && parts[1] !== "handover") throw new ChatError("NOT_FOUND", 404);
      return jsonResponse(await getService().send(id, owner, body.requestId,
        parts[1] === "handover" ? (body.locale === "th" ? "ขอคุยกับเจ้าหน้าที่" : "I’d like to speak with your team.") : messageText(body.message), parts[1] === "handover"));
    } catch (error) {
      return error instanceof ChatError
        ? jsonResponse({ error: error.code }, error.status, error.status === 429 ? { "Retry-After": "60" } : {})
        : jsonResponse({ error: "CHAT_UNAVAILABLE" }, 503);
    }
  };
}
