import assert from "node:assert/strict";
import { test } from "node:test";
import { rankWithOpenAI, openaiModel } from "../../src/matching/openai.provider.js";
import { selectedProvider } from "../../src/matching/match.provider.js";
import { rankingSchema } from "../../src/matching/match.schema.js";

test("OpenAI Responses transport, provider isolation and failure handling", async () => {
  const originalFetch = globalThis.fetch;
  const names = ["OPENAI_API_KEY", "OPENAI_MODEL", "AI_PROVIDER", "GEMINI_API_KEY", "ANTHROPIC_API_KEY"];
  const saved = names.map(name => process.env[name]);
  const input = { request: "หาคอนโด ห้ามเกินงบ", locale: "th" as const };
  const complete = (text = '{"matches":[]}') => ({ status: "completed", output: [
    { type: "reasoning", summary: [] },
    { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text }] },
  ] });
  try {
    delete process.env.OPENAI_MODEL;
    assert.equal(openaiModel(), "gpt-4.1-mini");
    process.env.AI_PROVIDER = "openai";
    process.env.GEMINI_API_KEY = "unused-gemini";
    process.env.ANTHROPIC_API_KEY = "unused-claude";
    delete process.env.OPENAI_API_KEY;
    globalThis.fetch = async () => { assert.fail("Missing OpenAI key must not call any provider"); };
    assert.equal(selectedProvider().rank, rankWithOpenAI);
    await assert.rejects(selectedProvider().rank(input, []), { code: "AI_NOT_CONFIGURED" });
    process.env.OPENAI_API_KEY = "offline-only";
    process.env.OPENAI_MODEL = "custom-model";
    const version = selectedProvider().version;
    assert.match(version, /^openai:custom-model:/);
    let calls = 0;
    globalThis.fetch = async (url, options) => {
      calls++;
      assert.equal(url, "https://api.openai.com/v1/responses");
      assert.equal((options!.headers as Record<string, string>).Authorization, "Bearer offline-only");
      const body = JSON.parse(String(options!.body));
      assert.equal(body.model, "custom-model");
      assert.equal(body.store, false);
      assert.equal(body.text.format.strict, true);
      assert.deepEqual(body.text.format.schema, rankingSchema);
      assert.equal(JSON.parse(body.input[0].content).buyer_request, input.request);
      assert.ok(body.instructions.includes("Thai"));
      return Response.json(complete());
    };
    assert.deepEqual(await rankWithOpenAI(input, []), { matches: [] });
    assert.equal(calls, 1);
    process.env.OPENAI_MODEL = "another-model";
    assert.notEqual(selectedProvider().version, version);
    for (const status of [400, 401, 403, 404, 429, 500]) {
      calls = 0;
      globalThis.fetch = async () => { calls++; return new Response("private provider details", { status }); };
      await assert.rejects(rankWithOpenAI(input, []), { code: status === 429 ? "RATE_LIMITED" : "AI_UNAVAILABLE" });
      assert.equal(calls, 1); // No retries or fallback billing.
    }
    for (const payload of [
      null, {}, { ...complete(), status: "incomplete" },
      { ...complete(), error: { message: "private" } },
      { ...complete(), incomplete_details: { reason: "max_output_tokens" } },
      { status: "completed", output: [] }, complete("bad json"),
      { status: "completed", output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "No" }] }] },
      { status: "completed", output: [complete().output[1], complete().output[1]] },
    ]) {
      globalThis.fetch = async () => Response.json(payload);
      await assert.rejects(rankWithOpenAI(input, []), { code: "INVALID_AI_RESPONSE" });
    }
    globalThis.fetch = async () => { throw new DOMException("timeout", "TimeoutError"); };
    await assert.rejects(rankWithOpenAI(input, []), { code: "AI_TIMEOUT" });
    globalThis.fetch = async () => { throw new Error("network"); };
    await assert.rejects(rankWithOpenAI(input, []), { code: "AI_UNAVAILABLE" });
  } finally {
    globalThis.fetch = originalFetch;
    names.forEach((name, index) => { if (saved[index] === undefined) delete process.env[name]; else process.env[name] = saved[index]; });
  }
});
