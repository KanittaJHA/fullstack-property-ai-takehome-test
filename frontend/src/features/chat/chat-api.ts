import type { Conversation } from "@contracts/contracts/chat";

export async function chatRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/chat${path}`, {
    method: body === undefined ? "GET" : "POST", cache: "no-store", credentials: "same-origin",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(55000),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(typeof payload.error === "string" ? payload.error : "CHAT_UNAVAILABLE");
  }
  return response.json() as Promise<T>;
}
export const chatLabels: Record<Conversation["status"], [string, string]> = {
  bot_active: ["AI assistant", "ผู้ช่วย AI"], awaiting_human: ["Waiting for sales team", "รอทีมฝ่ายขาย"],
  human_active: ["Sales specialist", "เจ้าหน้าที่ดูแล"], closed: ["Closed", "ปิดแล้ว"],
};
