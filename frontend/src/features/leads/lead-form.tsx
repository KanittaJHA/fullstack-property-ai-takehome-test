"use client";
import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import type { LeadRequest, LeadResponse } from "@contracts/contracts/leads";
import { useWorkspace } from "@/shell/workspace";
import { Icon } from "@/ui/icon";
import { submitLead } from "./lead-api";
import { exampleLeads, rejectionCopy } from "./lead-copy";
import "./leads.css";

const empty: LeadRequest = { name: "", phone: "", email: "", area: "", budget: "", message: "", website: "" };
// Unsplash, like the property card photos; editorial illustrations, not listing photos. One per colour theme.
const unsplash = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=2400&q=80`;
const heroPhotos: Record<"light" | "dark" | "rainbow", { src: string; alt: [string, string] }> = {
  light: { src: unsplash("photo-1613977257363-707ba9348227"), alt: ["Illustrative photo of a white villa with a pool on a sunny day", "ภาพประกอบวิลล่าสีขาวพร้อมสระว่ายน้ำในวันฟ้าใส"] },
  dark: { src: unsplash("photo-1600585154526-990dced4db0d"), alt: ["Illustrative photo of a modern house facade at dusk", "ภาพประกอบบ้านสไตล์โมเดิร์นยามพลบค่ำ"] },
  rainbow: { src: unsplash("photo-1599809275671-b5942cabc7a2"), alt: ["Illustrative photo of a villa with a pool at sunset", "ภาพประกอบวิลล่าพร้อมสระว่ายน้ำยามพระอาทิตย์ตก"] },
};

type Copy = [string, string];
// Sentence parts: strings are connecting words, numbers are step indexes (the words that light up).
const sentenceEn: (string | number)[] = ["We ", 0, " your message, ", 1, " it, ", 2, " it and ", 3, " right away."];
const sentenceTh: (string | number)[] = ["เรา ", 0, " ", 1, " ", 2, " และ ", 3, " ให้คุณทันที"];
// Stock portraits (Unsplash) for the social-proof row; illustrative, not real customers.
const people = ["photo-1494790108377-be9c29b29330", "photo-1500648767791-00dcc994a43e", "photo-1507003211169-0a1dd7228f2d", "photo-1544005313-94ddf0286df2"]
  .map(id => `https://images.unsplash.com/${id}?auto=format&fit=crop&crop=faces&w=96&h=96&q=75`);
const steps: { word: Copy; note: Copy }[] = [
  { word: ["receive", "รับข้อมูล"], note: ["Your form goes straight to our n8n automation workflow the moment you press send, day or night.", "แบบฟอร์มของคุณถูกส่งเข้า workflow อัตโนมัติใน n8n ทันทีที่กดส่ง ไม่ว่าจะเป็นเวลาไหนของวัน"] },
  { word: ["check", "ตรวจสอบ"], note: ["Spam, empty and fake-looking entries are rejected before anything is saved, so the team sees real people.", "ข้อมูลสแปม ข้อมูลว่าง หรือข้อมูลที่ดูปลอมจะถูกปฏิเสธก่อนบันทึก ทีมจึงเห็นเฉพาะลูกค้าตัวจริง"] },
  { word: ["score", "ประเมิน"], note: ["AI reads your message and budget, then rates the lead hot, warm or cold so urgent requests come first.", "AI อ่านข้อความและงบประมาณ แล้วจัดกลุ่มเป็น ร้อน อุ่น หรือเย็น เพื่อให้คำขอเร่งด่วนได้รับการติดต่อก่อน"] },
  { word: ["reply", "ตอบกลับ"], note: ["Hot leads alert the sales team straight away, and you get an instant confirmation that we have your message.", "ลีดเร่งด่วนจะแจ้งทีมขายทันที และคุณจะได้รับข้อความยืนยันอัตโนมัติว่าเราได้รับข้อความแล้ว"] },
];

