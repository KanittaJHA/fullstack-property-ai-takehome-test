"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Conversation } from "@contracts/contracts/chat";
import { chatRequest } from "@/features/chat/chat-api";

const PREFIX = "/admin/conversations";
const POLL_MS = 4000;
type AdminAction = "takeover" | "close" | "reply";

/** The admin inbox: polls the conversation list and the open conversation, and sends staff actions. */
export function useAdminChat() {
  const [ready, setReady] = useState(false);
  // Bumped by the Refresh button to reload the inbox now instead of waiting for the next poll.
  const [refreshTick, setRefreshTick] = useState(0);
  const [items, setItems] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState("");
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const pending = useRef<{ key: string; id: string } | null>(null);
  const sending = useRef(false);

  useEffect(() => {
    let cancelled = false;
    chatRequest(PREFIX).then(() => { if (!cancelled) { setReady(true); setError(""); } })
      .catch(() => { if (!cancelled) { setError("CONNECT_FAILED"); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    let running = false;
    async function refresh() {
      if (running) return;
      running = true;
      try {
        const list = await chatRequest<{ conversations: Conversation[] }>(PREFIX);
        if (selected && !list.conversations.some(c => c.id === selected)) {
          if (!cancelled) {
            setItems(list.conversations); setSelected(list.conversations[0]?.id || "");
            setConversation(null); setDraft(""); setLoading(false);
          }
          return;
        }
        const detail = selected ? await chatRequest<Conversation>(`${PREFIX}/${selected}`) : null;
        if (cancelled) return;
        setItems(list.conversations);
        if (detail) setConversation(previous => previous?.id === detail.id && previous.updatedAt > detail.updatedAt ? previous : detail);
        else if (list.conversations.length) setSelected(list.conversations[0].id);
        setLoading(false);
      } catch {
        if (!cancelled) { setError("LOAD_FAILED"); setLoading(false); }
      } finally { running = false; }
    }
    void refresh();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [ready, selected, refreshTick]);

  async function act(action: AdminAction) {
    if (!selected || sending.current) return;
    sending.current = true;
    const message = action === "reply" ? draft.trim() : undefined;
    if (message === "") { sending.current = false; return; }
    const key = JSON.stringify([selected, action, message]);
    if (pending.current?.key !== key) pending.current = { key, id: crypto.randomUUID() };
    setBusy(true); setError("");
    try {
      const c = await chatRequest<Conversation>(`${PREFIX}/${selected}/${action}`, { message, requestId: pending.current.id });
      setConversation(c); setItems(old => old.map(item => item.id === c.id ? c : item));
      if (message !== undefined) setDraft("");
      pending.current = null;
    } catch (e) { setError(e instanceof Error ? e.message : "SEND_FAILED"); }
    finally { sending.current = false; setBusy(false); }
  }

  async function pin(id: string, pinned: boolean) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true); setError("");
    try {
      const c = await chatRequest<Conversation>(`${PREFIX}/${id}/pin`, { pinned, requestId: crypto.randomUUID() });
      setItems(old => old.map(item => item.id === c.id ? c : item));
      setConversation(old => old?.id === c.id ? c : old);
    } catch (e) { setError(e instanceof Error ? e.message : "SEND_FAILED"); }
    finally { sending.current = false; setBusy(false); }
  }

  function select(id: string) {
    if (sending.current) return;
    setSelected(id); setConversation(null); setDraft(""); setError(""); pending.current = null;
  }
  const refresh = useCallback(() => setRefreshTick(n => n + 1), []);
  return { items, selected, conversation, draft, setDraft, busy, error, loading, select, act, pin, refresh };
}
