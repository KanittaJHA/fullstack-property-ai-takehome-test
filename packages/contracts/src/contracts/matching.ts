import type { Property } from "../domain/property.js";

export type MatchInput = { request: string; locale: "en" | "th" };
export type MatchResult = {
  matches: { property: Property; reason: string; alternative?: boolean }[];
  summary: string;
  clarification: string | null;
  cached: boolean;
  cacheStatus?: "hit" | "miss" | "coalesced" | "bypass";
};

