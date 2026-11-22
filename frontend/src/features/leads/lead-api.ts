import type { LeadRequest, LeadResponse, LeadSummary } from "@contracts/contracts/leads";

/** Submit the public contact form. Never throws: network and server failures become "unavailable". */
export async function submitLead(lead: LeadRequest): Promise<LeadResponse> {
  try {
    const response = await fetch("/api/leads", {
      method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lead), signal: AbortSignal.timeout(55000),
    });
    const body = await response.json().catch(() => null);
    if (body && typeof body.status === "string") return body as LeadResponse;
  } catch { /* fall through */ }
  return { ok: false, status: "unavailable" };
}

/** Stored leads for the signed-in team. Throws "UNAUTHORIZED" or "LEADS_UNAVAILABLE". */
export async function fetchLeads(): Promise<LeadSummary[]> {
  const response = await fetch("/api/leads", { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(20000) });
  if (response.status === 401) throw new Error("UNAUTHORIZED");
  if (!response.ok) throw new Error("LEADS_UNAVAILABLE");
  const body = await response.json();
  return Array.isArray(body.leads) ? body.leads : [];
}
