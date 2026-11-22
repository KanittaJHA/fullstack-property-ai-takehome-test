import { rankWithOpenAI, openaiModel } from "./openai.provider.js";
import { rankWithClaude, claudeModel } from "./claude.provider.js";
import { rankWithGemini, geminiModel } from "./gemini.provider.js";
import { MATCH_PROMPT_VERSION } from "../prompts/property-matching/system.js";
import { MatchError } from "./match.validation.js";

/** Explicit selection never falls back to another provider or spends its credits. */
export function selectedProvider() {
  const provider = process.env.AI_PROVIDER?.trim() || (process.env.GEMINI_API_KEY?.trim() ? "gemini" : "anthropic");
  if (provider === "openai") return { key: process.env.OPENAI_API_KEY, rank: rankWithOpenAI, version: `openai:${openaiModel()}:${MATCH_PROMPT_VERSION}` };
  if (provider === "gemini") return { key: process.env.GEMINI_API_KEY, rank: rankWithGemini, version: `gemini:${geminiModel()}:${MATCH_PROMPT_VERSION}` };
  if (provider === "anthropic") return { key: process.env.ANTHROPIC_API_KEY, rank: rankWithClaude, version: `anthropic:${claudeModel()}:${MATCH_PROMPT_VERSION}` };
  throw new MatchError("AI_NOT_CONFIGURED", 503);
}
