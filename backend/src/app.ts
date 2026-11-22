import { handleListings } from "./properties/listings.handler.js";
import { handleMatch } from "./matching/match.handler.js";
import { getBusinessProfile } from "./business/business-profile.repository.js";
import { hasAdminSession } from "./auth/admin-session.js";
import { createAdminHandlers } from "./auth/admin.handler.js";
import { jsonResponse } from "./http/json-response.js";
import { createChatHandler } from "./chat/chat.handler.js";
import { createLeadHandlers } from "./leads/leads.handler.js";

interface AppDependencies {
  listings: typeof handleListings;
  match: typeof handleMatch;
  profile: typeof getBusinessProfile;
  chat?: ReturnType<typeof createChatHandler>;
  leads?: ReturnType<typeof createLeadHandlers>;
}

const defaultDependencies: AppDependencies = {
  listings: handleListings,
  match: handleMatch,
  profile: getBusinessProfile,
};

const routes = new Set([
  "/health", "/listings", "/match", "/auth/session",
  "/auth/login", "/auth/logout", "/business-profile", "/leads",
]);

/** Compose HTTP routes. Feature handlers own their behaviour; admin-only routes check the session before answering. */
export function createApp(overrides: Partial<AppDependencies> = {}) {
  const dependencies = { ...defaultDependencies, ...overrides };
  const admin = createAdminHandlers();
  const chat = dependencies.chat ?? createChatHandler();
  const leads = dependencies.leads ?? createLeadHandlers();

  return async (request: Request): Promise<Response> => {
    const { pathname } = new URL(request.url);
    try {
      // Browser writes must originate from the configured frontend. No permissive CORS.
      if (request.method === "POST") {
        const origin = request.headers.get("origin");
        const frontendOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:3100";
        if (
          (origin && origin !== frontendOrigin) ||
          request.headers.get("sec-fetch-site") === "cross-site"
        ) {
          return jsonResponse({ error: "FORBIDDEN_ORIGIN" }, 403);
        }
        if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
          return jsonResponse({ error: "INVALID_REQUEST" }, 415);
        }
      }

      if (pathname.startsWith("/chat/")) return await chat(request);

      if (request.method === "GET") {
        switch (pathname) {
          case "/health":
            return jsonResponse({ status: "ok" });
          case "/listings":
            return await dependencies.listings(request);
          case "/auth/session":
            return admin.session(request);
          case "/business-profile":
            if (!hasAdminSession(request)) {
              return jsonResponse({ error: "UNAUTHORIZED" }, 401);
            }
            return jsonResponse(await dependencies.profile());
          case "/leads":
            return await leads.list(request);
        }
      }

      if (request.method === "POST") {
        switch (pathname) {
          case "/match":
            return await dependencies.match(request);
          case "/auth/login":
            return await admin.login(request);
          case "/auth/logout":
            return admin.logout();
          case "/leads":
            return await leads.submit(request);
        }
      }

      return routes.has(pathname)
        ? jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405)
        : jsonResponse({ error: "NOT_FOUND" }, 404);
    } catch {
      return jsonResponse({ error: "SERVICE_UNAVAILABLE" }, 503);
    }
  };
}
