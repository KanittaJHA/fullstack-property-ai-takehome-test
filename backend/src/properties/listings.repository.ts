import { createClient } from "@supabase/supabase-js";
import type { Property } from "../../../packages/contracts/src/domain/property.js";

export type ListingFilters = { city?: string; maxPrice?: number; bedrooms?: number };

export async function getListings(filters: ListingFilters = {}): Promise<Property[]> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing");

  // Use public read permissions; no privileged key or shared user session.
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  let query = supabase.from("listings").select(
    "id,title,city,area,price,bedrooms,bathrooms,size_sqm,type,near_transit,furnished,image,description",
  ).order("id");
  // Case-insensitive exact city match ("bangkok" finds "Bangkok"); LIKE wildcards are escaped.
  if (filters.city !== undefined) query = query.ilike("city", filters.city.replace(/[\\%_]/g, "\\$&"));
  if (filters.maxPrice !== undefined) query = query.lte("price", filters.maxPrice);
  if (filters.bedrooms !== undefined) query = query.eq("bedrooms", filters.bedrooms);
  const { data, error } = await query.abortSignal(AbortSignal.timeout(10000));
  if (error) throw new Error("Unable to read listings from Supabase");
  return data as Property[];
}
