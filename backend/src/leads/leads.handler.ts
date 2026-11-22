import { hasAdminSession } from "../auth/admin-session.js";
import { clientKey } from "../http/client.js";
import { jsonResponse } from "../http/json-response.js";
import { createRateLimiter } from "../http/rate-limit.js";
import { sendLeadToWorkflow } from "./lead-webhook.provider.js";
import { listLeads } from "./leads.repository.js";
import { leadRequest } from "./leads.validation.js";

interface LeadDependencies {
  send: typeof sendLeadToWorkflow;
  list: typeof listLeads;
}

/** Public lead form submission and the team's lead list. */
export function createLeadHandlers(overrides: Partial<LeadDependencies> = {}) {
  const { send, list } = { send: sendLeadToWorkflow, list: listLeads, ...overrides };
  // Per minute, per client and in total; the per-contact limit lives in the workflow's database function.
  const allow = createRateLimiter();

  return {
    async submit(request: Request): Promise<Response> {
      if (!allow(`leads:${clientKey(request)}`, 5) || !allow("leads", 30)) return jsonResponse({ ok: false, status: "rate_limited" }, 429, { "Retry-After": "60" });
      const lead = leadRequest(await request.json().catch(() => null));
      if (!lead) return jsonResponse({ ok: false, status: "rejected", reasons: ["invalid_request"] }, 400);
      const result = await send(lead);
      return jsonResponse(result.body, result.status);
    },

    async list(request: Request): Promise<Response> {
      if (!hasAdminSession(request)) return jsonResponse({ error: "UNAUTHORIZED" }, 401);
      return jsonResponse({ leads: await list() });
    },
  };
}
