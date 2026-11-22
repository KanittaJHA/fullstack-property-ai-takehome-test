"use client";
export async function unlockAdmin(_state: string, data: FormData): Promise<string> {
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: data.get("code") }), signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return typeof body.error === "string" ? body.error : "SERVICE_UNAVAILABLE";
    }
    const destination = data.get("destination");
    window.location.assign(destination === "/knowledge" || destination === "/leads" ? destination : "/admin");
    return "";
  } catch { return "SERVICE_UNAVAILABLE"; }
}
export async function lockAdmin() {
  try {
    const response = await fetch("/api/auth/logout", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("Logout failed");
    // Reload to discard cached authenticated Server Component payloads after logout.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/admin");
  } catch {
    window.alert("Unable to lock workspace. Please try again. / ล็อกพื้นที่ทำงานไม่สำเร็จ กรุณาลองอีกครั้ง");
  }
}
