import type { LeadRequest, LeadResponse } from "../../../packages/contracts/src/contracts/leads.js";
import { UPSTREAM_TIMEOUT_MS } from "../http/limits.js";

/** Header the n8n webhook checks (Header Auth credential "Lead webhook secret"). */
export const WEBHOOK_SECRET_HEADER = "X-Lead-Webhook-Secret";
const passThrough = new Set([200, 400, 429, 503]);
const unavailable: LeadResponse = { ok: false, status: "unavailable" };

/** Forward one lead to the n8n workflow webhook and relay its answer. */
export async function sendLeadToWorkflow(lead: LeadRequest): Promise<{ status: number; body: LeadResponse }> {
  const url = process.env.N8N_LEAD_WEBHOOK_URL;
  const secret = process.env.N8N_LEAD_WEBHOOK_SECRET?.trim();
  if (!url || !secret) return { status: 503, body: unavailable };
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", [WEBHOOK_SECRET_HEADER]: secret },
      body: JSON.stringify(lead),
      // The workflow calls Supabase and the AI model; allow for retries inside it.
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return { status: 503, body: unavailable };
  }
  const body = await response.json().catch(() => null) as LeadResponse | null;
  if (!passThrough.has(response.status) || !body || typeof body.status !== "string") {
    return { status: 503, body: unavailable };
  }
  return {
    status: response.status,
    body: {
      ok: body.ok === true,
      status: body.status,
      ...(typeof body.message === "string" ? { message: body.message } : {}),
      ...(Array.isArray(body.reasons) ? { reasons: body.reasons.filter(r => typeof r === "string") } : {}),
    },
  };
}
