"use client";
import "./empty-chat.css";
import "./handover-event.css";
import "./thinking-indicator.css";
import "./message-avatar.css";
import "./message-width.css";
import "./status-card.css";
import { ChatMessage } from "./chat-message";
import { DeleteChatDialog } from "./delete-chat-dialog";
import { SalesContextPanel } from "./sales-context-panel";
import { SidebarCards } from "./sidebar-cards";
import { SolarPromo } from "./solar-promo";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useWorkspace } from "@/shell/workspace";
import { Icon } from "@/ui/icon";
import { useReadReceipts } from "@/features/chat/use-read-receipts";
import { useSalesChat } from "./use-sales-chat";
import { conversationTitle, handoverTranslator, chatErrorMessage, conversationLanguage } from "@/features/chat/chat-copy";
import { chatLabels } from "@/features/chat/chat-api";

const HISTORY_PAGE_SIZE = 10;
// Media queries matching CSS breakpoints: the details panel becomes an overlay at 1050px,
// and conversation history becomes a slide-in drawer at 760px.
function mediaQuery(query: string) {
  return {
    subscribe(callback: () => void) {
      const media = window.matchMedia(query);
      media.addEventListener("change", callback);
      return () => media.removeEventListener("change", callback);
    },
    matches: () => window.matchMedia(query).matches,
  };
}
const overlayContextMedia = mediaQuery("(max-width: 1050px)");
const historyDrawerMedia = mediaQuery("(max-width: 760px)");
const infoIcon = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6" /><circle cx="12" cy="7.5" r="0.8" fill="currentColor" stroke="none" /></svg>;
const sidebarIcon = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /></svg>;