/** A short random suffix for field names; called from effects and click handlers, never during render. */
const newNameSalt = () => Math.random().toString(36).slice(2, 8);
const fieldCode: Record<keyof LeadRequest, string> = { name: "a", phone: "b", email: "c", area: "d", budget: "e", message: "f", website: "g" };

export function LeadForm() {
  const { t, theme, locale } = useWorkspace();
  const [lead, setLead] = useState<LeadRequest>(empty);
  const [result, setResult] = useState<LeadResponse | null>(null);
  const [localError, setLocalError] = useState("");
  const [pending, setPending] = useState(false);
  const [step, setStep] = useState(0);
  const [failedPhoto, setFailedPhoto] = useState("");
  const photo = heroPhotos[theme];
  const photoFailed = failedPhoto === photo.src;
  // A fresh random suffix for the field names on every visit and every new form, so Chrome has no typing history to offer.
  const [nameSalt, setNameSalt] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setNameSalt(newNameSalt()));
    return () => clearTimeout(timer);
  }, []);
  const field = (key: keyof LeadRequest) => ({
    // Chrome ignores autocomplete="off" for contact details and guesses from id/name, so use neutral ids and a token
    // it does not recognise (no saved-address popup), plus per-visit names (no history popup) on this demo form.
    id: `lf-${fieldCode[key]}`, name: `lf-${fieldCode[key]}${nameSalt && `-${nameSalt}`}`, value: lead[key] ?? "", autoComplete: "lead-form-no-fill",
    onChange: (event: { target: { value: string } }) => setLead(current => ({ ...current, [key]: event.target.value })),
  });

  // While the workflow runs, walk through its steps so the wait shows what is happening.
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => setStep(current => Math.min(current + 1, steps.length - 2)), 1100);
    return () => clearInterval(timer);
  }, [pending]);

  // Idle: light up one step at a time, in random order. Pauses while the panel is hovered or focused,
  // after a submission, and for people who prefer reduced motion.
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (pending || result || paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setStep(current => {
      // Random order, never the same word twice in a row.
      const next = Math.floor(Math.random() * (steps.length - 1));
      return next >= current ? next + 1 : next;
    }), 1500);
    return () => clearInterval(timer);
  }, [pending, result, paused]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setResult(null);
    if (!lead.phone?.trim() && !lead.email?.trim()) {
      setLocalError(t("Please add a phone number or an email so we can reply.", "กรุณาใส่เบอร์โทรหรืออีเมลเพื่อให้เราติดต่อกลับ"));
      return;
    }
    setLocalError("");
    setStep(0);
    setPending(true);
    const response = await submitLead(lead);
    setPending(false);
    setResult(response);
    setStep(response.ok ? steps.length - 1 : 1);
  }
  // New field names on every fresh form too, so Chrome cannot offer what was just sent.
  const reset = (next: LeadRequest = empty) => { setLead(next); setResult(null); setLocalError(""); setStep(0); setNameSalt(newNameSalt()); };

  const accepted = result && (result.status === "received" || result.status === "already_received");
  // A server answer that was not accepted (rejected, too many messages, or the workflow was unavailable).
  const failed = result && !accepted ? result : null;
  const reasons = result?.status === "rejected" ? [...new Set((result.reasons ?? []).map(r => r.startsWith("spam_") ? "spam" : r))] : [];

  return <main id="main-content" className="lead-page">
    <section className={`lead-hero ${photoFailed ? "no-photo" : ""}`}>
      {/* Keyed by theme so a theme change fades in the matching photo. */}
      {!photoFailed && <Image key={photo.src} className="lead-hero-photo" src={photo.src} alt={t(...photo.alt)} fill sizes="100vw" unoptimized priority onError={() => setFailedPhoto(photo.src)} />}

      <div className="lead-hero-side">
        <div className="lead-hero-copy">
          <p className="lead-hero-eyebrow">WHAT THE PROPERTY · {t("CONTACT", "ติดต่อเรา")}</p>
          <h1><span className="lead-line">{t("Tell us what property you", "บอกเราว่าคุณกำลังมองหา")}</span> <span className="lead-line">{t("are really looking for.", "อสังหาฯ แบบไหน")}</span></h1>
          <p>{t("Share your budget, preferred area and timeline. A property advisor will get back to you with homes that fit, and urgent requests reach the team right away.", "บอกงบประมาณ ทำเลที่สนใจ และช่วงเวลาที่ต้องการ ที่ปรึกษาจะติดต่อกลับพร้อมตัวเลือกบ้านที่เหมาะกับคุณ ส่วนคำขอเร่งด่วนจะถึงทีมขายทันที")}</p>
        </div>
      <aside className="lead-glass lead-process" aria-label={t("How your message is handled", "ขั้นตอนการจัดการข้อความของคุณ")}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
        <div className="lead-process-top">
          <span className="lead-pill">{t("How it works", "ขั้นตอนการทำงาน")}</span>
          <div className="lead-people">
            <div className="lead-avatars" aria-hidden="true">
              {people.map(src => <Image key={src} src={src} alt="" width={40} height={40} unoptimized />)}
              <span>+</span>
            </div>
            {/* No made-up statistics: a plain promise instead of a customer count. Portraits are illustrative stock photos. */}
            <p><strong>{t("Real advisors", "ที่ปรึกษาตัวจริง")}</strong>{t("read every message", "อ่านทุกข้อความ")}</p>
          </div>
        </div>
        {/* One sentence; only the four step words light up. */}
        <p className="lead-sentence">{(locale === "th" ? sentenceTh : sentenceEn).map((part, i) => typeof part === "string" ? part : (
          <button key={i} type="button" className={part === step ? "active" : ""} aria-current={part === step ? "step" : undefined} onClick={() => setStep(part)}>{t(...steps[part].word)}</button>
        ))}</p>
        <p className="lead-step-note">{t(...steps[step].note)}</p>
      </aside>
      </div>

      <div className="lead-glass lead-panel" aria-live="polite">
        {accepted ? <output className="lead-result success">
          <span className="lead-result-icon"><Icon name="check" size={26} /></span>
          <h2>{result.status === "already_received" ? t("We already have your message.", "เราได้รับข้อความนี้แล้ว") : t("Thank you. Your message was received.", "ขอบคุณ เราได้รับข้อความของคุณแล้ว")}</h2>
          {result.message && <p className="lead-auto-reply"><small>{t("Auto-reply", "ข้อความตอบกลับอัตโนมัติ")}</small>{result.message}</p>}
          {result.status === "already_received" && <p>{t("The same message was sent before, so it was not stored twice.", "ข้อความเดียวกันเคยถูกส่งแล้ว ระบบจึงไม่บันทึกซ้ำ")}</p>}
          <button type="button" className="lead-light-button" onClick={() => reset()}>{t("Send another message", "ส่งข้อความใหม่")}</button>
        </output> : failed ? <div className="lead-result failure" role="alert">
          {/* Same layout as the success screen, in red. "Edit and try again" keeps everything the person typed. */}
          <span className="lead-result-icon"><Icon name="close" size={26} /></span>
          <h2>{failed.status === "rate_limited" ? t("Too many messages in a short time.", "ส่งข้อความถี่เกินไป")
            : failed.status === "unavailable" ? t("We could not send your message.", "ยังส่งข้อความไม่ได้")
            : reasons.includes("spam") ? t("This message looks like spam.", "ข้อความนี้ดูเหมือนสแปม")
            : t("Please check your details.", "กรุณาตรวจสอบข้อมูลอีกครั้ง")}</h2>
          {failed.status === "rate_limited" ? <p>{t("Please try again in 10 minutes.", "กรุณาลองใหม่ในอีก 10 นาที")}</p>
            : failed.status === "unavailable" ? <p>{t("Please try again in a minute. Nothing you typed was lost.", "กรุณาลองใหม่ในอีกสักครู่ ข้อมูลที่กรอกไว้ยังอยู่ครบ")}</p>
            : reasons.includes("spam") ? <p>{t("It was not sent. If this is a real enquiry, please remove links or promotional words and try again.", "ข้อความจึงไม่ถูกส่ง หากเป็นคำถามจริง กรุณาลบลิงก์หรือคำโฆษณาออกแล้วลองใหม่")}</p>
            : <ul className="lead-reasons">{reasons.map(r => <li key={r}>{rejectionCopy[r] ? t(...rejectionCopy[r]) : r}</li>)}</ul>}
          <button type="button" className="lead-light-button" onClick={() => setResult(null)}>{t("Edit and try again", "กลับไปแก้ไข")}</button>
        </div> : <form onSubmit={submit} autoComplete="off">
          <div className="lead-panel-top">
            <span className="lead-pill">{t("Send us a message", "ส่งข้อความถึงเรา")}</span>
            <fieldset className="lead-examples">
              <legend>{t("Try an example:", "ลองตัวอย่าง:")}</legend>
              {exampleLeads.map(example => (
                <button type="button" key={example.key} className={`lead-example ${example.key}`} onClick={() => reset({ ...empty, ...example.lead[locale === "th" ? 1 : 0] })}>{t(...example.label)}</button>
              ))}
            </fieldset>
          </div>
          <div className="lead-grid">
            <label className="lead-field wide"><span>{t("Name", "ชื่อ")} *</span><input {...field("name")} required maxLength={80} placeholder={t("e.g. Somchai Jaidee", "เช่น สมชาย ใจดี")} /></label>
            <label className="lead-field"><span>{t("Phone", "เบอร์โทร")}</span><input {...field("phone")} type="tel" inputMode="tel" maxLength={40} placeholder="08X XXX XXXX" /></label>
            <label className="lead-field"><span>{t("Email", "อีเมล")}</span><input {...field("email")} type="email" maxLength={254} placeholder="name@example.com" /></label>
            <p className="lead-hint wide">{t("Phone or email is required.", "ต้องใส่เบอร์โทรหรืออีเมลอย่างน้อย 1 อย่าง")}</p>
            <label className="lead-field"><span>{t("Area", "ทำเล")}</span><input {...field("area")} maxLength={120} placeholder={t("e.g. Ari, Bang Na", "เช่น อารีย์ บางนา")} /></label>
            <label className="lead-field"><span>{t("Budget (THB)", "งบประมาณ (บาท)")}</span><input {...field("budget")} maxLength={40} placeholder={t("e.g. 5,000,000 or 5M", "เช่น 5,000,000 หรือ 5 ล้าน")} /></label>
            <label className="lead-field wide"><span>{t("Message", "ข้อความ")} *</span><textarea {...field("message")} required minLength={5} maxLength={2000} rows={4} placeholder={t("What are you looking for, and when?", "คุณกำลังมองหาอะไร และต้องการเมื่อไหร่")} /></label>
            {/* Honeypot: hidden from people, often filled by bots. */}
            <label className="lead-honeypot" aria-hidden="true">Website<input {...field("website")} tabIndex={-1} /></label>
          </div>
          {/* Quick check before sending (no phone and no email): shown inline so the field can be fixed right away. */}
          {localError && <div className="lead-result error" role="alert">{localError}</div>}
          <button type="submit" className="lead-submit" disabled={pending}>{pending ? t("Sending…", "กำลังส่ง…") : t("Send message", "ส่งข้อความ")}<Icon name="send" size={15} /></button>
          <small className="lead-privacy">{t("Demo form: auto-replies are simulated and no message is actually sent to you.", "ฟอร์มสาธิต: การตอบกลับเป็นการจำลอง ไม่มีข้อความส่งถึงคุณจริง")}</small>
        </form>}
        <Link href="/leads" className="lead-team-link"><Icon name="shield" size={14} />{t("Sales team: view leads", "ทีมขาย: ดูรายการลีด")}</Link>
      </div>
    </section>
  </main>;
}
