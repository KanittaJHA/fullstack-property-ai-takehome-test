"use client";
import Image from "next/image";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { Property } from "@contracts/domain/property";
import { localizedProperty, propertyPhoto, typeThai } from "@/features/properties/property-presentation";
import { Icon } from "@/ui/icon";
import { ribbonOutlines, type Segment } from "./ribbon-shape";

type Translate = (en: string, th: string) => string;
const unsplash = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=75`;
const money = (value: number, locale: "en" | "th") =>
  new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-US", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(value);

/** How matching works: a ribbon with the steps written along it, scattered photos, and a real example request. */
export function HowItWorks({ t, example, locale }: { t: Translate; example: Property | undefined; locale: "en" | "th" }) {
  const shown = example && localizedProperty(example, locale);
  // crop "top" or "bottom" keeps that part of a tall photo in the circle (default: the centre).
  const photo = (id: string, crop = "") => `https://images.unsplash.com/${id}?auto=format&fit=crop${crop && `&crop=${crop}`}&w=400&h=400&q=70`;
  // Circle photos placed in the drawing's own coordinates (1400 × 640), so they scale with the ribbon.
  const dots: [number, number, number, string, string?][] = [
    [560, 140, 84, "photo-1751872236398-ee2022bd1c50", "bottom"], [160, 540, 68, "photo-1777291126955-8c85847c4a1e"],
    [520, 440, 68, "photo-1643068474433-9efab014ffb7", "top"], [951, 446, 68, "photo-1610123172705-a57f116cd4d9"],
    [1300, 490, 68, "photo-1683638170557-a7b649bdb2a9"], [1222, 207, 104, "photo-1760067538263-fb7126fe748c"],
  ];
  // Ribbon text is decorative and stays in English in both languages.
  const steps = "Describe what you need  •  the AI finds a match  •  the server checks it  •  you book a visit  •  ";
  return <section className="home-band home-how">
    <svg className="home-how-art" viewBox="0 0 1400 640" aria-hidden="true">
      <defs>{dots.map(([x, y, r], i) => <clipPath key={i} id={`home-how-dot-${i}`}><circle cx={x} cy={y} r={r} /></clipPath>)}</defs>
      {/* Rings that breathe around the large photo, with ripples spreading outward from it. */}
      <circle className="home-how-ripple" cx="1222" cy="207" r="112" />
      <circle className="home-how-ripple home-how-ripple-late" cx="1222" cy="207" r="112" />
      <circle className="home-how-ring" cx="1222" cy="207" r="162" />
      <circle className="home-how-ring home-how-ring-inner" cx="1222" cy="207" r="134" />
      <path id="home-how-path" className="home-how-ribbon" d="M -30 420 C 210 360, 380 600, 660 605 C 1000 600, 1180 380, 1218 240 C 1240 150, 1240 50, 1238 -40" />
      <text><textPath href="#home-how-path" startOffset="3%">{steps.repeat(2)}</textPath></text>
      {dots.map(([x, y, r, id, crop], i) => <g key={id}>
        <image href={photo(id, crop)} x={x - r} y={y - r} width={r * 2} height={r * 2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#home-how-dot-${i})`} />
        <circle className="home-how-dot" cx={x} cy={y} r={r} />
      </g>)}
    </svg>
    <div className="home-how-copy">
      <span className="home-tag">{t("How it works", "ทำงานอย่างไร")}</span>
      <h2>{t("From a sentence", "จากหนึ่งประโยค")}<br />{t("to a shortlist", "สู่รายการที่ใช่")}</h2>
      <p>{t("Write what you need the way you would tell a friend. The AI picks up to three listings, and the server checks each one against the real listing data before you see it.",
        "เขียนสิ่งที่ต้องการเหมือนเล่าให้เพื่อนฟัง AI เลือกให้ไม่เกินสามรายการ และ server ตรวจทุกรายการกับข้อมูลประกาศจริงก่อนแสดงให้คุณเห็น")}</p>
    </div>
    {shown && example && <figure className="home-how-example">
      <blockquote>{t("“I want a 2-bedroom condo near BTS in Bangkok under 6 million baht for my family.”", "“อยากได้คอนโด 2 ห้องนอนใกล้ BTS ในกรุงเทพ งบไม่เกิน 6 ล้านบาท สำหรับครอบครัว”")}</blockquote>
      <figcaption>
        <strong>{shown.title}</strong>
        <span>{`${shown.area}, ${shown.city} · ${money(example.price, locale)} · ${t("300 m from BTS Asok", "ห่าง BTS อโศก 300 เมตร")}`}</span>
        <small>{t("Top match for this request in a live test", "ผลอันดับ 1 ของคำขอนี้จากการทดสอบจริง")}</small>
      </figcaption>
    </figure>}
  </section>;
}

