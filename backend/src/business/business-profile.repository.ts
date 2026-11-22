import { createClient } from "@supabase/supabase-js";
import type { BusinessProfile } from "../../../packages/contracts/src/domain/business-profile.js";
import { isBusinessProfile } from "./business-profile.validation.js";

// Server-controlled tenant for this single-business demo. Never accept a client-supplied ID.
export const DEMO_BUSINESS_ID = "sunpro-solar";

export async function getBusinessProfile(): Promise<BusinessProfile> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Business database configuration is missing");
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
  const { data, error } = await supabase.from("business_profiles")
    .select("profile").eq("id", DEMO_BUSINESS_ID)
    .abortSignal(AbortSignal.timeout(10000)).single();
  if (error || !data || !isBusinessProfile(data.profile)) {
    throw new Error("Business profile is missing, invalid, or unavailable");
  }
  return data.profile;
}
