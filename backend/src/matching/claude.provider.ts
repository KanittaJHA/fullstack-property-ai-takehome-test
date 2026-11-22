import type { Property } from "../../../packages/contracts/src/domain/property.js";
import type { MatchInput } from "../../../packages/contracts/src/contracts/matching.js";
import { MatchError } from "./match.validation.js";
import { rankingSchema } from "./match.schema.js";
import { buildSystemPrompt } from "../prompts/property-matching/system.js";
import { buildUserPrompt } from "../prompts/property-matching/user.js";
import { MAX_OUTPUT_TOKENS, UPSTREAM_TIMEOUT_MS } from "../http/limits.js";

export const claudeModel = () => process.env.ANTHROPIC_MODEL?.trim() || "claude-haiku-4-5";

export async function rankWithClaude(input: MatchInput, listings: Property[]): Promise<unknown> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new MatchError("AI_NOT_CONFIGURED", 503);
  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: claudeModel(), max_tokens: MAX_OUTPUT_TOKENS,
        system: buildSystemPrompt(input),
        messages: [{ role: "user", content: buildUserPrompt(input, listings) }],
        output_config: { format: { type: "json_schema", schema: rankingSchema } },
      }),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new MatchError("AI_TIMEOUT", 504);
    throw new MatchError("AI_UNAVAILABLE", 503);
  }
  if (!response.ok) throw new MatchError(response.status === 429 ? "RATE_LIMITED" : "AI_UNAVAILABLE", response.status === 429 ? 429 : 503);
  let stage = "claude.envelope_json";
  try {
    const payload = await response.json();
    stage = "claude.incomplete_response";
    if (payload.stop_reason !== "end_turn" || !Array.isArray(payload.content)) throw new Error("Incomplete response");
    stage = "claude.content";
    const blocks = payload.content.filter((block: { type?: string }) => block.type === "text");
    if (blocks.length !== 1 || typeof blocks[0].text !== "string") throw new Error("Invalid content");
    stage = "claude.output_json";
    return JSON.parse(blocks[0].text);
  } catch { throw new MatchError("INVALID_AI_RESPONSE", 502, stage); }
}
