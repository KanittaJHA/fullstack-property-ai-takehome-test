"use client";
import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/shell/workspace";
import "./delete-chat-dialog.css";

export function DeleteChatDialog({ title, onDelete, onClose }: {
  title: string; onDelete: () => Promise<boolean>; onClose: () => void;
}) {
  const { t } = useWorkspace();
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    cancel.current?.focus();
    return () => element.close();
  }, []);
  const close = () => { if (!pending.current) onClose(); };
  async function remove() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setFailed(false);
    try {
      if (await onDelete()) onClose(); else setFailed(true);
    } catch { setFailed(true); }
    finally { pending.current = false; setBusy(false); }
  }
  return <dialog ref={dialog} className="delete-chat-dialog" aria-labelledby="delete-chat-title" aria-describedby="delete-chat-description"
    onCancel={event => { event.preventDefault(); close(); }}>
    <button type="button" className="delete-chat-close" onClick={close} disabled={busy} aria-label={t("Close confirmation", "ปิดหน้าต่างยืนยัน")}>×</button>
    <h2 id="delete-chat-title">{t("Delete chat?", "ลบแชทนี้ไหม?")}</h2>
    <p id="delete-chat-description">{t("Permanently delete", "ลบ")} <strong>{title}</strong>{t(" from your history and the sales inbox. This cannot be undone.", " ออกจากประวัติและกล่องข้อความฝ่ายขายอย่างถาวร ไม่สามารถกู้คืนได้")}</p>
    {failed && <p role="alert">{t("Unable to delete. Please try again.", "ลบไม่สำเร็จ กรุณาลองอีกครั้ง")}</p>}
    <div className="delete-chat-actions">
      <button ref={cancel} type="button" onClick={close} disabled={busy}>{t("Cancel", "ยกเลิก")}</button>
      <button type="button" className="delete-chat-delete" disabled={busy} onClick={() => void remove()}>{busy ? t("Deleting…", "กำลังลบ…") : t("Delete chat", "ลบแชท")}</button>
    </div>
  </dialog>;
}