export function SalesWorkspace() {
  const { t, locale } = useWorkspace();
  const chat = useSalesChat();
  const { conversation, draft, setDraft, busy, ready, error } = chat;
  useReadReceipts(conversation, false, !chat.landing && !busy);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // On small screens history is a drawer over the chat (closed by default), like common chat apps.
  const historyDrawer = useSyncExternalStore(historyDrawerMedia.subscribe, historyDrawerMedia.matches, () => false);
  // The drawer remembers which chat it was opened over, so choosing another conversation closes it.
  const [drawerOpenFor, setDrawerOpenFor] = useState<string | null>(null);
  const drawerOpen = drawerOpenFor === chat.selected;
  const setDrawerOpen = (open: boolean) => setDrawerOpenFor(open ? chat.selected : null);
  const drawerVisible = historyDrawer && drawerOpen;
  const toggleHistory = () => historyDrawer ? setDrawerOpen(!drawerOpen) : setSidebarOpen(open => !open);
  const historyToggleOpen = historyDrawer ? drawerOpen : sidebarOpen;
  useEffect(() => {
    if (!drawerVisible) return;
    document.querySelector<HTMLButtonElement>("#conversation-sidebar .conversation-sidebar-toggle")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setDrawerOpenFor(null);
      document.querySelector<HTMLButtonElement>(".chat-history-toggle")?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerVisible]);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(HISTORY_PAGE_SIZE);
  const togglePin = (id: string) => {
    const item = chat.items.find(item => item.id === id);
    if (!item) return;
    void chat.setPinned(id, !item.pinned);
    setActionsId("");
    actionsTrigger.current?.focus();
  };
  const historyItems = [...chat.items].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
  const [actionsId, setActionsId] = useState("");
  const [actionsPosition, setActionsPosition] = useState({ top: 0, left: 0 });
  const actionsRef = useRef<HTMLDivElement>(null);
  const actionsTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!actionsId) return;
    actionsRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const dismiss = () => setActionsId("");
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !actionsRef.current?.contains(event.target) && !actionsTrigger.current?.contains(event.target)) dismiss();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { dismiss(); actionsTrigger.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", keydown);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", keydown);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [actionsId]);
  const selectedChat = conversation?.id === chat.selected ? conversation : chat.items.find(item => item.id === chat.selected);
  const hasMessages = Boolean(selectedChat?.messages.length);
  const contextKey = `${chat.selected}:${hasMessages ? "conversation" : "new"}`;
  const [contextPreference, setContextPreference] = useState<{ key: string; open: boolean } | null>(null);
  // Docked beside the chat on wide screens it opens by default; as an overlay it would cover the reply.
  const overlayContext = useSyncExternalStore(overlayContextMedia.subscribe, overlayContextMedia.matches, () => false);
  const contextDefault = hasMessages && !overlayContext;
  const contextVisible = contextPreference?.key === contextKey ? contextPreference.open : contextDefault;
  const setContextVisible = useCallback((value: boolean | ((open: boolean) => boolean)) => {
    setContextPreference(previous => ({
      key: contextKey,
      open: typeof value === "function" ? value(previous?.key === contextKey ? previous.open : contextDefault) : value,
    }));
  }, [contextKey, contextDefault]);
  const [infoHint, setInfoHint] = useState<{ top: number; left: number } | null>(null);
  // Explore on the welcome promo starts a chat, then opens the package panel for that new chat
  // (the panel's open state is remembered per conversation, so it must be set after the switch).
  const openContextAfterStart = useRef(false);
  useEffect(() => {
    if (!openContextAfterStart.current || !chat.selected) return;
    openContextAfterStart.current = false;
    setContextVisible(true);
  }, [chat.selected, setContextVisible]);
  const contextTriggerRef = useRef<HTMLButtonElement>(null);
  const hintHovered = useRef(false);
  const hintLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (hintLeaveTimer.current) clearTimeout(hintLeaveTimer.current); }, []);
  const showInfoHint = () => {
    if (contextVisible) return;
    if (hintLeaveTimer.current) clearTimeout(hintLeaveTimer.current);
    hintHovered.current = true;
    const rect = contextTriggerRef.current?.getBoundingClientRect();
    if (rect) setInfoHint({ top: rect.bottom + 12, left: Math.max(12, Math.min(rect.right - 260, window.innerWidth - 272)) });
  };
  const leaveInfoHint = () => {
    hintHovered.current = false;
    if (hintLeaveTimer.current) clearTimeout(hintLeaveTimer.current);
    hintLeaveTimer.current = setTimeout(() => setInfoHint(null), 180);
  };
  const contextCloseRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!contextVisible) return;
    contextCloseRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextVisible(false);
        contextTriggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [contextVisible, setContextVisible]);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  // Publishes the composer height so the floating language button can sit above it on small screens.
  const composeAreaRef = useCallback((area: HTMLDivElement | null) => {
    if (!area) return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => root.style.setProperty("--chat-compose-height", `${area.getBoundingClientRect().height}px`));
    observer.observe(area);
    return () => { observer.disconnect(); root.style.removeProperty("--chat-compose-height"); };
  }, []);
  useEffect(() => {
    if (conversation && conversation.messages.length === 0 && !busy) composerRef.current?.focus();
  }, [conversation, busy]);
  const resetRef = useRef(chat.select);
  useEffect(() => { resetRef.current = chat.select; });
  useEffect(() => {
    const showWelcome = () => {
      resetRef.current("");
      setContextPreference(null);
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    window.addEventListener("graspia-welcome", showWelcome);
    return () => window.removeEventListener("graspia-welcome", showWelcome);
  }, []);
  const pointerFrame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(pointerFrame.current), []);
  const threadRef = useRef<HTMLDivElement>(null);
  const startAtFirstMessage = useRef(false);
  const handover = conversation?.handover ?? false;
  const closed = conversation?.status === "closed";
  const isWelcome = chat.landing && !chat.selected;
  const messages = conversation?.messages ?? [];
  const handoverText = handoverTranslator(messages, t);
  const messageReceipts = messages.map((message, index) => {
    if (message.role !== "user") return null;
    const following = messages.slice(index + 1);
    const nextReply = following.find((item) => item.role !== "system");
    if (nextReply?.role === "assistant") return { text: t("Read", "อ่านแล้ว"), read: true };
    const readThrough = messages.findIndex(item => item.id === conversation?.adminReadThrough);
    if (index <= readThrough) return { text: t("Read", "อ่านแล้ว"), read: true };
    if (closed) return { text: t("Sent", "ส่งแล้ว"), read: false };
    if (handover) return { text: t("Sent · Awaiting a reply", "ส่งแล้ว · รอเจ้าหน้าที่ตอบกลับ"), read: false };
    return { text: t("Sent", "ส่งแล้ว"), read: false };
  });
  const isEmptyChat = !chat.selected || (!!conversation && messages.length === 0);
  useEffect(() => {
    if (chat.loading || isWelcome || contextVisible) return;
    let hideTimer: ReturnType<typeof setTimeout>;
    // On small screens the tip would cover the first messages, so it appears automatically
    // only once per browser session there (it still shows on hover/focus of the info button).
    const SEEN_KEY = "graspia-info-tip-seen";
    const smallScreen = historyDrawerMedia.matches();
    let seen = false;
    try { seen = smallScreen && sessionStorage.getItem(SEEN_KEY) === "1"; } catch { /* storage unavailable */ }
    if (seen) return;
    const showTimer = setTimeout(() => {
      const trigger = contextTriggerRef.current;
      if (!trigger || !trigger.getClientRects().length) return;
      if (smallScreen) try { sessionStorage.setItem(SEEN_KEY, "1"); } catch { /* storage unavailable */ }
      const rect = trigger.getBoundingClientRect();
      setInfoHint({ top: rect.bottom + 12, left: Math.max(12, Math.min(rect.right - 260, window.innerWidth - 272)) });
      hideTimer = setTimeout(() => { if (!hintHovered.current) setInfoHint(null); }, 8000);
    }, 400);
    const dismiss = () => setInfoHint(null);
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") dismiss(); };
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(showTimer); clearTimeout(hideTimer);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [chat.loading, isWelcome, isEmptyChat, contextVisible]);
  const selectConversation = (id: string) => {
    startAtFirstMessage.current = true;
    setContextPreference(null);
    chat.select(id);
  };
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = startAtFirstMessage.current ? 0 : threadRef.current.scrollHeight;
      startAtFirstMessage.current = false;
    }
  }, [conversation?.messages.length, handover]);
  const send = () => { void chat.send(); };
  // Quick-prompt text follows the language the customer is chatting in, not the interface language.
  const chatText = (en: string, th: string) => conversationLanguage(messages, locale) === "th" ? th : en;
  const packagesPrompt = () => setDraft(chatText("Which solar packages do you offer?", "มีแพ็กเกจโซลาร์อะไรบ้างครับ?"));
  const statusLabel = conversation ? t(...chatLabels[conversation.status]) : t("Sales assistant", "ผู้ช่วยฝ่ายขาย");
  // Business name and conversation status: in the chat heading on wide screens,
  // inside the history drawer on small screens so the heading stays compact.
  const chatIdentity = <>
    <div className="sun-avatar large">
      <Icon name="sun" size={26} />
    </div>
    <div>
      <h2>SunPro Solar</h2>
      <p>
        <span
          className={`status-dot ${handover ? "amber" : ""}`}
          style={{ backgroundColor: handover ? "#c59a57" : "#32b76b" }}
        />
        {statusLabel}
      </p>
    </div>
  </>;
  return (
    <main id="main-content" style={chat.loading ? { visibility: "hidden" } : undefined} className={`sales-workspace ${contextVisible === false && !isEmptyChat ? "context-collapsed" : ""} ${!sidebarOpen && !isWelcome && !historyDrawer ? "sidebar-collapsed" : ""} ${drawerVisible ? "drawer-open" : ""} ${isWelcome ? "is-welcome is-landing" : isEmptyChat ? "is-welcome is-new-chat" : ""}`}>
      {!isWelcome && !sidebarOpen && !historyDrawer && <aside className="conversation-icon-rail" aria-label={t("Chat navigation", "เมนูแชต")}>
        <button type="button" className="conversation-sidebar-toggle" aria-label={t("Open conversations", "เปิดแถบบทสนทนา")} title={t("Open conversations", "เปิดแถบบทสนทนา")} aria-expanded={false} aria-controls="conversation-sidebar" onClick={() => setSidebarOpen(true)}>
          {sidebarIcon}
        </button>
        <button type="button" disabled={busy || !ready} aria-label={t("New conversation", "เริ่มบทสนทนาใหม่")} title={t("New conversation", "เริ่มบทสนทนาใหม่")} onClick={() => { setContextVisible(false); void chat.start(); }}><Icon name="plus" size={20} /></button>
        <button type="button" aria-label={t("History", "ประวัติแชต")} title={t("History", "ประวัติแชต")} onClick={() => setSidebarOpen(true)}><Icon name="chat" size={20} /></button>
      </aside>}
      {drawerVisible && <button type="button" className="conversation-drawer-backdrop" tabIndex={-1} aria-label={t("Close conversations", "ปิดแถบบทสนทนา")} onClick={() => setDrawerOpen(false)} />}
      <aside id="conversation-sidebar" className="conversation-sidebar">
        <div className="sales-brand conversation-brand">
          <span className="graspia-logo">
            <Icon name="chat" size={22} />
          </span>
          <div>
            <div className="conversation-title-row">
              <h1>{t("Conversations", "บทสนทนา")}</h1>
              {!isWelcome && historyToggleOpen && <button type="button" className="conversation-sidebar-toggle" aria-label={historyDrawer ? t("Close conversations", "ปิดแถบบทสนทนา") : t("Collapse conversations", "ยุบแถบบทสนทนา")} title={historyDrawer ? t("Close conversations", "ปิดแถบบทสนทนา") : t("Collapse conversations", "ยุบแถบบทสนทนา")} aria-expanded={historyToggleOpen} aria-controls="conversation-sidebar" onClick={toggleHistory}>
                {sidebarIcon}
              </button>}
            </div>
            <p>{t("Your solar journey starts here", "เริ่มต้นโซลาร์ที่ใช่สำหรับคุณ")}</p>
          </div>
        </div>
        {historyDrawer && !isWelcome && <div className="drawer-chat-identity">{chatIdentity}</div>}
        <button
          className="primary-button full-width"
          disabled={busy || !ready}
          onClick={() => { setContextVisible(false); setDrawerOpenFor(null); void chat.start(); }}
        >
          <Icon name="plus" size={17} />
          {t("New conversation", "เริ่มบทสนทนาใหม่")}
        </button>
        <div className="conversation-label">
          <span>{t("RECENT CHATS", "แชตล่าสุด")}</span>
          <span>{String(chat.items.length).padStart(2, "0")}</span>
        </div>
        <div className="scenario-list">
          {chat.loading && <p role="status">{t("Loading…", "กำลังโหลด…")}</p>}
          {!chat.loading && !chat.items.length && <p>{t("No conversations yet.", "ยังไม่มีบทสนทนา")}</p>}
          <div className="conversation-history">
            {historyItems.slice(0, visibleHistoryCount).map((item) => (
              <div className="conversation-row" key={item.id} onKeyDown={event => {
                if (event.key === "Escape") { setActionsId(""); event.currentTarget.querySelector<HTMLButtonElement>(".conversation-more")?.focus(); }
              }}>
              <button
                className={`conversation-item ${chat.selected === item.id ? "active" : ""}`}
                aria-pressed={chat.selected === item.id}
                disabled={busy}
                onClick={() => selectConversation(item.id)}
              >
                {item.pinned && <span className="conversation-pin" role="img" aria-label={t("Pinned", "ปักหมุดแล้ว")}><Icon name="thumbtack" size={13} /></span>}
                <span className="conversation-item-copy">
                  <strong title={conversationTitle(item, t)}>{conversationTitle(item, t)}</strong>
                </span>
              </button>
              <button className="conversation-more" disabled={busy} aria-label={`${t("Conversation options", "ตัวเลือกบทสนทนา")} ${conversationTitle(item, t)}`} aria-expanded={actionsId === item.id} aria-controls={`conversation-actions-${item.id}`} onClick={event => {
                const rect = event.currentTarget.getBoundingClientRect();
                actionsTrigger.current = event.currentTarget;
                setActionsPosition({ left: Math.max(8, Math.min(rect.right - 160, window.innerWidth - 168)), top: rect.bottom + 96 > window.innerHeight ? Math.max(8, rect.top - 96) : rect.bottom + 6 });
                setActionsId(actionsId === item.id ? "" : item.id);
              }}><span aria-hidden="true">⋯</span></button>
              {actionsId === item.id && createPortal(<div ref={actionsRef} className="conversation-actions conversation-actions-popover" style={actionsPosition} id={`conversation-actions-${item.id}`} onBlur={event => {
                if (!event.currentTarget.contains(event.relatedTarget)) setActionsId("");
              }}>
                <button type="button" className="conversation-pin-action" disabled={busy} onClick={() => togglePin(item.id)}>
                  <Icon name="thumbtack" size={16} />{item.pinned ? t("Unpin", "เลิกปักหมุด") : t("Pin", "ปักหมุด")}
                </button>
                <button type="button" disabled={busy} onClick={() => {
                  setActionsId("");
                  setDeleteTarget({ id: item.id, title: conversationTitle(item, t) });
                }}><Icon name="trash" size={16} />{t("Delete", "ลบ")}</button>
              </div>, document.body)}
              </div>
            ))}
          </div>
          {chat.items.length > HISTORY_PAGE_SIZE && (
            <div className="conversation-history-controls">
              {chat.items.length > visibleHistoryCount && (
                <button
                  type="button"
                  className="conversation-show-more"
                  onClick={() => setVisibleHistoryCount(count => count + HISTORY_PAGE_SIZE)}
                >
                  {t("Show more", "ดูเพิ่ม")}
                </button>
              )}
              {visibleHistoryCount > HISTORY_PAGE_SIZE && (
                <button
                  type="button"
                  className="conversation-show-more"
                  onClick={() => {
                    setVisibleHistoryCount(HISTORY_PAGE_SIZE);
                    setActionsId("");
                  }}
                >
                  {t("Show less", "แสดงน้อยลง")}
                </button>
              )}
            </div>
          )}
        </div>
        <SidebarCards t={t} busy={busy} onExplorePackages={packagesPrompt} />
      </aside>
      <section
        className="chat-panel"
        onPointerMove={(event) => {
          if (!isEmptyChat || event.pointerType !== "mouse" ||
              (event.movementX === 0 && event.movementY === 0) ||
              window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
          const panel = event.currentTarget;
          // Viewport coordinates stay stable when the page scrolls under the cursor.
          const x = (event.clientX / window.innerWidth - 0.5) * 28;
          const y = (event.clientY / window.innerHeight - 0.5) * 22;
          cancelAnimationFrame(pointerFrame.current);
          pointerFrame.current = requestAnimationFrame(() => {
            panel.style.setProperty("--pointer-x", `${x}px`);
            panel.style.setProperty("--pointer-y", `${y}px`);
          });
        }}
        onPointerLeave={(event) => {
          cancelAnimationFrame(pointerFrame.current);
          event.currentTarget.style.setProperty("--pointer-x", "0px");
          event.currentTarget.style.setProperty("--pointer-y", "0px");
        }}
      >
        {isWelcome && <div className="welcome-particles" aria-hidden="true">
          {(["spark", "home", "spark", "chat", "sun", "spark", "home", "spark", "pin", "spark"] as const).map((name, index) => (
            <span key={index} className={`welcome-particle particle-${index + 1}`}><Icon name={name} size={index % 3 === 0 ? 13 : 19} strokeWidth={1.4} /></span>
          ))}
        </div>}
        <header className="chat-heading">
          {historyDrawer && <button type="button" className="icon-button chat-history-toggle" aria-label={t("Open conversations", "เปิดแถบบทสนทนา")} title={t("Open conversations", "เปิดแถบบทสนทนา")} aria-expanded={drawerOpen} aria-controls="conversation-sidebar" onClick={() => setDrawerOpen(true)}>{sidebarIcon}</button>}
          {!historyDrawer && chatIdentity}
          <button
            ref={!isEmptyChat ? contextTriggerRef : undefined}
            onMouseEnter={showInfoHint}
            onMouseLeave={leaveInfoHint}
            onFocus={showInfoHint}
            onBlur={leaveInfoHint}
            className="icon-button context-toggle chat-details-toggle"
            onClick={() => { setInfoHint(null); setContextVisible(!contextVisible); }}
            aria-label={t(
              "Toggle conversation details",
              "เปิดหรือปิดรายละเอียดบทสนทนา",
            )}
            aria-expanded={Boolean(contextVisible)}
          >
            {infoIcon}
          </button>
          <span className="channel-badge">
            <Icon name="chat" size={14} />
            {t("Web chat", "เว็บแชท")}
          </span>
        </header>
        {error && <div className="chat-demo-banner" role="alert" data-error-code={error}>
          <Icon name="shield" size={16} />
          <span>{chatErrorMessage(error, t).text}</span>
          {!ready && <button onClick={() => window.location.reload()}>{t("Reconnect", "เชื่อมต่อใหม่")}</button>}
        </div>}
        {isEmptyChat && <div className="graspia-welcome">
          <span className="welcome-orb"><Icon name="spark" size={36} /></span>
          <p className="welcome-eyebrow">GRASPIA · SUNPRO SOLAR</p>
          <h1>{t("Your ", "")}<span>{t("brighter future", "อนาคตที่สดใสกว่า")}</span>{t(" starts here.", " เริ่มต้นที่นี่")}</h1>
          <p className="welcome-subtitle">{t("Let’s find the right solar solution for your space.", "ค้นหาโซลาร์ที่เหมาะกับพื้นที่และชีวิตของคุณ")}</p>
          {isWelcome && <div className="welcome-actions">
            <button className="primary-button welcome-start" disabled={busy || !ready} onClick={() => { setContextVisible(false); void chat.start(); }}>
              {t("Get started", "เริ่มใช้งาน")}
            </button>
            <button className="welcome-specialist" disabled={busy || !ready} onClick={() => void chat.requestHuman()}>
              {t("Talk to us", "คุยกับทีมงาน")}
            </button>
            {chat.items.length > 0 && <button className="welcome-specialist" disabled={busy || !ready} onClick={() => { selectConversation(chat.items[0].id); }}>
              {t("History", "ประวัติแชต")}
            </button>}
          </div>}
        </div>}
        <div
          className="chat-thread"
          ref={threadRef}
          role="log"
          aria-label={t("Conversation messages", "ข้อความสนทนา")}
          aria-live="polite"
        >
          {messages.map((message, index) => (
            <ChatMessage key={message.id} message={message} receipt={messageReceipts[index]} locale={locale} t={t} handoverText={handoverText} />
          ))}
          {chat.thinking ? (
            <div className="sales-thinking" role="status" aria-label={t("Preparing a response", "กำลังเตรียมคำตอบ")}>
              <Icon name="sun" size={18} />
              <span className="sales-thinking-text">Thinking</span>
              <span className="sales-thinking-dots" aria-hidden="true"><i /><i /><i /></span>
            </div>
          ) : null}
          {chat.selected && !conversation && !busy && <p role="status">{t("Loading conversation…", "กำลังโหลดบทสนทนา…")}</p>}
        </div>
        <div ref={composeAreaRef} className="chat-compose-area">
          {!handover && !isEmptyChat && (
            <div className="quick-prompts">
              <button disabled={busy} onClick={packagesPrompt}>
                {t("Explore packages", "ดูแพ็กเกจ")}
              </button>
              <button disabled={busy} onClick={() => setDraft(chatText("I would like to book a free site survey.", "ต้องการนัดสำรวจหน้างานฟรีครับ"))}>
                {t("Book a survey", "นัดสำรวจพื้นที่")}
              </button>
              <button
                disabled={busy} onClick={() => void chat.requestHuman()}
              >
                {t("Request a human", "ขอคุยกับเจ้าหน้าที่")}
              </button>
            </div>
          )}
          <form
            className={`chat-compose ${closed ? "is-paused" : ""}`}
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            {isEmptyChat ? <>
              <textarea
                ref={composerRef}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                maxLength={2000}
                rows={3}
                disabled={busy || !ready}
                aria-label={t("Your message", "ข้อความของคุณ")}
                placeholder={t("Ask Graspia about solar for your property…", "ถาม Graspia เรื่องโซลาร์สำหรับอาคารของคุณ…")}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <div className="welcome-compose-toolbar">
                <div className="welcome-compose-tools">
                  <button type="button" onClick={() => setDraft(chatText("Which solar package is right for my property?", "แพ็กเกจโซลาร์ไหนเหมาะกับอาคารของฉัน?"))}><Icon name="sun" size={15} />{t("Solar packages", "แพ็กเกจโซลาร์")}</button>
                  <button type="button" onClick={() => setDraft(chatText("I’d like to learn about a free site survey.", "อยากทราบรายละเอียดการสำรวจหน้างานฟรีค่ะ"))}><Icon name="home" size={15} />{t("Site survey", "สำรวจหน้างาน")}</button>
                  <span><Icon name="shield" size={14} />{t("AI assistant", "ผู้ช่วย AI")}</span>
                </div>
                <button className="send-button welcome-send" disabled={busy || !ready || !draft.trim()} aria-label={t("Send message", "ส่งข้อความ")}><Icon name="arrow" size={19} /></button>
              </div>
            </> : <>
            <input
              autoComplete="off"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={closed || busy || !ready}
              maxLength={2000}
              aria-label={t("Your message", "ข้อความของคุณ")}
              placeholder={
                closed
                  ? t("Conversation closed", "ปิดบทสนทนาแล้ว")
                  : handover ? t("Leave a message for the sales team…", "ฝากข้อความให้ทีมฝ่ายขาย…")
                  : t(
                      "Ask about solar…",
                      "พิมพ์คำถามเกี่ยวกับโซลาร์…",
                    )
              }
            />
            <button
              className="send-button"
              disabled={closed || busy || !ready || !draft.trim()}
              aria-label={t("Send message", "ส่งข้อความ")}
            >
              <Icon name="send" size={19} />
            </button>
            </>}
          </form>
          {isEmptyChat && <div className="welcome-suggestions">
            <button disabled={busy} onClick={packagesPrompt}><Icon name="sun" size={20} /><strong>{t("Find my solar fit", "เลือกโซลาร์ที่เหมาะกับฉัน")}</strong><span>{t("Explore packages for your home or business", "สำรวจแพ็กเกจสำหรับบ้านหรือธุรกิจ")}</span><Icon name="arrow" size={15} /></button>
            <button disabled={busy} onClick={() => setDraft(chatText("Which areas do you serve?", "ให้บริการในพื้นที่ไหนบ้างครับ?"))}><Icon name="pin" size={20} /><strong>{t("Check my area", "เช็กพื้นที่ให้บริการ")}</strong><span>{t("See where SunPro can help", "ดูพื้นที่ที่ SunPro ดูแล")}</span><Icon name="arrow" size={15} /></button>
            <button disabled={busy} onClick={() => setDraft(chatText("How does the free site survey work?", "การสำรวจหน้างานฟรีมีขั้นตอนอย่างไรครับ?"))}><Icon name="home" size={20} /><strong>{t("Plan a fresh start", "วางแผนเริ่มต้นใหม่")}</strong><span>{t("Learn about a free site survey", "สอบถามการสำรวจหน้างานฟรี")}</span><Icon name="arrow" size={15} /></button>
          </div>}
          <p className="compose-note">
            <Icon name="shield" size={12} />
            {t(
              "Messages are saved for our sales team and processed by AI while the assistant is active. Do not share passwords or payment details.",
              "ข้อความถูกเก็บให้ทีมฝ่ายขายและประมวลผลด้วย AI ขณะผู้ช่วยทำงาน กรุณาไม่ส่งรหัสผ่านหรือข้อมูลชำระเงิน",
            )}
          </p>
        </div>
        {isEmptyChat && !contextVisible && (
          <SolarPromo onExplore={() => {
            // The package panel is hidden on the welcome screen, so start a chat first (like "Get started").
            if (isWelcome) { openContextAfterStart.current = true; void chat.start(); }
            else setContextVisible(true);
          }} />
        )}
      </section>
      {isWelcome && (
        <div className="new-chat-top-actions">
          <span className="chat-model-label">Graspia 5.6 Sunpro</span>
        </div>
      )}
      {!isWelcome && isEmptyChat && (
        <div className="new-chat-top-actions">
          {historyDrawer && <button type="button" className="icon-button chat-history-toggle" aria-label={t("Open conversations", "เปิดแถบบทสนทนา")} title={t("Open conversations", "เปิดแถบบทสนทนา")} aria-expanded={drawerOpen} aria-controls="conversation-sidebar" onClick={() => setDrawerOpen(true)}>{sidebarIcon}</button>}
          <span className="chat-model-label">Graspia 5.6 Sunpro</span>
        <button
          ref={contextTriggerRef}
          onMouseEnter={showInfoHint}
          onMouseLeave={leaveInfoHint}
          onFocus={showInfoHint}
          onBlur={leaveInfoHint}
          type="button"
          className="new-chat-context-toggle"
          aria-label={t("Open information panel", "เปิดแถบข้อมูล")}
          title={t("Business information and packages", "ข้อมูลธุรกิจและแพ็กเกจ")}
          aria-controls="sales-context-panel"
          aria-expanded={Boolean(contextVisible)}
          onClick={() => { setInfoHint(null); setContextVisible(open => !open); }}
        >
          {infoIcon}
        </button>
        </div>
      )}
      {infoHint && !isWelcome && !contextVisible && createPortal(
        <div className="chat-info-hint" style={infoHint} onMouseEnter={showInfoHint} onMouseLeave={leaveInfoHint}>
          <div role="status">
            <strong>{t("Your guide to SunPro", "ข้อมูลที่ช่วยคุณตัดสินใจ")}</strong>
            <p>{t("Tap", "กด")} <svg className="hint-info-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" role="img" aria-label={t("information", "ข้อมูล")}><circle cx="12" cy="12" r="9" /><path d="M12 11v6" /><circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" /></svg> {t("to explore solar packages, service details, and ways to reach our team.", "เพื่อดูแพ็กเกจโซลาร์ รายละเอียดบริการ และช่องทางติดต่อทีมงาน")}</p>
          </div>
          <button type="button" aria-label={t("Dismiss tip", "ปิดคำแนะนำ")} onClick={() => setInfoHint(null)}><Icon name="close" size={14} /></button>
        </div>, document.body
      )}
      <SalesContextPanel
        t={t}
        open={contextVisible}
        isEmptyChat={isEmptyChat}
        status={conversation?.status}
        handover={handover}
        closed={closed}
        requestDisabled={handover || closed || busy || !ready}
        closeRef={contextCloseRef}
        onClose={() => { setContextVisible(false); contextTriggerRef.current?.focus(); }}
        onRequestHuman={() => void chat.requestHuman()}
      />
      {deleteTarget && <DeleteChatDialog title={deleteTarget.title} onDelete={() => chat.remove(deleteTarget.id)} onClose={() => {
        setDeleteTarget(null);
        requestAnimationFrame(() => {
          if (actionsTrigger.current?.isConnected) actionsTrigger.current.focus();
          else document.querySelector<HTMLButtonElement>("#conversation-sidebar > button")?.focus();
        });
      }} />}
    </main>
  );
}
