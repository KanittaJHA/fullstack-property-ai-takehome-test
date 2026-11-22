"use client";
import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Property } from "@contracts/domain/property";
import { cityThai, typeThai } from "@/features/properties/property-presentation";
import { useWorkspace } from "@/shell/workspace";
import { Icon } from "@/ui/icon";
import { FeaturedListings, HomeClosing, HomeFaq, HowItWorks, WaysWeHelp } from "./home-sections";
import "./home.css";

// Unsplash, like the property card photos; editorial illustrations, not listing photos.
const unsplash = (id: string, width = 2400) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=80`;
type Theme = "light" | "dark" | "rainbow";
type Photo = { src: string; alt: [string, string] };
// One hero photo per colour theme.
const heroPhotos: Record<Theme, Photo> = {
  light: { src: unsplash("photo-1766603636700-e9d80473f40f"), alt: ["Illustrative photo of a modern two-storey house with timber, glass and a garden lawn", "ภาพประกอบบ้านสองชั้นสไตล์โมเดิร์น ผนังกระจกกรอบไม้ พร้อมสนามหญ้า"] },
  dark: { src: unsplash("photo-1760067537293-6b30141d6a52"), alt: ["Illustrative photo of a modern timber and stone house with palm trees and a lawn", "ภาพประกอบบ้านสไตล์โมเดิร์นผนังไม้และหิน มีต้นปาล์มและสนามหญ้า"] },
  rainbow: { src: unsplash("photo-1760067537640-6ffab10b27d2"), alt: ["Illustrative photo of a two-storey house with a pool, timber deck and sun loungers", "ภาพประกอบบ้านสองชั้นพร้อมสระว่ายน้ำ ระเบียงไม้ และเก้าอี้อาบแดด"] },
};
const cardPhotos: Record<"condo" | "house" | "ai", Photo> = {
  condo: { src: unsplash("photo-1597434604826-83f59b613307", 900), alt: ["Illustrative photo of a bright open-plan dining and kitchen area", "ภาพประกอบมุมรับประทานอาหารและห้องครัวแบบเปิดที่สว่างโปร่ง"] },
  house: { src: unsplash("photo-1656992470123-58162a9e9da6", 900), alt: ["Illustrative photo of a modern concrete house with a carport", "ภาพประกอบบ้านคอนกรีตสไตล์โมเดิร์นพร้อมที่จอดรถ"] },
  ai: { src: unsplash("photo-1783581040348-2bfff0b1559d", 900), alt: ["Illustrative photo of a calm high-rise living room with a city view", "ภาพประกอบห้องนั่งเล่นบนตึกสูงโทนสงบ มองเห็นวิวเมือง"] },
};
// Options match the listing data (city and type values) and the property page's filters.
const cities = ["Bangkok", "Chiang Mai", "Nonthaburi", "Pattaya"];
const types: [string, string][] = [["condo", "Condominium"], ["house", "House"], ["villa", "Villa"]];
const prices = [3000000, 6000000, 10000000, 20000000, 30000000];

export function HomePage() {
  const { t, theme, locale } = useWorkspace();
  const router = useRouter();
  const photo = heroPhotos[theme];
  const [failedPhotos, setFailedPhotos] = useState<string[]>([]);
  const [listings, setListings] = useState<Property[]>([]);
  const [city, setCity] = useState("");
  const [type, setType] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [request, setRequest] = useState("");
  const money = (value: number, compact = false) => new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-US", { style: "currency", currency: "THB", maximumFractionDigits: 0, ...(compact ? { notation: "compact" } : {}) }).format(value);
  const failed = (src: string) => setFailedPhotos(list => [...list, src]);
  const cardImage = (p: Photo) => !failedPhotos.includes(p.src) && <Image src={p.src} alt={t(...p.alt)} fill sizes="(max-width: 900px) 100vw, 33vw" unoptimized onError={() => failed(p.src)} />;

  useEffect(() => {
    const controller = new AbortController();
    fetch("/listings", { signal: controller.signal, cache: "no-store" })
      .then(response => response.ok ? response.json() : [])
      .then((rows: Property[]) => setListings(Array.isArray(rows) ? rows : []))
      .catch(() => { /* The card is optional; the page works without it. */ });
    return () => controller.abort();
  }, []);

  function search(event: FormEvent) {
    event.preventDefault();
    const query = new URLSearchParams();
    if (type) query.set("type", type);
    if (maxPrice) query.set("maxPrice", maxPrice);
    if (city) query.set("city", city);
    router.push(`/properties${query.size ? `?${query}` : ""}`);
  }
  // The AI card fills the request box on the property page; the visitor still presses Match there.
  function askAi(event: FormEvent) {
    event.preventDefault();
    const text = request.trim();
    router.push(`/properties${text ? `?${new URLSearchParams({ request: text })}` : ""}`);
  }
  // Ribbon text is decorative and stays in English in both languages.
  const ribbon = "AI matching  •  English and Thai  •  Real listings  •  Human advisors  •  ";

  return <main id="main-content" className={`home-page ${theme}`}>
    <section className="home-hero">
      {!failedPhotos.includes(photo.src) && <Image key={photo.src} className="home-photo" src={photo.src} alt={t(...photo.alt)} fill sizes="100vw" unoptimized priority onError={() => failed(photo.src)} />}

      {/* A ribbon of what the site offers. It leaves the bottom edge where the grey ribbon of "How it works" enters. */}
      <svg className="home-ribbon" viewBox="0 0 1400 560" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
        {/* The straight start reaches above the drawing, so the ribbon still meets the top edge when the hero grows taller. */}
        <path id="home-ribbon-path" d="M 698 -400 L 700 -40 C 720 150, 820 230, 1000 300 C 1160 365, 1240 450, 1254 640" />
        <text><textPath href="#home-ribbon-path" startOffset="426">{ribbon.repeat(2)}</textPath></text>
      </svg>

      <div className="home-hero-copy">
        <span className="home-eyebrow">{t("Search. Match. Move in.", "ค้นหา จับคู่ แล้วย้ายเข้า")}</span>
        <h1>{t("Find a property", "หาอสังหาฯ ที่ใช่")}<br />{t("that fits ", "สำหรับ")}<em>{t("your life.", "ชีวิตคุณ")}</em></h1>
        <p>{t("Describe the property you want in your own words, the way you would tell a friend. Our AI reads English or Thai and finds the listings that fit, from city condos near the BTS and MRT to family houses and villas with a pool.",
          "บอกอสังหาฯ ที่อยากได้ด้วยคำพูดของคุณเอง AI อ่านได้ทั้งไทยและอังกฤษ แล้วหาประกาศที่ใช่ให้ ตั้งแต่คอนโดใกล้ BTS และ MRT จนถึงบ้านและวิลล่าพร้อมสระว่ายน้ำ")}</p>
        <div className="home-hero-actions">
          <Link href="/properties" className="home-hero-cta">{t("Start AI matching", "เริ่มหาด้วย AI")}<Icon name="arrow" size={16} /></Link>
          <Link href="/contact" className="home-hero-cta home-hero-cta-quiet"><Icon name="chat" size={16} />{t("Talk to an advisor", "คุยกับที่ปรึกษา")}</Link>
        </div>
      </div>

    </section>

    <form className="home-search" onSubmit={search}>
      <div className="home-search-head">
        <h2>{t("Search by filters", "ค้นหาตามตัวกรอง")}</h2>
        <div className="home-search-links">
          <Link href="/graspia" className="home-search-link"><Icon name="sun" size={15} />{t("Graspia solar", "โซลาร์กับ Graspia")}</Link>
          <Link href="/contact" className="home-search-link"><Icon name="chat" size={15} />{t("Talk to an advisor", "คุยกับที่ปรึกษา")}</Link>
        </div>
      </div>
      <div className="home-search-row">
        <label className="home-search-field">
          <span>{t("Looking for", "ประเภท")}</span>
          <span className="home-select"><Icon name="home" size={17} />
            <select value={type} onChange={event => setType(event.target.value)}>
              <option value="">{t("Any property type", "ทุกประเภท")}</option>
              {types.map(([value, en]) => <option key={value} value={value}>{t(en, typeThai[value])}</option>)}
            </select>
          </span>
        </label>
        <label className="home-search-field">
          <span>{t("Max price", "ราคาสูงสุด")}</span>
          <span className="home-select"><span className="home-select-baht" aria-hidden="true">฿</span>
            <select value={maxPrice} onChange={event => setMaxPrice(event.target.value)}>
              <option value="">{t("Any price", "ไม่จำกัดราคา")}</option>
              {prices.map(value => <option key={value} value={value}>{t("Up to ", "ไม่เกิน ")}{money(value, true)}</option>)}
            </select>
          </span>
        </label>
        <label className="home-search-field">
          <span>{t("Location", "ทำเล")}</span>
          <span className="home-select"><Icon name="pin" size={17} />
            <select value={city} onChange={event => setCity(event.target.value)}>
              <option value="">{t("All of Thailand", "ทุกเมือง")}</option>
              {cities.map(value => <option key={value} value={value}>{t(value, cityThai[value])}</option>)}
            </select>
          </span>
        </label>
        <button type="submit" className="home-search-button"><Icon name="search" size={18} />{t("Search properties", "ค้นหาบ้าน")}</button>
      </div>
    </form>

    <section className="home-cards" aria-label={t("Start here", "เริ่มต้นที่นี่")}>
      <Link href="/properties?type=condo" className="home-card">
        {cardImage(cardPhotos.condo)}
        <span className="home-card-pill">{t("View listings", "ดูประกาศ")}</span>
        <span className="home-card-arrow" aria-hidden="true"><Icon name="arrow" size={15} /></span>
        <strong>{t("City", "คอนโด")}<br />{t("condominiums", "ใจกลางเมือง")}</strong>
      </Link>
      <Link href="/properties?type=house" className="home-card">
        {cardImage(cardPhotos.house)}
        <span className="home-card-pill">{t("View listings", "ดูประกาศ")}</span>
        <span className="home-card-arrow" aria-hidden="true"><Icon name="arrow" size={15} /></span>
        <strong>{t("Houses", "บ้านเดี่ยว")}<br />{t("and villas", "และวิลล่า")}</strong>
      </Link>
      <form className="home-card home-card-ai" onSubmit={askAi}>
        {cardImage(cardPhotos.ai)}
        <span className="home-card-pill">{t("Ask our AI", "ถาม AI")}</span>
        <strong>{t("Tell us what", "บอกเราว่า")}<br />{t("you need", "อยากได้แบบไหน")}</strong>
        <span className="home-card-ask">
          <input value={request} onChange={event => setRequest(event.target.value)} maxLength={500}
            placeholder={t("2-bed condo near BTS…", "คอนโด 2 ห้องนอนใกล้ BTS…")} aria-label={t("Describe the home you want", "บอกบ้านที่อยากได้")} />
          <button type="submit">{t("Match me", "หาให้หน่อย")}</button>
        </span>
      </form>
    </section>

    <HowItWorks t={t} example={listings.find(p => p.id === "P001")} locale={locale} />
    <WaysWeHelp t={t} />
    <FeaturedListings t={t} listings={listings} locale={locale} />
    <HomeFaq t={t} />
    <HomeClosing t={t} />
  </main>;
}
