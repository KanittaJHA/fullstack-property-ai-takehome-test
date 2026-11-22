"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/shell/workspace";

export function KnowledgeLoadError() {
  const { t } = useWorkspace();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <main id="main-content" style={{ padding: "32px 24px" }}>
      <div className="empty-state property-load-state" role="alert">
        <p>{t("Unable to load the business knowledge. Please try again.", "โหลดฐานความรู้ธุรกิจไม่สำเร็จ กรุณาลองอีกครั้ง")}</p>
        <button className="text-button" disabled={pending}
          onClick={() => startTransition(() => router.refresh())}>
          {pending ? t("Loading…", "กำลังโหลด…") : t("Try again", "ลองอีกครั้ง")}
        </button>
      </div>
    </main>
  );
}
