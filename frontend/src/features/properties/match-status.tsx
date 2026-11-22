"use client";

import "./match-status.css";
import { useWorkspace } from "@/shell/workspace";

export function MatchStatus({ alternative }: { alternative: boolean | undefined }) {
  const { t } = useWorkspace();
  if (alternative === undefined) return null;
  return (
    <span className={`property-match-badge ${alternative ? "property-match-alternative" : "property-match-recommended"}`}>
      {alternative
        ? t("Alternative · unmet criteria", "ตัวเลือกใกล้เคียง · มีข้อไม่ตรง")
        : t("Recommended", "รายการแนะนำ")}
    </span>
  );
}
