import type { LeadRequest } from "../../../packages/contracts/src/contracts/leads.js";

const limits: Record<keyof LeadRequest, number> = {
  name: 120, phone: 40, email: 254, message: 2000, budget: 40, area: 120, website: 200,
};

/**
 * Shape check only: keep known string fields within size limits.
 * Spam, contact and content rules live in the n8n workflow so every lead source gets them.
 */
export function leadRequest(body: unknown): LeadRequest | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const lead: Record<string, string> = {};
  for (const [key, max] of Object.entries(limits)) {
    const value = input[key];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "string" || value.length > max) return null;
    lead[key] = value;
  }
  return lead as unknown as LeadRequest;
}
