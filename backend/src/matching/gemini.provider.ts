import type { Property } from "../../../packages/contracts/src/domain/property.js";
import type { MatchInput } from "../../../packages/contracts/src/contracts/matching.js";
import { rankingSchema } from "./match.schema.js";
import { buildSystemPrompt } from "../prompts/property-matching/system.js";
import { buildUserPrompt } from "../prompts/property-matching/user.js";
import { MatchError } from "./match.validation.js";
import { MAX_OUTPUT_TOKENS, UPSTREAM_TIMEOUT_MS } from "../http/limits.js";

export const geminiModel = () => process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";

export async function rankWithGemini(input: MatchInput, listings: Property[]): Promise<unknown> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new MatchError("AI_NOT_CONFIGURED", 503);
  let response: Response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel())}:generateContent`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: buildSystemPrompt(input) }] },
        contents: [{ role: "user", parts: [{ text: buildUserPrompt(input, listings) }] }],
        generationConfig: { responseMimeType: "application/json", responseJsonSchema: rankingSchema, maxOutputTokens: MAX_OUTPUT_TOKENS },
      }),
    });
  } catch (error) {
    if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) throw new MatchError("AI_TIMEOUT", 504);
    throw new MatchError("AI_UNAVAILABLE", 503);
  }
  if (!response.ok) throw new MatchError(response.status === 429 ? "RATE_LIMITED" : "AI_UNAVAILABLE", response.status === 429 ? 429 : 503);
  let stage = "gemini.envelope_json";
  try {
    const payload = await response.json();
    stage = "gemini.blocked_or_candidate_count";
    if (payload.promptFeedback?.blockReason || payload.candidates?.length !== 1) throw new Error("Blocked or missing result");
    const candidate = payload.candidates[0];
    stage = candidate?.finishReason === "MAX_TOKENS" ? "gemini.token_limit" : "gemini.incomplete_response";
    if (candidate.finishReason !== "STOP" || !Array.isArray(candidate.content?.parts)) throw new Error("Incomplete response");
    stage = "gemini.content_parts";
    const parts = candidate.content.parts.filter((part: { thought?: boolean }) => !part.thought);
    if (!parts.length || parts.some((part: { text?: unknown }) => typeof part.text !== "string")) throw new Error("Invalid content");
    stage = "gemini.output_json";
    return JSON.parse(parts.map((part: { text: string }) => part.text).join(""));
  } catch { throw new MatchError("INVALID_AI_RESPONSE", 502, stage); }
}
