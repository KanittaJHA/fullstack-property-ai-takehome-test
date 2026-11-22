import "server-only";
import { cookies } from "next/headers";
import type { BusinessProfile } from "@contracts/domain/business-profile";
// HTTP transport only. Session validation and database queries run in backend.
async function backendGet(path: string) {
  return fetch(`${process.env.BACKEND_URL || "http://127.0.0.1:4000"}${path}`, {
    headers: { cookie: (await cookies()).toString() }, cache: "no-store", signal: AbortSignal.timeout(12000),
  });
}
export async function hasAdminSession() {
  try {
    const response = await backendGet("/auth/session");
    return response.ok && (await response.json()).authenticated === true;
  } catch { return false; }
}
export async function getBusinessProfile(): Promise<BusinessProfile> {
  const response = await backendGet("/business-profile");
  if (!response.ok) throw new Error("Business knowledge unavailable");
  return response.json();
}
