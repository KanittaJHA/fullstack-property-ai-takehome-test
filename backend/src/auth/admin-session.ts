import { createHmac, timingSafeEqual } from "node:crypto";
import { readCookie, secureFlag } from "../http/cookies.js";
export const adminCookie = "workspace-demo-session";
const SESSION_SECONDS = 8 * 60 * 60;
export function configured() {
  return process.env.ADMIN_ACCESS_CODE?.length === 8 && (process.env.ADMIN_SESSION_SECRET?.length ?? 0) >= 32;
}
export function sign(value: string) {
  return createHmac("sha256", process.env.ADMIN_SESSION_SECRET!).update(value).digest("hex");
}
export function equal(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function hasAdminSession(request: Request) {
  if (!configured()) return false;
  const token = readCookie(request, adminCookie);
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2 || !/^\d+$/.test(parts[0]) || !/^[0-9a-f]{64}$/.test(parts[1])) return false;
  return Number(parts[0]) > Date.now() && equal(parts[1], sign(parts[0]));
}
export function sessionCookie(clear = false) {
  const expires = String(Date.now() + SESSION_SECONDS * 1000);
  const value = clear ? "" : `${expires}.${sign(expires)}`;
  return `${adminCookie}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : SESSION_SECONDS}${secureFlag()}`;
}
