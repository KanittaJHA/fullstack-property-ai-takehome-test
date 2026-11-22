import type { MatchInput } from "../../../packages/contracts/src/contracts/matching.js";

export class MatchError extends Error {
  constructor(public code: string, public status: number, public diagnostic?: string, public counts?: { expectedCount: number; actualCount: number }) { super(code); }
}

export function parseMatchInput(value: unknown): MatchInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MatchError("INVALID_REQUEST", 400);
  const input = value as Record<string, unknown>;
  if (typeof input.request !== "string" || !input.request.trim() || input.request.trim().length > 1000 ||
    (input.locale !== undefined && input.locale !== "en" && input.locale !== "th")) {
    throw new MatchError("INVALID_REQUEST", 400);
  }
  return { request: input.request.trim().normalize("NFC"), locale: input.locale as "en" | "th" ?? (/[\u0e00-\u0e7f]/.test(input.request) ? "th" : "en") };
}

// Only internal, fixed diagnostic labels belong here; never log model text or input.
export function logMatchFailure(error: MatchError): void {
  if (error.code !== "INVALID_AI_RESPONSE") return;
  console.warn("[matching]", JSON.stringify({
    code: error.code,
    diagnostic: error.diagnostic ?? "response.unspecified",
    ...(error.counts ? { expectedCount: error.counts.expectedCount, actualCount: error.counts.actualCount } : {}),
  }));
}
