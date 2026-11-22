import assert from "node:assert/strict";
import { test } from "node:test";
import { MatchError, logMatchFailure } from "../../src/matching/match.validation.js";
import { validateRanking } from "../../src/matching/match.service.js";
import { rankWithGemini } from "../../src/matching/gemini.provider.js";

test("ranking diagnostics identify missing furnishing without including input", () => {
  const value = {
    summary: "private response", clarification: null, matches: [],
    constraints: { city: null, type: null, near_transit: false, strict_budget: false },
  };
  assert.throws(() => validateRanking(value, []), {
    code: "INVALID_AI_RESPONSE", status: 502, diagnostic: "ranking.constraints.furnished",
  });
});

test("failure logging only emits code and diagnostic, never stack or attached data", () => {
  const original = console.warn;
  const lines: unknown[][] = [];
  console.warn = (...args) => { lines.push(args); };
  try {
    const error = new MatchError("INVALID_AI_RESPONSE", 502, "ranking.matches.count", { expectedCount: 3, actualCount: 0 });
    Object.assign(error, { body: "private prompt", key: "secret key" });
    logMatchFailure(error);
    logMatchFailure(new MatchError("INVALID_REQUEST", 400));
    assert.deepEqual(lines, [["[matching]", JSON.stringify({
      code: "INVALID_AI_RESPONSE", diagnostic: "ranking.matches.count", expectedCount: 3, actualCount: 0,
    })]]);
  } finally { console.warn = original; }
});

test("Gemini diagnostics distinguish truncation and malformed JSON without network", async () => {
  const originalFetch = globalThis.fetch;
  const key = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "offline-only";
  try {
    for (const [payload, diagnostic] of [
      [{ candidates: [{ finishReason: "MAX_TOKENS" }] }, "gemini.token_limit"],
      [{ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "private invalid JSON" }] } }] }, "gemini.output_json"],
    ] as const) {
      globalThis.fetch = async () => Response.json(payload);
      await assert.rejects(rankWithGemini({ request: "private request", locale: "en" }, []), {
        code: "INVALID_AI_RESPONSE", status: 502, diagnostic,
      });
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (key === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = key;
  }
});
