import assert from "node:assert/strict";
import { test } from "node:test";
import { rankWithGemini } from "../../src/matching/gemini.provider.js";
import { selectedProvider } from "../../src/matching/match.provider.js";

test("Gemini transport, fail-closed output and explicit provider selection", async () => {
  const originalFetch = globalThis.fetch;
  const variables = ["GEMINI_API_KEY", "GEMINI_MODEL", "AI_PROVIDER", "ANTHROPIC_API_KEY"];
  const saved = variables.map(name => process.env[name]);
  const input = { request: "condo", locale: "en" as const };
  try {
    delete process.env.GEMINI_API_KEY;
    await assert.rejects(rankWithGemini(input, []), { code: "AI_NOT_CONFIGURED" });
    process.env.GEMINI_API_KEY = "offline-only";
    process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";
    delete process.env.AI_PROVIDER;
    assert.match(selectedProvider().version, /^gemini:/);
    process.env.AI_PROVIDER = "anthropic";
    assert.match(selectedProvider().version, /^anthropic:/);
    process.env.AI_PROVIDER = "unknown";
    assert.throws(selectedProvider, { code: "AI_NOT_CONFIGURED" });
    process.env.AI_PROVIDER = "gemini";
    globalThis.fetch = async (url, options) => {
      assert.equal(String(url), "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
      assert.equal((options!.headers as Record<string, string>)["x-goog-api-key"], "offline-only");
      const body = JSON.parse(String(options!.body));
      assert.equal(body.generationConfig.responseMimeType, "application/json");
      assert.ok(body.generationConfig.responseJsonSchema.required.includes("constraints"));
      assert.equal(JSON.parse(body.contents[0].parts[0].text).buyer_request, "condo");
      return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ thought: true, text: "private" }, { text: '{"matches":[]}' }] } }] });
    };
    assert.deepEqual(await rankWithGemini(input, []), { matches: [] });
    for (const status of [400, 401, 403, 404, 429, 500]) {
      globalThis.fetch = async () => new Response("private details", { status });
      await assert.rejects(rankWithGemini(input, []), { code: status === 429 ? "RATE_LIMITED" : "AI_UNAVAILABLE" });
    }
    for (const payload of [
      { promptFeedback: { blockReason: "SAFETY" } },
      { candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: '{}' }] } }] },
      { candidates: [{ finishReason: "STOP", content: { parts: [{ text: 'bad json' }] } }] },
      { candidates: [] },
    ]) {
      globalThis.fetch = async () => Response.json(payload);
      await assert.rejects(rankWithGemini(input, []), { code: "INVALID_AI_RESPONSE" });
    }
    globalThis.fetch = async () => { throw new DOMException("timeout", "TimeoutError"); };
    await assert.rejects(rankWithGemini(input, []), { code: "AI_TIMEOUT" });
    globalThis.fetch = async () => { throw new Error("network"); };
    await assert.rejects(rankWithGemini(input, []), { code: "AI_UNAVAILABLE" });
  } finally {
    globalThis.fetch = originalFetch;
    variables.forEach((name, i) => { if (saved[i] === undefined) delete process.env[name]; else process.env[name] = saved[i]; });
  }
});
