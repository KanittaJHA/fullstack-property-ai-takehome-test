"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { HandoverReason } from "@contracts/contracts/chat";
import { lockAdmin } from "@/api/auth";
import {
  CLOSED_NOTICE,
  TAKEOVER_NOTICE,
  chatErrorMessage,
  conversationTitle,
  formatMessageTime,
  handoverNoticeCopy,
  handoverTranslator,
  isHandoverNotice,
  messageLabel,
} from "@/features/chat/chat-copy";
import { useReadReceipts } from "@/features/chat/use-read-receipts";
import { useAdminChat } from "./use-admin-chat";
import { CollapsibleBrief } from "./collapsible-brief";
import "./handover-brief.css";
import "./queue-item.css";
import "./status-event.css";
import "./message-alignment.css";
import "./access-code.css";
import "./status-dot.css";
import "./stat-card.css";
import { localizeHandoverSummary } from "./handover-summary-copy";
import profile from "@/demo/business-profile";
import { useWorkspace } from "@/shell/workspace";
import { Icon } from "@/ui/icon";

// Same value as HANDOVER_CONFIDENCE_THRESHOLD in backend/src/chat/chat.service.ts.
const HANDOVER_CONFIDENCE_THRESHOLD = 0.65;

const handoverTitles: Record<HandoverReason, [string, string]> = {
  ready_to_buy: ["Customer ready to proceed", "ลูกค้าพร้อมดำเนินการต่อ"],
  human_requested: ["Customer requested a person", "ลูกค้าขอคุยกับเจ้าหน้าที่"],
  angry_customer: ["Customer needs help with a concern", "ลูกค้าไม่พอใจและต้องการการดูแล"],
  unknown_answer: ["Information needs checking", "ต้องตรวจสอบข้อมูลเพิ่มเติม"],
  uncertain: ["Answer needs confirmation", "ต้องยืนยันคำตอบกับเจ้าหน้าที่"],
  conversation_loop: ["Conversation needs follow-up", "บทสนทนาต้องการความช่วยเหลือเพิ่มเติม"],
  service_unavailable: ["AI assistant unavailable", "ผู้ช่วย AI ไม่พร้อมใช้งาน"],
};

// What the team should know or do, written for staff (not the customer-facing wording).
const handoverNotes: Record<HandoverReason, [string, string]> = {
  ready_to_buy: ["The customer wants to move forward. Confirm the details and arrange the next step.", "ลูกค้าต้องการดำเนินการต่อ ตรวจสอบรายละเอียดแล้วนัดขั้นตอนถัดไป"],
  human_requested: ["The customer asked to speak with the team.", "ลูกค้าขอคุยกับเจ้าหน้าที่"],
  angry_customer: ["The customer is upset. Respond with care and address the concern.", "ลูกค้าไม่พอใจ ควรตอบอย่างใส่ใจและแก้ไขข้อกังวล"],
  unknown_answer: ["The answer is not in the business profile. Check before replying.", "คำตอบไม่มีในข้อมูลธุรกิจ ตรวจสอบข้อมูลก่อนตอบลูกค้า"],
  uncertain: ["The assistant could not give a reliable answer: the request is still unclear, or the answer needs checking. Confirm the details with the customer.", "ผู้ช่วยยังให้คำตอบที่แน่ชัดไม่ได้ เพราะคำขอยังไม่ชัดเจนหรือคำตอบต้องตรวจสอบ ยืนยันรายละเอียดกับลูกค้า"],
  conversation_loop: ["The conversation was going in circles. Help the customer move forward.", "บทสนทนาวนซ้ำ ช่วยให้ลูกค้าไปต่อได้"],
  service_unavailable: ["The AI assistant was unavailable. Reply to the customer directly.", "ผู้ช่วย AI ไม่พร้อมใช้งาน ตอบลูกค้าโดยตรง"],
};

type Status = "waiting" | "active" | "resolved" | "assistant";
const STATUSES: Status[] = ["waiting", "active", "resolved", "assistant"];