/** Three ways the site helps, each linking to a working page (in place of a team section). */
export function WaysWeHelp({ t }: { t: Translate }) {
  const ways = [
    { href: "/properties", photo: "photo-1758915753451-b478b4e6f920", en: "AI property matching", th: "AI จับคู่อสังหาฯ" },
    { href: "/graspia", photo: "photo-1509391366360-2e959784a276", en: "Graspia solar", th: "โซลาร์กับ Graspia" },
    { href: "/contact", photo: "photo-1521791136064-7986c2920216", en: "Talk to an advisor", th: "คุยกับที่ปรึกษา" },
  ];
  return <section className="home-ways">
    <div className="home-ways-intro">
      <span className="home-tag">{t("What we do", "เราช่วยอะไรได้")}</span>
      <h2>{t("Three ways", "สามทาง")}<br />{t("we help", "ที่เราช่วยคุณ")}</h2>
      <p>{t("Search on your own, let the AI shortlist for you, or hand it to a person. You can switch at any time.",
        "ค้นหาเอง ให้ AI คัดให้ หรือส่งต่อให้คนช่วย เปลี่ยนได้ตลอดเวลา")}</p>
      <Icon name="arrow" size={20} />
    </div>
    {ways.map(way => <Link key={way.href} href={way.href} className="home-way">
      <Image src={unsplash(way.photo)} alt="" fill sizes="(max-width: 900px) 100vw, 25vw" unoptimized />
      <span className="home-way-label">{t(way.en, way.th)}</span>
    </Link>)}
  </section>;
}

/** Real listings from the database on a dark band (in place of events). */
export function FeaturedListings({ t, listings, locale }: { t: Translate; listings: Property[]; locale: "en" | "th" }) {
  const picks = ["P001", "P006"].map(id => listings.find(p => p.id === id)).filter((p): p is Property => Boolean(p));
  return <section className="home-band home-listings">
    <div className="home-listings-copy">
      <span className="home-tag">{t("Listings", "ประกาศ")}</span>
      <h2>{t("Properties worth", "อสังหาฯ ที่น่า")}<br />{t("a closer look", "ไปดูใกล้ๆ")}</h2>
      <p>{t("A city condo next to the BTS and a pool villa in Chiang Mai, both from the live listing data.",
        "คอนโดติด BTS กลางเมือง และพูลวิลล่าที่เชียงใหม่ จากข้อมูลประกาศจริงในระบบ")}</p>
      <Link href="/properties" className="home-outline-button">{t("See all", "ดูทั้งหมด")}<Icon name="arrow" size={14} /></Link>
    </div>
    {picks.map(p => {
      const shown = localizedProperty(p, locale);
      return <Link key={p.id} href={`/properties?city=${encodeURIComponent(p.city)}&type=${p.type}`} className="home-listing">
        <Image src={propertyPhoto(p)} alt={t("Illustrative photo, not the actual property", "ภาพประกอบ ไม่ใช่ภาพทรัพย์จริง")} fill sizes="(max-width: 900px) 100vw, 30vw" unoptimized />
        <span className="home-listing-head"><small>{`${t(p.type === "villa" ? "Villa" : p.type === "house" ? "House" : "Condominium", typeThai[p.type] ?? p.type)} · ${shown.city}`}</small><strong>{shown.title}</strong></span>
        <span className="home-listing-foot"><b>{money(p.price, locale)}</b><span className="home-small-button">{t("View", "ดูรายละเอียด")}<Icon name="arrow" size={13} /></span></span>
      </Link>;
    })}
  </section>;
}

