"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useWorkspace } from "@/shell/workspace";
import { Icon } from "@/ui/icon";

/**
 * Text cut to a fixed number of lines (set in CSS) so every lead card has the same height.
 * When the text does not fit, a "Read more" button appears; it calls `onMore`.
 */
export function ClampedText({ as: Tag = "p", className, children, onMore }: {
  as?: "p" | "blockquote"; className: string; children: ReactNode; onMore: () => void;
}) {
  const { t } = useWorkspace();
  const ref = useRef<HTMLElement>(null);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    // Re-check whenever the card is resized (window width, language switch, new text).
    const observer = new ResizeObserver(() => setOverflows(element.scrollHeight > element.clientHeight + 1));
    observer.observe(element);
    return () => observer.disconnect();
  }, [children]);
  return <div className="lead-clamp">
    <Tag ref={ref as never} className={`${className} clamped`}>{children}</Tag>
    {overflows && <button type="button" className="lead-more" onClick={onMore}>{t("Read more", "อ่านต่อ")}</button>}
  </div>;
}

/** A modal window with the lead's full message, reason and auto-reply. Closes with Esc, the close button or a click outside. */
export function LeadDialog({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useWorkspace();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} className="lead-dialog" aria-label={title} onClose={onClose}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="lead-dialog-body">
      <button type="button" className="lead-dialog-close" aria-label={t("Close", "ปิด")} onClick={onClose}><Icon name="close" size={16} /></button>
      {children}
    </div>
  </dialog>;
}
