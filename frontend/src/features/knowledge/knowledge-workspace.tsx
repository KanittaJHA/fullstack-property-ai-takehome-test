"use client";

import { useState } from "react";
import { lockAdmin } from "@/api/auth";
import Link from "next/link";
import type { BusinessProfile } from "@contracts/domain/business-profile";
import { Icon, type IconName } from "@/ui/icon";
import { useWorkspace } from "@/shell/workspace";

export function KnowledgeWorkspace({ profile }: { profile: BusinessProfile }) {
  const { t, locale } = useWorkspace();
  const [query, setQuery] = useState("");
  const sections = [
    { id: "business", title: t("The business", "ข้อมูลธุรกิจ"), terms: `${profile.business_name} ${profile.about} ${profile.service_area} ${profile.languages.join(" ")}` },
    { id: "packages", title: t("Solar packages", "แพ็กเกจโซลาร์"), terms: JSON.stringify(profile.products) },
    { id: "process", title: t("From survey to solar", "จากสำรวจสู่การติดตั้ง"), terms: `${profile.process.join(" ")} ${profile.payment}` },
    { id: "rules", title: t("Answering with care", "แนวทางการตอบลูกค้า"), terms: profile.rules.join(" ") },
    { id: "human", title: t("When a human steps in", "เมื่อส่งต่อให้ทีมขาย"), terms: `${profile.human_team.sales_contact} ${profile.human_team.handover_hours} 10kW` },
  ];
  const sectionIcons: Record<string, IconName> = { business: "home", packages: "sun", process: "clock", rules: "shield", human: "user" };
  const visible = sections.filter((section) => `${section.title} ${section.terms}`.toLowerCase().includes(query.trim().toLowerCase()));
  const show = (id: string) => visible.some((section) => section.id === id);
  const money = (value: number) => new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-US", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(value);
  return (
    <main id="main-content" className="knowledge-page">
      <div className="knowledge-layout">
      <aside className="knowledge-sidebar">
        <div className="knowledge-sidebar-brand"><span><Icon name="book" size={24} /></span><div><strong>{t("Knowledge base", "ฐานความรู้")}</strong><small>{profile.business_name}</small></div></div>
        <p className="knowledge-sidebar-label">{t("EXPLORE KNOWLEDGE", "หมวดข้อมูล")}</p>
        <nav aria-label={t("Knowledge sections", "หมวดฐานความรู้")}>
          {sections.map((section) => show(section.id) ? (
            <a key={section.id} href={`#knowledge-${section.id}`}><Icon name={sectionIcons[section.id]} size={18} /><span>{section.title}</span><Icon name="chevron" size={14} /></a>
          ) : (
            <span key={section.id} className="knowledge-nav-unavailable" aria-disabled="true"><Icon name={sectionIcons[section.id]} size={18} /><span>{section.title}</span></span>
          ))}
        </nav>
        <div className="knowledge-sidebar-footer">
          <section className="admin-account knowledge-team-account" aria-label={t("Demo team account", "บัญชีทีมตัวอย่าง")}>
            <span className="admin-eyebrow">{t("YOUR WORKSPACE", "พื้นที่ของคุณ")}</span>
            <div className="admin-account-identity">
              <span className="admin-account-avatar" aria-hidden="true">N</span>
              <div><h3>{profile.human_team.sales_contact}</h3><p>{t("Sales specialist · Demo account", "เจ้าหน้าที่ฝ่ายขาย · บัญชีเดโม")}</p></div>
            </div>
            <p className="admin-account-description">{t("Your team’s knowledge, ready for every conversation.", "ข้อมูลของทีม พร้อมใช้ในทุกบทสนทนา")}</p>
            <Link href="/admin" className="admin-account-link"><span><Icon name="chat" size={15} />{t("Team workspace", "พื้นที่ทำงานทีม")}</span><Icon name="arrow" size={14} /></Link>
            <small>{t("Sample profile for this demo workspace.", "โปรไฟล์ตัวอย่างสำหรับพื้นที่เดโมนี้")}</small>
          </section>
        <div className="knowledge-sidebar-note"><Icon name="shield" size={20} /><strong>{t("A shared source of truth", "ข้อมูลอ้างอิงร่วมกัน")}</strong><p>{t("Business details, answers and boundaries — in one place for your team.", "ข้อมูลธุรกิจ แนวทางตอบ และขอบเขตการให้ข้อมูล รวมไว้ให้ทีมใช้ร่วมกัน")}</p><small>{t("Read-only preview", "ตัวอย่างสำหรับอ่าน")}</small></div>
        </div>
      </aside>
      <div className="knowledge-content">
      <div className="knowledge-page-heading">
        <div>
          <p className="knowledge-eyebrow">GRASPIA · {t("KNOWLEDGE BASE", "ฐานความรู้")}</p>
          <h1>{t("Good answers start here.", "คำตอบที่ดี เริ่มจากข้อมูลที่ใช่")}</h1>
          <p>{t("Explore the business knowledge behind the sales experience.", "สำรวจข้อมูลธุรกิจที่ใช้ประกอบประสบการณ์แชทฝ่ายขาย")}</p>
        </div>
        <div className="workspace-heading-actions"><form action={lockAdmin}><button className="admin-secondary"><Icon name="shield" size={16} />{t("Lock workspace", "ล็อกพื้นที่ทำงาน")}</button></form><Link href="/graspia" className="primary-button">{t("Try the chat", "ลองแชท")} <Icon name="arrow" size={17} /></Link></div>
      </div>
      <div className="knowledge-source"><Icon name="shield" size={20} /><div><strong>{t("One shared business profile", "ข้อมูลธุรกิจชุดเดียวกัน")}</strong><p>{t("Business knowledge is loaded from the database. Chat replies are still sample responses; AI is not connected yet.", "ฐานความรู้อ่านจากฐานข้อมูล แชทยังใช้คำตอบตัวอย่าง ยังไม่ได้เชื่อม AI")}</p><small>{t("Source content is shown in its original English.", "เนื้อหาต้นฉบับแสดงเป็นภาษาอังกฤษ")}</small></div></div>
      <label className="knowledge-search"><Icon name="search" size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search packages, pricing, service areas…", "ค้นหาแพ็กเกจ ราคา หรือพื้นที่บริการ…")} aria-label={t("Search knowledge", "ค้นหาฐานความรู้")} />{query && <button type="button" onClick={() => setQuery("")} aria-label={t("Clear search", "ล้างคำค้น")}><Icon name="close" size={18} /></button>}</label>
      <p className="knowledge-results" role="status">{t(`${visible.length} of ${sections.length} sections`, `${visible.length} จาก ${sections.length} หมวด`)}</p>
      <div className="knowledge-grid">
        {show("business") && <section id="knowledge-business" tabIndex={-1} className="knowledge-card"><div className="knowledge-section-title"><Icon name="sun" /><h2>{sections[0].title}</h2></div><h3>{profile.business_name}</h3><p>{profile.about}</p><dl><dt>{t("Service area", "พื้นที่ให้บริการ")}</dt><dd>{profile.service_area}</dd><dt>{t("Languages", "ภาษา")}</dt><dd>{profile.languages.join(" · ")}</dd></dl></section>}
        {show("human") && <section id="knowledge-human" tabIndex={-1} className="knowledge-card knowledge-human"><div className="knowledge-section-title"><Icon name="user" /><h2>{sections[4].title}</h2></div><h3>{profile.human_team.sales_contact}</h3><p>{profile.human_team.handover_hours}</p><p>{t("Systems above 10kW need a human quote. The assistant should not invent a price.", "ระบบขนาดเกิน 10kW ต้องให้ทีมขายเสนอราคา ผู้ช่วยไม่ควรสร้างราคาขึ้นเอง")}</p><small>{t("This page does not send team notifications.", "หน้านี้ไม่ได้ส่งการแจ้งเตือนให้ทีมขาย")}</small></section>}
        {show("packages") && <section id="knowledge-packages" tabIndex={-1} className="knowledge-card knowledge-wide"><div className="knowledge-section-title"><Icon name="sun" /><h2>{sections[1].title}</h2></div><div className="knowledge-packages">{profile.products.map((product) => <article key={product.name}><h3>{product.name}</h3><strong className="knowledge-price">{money(product.price_thb)}</strong><p>{product.good_for}</p><dl><dt>{t("Monthly savings range", "ช่วงเงินประหยัดต่อเดือน")}</dt><dd>฿{product.saves_per_month_thb}</dd><dt>{t("Warranty", "การรับประกัน")}</dt><dd>{product.warranty_years} {t("years", "ปี")}</dd></dl></article>)}</div><p className="knowledge-footnote">{t("Savings are ranges from the business profile, not guaranteed outcomes.", "เงินประหยัดเป็นช่วงตามข้อมูลธุรกิจ ไม่ใช่การรับประกันผลลัพธ์")}</p></section>}
        {show("process") && <section id="knowledge-process" tabIndex={-1} className="knowledge-card"><div className="knowledge-section-title"><Icon name="home" /><h2>{sections[2].title}</h2></div><ol>{profile.process.map((step) => <li key={step}>{step}</li>)}</ol><h3>{t("Payment", "การชำระเงิน")}</h3><p>{profile.payment}</p></section>}
        {show("rules") && <section id="knowledge-rules" tabIndex={-1} className="knowledge-card"><div className="knowledge-section-title"><Icon name="shield" /><h2>{sections[3].title}</h2></div><ul>{profile.rules.map((rule) => <li key={rule}>{rule}</li>)}</ul></section>}
      </div>
      {!visible.length && <div className="knowledge-empty"><Icon name="search" size={28} /><h2>{t("No matching knowledge yet.", "ไม่พบข้อมูลที่ตรงกัน")}</h2><p>{t("Try a source keyword like solar, warranty or Bangkok.", "ลองคำจากต้นฉบับ เช่น solar, warranty หรือ Bangkok")}</p><button className="primary-button" onClick={() => setQuery("")}>{t("Show all knowledge", "แสดงข้อมูลทั้งหมด")}</button></div>}
      </div>
      </div>
    </main>
  );
}
