import { jsonResponse } from "../http/json-response.js";
import { getListings, type ListingFilters } from "./listings.repository.js";

export async function handleListings(request: Request) {
  const params = new URL(request.url).searchParams;
  const filters: ListingFilters = {};
  if (params.has("city")) {
    const city = params.get("city")!.trim();
    if (!city || city.length > 100) {
      return jsonResponse({ error: "INVALID_CITY" }, 400);
    }
    filters.city = city;
  }
  for (const name of ["maxPrice", "bedrooms"] as const) {
    if (!params.has(name)) continue;
    const raw = params.get(name)!;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value)) {
      return jsonResponse({ error: "INVALID_FILTER", field: name }, 400);
    }
    filters[name] = value;
  }
  try {
    return jsonResponse(await getListings(filters));
  } catch {
    return jsonResponse({ error: "LISTINGS_UNAVAILABLE" }, 503);
  }
}
