import { createClient } from "@supabase/supabase-js";
import type { LeadNotification, LeadSummary } from "../../../packages/contracts/src/contracts/leads.js";

export interface SubmissionRow {
  id: string;
  message: string;
  budget: number | string | null;
  area: string | null;
  is_repeat: boolean;
  classification: LeadSummary["classification"];
  classification_source: LeadSummary["classificationSource"];
  classification_reason: string | null;
  classification_reason_th: string | null;
  created_at: string;
  leads: { name: string; phone: string | null; email: string | null; submission_count: number } | null;
  lead_notifications: { kind: LeadNotification["kind"]; status: LeadNotification["status"]; channel: string; attempts: number; detail: Record<string, unknown> | null }[];
}

/** Newest lead submissions for the sales team. Requires the service role; never call from a browser. */
export async function listLeads(limit = 100): Promise<LeadSummary[]> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Lead database configuration is missing");
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
  const { data, error } = await supabase.from("lead_submissions")
    .select("id,message,budget,area,is_repeat,classification,classification_source,classification_reason,classification_reason_th,created_at,leads(name,phone,email,submission_count),lead_notifications(kind,status,channel,attempts,detail)")
    .order("created_at", { ascending: false })
    .limit(limit)
    .abortSignal(AbortSignal.timeout(10000))
    .returns<SubmissionRow[]>();
  if (error || !data) throw new Error("Leads are unavailable");
  return data.map(toLeadSummary);
}

/** One database row (a submission with its customer and notifications) as the lead card the sales team sees. */
export function toLeadSummary(row: SubmissionRow): LeadSummary {
  return {
    id: row.id,
    name: row.leads?.name ?? "",
    phone: row.leads?.phone ?? null,
    email: row.leads?.email ?? null,
    message: row.message,
    budget: row.budget === null ? null : Number(row.budget),
    area: row.area,
    isRepeat: row.is_repeat,
    submissionCount: row.leads?.submission_count ?? 1,
    classification: row.classification,
    classificationSource: row.classification_source,
    classificationReason: row.classification_reason,
    classificationReasonTh: row.classification_reason_th ?? null,
    createdAt: row.created_at,
    notifications: (row.lead_notifications ?? []).map(n => ({
      kind: n.kind, status: n.status, channel: n.channel, attempts: n.attempts,
      text: typeof n.detail?.alert === "string" ? n.detail.alert : typeof n.detail?.text === "string" ? n.detail.text : null,
      to: typeof n.detail?.to === "string" ? n.detail.to : null,
      error: typeof n.detail?.error === "string" ? n.detail.error : null,
    })),
  };
}
