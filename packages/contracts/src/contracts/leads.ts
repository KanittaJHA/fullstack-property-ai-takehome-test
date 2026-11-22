// Task 3: property leads. The n8n workflow owns validation, scoring and notifications;
// the backend only forwards form submissions and reads stored leads for the team.
export type LeadClassification = "hot" | "warm" | "cold";

/** Fields sent by the public contact form. `website` is a hidden honeypot field. */
export interface LeadRequest {
  name: string;
  phone?: string;
  email?: string;
  message: string;
  budget?: string;
  area?: string;
  website?: string;
}

export type LeadResponseStatus = "received" | "already_received" | "rejected" | "rate_limited" | "unavailable";

export interface LeadResponse {
  ok: boolean;
  status: LeadResponseStatus;
  /** Auto-reply text shown to the customer when the lead is accepted. */
  message?: string;
  /** Machine-readable rejection reasons, e.g. "phone_invalid", "spam_links". */
  reasons?: string[];
}

export interface LeadNotification {
  kind: "team_alert" | "auto_reply";
  status: "sent" | "failed" | "skipped";
  /** e.g. "sms (simulated)", "email (simulated)" or "team log (simulated)". */
  channel: string;
  attempts: number;
  text: string | null;
  /** Where it went: the team inbox, or the lead's email or phone. */
  to: string | null;
  /** Why it was not sent, when status is "failed". */
  error: string | null;
}

/** One stored form submission, with the person it belongs to. */
export interface LeadSummary {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  message: string;
  budget: number | null;
  area: string | null;
  isRepeat: boolean;
  submissionCount: number;
  classification: LeadClassification | null;
  classificationSource: "ai" | "rules" | null;
  classificationReason: string | null;
  /** Thai version of the reason; null for older leads, which only have English. */
  classificationReasonTh: string | null;
  createdAt: string;
  notifications: LeadNotification[];
}