/** Plain answers about the site itself. */
export function HomeFaq({ t }: { t: Translate }) {
  const items: [string, string, string, string][] = [
    ["How does the AI matching work?", "AI จับคู่บ้านทำงานอย่างไร",
      "The AI reads your request and suggests up to three listings. The server then checks city, budget, bedrooms, type, furnishing and distance to the train against the listing data; anything that does not fit is shown as an alternative with the reason.",
      "AI อ่านคำขอแล้วเสนอไม่เกินสามรายการ จากนั้น server ตรวจเมือง งบ ห้องนอน ประเภท เฟอร์นิเจอร์ และระยะถึงรถไฟฟ้ากับข้อมูลประกาศ รายการที่ไม่ตรงจะแสดงเป็นตัวเลือกใกล้เคียงพร้อมเหตุผล"],
    ["Can I search in Thai?", "ค้นหาเป็นภาษาไทยได้ไหม",
      "Yes. Write in Thai or English, including prices such as 6 ล้าน and phrases such as ห้ามเกินงบ (do not go over budget).",
      "ได้ พิมพ์ภาษาไทยหรืออังกฤษก็ได้ รวมถึงราคาอย่าง 6 ล้าน และคำอย่าง ห้ามเกินงบ"],
    ["Can the AI be wrong?", "AI ตอบผิดได้ไหม",
      "It can misread a request, which is why every result is checked against the data and unmet requirements are labelled. Nothing it says about a listing is shown without that check.",
      "อาจเข้าใจคำขอผิดได้ ระบบจึงตรวจทุกผลลัพธ์กับข้อมูลจริงและบอกข้อที่ไม่ตรงไว้ชัดเจน"],
    ["What is Graspia?", "Graspia คืออะไร",
      "A sales assistant for a solar installer. It answers from the company's own information and hands the chat to a person when it should.",
      "ผู้ช่วยขายของบริษัทติดตั้งโซลาร์ ตอบจากข้อมูลของบริษัทเท่านั้น และส่งต่อให้เจ้าหน้าที่เมื่อถึงเวลาที่ควร"],
    ["Are these real properties?", "ประกาศเหล่านี้เป็นของจริงไหม",
      "They are sample listings for this demo, and the photos are illustrations, not the actual properties.",
      "เป็นประกาศตัวอย่างสำหรับเดโมนี้ และรูปเป็นภาพประกอบ ไม่ใช่ภาพทรัพย์จริง"],
  ];
  return <section className="home-faq">
    <div className="home-faq-intro">
      <span className="home-tag">{t("Questions", "คำถาม")}</span>
      <h2>{t("Frequently asked", "คำถามที่")}<br />{t("questions", "พบบ่อย")}</h2>
      <p>{t("Short answers about searching, the AI and the data.", "คำตอบสั้นๆ เรื่องการค้นหา AI และข้อมูล")}</p>
      <Link href="/contact" className="home-outline-button">{t("Ask us", "ถามเรา")}<Icon name="arrow" size={14} /></Link>
    </div>
    <div className="home-faq-list">
      {items.map(([qEn, qTh, aEn, aTh], index) => <details key={qEn} open={index === 0}>
        <summary>{t(qEn, qTh)}</summary>
        <p>{t(aEn, aTh)}</p>
      </details>)}
    </div>
  </section>;
}

// The closing ribbon: in from the left, one loop (a circle around 330,215, radius 140), back through the crossing at
// 300,420, then a wave off to the right. Widths (one per joint) make it thin around the loop and wide along the wave.
const closingRibbon: Segment[] = [
  [[-60, 440], [90, 525], [210, 490], [300, 420]],
  [[300, 420], [370, 366], [470, 300], [470, 215]],
  [[470, 215], [470, 138], [407, 75], [330, 75]],
  [[330, 75], [253, 75], [190, 138], [190, 215]],
  [[190, 215], [190, 300], [240, 375], [300, 420]],
  [[300, 420], [420, 500], [560, 525], [760, 500]],
  [[760, 500], [1000, 470], [1250, 420], [1560, 480]],
];
const closingOutlines = ribbonOutlines(closingRibbon, [64, 56, 48, 46, 48, 56, 72, 62]);

