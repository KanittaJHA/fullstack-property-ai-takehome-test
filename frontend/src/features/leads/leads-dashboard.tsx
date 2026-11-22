"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { LeadClassification, LeadNotification, LeadSummary } from "@contracts/contracts/leads";
import { lockAdmin } from "@/api/auth";
import { useWorkspace } from "@/shell/workspace";
import { Icon, type IconName } from "@/ui/icon";
import { fetchLeads } from "./lead-api";
import { classificationCopy } from "./lead-copy";
import { ClampedText, LeadDialog } from "./lead-detail";
import "@/features/admin/status-dot.css";
import "@/features/admin/stat-card.css";
import "./leads.css";

type Filter = LeadClassification | "all";
const order: LeadClassification[] = ["hot", "warm", "cold"];
const REFRESH_MS = 20000;
/** Cards shown at first and added by each "Show more" click. */
const PAGE_SIZE = 12;
const statIcons: Record<Filter, IconName> = { all: "grid", hot: "spark", warm: "sun", cold: "moon" };

/** Property types read from the lead's own words (the form has no type field). A message can mention more than one. */
type PropertyType = "condo" | "townhouse" | "house" | "villa" | "land";
const propertyTypes: { key: PropertyType; label: [string, string]; pattern: RegExp }[] = [
  { key: "condo", label: ["Condo", "คอนโด"], pattern: /condo|apartment|คอนโด|ห้องชุด|อพาร์ต/i },
  { key: "townhouse", label: ["Townhouse", "ทาวน์โฮม"], pattern: /town ?(house|home)|ทาวน์(โฮม|เฮาส์)/i },
  { key: "house", label: ["House", "บ้าน"], pattern: /\bhouse\b|บ้าน/i },
  { key: "villa", label: ["Villa", "วิลล่า"], pattern: /villa|วิลล่า/i },
  { key: "land", label: ["Land", "ที่ดิน"], pattern: /\bland\b|ที่ดิน/i },
];

/** The workflow names channels in English, e.g. "sms (simulated)"; show them in Thai for Thai viewers. */
const channelThai = (channel: string) => channel
  .replace(/^sms\b/i, "SMS").replace(/^email\b/i, "อีเมล").replace(/\(simulated\)/i, "(จำลอง)");
const channelEnglish = (channel: string) => channel.replace(/^sms\b/i, "SMS").replace(/^email\b/i, "Email");

