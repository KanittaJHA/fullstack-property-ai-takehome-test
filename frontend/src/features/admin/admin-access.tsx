"use client";
import { useActionState, useState } from "react";
import { unlockAdmin } from "@/api/auth";
import { useWorkspace } from "@/shell/workspace";
import { Icon } from "@/ui/icon";
import "./access-code.css";

type Destination = "/admin" | "/knowledge" | "/leads";

/** Access-code screen shared by the team pages; after sign-in it returns to `destination`. */
export function AdminAccess({ destination = "/admin" }: { destination?: Destination }) {
  const { t } = useWorkspace();
  const [error, action, pending] = useActionState(unlockAdmin, "");
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const toggleLabel = showCode ? t("Hide code", "ซ่อนรหัส") : t("Show code", "แสดงรหัส");
  const eyebrow = destination === "/leads"
    ? "WHAT THE PROPERTY · LEADS"
    : `GRASPIA · ${destination === "/knowledge" ? "KNOWLEDGE BASE" : "ADMIN"}`;
  const intro = destination === "/leads"
    ? t("Use your team access code to review incoming property leads.", "ใช้รหัสเดียวกับ Admin เพื่อดูลีดที่เข้ามาใหม่")
    : destination === "/knowledge"
      ? t("Use your team access code to explore the business knowledge.", "ใช้รหัสเดียวกับ Admin เพื่อเข้าฐานความรู้ของทีม")
      : t("Your workspace for thoughtful follow-ups and human handovers.", "พื้นที่สำหรับติดตามลูกค้าและรับช่วงดูแลจากผู้ช่วย");

  return (
    <main id="main-content" className="admin-access">
      <form action={action} className="admin-access-card">
        <input type="hidden" name="destination" value={destination} />
        <span className="admin-symbol"><Icon name="shield" size={28} /></span>
        <p className="admin-eyebrow">{eyebrow}</p>
        <h1>{t("A little behind the scenes.", "เบื้องหลังการดูแลลูกค้า")}</h1>
        <p>{intro}</p>
        <label htmlFor="admin-code">{t("8-character access code", "รหัสเข้าใช้งาน 8 ตัว")}</label>
        <div className="admin-code-field">
          <input
            id="admin-code"
            name="code"
            value={code}
            onChange={event => setCode(event.target.value)}
            type={showCode ? "text" : "password"}
            minLength={8}
            maxLength={8}
            required
            autoComplete="current-password"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="••••••••"
            aria-describedby={error ? "access-error" : undefined}
          />
          <button
            type="button"
            className="admin-code-toggle"
            aria-controls="admin-code"
            aria-pressed={showCode}
            aria-label={toggleLabel}
            title={toggleLabel}
            onClick={() => setShowCode(shown => !shown)}
          >
            <Icon name={showCode ? "eye-off" : "eye"} size={20} />
          </button>
        </div>
        {error && (
          <p id="access-error" role="alert">
            {["ADMIN_NOT_CONFIGURED", "RATE_LIMITED", "SERVICE_UNAVAILABLE"].includes(error)
              ? t("Admin service is unavailable or busy. Please try again shortly.", "ระบบเข้าสู่ระบบยังไม่พร้อมหรือมีคำขอมาก กรุณาลองอีกครั้ง")
              : t("That code doesn’t match. Please try again.", "รหัสไม่ถูกต้อง กรุณาลองอีกครั้ง")}
          </p>
        )}
        <button className="primary-button" disabled={pending}>
          {pending ? t("Checking…", "กำลังตรวจสอบ…") : t("Enter workspace", "เข้าสู่พื้นที่ทำงาน")}
          <Icon name="arrow" size={16} />
        </button>
        <small>{t("Private sales workspace", "พื้นที่ส่วนตัวของทีมฝ่ายขาย")}</small>
      </form>
    </main>
  );
}