/** Closing call to action on a looping ribbon, with the footer inside the same card. */
export function HomeClosing({ t }: { t: Translate }) {
  return <section className="home-closing">
    <div className="home-closing-art">
      {/* The ribbon, then its text (decorative, English in both languages): clockwise round the loop, then along the wave. */}
      <svg viewBox="0 0 1500 560" aria-hidden="true">
        {closingOutlines.map(d => <path key={d.slice(0, 24)} className="home-closing-ribbon" d={d} />)}
        <path id="home-closing-loop" d="M 200 267 A 140 140 0 1 1 460 267" fill="none" />
        <path id="home-closing-wave" d="M 300 420 C 420 500, 560 525, 760 500 C 1000 470, 1250 420, 1560 480" fill="none" />
        <text className="home-closing-loop-text"><textPath href="#home-closing-loop" startOffset="1%">Find a property that fits you.</textPath></text>
        <text><textPath href="#home-closing-wave" startOffset="6%">Describe it in your own words, and we will help you find it.</textPath></text>
      </svg>
      <div className="home-closing-copy">
        <h2>{t("Let’s find your next", "มาหาอสังหาฯ ที่ใช่")}<br />{t("property, together.", "ของคุณไปด้วยกัน")}</h2>
        <Link href="/properties" className="home-dark-button">{t("Start searching", "เริ่มค้นหา")}<Icon name="arrow" size={14} /></Link>
      </div>
    </div>
    <footer className="home-footer">
      <div className="home-footer-brand">
        <strong>what the <span>property.</span></strong>
        <h3>{t("Stay in the loop", "ติดตามข่าวสาร")}</h3>
        <p>{t("New listings and tips for buyers, now and then.", "ประกาศใหม่และเคล็ดลับสำหรับผู้ซื้อ ส่งให้เป็นครั้งคราว")}</p>
        <NewsletterForm t={t} />
      </div>
      <nav aria-label={t("Explore", "สำรวจ")}>
        <h3>{t("Explore", "สำรวจ")}</h3>
        <Link href="/properties">{t("Property matching", "จับคู่อสังหาฯ")}</Link>
        <Link href="/properties?type=condo">{t("Condominiums", "คอนโด")}</Link>
        <Link href="/properties?type=house">{t("Houses", "บ้านเดี่ยว")}</Link>
        <Link href="/properties?type=villa">{t("Villas", "วิลล่า")}</Link>
      </nav>
      <nav aria-label={t("Help", "ช่วยเหลือ")}>
        <h3>{t("Help", "ช่วยเหลือ")}</h3>
        <Link href="/contact">{t("Talk to an advisor", "คุยกับที่ปรึกษา")}</Link>
        <Link href="/graspia">{t("Graspia solar", "โซลาร์กับ Graspia")}</Link>
      </nav>
      <nav aria-label={t("For the team", "สำหรับทีม")} className="home-footer-team">
        <h3>{t("For the team", "สำหรับทีม")}</h3>
        <Link href="/leads">{t("Leads", "ลีด")}</Link>
        <Link href="/admin">{t("Sales inbox", "กล่องข้อความทีมขาย")}</Link>
      </nav>
      {/* Sample contact details for the demo: the address and number are made up, and .example addresses never deliver. */}
      <address className="home-footer-contact">
        <h3>{t("Contact", "ติดต่อ")}</h3>
        <span>{t("88 Sukhumvit Road, Bangkok", "88 ถนนสุขุมวิท กรุงเทพฯ")}</span>
        <span>+66 2 123 4567</span>
        <span>hello@wtp.example</span>
        <span className="home-footer-social" aria-label={t("Social media (sample)", "โซเชียลมีเดีย (ตัวอย่าง)")}>
          {(["linkedin", "instagram", "facebook"] as const).map(name => <span key={name} title={name}><SocialIcon name={name} /></span>)}
        </span>
      </address>
      <p className="home-footer-bottom">
        <span>{t("© 2026 What The Property. A take-home project by Kanitta K.", "© 2026 What The Property โปรเจกต์ทดสอบ โดย Kanitta K.")}</span>
        <span>{t("Sample listings, contact details and illustrative photos.", "ประกาศ ข้อมูลติดต่อ และภาพประกอบเป็นตัวอย่าง")}</span>
      </p>
    </footer>
  </section>;
}

/** Newsletter sign-up. This demo sends no email, so it checks the address and says so instead of storing it. */
function NewsletterForm({ t }: { t: Translate }) {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  function subscribe(event: FormEvent) {
    event.preventDefault();
    setDone(true);
  }
  if (done) return <p className="home-newsletter-done" role="status">{t("Thanks! This is a demo, so no email is sent and your address is not saved.", "ขอบคุณ! นี่เป็นเดโม จึงไม่มีการส่งอีเมลและไม่ได้บันทึกอีเมลของคุณ")}</p>;
  return <form className="home-newsletter" onSubmit={subscribe}>
    <input type="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder={t("Your email", "อีเมลของคุณ")} aria-label={t("Your email", "อีเมลของคุณ")} />
    <button type="submit">{t("Subscribe", "สมัคร")}</button>
  </form>;
}

/** Simple outline icons for the sample social links. */
function SocialIcon({ name }: { name: "linkedin" | "instagram" | "facebook" }) {
  return <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === "linkedin" && <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 0 1 4 0v4M12 10v7" /></>}
    {name === "instagram" && <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M17.5 6.5v.01" /></>}
    {name === "facebook" && <path d="M15 3h-2a4 4 0 0 0-4 4v3H7v4h2v7h4v-7h3l1-4h-4V7a1 1 0 0 1 1-1h2Z" />}
  </svg>;
}
