import type { BusinessProfile } from "../../../packages/contracts/src/domain/business-profile.js";
import type { ChatDecision, ChatMessage } from "../../../packages/contracts/src/contracts/chat.js";
import { salesInstructions } from "../prompts/sales/system.js";
import { ChatError, decision, decisionSchema } from "./chat.validation.js";
import { expectedReplyLanguage } from "./reply-language.js";
import { MAX_OUTPUT_TOKENS } from "../http/limits.js";

type Provider = "gemini" | "openai" | "anthropic";
type Turn = { role: "user" | "assistant"; content: string };
/** Untyped JSON from the provider; answerText checks it field by field. */
type ProviderJson = Awaited<ReturnType<Response["json"]>>;

export const retryDelaysMs = [1_000, 3_000];
// "Overloaded" answers are usually brief: 503 from Gemini and OpenAI, 529 from Claude.
const OVERLOADED = new Set([503, 529]);

const providers: Record<Provider, { keyVariable: string; model: () => string }> = {
  gemini: { keyVariable: "GEMINI_API_KEY", model: () => process.env.GEMINI_MODEL || "gemini-3.5-flash-lite" },
  openai: { keyVariable: "OPENAI_API_KEY", model: () => process.env.OPENAI_MODEL || "gpt-4.1-mini" },
  anthropic: { keyVariable: "ANTHROPIC_API_KEY", model: () => process.env.ANTHROPIC_MODEL || "claude-haiku-4-5" },
};

// Claude's structured outputs do not accept numeric bounds or type arrays; decision() still checks both.
const claudeDecisionSchema = {
  ...decisionSchema,
  properties: {
    ...decisionSchema.properties,
    reason: { anyOf: [{ type: "string", enum: decisionSchema.properties.reason.enum.filter(value => value !== null) }, { type: "null" }] },
    confidence: { type: "number" },
  },
};

function request(provider: Provider, model: string, key: string, instructions: string, turns: Turn[]): { url: string; headers: Record<string, string>; body: object } {
  if (provider === "gemini") return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    headers: { "x-goog-api-key": key },
    body: {
      systemInstruction: { parts: [{ text: instructions }] },
      contents: turns.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: { responseMimeType: "application/json", responseJsonSchema: decisionSchema, maxOutputTokens: MAX_OUTPUT_TOKENS },
    },
  };
  if (provider === "openai") return {
    url: "https://api.openai.com/v1/responses",
    headers: { Authorization: `Bearer ${key}` },
    body: {
      model, store: false, instructions, input: turns.map(m => ({ role: m.role, content: m.content })), max_output_tokens: MAX_OUTPUT_TOKENS,
      text: { format: { type: "json_schema", name: "sales_decision", strict: true, schema: decisionSchema } },
    },
  };
  // Claude: the conversation must start with a customer message.
  const firstUser = turns.findIndex(m => m.role === "user");
  return {
    url: "https://api.anthropic.com/v1/messages",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: {
      model, max_tokens: MAX_OUTPUT_TOKENS, system: instructions,
      messages: (firstUser < 0 ? [] : turns.slice(firstUser)).map(m => ({ role: m.role, content: m.content })),
      output_config: { format: { type: "json_schema", schema: claudeDecisionSchema } },
    },
  };
}

/** The JSON text of a complete answer; throws on blocked, cut-off or unexpected responses. */
function answerText(provider: Provider, payload: ProviderJson): string {
  if (provider === "gemini") {
    const c = payload.candidates?.[0];
    if (payload.promptFeedback?.blockReason || payload.candidates?.length !== 1 || c.finishReason !== "STOP") throw new Error();
    const parts = c.content.parts.filter((p: { thought?: boolean }) => !p.thought);
    if (!parts.length || parts.some((p: { text?: unknown }) => typeof p.text !== "string")) throw new Error();
    return parts.map((p: { text: string }) => p.text).join("");
  }
  if (provider === "openai") {
    if (payload.status !== "completed" || payload.error || payload.incomplete_details) throw new Error();
    const entries = payload.output.filter((p: { type: string }) => p.type === "message");
    if (entries.length !== 1 || entries[0].status !== "completed" || entries[0].role !== "assistant" || entries[0].content.length !== 1 || entries[0].content[0].type !== "output_text") throw new Error();
    return entries[0].content[0].text;
  }
  // Claude: a finished turn (not a refusal or max_tokens) with exactly one text block; thinking blocks are ignored.
  if (payload.type !== "message" || payload.stop_reason !== "end_turn") throw new Error();
  const texts = payload.content.filter((block: { type: string }) => block.type === "text");
  if (texts.length !== 1 || typeof texts[0].text !== "string") throw new Error();
  return texts[0].text;
}

export async function respond(profile: BusinessProfile, messages: ChatMessage[], correction?: { errors: string[]; timeoutMs: number }): Promise<ChatDecision> {
  const provider = (process.env.CHAT_AI_PROVIDER || "gemini") as Provider;
  if (!Object.hasOwn(providers, provider)) throw new ChatError("CHAT_PROVIDER_NOT_SUPPORTED", 503);
  const key = process.env[providers[provider].keyVariable]?.trim();
  if (!key) throw new ChatError("AI_NOT_CONFIGURED", 503);
  const turns = messages.filter((m): m is ChatMessage & Turn => m.role === "user" || m.role === "assistant");
  const instructions = salesInstructions(profile, expectedReplyLanguage(messages)) + (correction
    ? `\nThe previous draft failed server checks: ${correction.errors.join(", ")}. Generate a fresh answer using the exact trusted catalog values in the required reply language. Do not repeat or justify the invalid draft. If you cannot answer reliably, hand over with uncertain.`
    : "");
  const model = process.env.CHAT_MODEL?.trim() || providers[provider].model();
  const { url, headers, body } = request(provider, model, key, instructions, turns);

  // Retry a brief overload twice inside this call's time budget; auth, quota (429) and bad requests are not retried.
  const deadline = Date.now() + (correction?.timeoutMs ?? 40_000);
  let response: Response;
  let attempt = 0;
  for (; ; attempt++) {
    try {
      response = await fetch(url, {
        method: "POST", cache: "no-store", signal: AbortSignal.timeout(Math.min(35_000, deadline - Date.now())),
        headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
      });
    } catch {
      console.warn("[chat]", JSON.stringify({ event: "ai_provider_error", provider, model, status: "network_or_timeout", attempts: attempt + 1 }));
      throw new ChatError("AI_UNAVAILABLE", 503);
    }
    const wait = retryDelaysMs[attempt];
    if (!OVERLOADED.has(response.status) || wait === undefined || deadline - Date.now() - wait < 5_000) break;
    await new Promise(resolve => setTimeout(resolve, wait));
  }
  if (!response.ok) {
    // Status only: no key, prompt or customer text. Lets operators tell overload from quota (429).
    console.warn("[chat]", JSON.stringify({ event: "ai_provider_error", provider, model, status: response.status, attempts: attempt + 1 }));
    throw new ChatError("AI_UNAVAILABLE", 503);
  }
  try {
    return decision(JSON.parse(answerText(provider, await response.json())));
  } catch {
    console.warn("[chat]", JSON.stringify({ event: "ai_invalid_response", provider, model }));
    throw new ChatError("INVALID_AI_RESPONSE", 502);
  }
}
