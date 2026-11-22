import type { Property } from "../../../packages/contracts/src/domain/property.js";
import type { MatchInput } from "../../../packages/contracts/src/contracts/matching.js";
import { rankingSchema } from "./match.schema.js";
import { buildSystemPrompt } from "../prompts/property-matching/system.js";
import { buildUserPrompt } from "../prompts/property-matching/user.js";
import { MatchError } from "./match.validation.js";
import { MAX_OUTPUT_TOKENS, UPSTREAM_TIMEOUT_MS } from "../http/limits.js";

export const openaiModel = () => process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini";

export async function rankWithOpenAI(input: MatchInput, listings: Property[]): Promise<unknown> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new MatchError("AI_NOT_CONFIGURED", 503);
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: openaiModel(), store: false, max_output_tokens: MAX_OUTPUT_TOKENS,
        instructions: buildSystemPrompt(input),
        input: [{ role: "user", content: buildUserPrompt(input, listings) }],
        text: { format: { type: "json_schema", name: "property_matching", strict: true, schema: rankingSchema } },
      }),
    });
  } catch (error) {
    if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) throw new MatchError("AI_TIMEOUT", 504);
    throw new MatchError("AI_UNAVAILABLE", 503);
  }
  if (!response.ok) throw new MatchError(response.status === 429 ? "RATE_LIMITED" : "AI_UNAVAILABLE", response.status === 429 ? 429 : 503);
  let stage = "openai.envelope_json";
  try {
    const payload = await response.json();
    stage = "openai.incomplete_response";
    if (payload.status !== "completed" || payload.error || payload.incomplete_details || !Array.isArray(payload.output)) throw new Error("Incomplete response");
    // Responses may include reasoning items; accept only one completed assistant message.
    stage = "openai.content";
    const messages = payload.output.filter((item: { type?: string }) => item.type === "message");
    if (messages.length !== 1) throw new Error("Missing or multiple messages");
    const message = messages[0];
    if (message.role !== "assistant" || message.status !== "completed" || !Array.isArray(message.content) || message.content.length !== 1) throw new Error("Invalid message");
    const part = message.content[0];
    if (part.type !== "output_text" || typeof part.text !== "string") throw new Error("Refused or missing text");
    stage = "openai.output_json";
    return JSON.parse(part.text);
  } catch { throw new MatchError("INVALID_AI_RESPONSE", 502, stage); }
}