// Matches the CSS breakpoint where the inbox becomes a slide-in drawer, like the customer chat history.
const INBOX_DRAWER_QUERY = "(max-width: 760px)";
const subscribeInboxDrawer = (callback: () => void) => {
  const media = window.matchMedia(INBOX_DRAWER_QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
};
const sidebarIcon = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /></svg>;

export function AdminWorkspace() {
  const { t, locale } = useWorkspace();
  const chat = useAdminChat();
  const { selected, draft, setDraft, busy, error, loading } = chat;
  const conversations = chat.items;
  const item = chat.conversation;
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const messages = bottom.current?.parentElement;
    if (messages) messages.scrollTop = messages.scrollHeight;
  }, [item?.messages.length]);

  const [filter, setFilter] = useState<Status | "all">("all");
  const inboxDrawer = useSyncExternalStore(subscribeInboxDrawer, () => window.matchMedia(INBOX_DRAWER_QUERY).matches, () => false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // On small screens the status cards start collapsed behind an "Overview" button to bring the inbox and chat closer.
  // Visibility is decided in CSS by breakpoint, so the cards never flash on load.
  const [statsOpen, setStatsOpen] = useState(false);
  const drawerVisible = inboxDrawer && drawerOpen;
  useEffect(() => {
    if (!drawerVisible) return;
    document.querySelector<HTMLButtonElement>(".admin-drawer-close")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setDrawerOpen(false);
      document.querySelector<HTMLButtonElement>(".admin-inbox-toggle")?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerVisible]);

  const statusOf = (id: string): Status => {
    const status = conversations.find(c => c.id === id)?.status;
    return status === "awaiting_human" ? "waiting" : status === "human_active" ? "active" : status === "closed" ? "resolved" : "assistant";
  };
  const labels = {
    waiting: t("Needs attention", "รอเจ้าหน้าที่"),
    active: t("In your care", "กำลังดูแล"),
    resolved: t("Resolved", "ปิดแล้ว"),
    assistant: t("Assistant active", "ผู้ช่วยดูแล"),
  };
  const statDetails = {
    waiting: { icon: "clock", description: t("Ready for a human to step in", "รอเจ้าหน้าที่รับช่วงดูแล") },
    active: { icon: "user", description: t("Conversations you’re taking care of", "บทสนทนาที่คุณกำลังดูแล") },
    resolved: { icon: "check", description: t("Follow-ups completed with care", "ดูแลเรียบร้อยและปิดบทสนทนาแล้ว") },
    assistant: { icon: "spark", description: t("Your assistant is handling these", "ผู้ช่วยกำลังตอบและดูแลลูกค้า") },
  } as const;
  // Status cards in the transcript use the customer's language, exactly as the customer sees them.
  const conversationText = handoverTranslator(item?.messages ?? [], t);
  useReadReceipts(item, true);
  const status = statusOf(selected);
  const visible = conversations.filter(c => filter === "all" || statusOf(c.id) === filter);
  const selectStat = (key: Status) => {
    const next = filter === key ? "all" : key;
    setFilter(next);
    if (inboxDrawer && next !== "all") setDrawerOpen(true);
  };

  return <main id="main-content" className="admin-workspace">
    <div className="admin-page-heading">
      <div>
        <p className="admin-eyebrow">GRASPIA · TEAM WORKSPACE</p>
        <h1>{t("Every conversation, cared for.", "ดูแลทุกบทสนทนาอย่างใส่ใจ")}</h1>
        <p>{t("Review the context. Take over when it matters.", "อ่านบริบทให้ครบ แล้วรับช่วงต่อในจังหวะที่เหมาะสม")}</p>
      </div>
      <div className="workspace-heading-actions">
        <button type="button" className="admin-inbox-toggle" aria-label={t("Open inbox", "เปิดกล่องข้อความ")} title={t("Open inbox", "เปิดกล่องข้อความ")} aria-expanded={drawerOpen} aria-controls="admin-inbox-drawer" onClick={() => setDrawerOpen(true)}>{sidebarIcon}</button>
        <button type="button" className="admin-secondary admin-compact-action" onClick={chat.refresh} aria-label={t("Refresh", "รีเฟรช")}>
          <Icon name="clock" size={16} /><span>{t("Refresh", "รีเฟรช")}</span>
        </button>
        <Link href="/graspia?view=chat" className="admin-secondary admin-compact-action admin-chat-link" aria-label={t("Open customer chat", "เปิดแชทฝั่งลูกค้า")}>
          <Icon name="chat" size={16} /><span>{t("Open customer chat", "เปิดแชทฝั่งลูกค้า")}</span>
        </Link>
        <form action={lockAdmin}>
          <button className="admin-secondary admin-lock-action" aria-label={t("Lock workspace", "ล็อกพื้นที่ทำงาน")} title={t("Lock workspace", "ล็อกพื้นที่ทำงาน")}>
            <Icon name="shield" size={16} /><span>{t("Lock workspace", "ล็อกพื้นที่ทำงาน")}</span>
          </button>
        </form>
        <button type="button" className={`admin-secondary admin-stats-toggle ${statsOpen ? "open" : ""}`} aria-expanded={statsOpen} aria-controls="admin-stats" onClick={() => setStatsOpen(open => !open)}>
          <Icon name="grid" size={16} />{t("Overview", "ภาพรวม")}<Icon name="chevron" size={14} />
        </button>
      </div>
    </div>
    {error && <div className="admin-demo-note" role="alert" data-error-code={error}>{chatErrorMessage(error, t).text}</div>}
    <div id="admin-stats" className={`admin-stats ${statsOpen ? "open" : ""}`}>
      {STATUSES.map(key => (
        <button key={key} className={`admin-stat ${key} ${filter === key ? "selected" : ""}`} onClick={() => selectStat(key)} aria-pressed={filter === key}>
          <span className="admin-stat-heading">
            <span className={`admin-status ${key}`}>{labels[key]}</span>
            <span className="admin-stat-icon" aria-hidden="true"><Icon name={statDetails[key].icon} size={21} /></span>
          </span>
          <span className="admin-stat-value"><strong>{conversations.filter(c => statusOf(c.id) === key).length}</strong><small>{t("conversations", "บทสนทนา")}</small></span>
          <span className="admin-stat-description">{statDetails[key].description}<Icon name="arrow" size={14} /></span>
        </button>
      ))}
    </div>
    <div className={`admin-inbox ${drawerVisible ? "drawer-open" : ""}`}>
      {drawerVisible && <button type="button" className="admin-drawer-backdrop" tabIndex={-1} aria-label={t("Close inbox", "ปิดกล่องข้อความ")} onClick={() => setDrawerOpen(false)} />}
      <aside id="admin-inbox-drawer" className="admin-queue" aria-hidden={inboxDrawer && !drawerOpen ? true : undefined}>
        <div className="admin-queue-heading">
          <h2>
            {inboxDrawer && <button type="button" className="admin-drawer-close" aria-label={t("Close inbox", "ปิดกล่องข้อความ")} title={t("Close inbox", "ปิดกล่องข้อความ")} onClick={() => setDrawerOpen(false)}>{sidebarIcon}</button>}
            {t("Inbox", "กล่องข้อความ")}
          </h2>
          <button onClick={() => setFilter("all")}>{t("Show all", "ดูทั้งหมด")}{loading ? "" : ` · ${conversations.length}`}</button>
        </div>
        <div className="admin-queue-list" tabIndex={0} role="region" aria-label={t("Conversations", "รายการบทสนทนา")}>
          {visible.length === 0 && (loading
            ? <p className="admin-empty admin-loading" role="status">{t("Loading conversations…", "กำลังโหลดรายการแชต…")}</p>
            : <p className="admin-empty">{t("All clear. No conversations here.", "ยังไม่มีบทสนทนาในหมวดนี้")}</p>)}
          {STATUSES.filter(key => filter === "all" || filter === key).map(key => {
            const group = visible.filter(c => statusOf(c.id) === key).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
            if (!group.length) return null;
            // By default only groups that need a person are expanded; resolved and assistant-handled start collapsed.
            return <details className={`admin-chat-group conversation-group ${key}`} key={`${filter}-${key}`} open={filter === key || key === "waiting" || key === "active"}>
              <summary className="conversation-group-heading">
                <span className="conversation-group-dot" aria-hidden="true" />{labels[key]}<span className="conversation-group-count">{group.length}</span><Icon name="chevron" size={13} />
              </summary>
              <div className="admin-chat-group-items" tabIndex={0} role="region" aria-label={labels[key]}>
                {group.map(c => <div className="admin-queue-row" key={c.id}>
                  <button className={`admin-queue-item ${selected === c.id ? "selected" : ""}`} disabled={busy} onClick={() => { chat.select(c.id); setDrawerOpen(false); }} aria-pressed={selected === c.id}>
                    <span className="conversation-item-copy">
                      <strong>{conversationTitle(c, t)}</strong>
                      <small><span title={t("Conversation ID", "รหัสบทสนทนา")}>#{c.id.slice(0, 8)}</span> · {labels[statusOf(c.id)]}</small>
                    </span>
                  </button>
                  <button
                    className="admin-pin-button"
                    disabled={busy}
                    aria-pressed={!!c.pinned}
                    aria-label={c.pinned ? t("Unpin conversation", "เลิกปักหมุดบทสนทนา") : t("Pin conversation", "ปักหมุดบทสนทนา")}
                    title={c.pinned ? t("Unpin", "เลิกปักหมุด") : t("Pin", "ปักหมุด")}
                    onClick={() => void chat.pin(c.id, !c.pinned)}
                  ><Icon name="thumbtack" size={15} /></button>
                </div>)}
              </div>
            </details>;
          })}
        </div>
        <section className="admin-account" aria-label={t("Sales team account", "บัญชีทีมฝ่ายขาย")}>
          <span className="admin-eyebrow">{t("YOUR WORKSPACE", "พื้นที่ของคุณ")}</span>
          <div className="admin-account-identity">
            <span className="admin-account-avatar" aria-hidden="true">N</span>
            <div><h3>{profile.human_team.sales_contact}</h3><p>{t("Sales specialist", "เจ้าหน้าที่ฝ่ายขาย")}</p></div>
          </div>
          <div className="admin-account-session"><span aria-hidden="true" />{t("Admin session active", "เซสชันแอดมินพร้อมใช้งาน")}</div>
          <p className="admin-account-description">{t("A human touch, right when it matters. Your conversations are one click away.", "พร้อมรับช่วงต่อในเวลาที่ลูกค้าต้องการ ดูบทสนทนาที่คุณรับผิดชอบได้ที่นี่")}</p>
          <button className="admin-account-link" onClick={() => setFilter("active")}>
            <span><Icon name="user" size={15} />{t("In your care", "แชตที่คุณดูแล")}</span>
            <span>{conversations.filter(c => statusOf(c.id) === "active").length}<Icon name="arrow" size={14} /></span>
          </button>
        </section>
        <section className="admin-queue-guide">
          <span className="soft-icon"><Icon name="spark" size={23} /></span>
          <h3>{t("A little context. A better conversation.", "เข้าใจบริบท ดูแลได้ตรงใจ")}</h3>
          <p>{t("Open a status group to explore your inbox. Review the handover brief, then take over when you’re ready.", "เปิดหมวดสถานะเพื่อดูรายการแชต อ่านสรุปการส่งต่อ แล้วรับช่วงดูแลเมื่อพร้อม")}</p>
          <div><Icon name="chat" size={15} /><span>{t("Review customer conversation history", "ตรวจสอบประวัติการสนทนาของลูกค้า")}</span></div>
          <small>{t("Replies are sent to the customer’s chat.", "ข้อความตอบจะปรากฏในแชตของลูกค้า")}</small>
        </section>
      </aside>
      <section className="admin-conversation" aria-label={t("Selected conversation", "บทสนทนาที่เลือก")}>
        {!item ? (
          <p className="admin-empty admin-conversation-empty" role="status">
            {selected || loading ? t("Loading conversation…", "กำลังโหลดบทสนทนา…") : t("Select a conversation from the inbox.", "เลือกบทสนทนาจากกล่องข้อความ")}
          </p>
        ) : <>
          <header>
            <div className="admin-conversation-title">
              <span className={`admin-status ${status}`}>{labels[status]}</span>
              <h2 title={t("Conversation ID", "รหัสบทสนทนา")}>{t("Customer", "ลูกค้า")} · {item.id.slice(0, 8)}</h2>
            </div>
            <Icon name="chat" size={23} />
          </header>
          <CollapsibleBrief key={item.id} label={t("HANDOVER BRIEF", "สรุปสำหรับเจ้าหน้าที่")}>
            <h3>{item.handover
              ? (item.reason ? t(...handoverTitles[item.reason]) : t("Sales team follow-up", "ส่งต่อให้ทีมฝ่ายขายดูแล"))
              : t("The assistant is handling this conversation.", "ผู้ช่วยกำลังดูแลบทสนทนานี้")}</h3>
            <p>{item.reason ? t(...handoverNotes[item.reason]) : t("No handover requested. Review the messages below.", "ยังไม่มีคำขอส่งต่อ อ่านประวัติข้อความด้านล่างได้")}</p>
            {item.confidence !== null && <p className={`admin-confidence ${item.confidence < HANDOVER_CONFIDENCE_THRESHOLD ? "low" : "ok"}`} title={t("The assistant’s own score for its latest answer. Below the threshold, the conversation is handed to the team.", "คะแนนที่ผู้ช่วยประเมินคำตอบล่าสุดของตัวเอง หากต่ำกว่าเกณฑ์ จะส่งต่อให้ทีมดูแล")}>
              <span>{t("AI confidence (latest answer)", "ความมั่นใจของ AI (คำตอบล่าสุด)")}</span>
              <strong>{item.confidence.toFixed(2)}</strong>
              <small>{item.confidence < HANDOVER_CONFIDENCE_THRESHOLD
                ? t(`below the ${HANDOVER_CONFIDENCE_THRESHOLD} threshold${item.handover ? " → handed over" : ""}`, `ต่ำกว่าเกณฑ์ ${HANDOVER_CONFIDENCE_THRESHOLD}${item.handover ? " → ส่งต่อให้ทีม" : ""}`)
                : item.handover
                  ? t("handover was for the reason above, not low confidence", "ส่งต่อด้วยเหตุผลด้านบน ไม่ใช่เพราะความมั่นใจต่ำ")
                  : t(`above the ${HANDOVER_CONFIDENCE_THRESHOLD} threshold`, `สูงกว่าเกณฑ์ ${HANDOVER_CONFIDENCE_THRESHOLD}`)}</small>
            </p>}
            {item.handover && <div className="admin-customer-context">
              <strong>{t("Latest summary", "สรุปล่าสุด")}</strong>
              <p className="admin-handover-brief">{(item.summary ? localizeHandoverSummary(item.summary, t) : "") || t("No saved summary. Review the full conversation below.", "ไม่มีสรุปที่บันทึกไว้ กรุณาอ่านประวัติการสนทนาด้านล่าง")}</p>
              <small>{t("Updated with each customer message. The full conversation is below.", "อัปเดตทุกครั้งที่ลูกค้าส่งข้อความ อ่านประวัติทั้งหมดได้ด้านล่าง")}</small>
            </div>}
            <div className="admin-actions">
              {status === "waiting" && <button className="primary-button" disabled={busy} onClick={() => void chat.act("takeover")}><Icon name="user" size={16} />{t("Take over", "รับช่วงดูแล")}</button>}
              {(status === "active" || status === "resolved") && (
                <span className={`admin-secondary ${status === "resolved" ? "admin-support-completed" : "admin-support-active"}`} role="status">
                  {status === "resolved" ? t("Human support completed", "เจ้าหน้าที่ดูแลเรียบร้อยแล้ว") : t("Human support active", "เจ้าหน้าที่กำลังดูแล")}
                </span>
              )}
              {status === "resolved" && <span className="admin-secondary admin-support-active" role="status">{t("Resolved", "ปิดบทสนทนาแล้ว")}</span>}
              {(status === "waiting" || status === "active") && <button className="admin-secondary" disabled={busy} onClick={() => void chat.act("close")} aria-label={t("Close conversation", "ปิดบทสนทนา")}>{t("Mark resolved", "ปิดบทสนทนา")}</button>}
            </div>
          </CollapsibleBrief>
          <div className="admin-messages" role="log" aria-label={t("Messages", "ข้อความ")} aria-live="polite">
            {item.messages.map((m, index) => {
              const time = formatMessageTime(m.createdAt, locale);
              if (isHandoverNotice(m)) return <div className="admin-status-event waiting admin-handover-event" key={m.id}>
                <Icon name="clock" size={18} />
                <div>
                  <h3>{conversationText(...handoverNoticeCopy.title)}</h3>
                  <p>{conversationText(...handoverNoticeCopy.body)}</p>
                  <time className="admin-message-meta" dateTime={m.createdAt}>{time}</time>
                </div>
              </div>;
              if (m.role === "system") {
                const closed = m.content === CLOSED_NOTICE;
                const takenOver = m.content === TAKEOVER_NOTICE;
                // The closed notice is interface text; other notices follow the customer's language.
                const translate = closed ? t : conversationText;
                return <div className={`admin-status-event ${closed ? "resolved" : takenOver ? "active" : "neutral"}`} key={m.id}>
                  <Icon name={closed ? "check" : takenOver ? "user" : "clock"} size={16} />
                  <div>
                    <span className="admin-status-event-label">{translate("Status", "สถานะ")}</span>
                    <p>{messageLabel(m, translate)}</p>
                    <time className="admin-message-meta" dateTime={m.createdAt}>{time}</time>
                  </div>
                </div>;
              }
              const outgoing = m.role === "human" || m.role === "assistant";
              const read = outgoing && index <= item.messages.findIndex(message => message.id === item.customerReadThrough);
              return <div className={`admin-message ${m.role}`} key={m.id} data-read-id={m.role === "user" ? m.id : undefined}>
                {m.role === "user" && <span className="admin-customer-avatar" aria-hidden="true"><Icon name="user" size={15} /></span>}
                <small>{m.role === "user" ? t("Customer", "ลูกค้า") : m.role === "human" ? t("Sales specialist", "เจ้าหน้าที่ฝ่ายขาย") : "SunPro Assistant"}</small>
                <p>{messageLabel(m, t)}</p>
                <div className="admin-message-meta">
                  {outgoing && <span><span aria-hidden="true">{read ? "✓✓ " : "✓ "}</span>{read ? t("Read", "อ่านแล้ว") : t("Sent", "ส่งแล้ว")}</span>}
                  <time dateTime={m.createdAt}>{time}</time>
                </div>
              </div>;
            })}
            {!item.messages.length && <p>{t("No messages yet.", "ยังไม่มีข้อความ")}</p>}
            {busy && <p role="status">{t("Processing…", "กำลังดำเนินการ…")}</p>}
            <div ref={bottom} />
          </div>
          <form className="admin-reply" onSubmit={e => { e.preventDefault(); void chat.act("reply"); }}>
            <label htmlFor="admin-reply">{t("Reply as a sales specialist", "ตอบในนามเจ้าหน้าที่ฝ่ายขาย")}</label>
            <div>
              <input id="admin-reply" autoComplete="off" value={draft} onChange={e => setDraft(e.target.value)} maxLength={2000} disabled={status !== "active" || busy} placeholder={t("Write a thoughtful reply…", "เขียนข้อความตอบลูกค้า…")} />
              <button className="primary-button" disabled={status !== "active" || busy || !draft.trim()} aria-label={t("Send", "ส่งข้อความ")}><Icon name="send" size={18} /></button>
            </div>
            <small>{status === "resolved" ? t("This conversation is closed.", "บทสนทนานี้ปิดแล้ว") : status !== "active" ? t("Take over a handed-over conversation to reply.", "รับช่วงบทสนทนาที่ส่งต่อมาเพื่อตอบลูกค้า") : t("Your reply will be sent to the customer.", "ข้อความตอบจะถูกส่งให้ลูกค้า")}</small>
          </form>
        </>}
      </section>
    </div>
  </main>;
}