export function LeadsDashboard() {
  const { t, locale } = useWorkspace();
  const [leads, setLeads] = useState<LeadSummary[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [query, setQuery] = useState("");
  const [propertyType, setPropertyType] = useState<PropertyType | "all">("all");
  const [loading, setLoading] = useState(false);
  // The lead shown in the "Read more" popup (by id, so a background refresh keeps it up to date).
  const [openId, setOpenId] = useState<string | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setLeads(await fetchLeads()); setError(""); }
    catch (e) {
      if (e instanceof Error && e.message === "UNAUTHORIZED") { window.location.reload(); return; }
      setError("LEADS_UNAVAILABLE");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [load]);

  const money = (value: number) => new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-US", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(value);
  // 12-hour time with AM/PM in both languages, e.g. "21 Nov 2026, 2:45 PM" / "21 พ.ย. 2569 2:45 PM".
  const when = (iso: string) => new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })
    .format(new Date(iso)).replace(/\b(am|pm)\b/, period => period.toUpperCase());
  const count = (key: Filter) => filtered.filter(lead => key === "all" || lead.classification === key).length;
  const needle = query.trim().toLowerCase();
  const typePattern = propertyTypes.find(type => type.key === propertyType)?.pattern;
  // Search and property type narrow the list; the stat cards above still pick hot / warm / cold, and their counts follow the filters.
  const filtered = (leads ?? []).filter(lead =>
    (!needle || [lead.name, lead.phone, lead.email, lead.area, lead.message].some(value => value?.toLowerCase().includes(needle)))
    && (!typePattern || typePattern.test(lead.message)));
  const matching = filtered.filter(lead => filter === "all" || lead.classification === filter);
  const filtersOn = !!needle || propertyType !== "all";
  const clearFilters = () => { setQuery(""); setPropertyType("all"); setLimit(PAGE_SIZE); };
  const visible = matching.slice(0, limit);
  const openLead = (leads ?? []).find(lead => lead.id === openId) ?? null;
  const reasonOf = (lead: LeadSummary) => locale === "th" ? lead.classificationReasonTh ?? lead.classificationReason : lead.classificationReason;
  const replyLabel = (channel: string) => t(`Auto-reply · ${channelEnglish(channel)}`, `ตอบกลับอัตโนมัติ · ${channelThai(channel)}`);
  /** One line under a message in the popup: who the (simulated) message was logged for, or why it was not sent. */
  const delivery = (note: LeadNotification) => note.status === "failed"
    ? <p className="lead-delivery failed"><Icon name="close" size={13} />{t(`Not sent to ${note.to ?? "?"}`, `ส่งไม่สำเร็จ: ${note.to ?? "?"}`)}{note.error && <small>{note.error}</small>}</p>
    : note.to && <p className="lead-delivery"><Icon name="check" size={13} />{t(`Logged for ${note.to} (simulated)`, `บันทึกถึง ${note.to} (จำลอง)`)}</p>;

  return <main id="main-content" className="leads-page">
    <div className="admin-page-heading leads-heading">
      <div>
        <p className="admin-eyebrow">WHAT THE PROPERTY · {t("LEADS", "ลีด")}</p>
        <h1>{t("Every lead, ranked by urgency.", "ทุกลีด เรียงตามความเร่งด่วน")}</h1>
        <p>{t("Leads from the contact form, scored hot / warm / cold by the n8n workflow. Hot leads alert the team.", "ลีดจากฟอร์มติดต่อ จัดกลุ่ม ร้อน / อุ่น / เย็น โดย workflow ใน n8n ลีดร้อนจะแจ้งทีมขาย")}</p>
      </div>
      <div className="workspace-heading-actions">
        <button type="button" className="admin-secondary admin-compact-action" onClick={() => void load()} disabled={loading} aria-label={t("Refresh", "รีเฟรช")}><Icon name="clock" size={16} /><span>{loading ? t("Refreshing…", "กำลังโหลด…") : t("Refresh", "รีเฟรช")}</span></button>
        <Link href="/contact" className="admin-secondary admin-compact-action leads-contact-link" aria-label={t("Open contact form", "เปิดฟอร์มติดต่อ")}><Icon name="send" size={16} /><span>{t("Open contact form", "เปิดฟอร์มติดต่อ")}</span></Link>
        <button type="button" className="admin-secondary admin-lock-action" onClick={() => void lockAdmin()} aria-label={t("Lock workspace", "ล็อกพื้นที่ทำงาน")} title={t("Lock workspace", "ล็อกพื้นที่ทำงาน")}><Icon name="shield" size={16} /><span>{t("Lock workspace", "ล็อกพื้นที่ทำงาน")}</span></button>
        <button type="button" className={`admin-secondary admin-stats-toggle ${statsOpen ? "open" : ""}`} aria-expanded={statsOpen} aria-controls="leads-stats" onClick={() => setStatsOpen(open => !open)}><Icon name="grid" size={16} />{t("Overview", "ภาพรวม")}<Icon name="chevron" size={14} /></button>
      </div>
    </div>

    {/* Same stat cards as the admin inbox, coloured by lead category. */}
    <div id="leads-stats" className={`admin-stats leads-stats ${statsOpen ? "open" : ""}`} role="group" aria-label={t("Filter by category", "กรองตามกลุ่ม")}>
      {(["all", ...order] as Filter[]).map(key => (
        <button key={key} type="button" className={`admin-stat lead-stat ${key} ${filter === key ? "selected" : ""}`} aria-pressed={filter === key} onClick={() => { setFilter(key); setLimit(PAGE_SIZE); }}>
          <span className="admin-stat-heading">
            <span className={`admin-status lead-status ${key}`}>{key === "all" ? t("All leads", "ลีดทั้งหมด") : t(...classificationCopy[key].label)}</span>
            <span className="admin-stat-icon" aria-hidden="true"><Icon name={statIcons[key]} size={21} /></span>
          </span>
          <span className="admin-stat-value"><strong>{leads ? count(key) : "–"}</strong><small>{t(leads && count(key) === 1 ? "lead" : "leads", "ลีด")}</small></span>
          <span className="admin-stat-description">{key === "all" ? t("Every contact form message.", "ทุกข้อความจากฟอร์มติดต่อ") : t(...classificationCopy[key].note)}<Icon name="arrow" size={14} /></span>
        </button>
      ))}
    </div>

    <div className="leads-filters" role="search">
      <label className="leads-search"><Icon name="search" size={16} />
        <input type="search" value={query} onChange={event => { setQuery(event.target.value); setLimit(PAGE_SIZE); }}
          placeholder={t("Search name, phone, email, area or message", "ค้นหาชื่อ เบอร์ อีเมล ทำเล หรือข้อความ")} aria-label={t("Search leads", "ค้นหาลีด")} />
      </label>
      {/* Category buttons, in step with the stat cards above. */}
      <div className="leads-segment" role="group" aria-label={t("Category", "กลุ่ม")}>
        {(["all", ...order] as Filter[]).map(key => (
          <button key={key} type="button" className={`${key} ${filter === key ? "active" : ""}`} aria-pressed={filter === key} onClick={() => { setFilter(key); setLimit(PAGE_SIZE); }}>
            {key !== "all" && <span className="leads-segment-dot" aria-hidden="true" />}
            {key === "all" ? t("All", "ทั้งหมด") : t(...classificationCopy[key].label)}
            <small>{count(key)}</small>
          </button>
        ))}
      </div>
      <label className="leads-select"><span>{t("Property type", "ประเภท")}</span>
        <select value={propertyType} onChange={event => { setPropertyType(event.target.value as PropertyType | "all"); setLimit(PAGE_SIZE); }}>
          <option value="all">{t("All types", "ทุกประเภท")}</option>
          {propertyTypes.map(type => <option key={type.key} value={type.key}>{t(...type.label)}</option>)}
        </select>
      </label>
      {filtersOn && <button type="button" className="leads-clear" onClick={clearFilters}><Icon name="close" size={14} />{t("Clear filters", "ล้างตัวกรอง")}</button>}
    </div>

    {error && <p className="lead-result error" role="alert">{t("Leads could not be loaded. Check the connection and try again.", "โหลดรายการลีดไม่สำเร็จ ตรวจสอบการเชื่อมต่อแล้วลองใหม่")}</p>}
    {!leads && !error && <p className="leads-empty">{t("Loading leads…", "กำลังโหลดรายการลีด…")}</p>}
    {leads && visible.length === 0 && <div className="leads-empty">
      <Icon name="search" size={22} />
      <p>{filtersOn ? t("No leads match these filters.", "ไม่มีลีดที่ตรงกับตัวกรอง") : filter === "all" ? t("No leads yet. Send one from the contact form.", "ยังไม่มีลีด ลองส่งจากฟอร์มติดต่อ") : t("No leads in this category.", "ไม่มีลีดในกลุ่มนี้")}</p>
    </div>}

    <ul className="leads-list">
      {visible.map(lead => {
        const alert = lead.notifications.find(n => n.kind === "team_alert");
        const reply = lead.notifications.find(n => n.kind === "auto_reply");
        const category = lead.classification;
        return <li key={lead.id} className={`lead-item ${category ?? "pending"}`}>
          {/* Covers the whole card: a click anywhere opens the full details. */}
          <button type="button" className="lead-open" onClick={() => setOpenId(lead.id)} aria-label={t(`Open details for ${lead.name}`, `เปิดรายละเอียดของ ${lead.name}`)} />
          <div className="lead-item-top">
            <span className={`lead-badge ${category ?? "pending"}`}>{category ? t(...classificationCopy[category].label) : t("Not scored yet", "ยังไม่ได้จัดกลุ่ม")}</span>
            {lead.classificationSource === "rules" && <span className="lead-tag" title={t("The AI was unavailable or unsure, so simple rules decided.", "AI ไม่พร้อมหรือไม่มั่นใจ จึงใช้กฎสำรองตัดสิน")}>{t("Rule-based", "ใช้กฎสำรอง")}</span>}
            {lead.classificationSource === "ai" && <span className="lead-tag" title={t("Scored by AI (Gemini) from the message and budget.", "AI (Gemini) จัดกลุ่มจากข้อความและงบประมาณ")}><Icon name="spark" size={12} />AI</span>}
            <time dateTime={lead.createdAt}>{when(lead.createdAt)}</time>
          </div>
          {/* The repeat badge sits beside the name, so the date always stays on the badge row. */}
          <div className="lead-name-row"><h2>{lead.name}</h2>
            {lead.isRepeat && <span className="lead-tag repeat" title={t(`Repeat contact: ${lead.submissionCount} messages from this person`, `ติดต่อซ้ำ: คนนี้ส่งมาแล้ว ${lead.submissionCount} ข้อความ`)}>{t(`Repeat contact · ${lead.submissionCount}`, `ติดต่อซ้ำ · ${lead.submissionCount}`)}</span>}
          </div>
          <p className="lead-contact">{[lead.phone, lead.email].filter(Boolean).join(" · ")}</p>
          <dl className="lead-facts">
            <div><dt>{t("Area", "ทำเล")}</dt><dd>{lead.area || t("Not given", "ไม่ได้ระบุ")}</dd></div>
            <div><dt>{t("Budget", "งบประมาณ")}</dt><dd>{lead.budget !== null ? money(lead.budget) : t("Not given", "ไม่ได้ระบุ")}</dd></div>
          </dl>
          {/* Message and reason are cut to a fixed number of lines so every card is the same height; "Read more" opens the full text. */}
          <ClampedText as="blockquote" className="lead-message" onMore={() => setOpenId(lead.id)}>{lead.message}</ClampedText>
          {lead.classificationReason
            ? <ClampedText className="lead-reason" onMore={() => setOpenId(lead.id)}><strong>{t("Why", "เหตุผล")}</strong>{reasonOf(lead)}</ClampedText>
            : <div className="lead-clamp"><p className="lead-reason clamped" /></div>}
          <div className="lead-notifications">
            {alert ? <span className={`lead-note ${alert.status}`}><Icon name={alert.status === "sent" ? "check" : "close"} size={13} />{t("Team alerted (simulated)", "แจ้งทีมขายแล้ว (จำลอง)")}</span>
              : <span className="lead-note muted">{t("No urgent alert", "ไม่ต้องแจ้งด่วน")}</span>}
            {/* The auto-reply text opens in the popup instead of expanding the card. */}
            {reply ? <button type="button" className={`lead-note ${reply.status} lead-note-button`} onClick={() => setOpenId(lead.id)} title={t("Show the auto-reply", "ดูข้อความตอบกลับ")}><Icon name={reply.status === "sent" ? "check" : "close"} size={13} />{replyLabel(reply.channel)}</button>
              : <span className="lead-note failed">{t("Auto-reply not logged", "ไม่มีบันทึกการตอบกลับ")}</span>}
          </div>
        </li>;
      })}
    </ul>
    {matching.length > visible.length && <div className="leads-more">
      <button type="button" className="admin-secondary" onClick={() => setLimit(current => current + PAGE_SIZE)}>
        {t(`Show more (${matching.length - visible.length} more)`, `ดูเพิ่มเติม (อีก ${matching.length - visible.length} รายการ)`)}
      </button>
    </div>}
    <LeadDialog open={!!openLead} title={openLead?.name ?? ""} onClose={() => setOpenId(null)}>
      {openLead && (() => {
        const reply = openLead.notifications.find(n => n.kind === "auto_reply");
        const alert = openLead.notifications.find(n => n.kind === "team_alert");
        const category = openLead.classification;
        return <>
          <div className="lead-item-top">
            <span className={`lead-badge ${category ?? "pending"}`}>{category ? t(...classificationCopy[category].label) : t("Not scored yet", "ยังไม่ได้จัดกลุ่ม")}</span>
            <time dateTime={openLead.createdAt}>{when(openLead.createdAt)}</time>
          </div>
          <h2>{openLead.name}</h2>
          <p className="lead-contact">{[openLead.phone, openLead.email].filter(Boolean).join(" · ")}</p>
          <dl className="lead-facts">
            <div><dt>{t("Area", "ทำเล")}</dt><dd>{openLead.area || t("Not given", "ไม่ได้ระบุ")}</dd></div>
            <div><dt>{t("Budget", "งบประมาณ")}</dt><dd>{openLead.budget !== null ? money(openLead.budget) : t("Not given", "ไม่ได้ระบุ")}</dd></div>
          </dl>
          <h3>{t("Message", "ข้อความ")}</h3>
          <blockquote className="lead-message">{openLead.message}</blockquote>
          {openLead.classificationReason && <><h3>{t("Why", "เหตุผล")}</h3><p className="lead-reason">{reasonOf(openLead)}</p></>}
          {alert?.text && <><h3>{t("Team alert", "ข้อความแจ้งทีมขาย")}</h3>{delivery(alert)}<p className="lead-reason">{alert.text}</p></>}
          {reply && <><h3>{replyLabel(reply.channel)}</h3>{delivery(reply)}<p className="lead-reason">{reply.text ?? t("No text was logged.", "ไม่มีข้อความที่บันทึกไว้")}</p></>}
        </>;
      })()}
    </LeadDialog>
    {leads && <p className="leads-footnote">{t(`Showing ${visible.length} of ${matching.length} ${matching.length === 1 ? "submission" : "submissions"}, newest first. Refreshes every ${REFRESH_MS / 1000} seconds.`, `แสดง ${visible.length} จาก ${matching.length} รายการ เรียงจากล่าสุด รีเฟรชทุก ${REFRESH_MS / 1000} วินาที`)}</p>}
  </main>;
}
