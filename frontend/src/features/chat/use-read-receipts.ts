"use client";
import { useEffect, useRef } from "react";
import type { Conversation } from "@contracts/contracts/chat";
import { chatRequest } from "./chat-api";

/** Acknowledge incoming messages only while they are visible in the active tab. */
export function useReadReceipts(conversation: Conversation | null, admin: boolean, enabled = true) {
  const acknowledged = useRef(new Map<string, string>());
  useEffect(() => {
    if (!conversation || !enabled) return;
    const c = conversation;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending = false;
    let stopped = false;
    const visible = new Set<string>();
    const cursor = admin ? c.adminReadThrough : c.customerReadThrough;
    const key = `${admin}:${c.id}`;
    async function acknowledge() {
      if (pending || stopped || document.visibilityState !== "visible" || !document.hasFocus()) return;
      const latest = c.messages.findLast(m => visible.has(m.id));
      const previous = acknowledged.current.get(key) || cursor;
      if (!latest || c.messages.findIndex(m => m.id === latest.id) <= c.messages.findIndex(m => m.id === previous)) return;
      pending = true;
      try {
        await chatRequest(`/${admin ? "admin/" : ""}conversations/${c.id}/read`, {
          messageId: latest.id, requestId: crypto.randomUUID(),
        });
        acknowledged.current.set(key, latest.id);
      } catch { /* Retry on the next refresh; never invent a successful read. */ }
      finally { pending = false; }
    }
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(() => { void acknowledge(); }, 250);
    }
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.readId!;
        if (entry.isIntersecting) visible.add(id); else visible.delete(id);
      }
      schedule();
    }, { threshold: 0.5 });
    document.querySelectorAll<HTMLElement>("[data-read-id]").forEach(node => {
      if (c.messages.some(m => m.id === node.dataset.readId)) observer.observe(node);
    });
    document.addEventListener("visibilitychange", schedule);
    window.addEventListener("focus", schedule);
    return () => {
      stopped = true; clearTimeout(timer); observer.disconnect();
      document.removeEventListener("visibilitychange", schedule);
      window.removeEventListener("focus", schedule);
    };
  }, [conversation, admin, enabled]);
}
