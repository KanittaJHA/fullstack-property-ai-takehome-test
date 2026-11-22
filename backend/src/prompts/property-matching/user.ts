import type { MatchInput } from "../../../../packages/contracts/src/contracts/matching.js";
import type { Property } from "../../../../packages/contracts/src/domain/property.js";

/** Serialize untrusted buyer/catalog data separately from system instructions. */
export function buildUserPrompt(input: MatchInput, listings: Property[]): string {
  return JSON.stringify({ buyer_request: input.request, catalog: listings });
}
