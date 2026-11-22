"use client";
import { useEffect, useRef, useState } from "react";
import type { Conversation } from "@contracts/contracts/chat";
import { useWorkspace } from "@/shell/workspace";
import { chatRequest } from "@/features/chat/chat-api";
import { conversationLanguage } from "@/features/chat/chat-copy";
import { previousPath } from "@/shell/navigation-history";

const SELECTION_KEY = "graspia-conversation-id";
const VIEW_KEY = "graspia-view";
/** The "Thinking" indicator stays at least this long, so quick answers do not flash past. */
const MIN_THINKING_MS = 8_000;
const POLL_MS = 4000;

export function useSalesChat() {
  const { locale } = useWorkspace();
  const [landing, setLanding] = useState(false);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState("");
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const sending = useRef(false);
  const generation = useRef(0);
  const pending = useRef<{ key: string; id: string } | null>(null);

  function select(id: string) {
    if (sending.current) return;
    generation.current++;
    setLanding(!id);
    try { localStorage.setItem(VIEW_KEY, id ? "chat" : "welcome"); } catch { /* Optional view preference. */ }
    setSelected(id); setConversation(null); setDraft(""); setError(""); pending.current = null;
    try { if (id) localStorage.setItem(SELECTION_KEY, id); else localStorage.removeItem(SELECTION_KEY); }
    catch { /* The server retains history even if browser storage is unavailable. */ }
  }

  useEffect(() => {
    let cancelled = false;
    chatRequest("/session", {}).then(async () => {
      const list = await chatRequest<{ conversations: Conversation[] }>("/conversations");
      if (cancelled) return;
      setItems(list.conversations); setReady(true); setLoading(false);
      try {
        const id = localStorage.getItem(SELECTION_KEY);
        // Arriving from another page by an in-app link shows the welcome screen;
        // opening or reloading /graspia directly restores the last open chat.
        // ?view=chat (the admin "Open customer chat" button) goes straight to the chat instead.
        const query = new URLSearchParams(window.location.search);
        const openChat = query.get("view") === "chat";
        if (openChat) { localStorage.setItem(VIEW_KEY, "chat"); window.history.replaceState(null, "", window.location.pathname); }
        const fromAnotherPage = !openChat && (previousPath() ?? "/graspia") !== "/graspia";
        const welcome = fromAnotherPage || localStorage.getItem(VIEW_KEY) === "welcome";
        // Remember it, so reloading the welcome screen stays on the welcome screen.
        if (fromAnotherPage) localStorage.setItem(VIEW_KEY, "welcome");
        setLanding(welcome);
        if (!welcome && list.conversations.some(c => c.id === id)) setSelected(id!);
      } catch { /* History is still available in the sidebar. */ }
    }).catch(() => { if (!cancelled) { setError("CONNECT_FAILED"); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    let running = false;
    async function refresh() {
      if (running || sending.current) return;
      running = true;
      const version = generation.current;
      try {
        const list = await chatRequest<{ conversations: Conversation[] }>("/conversations");
        const detail = selected ? await chatRequest<Conversation>(`/conversations/${selected}`) : null;
        if (cancelled || sending.current || version !== generation.current) return;
        setItems(list.conversations);
        if (detail) setConversation(previous => previous?.id === detail.id && previous.updatedAt > detail.updatedAt ? previous : detail);
      } catch { if (!cancelled && version === generation.current) setError("LOAD_FAILED"); }
      finally { running = false; }
    }
    void refresh();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [ready, selected]);

  function accept(c: Conversation) {
    setLanding(false);
    try { localStorage.setItem(VIEW_KEY, "chat"); } catch { /* Optional view preference. */ }
    setConversation(c); setSelected(c.id);
    setItems(old => [c, ...old.filter(item => item.id !== c.id)]);
    try { localStorage.setItem(SELECTION_KEY, c.id); } catch { /* Optional reload selection. */ }
  }

  async function run(action: "start" | "messages" | "handover", value = draft) {
    if (!ready || sending.current || (action === "messages" && !value.trim())) return;
    sending.current = true; setBusy(true); setError(""); generation.current++;
    const original = conversation;
    try {
      let current = conversation;
      let id = selected;
      if (!id || action === "start") {
        const c = await chatRequest<Conversation>("/conversations", {});
        accept(c); current = c; id = c.id;
      }
      if (action === "start") { setDraft(""); pending.current = null; }
      if (action !== "start") {
        const message = action === "messages" ? value.trim() : undefined;
        const key = JSON.stringify([id, action, message]);
        if (pending.current?.key !== key) pending.current = { key, id: crypto.randomUUID() };
        const animateReply = action === "messages" && current?.status === "bot_active";
        const startedAt = Date.now();
        if (current && message) {
          setThinking(animateReply);
          setDraft("");
          setConversation({ ...current, messages: [...current.messages, {
            id: pending.current.id, role: "user", content: message,
            createdAt: new Date().toISOString(),
          }] });
        }
        // A handover request is written in the customer's chat language, not the interface language.
        const language = conversationLanguage(current?.messages ?? [], locale);
        const result = await chatRequest<Conversation>(`/conversations/${id}/${action}`, { message, locale: language, requestId: pending.current.id });
        if (animateReply) {
          const remaining = MIN_THINKING_MS - (Date.now() - startedAt);
          if (remaining > 0) await new Promise<void>(resolve => setTimeout(resolve, remaining));
        }
        accept(result);
        pending.current = null; setDraft("");
      }
    } catch (e) {
      if (action === "messages") { setConversation(original); setDraft(value); }
      setError(e instanceof Error ? e.message : "CHAT_UNAVAILABLE");
    }
    finally { sending.current = false; setThinking(false); setBusy(false); }
  }

  async function setPinned(id: string, pinned: boolean) {
    if (!ready || sending.current) return;
    sending.current = true; setBusy(true); setError(""); generation.current++;
    try {
      const updated = await chatRequest<Conversation>(`/conversations/${id}/pin`, { pinned, requestId: crypto.randomUUID() });
      generation.current++;
      setItems(old => old.map(item => item.id === id ? { ...item, pinned: updated.pinned } : item));
      setConversation(current => current?.id === id ? { ...current, pinned: updated.pinned } : current);
    } catch (e) { setError(e instanceof Error ? e.message : "PIN_FAILED"); }
    finally { sending.current = false; setBusy(false); }
  }

  async function remove(id: string) {
    if (!id || sending.current) return false;
    sending.current = true; setBusy(true); setError(""); generation.current++;
    try {
      try { await chatRequest(`/conversations/${id}/delete`, { requestId: crypto.randomUUID() }); }
      catch (e) { if (!(e instanceof Error) || e.message !== "NOT_FOUND") throw e; }
      generation.current++;
      const deletingEmpty = items.some(item => item.id === id && isEmpty(item));
      setItems(old => old.filter(item => item.id !== id && !(deletingEmpty && isEmpty(item))));
      if (id === selected || (deletingEmpty && items.some(item => item.id === selected && isEmpty(item)))) {
        setSelected(""); setConversation(null); setDraft(""); pending.current = null;
        try { localStorage.removeItem(SELECTION_KEY); } catch { /* Optional selection cache. */ }
      }
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "DELETE_FAILED"); return false; }
    finally { sending.current = false; setBusy(false); }
  }

  // Only one empty chat (the one open, or the newest) is listed in the history.
  const isEmpty = (item: Conversation) => item.status === "bot_active" && item.messages.length === 0;
  const emptyChat = items.find(item => item.id === selected && isEmpty(item)) ?? items.find(isEmpty);
  const historyItems = items.filter(item => !isEmpty(item) || item.id === emptyChat?.id);

  return { landing, remove, setPinned, ready, loading, items: historyItems, selected, conversation, draft, setDraft, error, busy, thinking, select,
    start: () => run("start"), send: () => run("messages"), requestHuman: () => run("handover") };
}
