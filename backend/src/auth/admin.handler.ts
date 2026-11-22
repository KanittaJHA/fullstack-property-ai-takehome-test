import { clientKey } from "../http/client.js";
import { jsonResponse } from "../http/json-response.js";
import { createRateLimiter } from "../http/rate-limit.js";
import { configured, equal, hasAdminSession, sessionCookie } from "./admin-session.js";

const LOGIN_ATTEMPTS_PER_CLIENT = 10;
const LOGIN_ATTEMPTS_TOTAL = 100;
/** A wrong code waits a moment, which slows down guessing. */
const WRONG_CODE_DELAY_MS = 300;

/** Login attempts are limited per minute, per client and in total, within this process. */
export function createAdminHandlers() {
  const allow = createRateLimiter();

  return {
    session(request: Request): Response {
      return jsonResponse({ authenticated: hasAdminSession(request) });
    },

    async login(request: Request): Promise<Response> {
      if (!configured()) return jsonResponse({ error: "ADMIN_NOT_CONFIGURED" }, 503);

      if (!allow(`login:${clientKey(request)}`, LOGIN_ATTEMPTS_PER_CLIENT) || !allow("login", LOGIN_ATTEMPTS_TOTAL)) {
        return jsonResponse({ error: "RATE_LIMITED" }, 429, { "Retry-After": "60" });
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: "INVALID_REQUEST" }, 400);
      }

      const code = body && typeof body === "object"
        ? (body as Record<string, unknown>).code
        : null;
      if (typeof code !== "string" || !equal(code, process.env.ADMIN_ACCESS_CODE!)) {
        await new Promise(resolve => setTimeout(resolve, WRONG_CODE_DELAY_MS));
        return jsonResponse({ error: "INVALID_CODE" }, 401);
      }

      return jsonResponse({ authenticated: true }, 200, {
        "Set-Cookie": sessionCookie(),
      });
    },

    logout(): Response {
      return jsonResponse({ authenticated: false }, 200, {
        "Set-Cookie": sessionCookie(true),
      });
    },
  };
}
