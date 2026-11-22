/** Largest request body the API accepts, in bytes. */
export const MAX_BODY_BYTES = 8192;
/** How long a call to an AI provider or the n8n webhook may take. */
export const UPSTREAM_TIMEOUT_MS = 45_000;
/** Output ceiling for AI calls. Thinking models count their reasoning toward it, so it is set well above the JSON answer size. */
export const MAX_OUTPUT_TOKENS = 16_000;
