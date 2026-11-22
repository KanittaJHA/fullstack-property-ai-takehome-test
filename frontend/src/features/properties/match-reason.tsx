"use client";
import "./match-reason.css";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/ui/icon";
import { useWorkspace } from "@/shell/workspace";

export function MatchReason({ text, propertyTitle, variant = "card" }: {
  text: string;
  propertyTitle: string;
  variant?: "card" | "detail";
}) {
  const { t } = useWorkspace();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    if (!element) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <div className={variant === "card" ? "card-reason match-reason" : "detail-insight match-reason"}>
      <Icon name="spark" size={variant === "card" ? 14 : 20} />
      <div className="match-reason-content">
        {variant === "detail" && <h3>{t("Why this property matches", "ทำไมอสังหาฯ นี้จึงตรงกับคุณ")}</h3>}
        <div className="match-reason-body">
          <p className="match-reason-preview">{text}</p>
          <div className="match-reason-action"><button type="button" className="text-button" aria-haspopup="dialog" onClick={() => setOpen(true)}>
            {t("Read more", "อ่านทั้งหมด")} <span aria-hidden="true">↗</span>
          </button></div>
        </div>
      </div>
      <dialog ref={dialog} className="match-reason-dialog" aria-labelledby={titleId}
        onCancel={(event) => { event.preventDefault(); event.stopPropagation(); setOpen(false); }}
        onClose={(event) => { event.stopPropagation(); setOpen(false); }}
        onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
        <div className="match-reason-dialog-content">
          <header>
            <h2 id={titleId}>{t("Why this property matches", "ทำไมอสังหาฯ นี้จึงตรงกับคุณ")}</h2>
            <button type="button" className="icon-button" aria-label={t("Close explanation", "ปิดเหตุผลการจับคู่")} onClick={() => setOpen(false)}>×</button>
          </header>
          <h3>{propertyTitle}</h3>
          <p>{text}</p>
        </div>
      </dialog>
    </div>
  );
}
