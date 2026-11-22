"use client";
import type { Property } from "@contracts/domain/property";
import type { MatchResult } from "@contracts/contracts/matching";
import { useEffect, useRef, useState } from "react";
import { PropertyCard } from "@/features/properties/property-card";
import { PropertyDetailBody } from "@/features/properties/property-detail-body";
import { PropertyDetails } from "@/features/properties/property-details";
import { Icon } from "@/ui/icon";
import { SolarPromo } from "@/features/sales/solar-promo";
import "./results-reset.css";
import { useWorkspace } from "@/shell/workspace";
import { cityThai, typeThai } from "@/features/properties/property-presentation";

/** Top of the budget slider; also means "no budget limit". */
const MAX_BUDGET = 30_000_000;

export function PropertyWorkspace() {
  const { locale, t, saved, toggleSaved } = useWorkspace();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [promoOpen, setPromoOpen] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/listings", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Listings unavailable");
        const listings: Property[] = await response.json();
        if (!controller.signal.aborted) setProperties(listings);
      } catch {
        if (!controller.signal.aborted) setLoadError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [reload]);
  const [city, setCity] = useState("");
  const [budget, setBudget] = useState(MAX_BUDGET);
  const [beds, setBeds] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [furnished, setFurnished] = useState(false);
  const [selectedId, setSelectedId] = useState("P001");
  const [tab, setTab] = useState<"all" | "saved">("all");
  const [sort, setSort] = useState("default");
  const [request, setRequest] = useState("");
  // Filters can arrive from the Home page: /properties?city=Bangkok&type=condo&maxPrice=6000000, and the AI card
  // sends ?request=… to fill the request box (the visitor still presses Match, so no AI call happens on arrival).
  useEffect(() => {
    const timer = setTimeout(() => {
      const query = new URLSearchParams(window.location.search);
      const cityParam = query.get("city");
      const typeParam = query.get("type");
      const maxPrice = Number(query.get("maxPrice"));
      const requestParam = query.get("request");
      if (cityParam) setCity(cityParam);
      if (typeParam && ["condo", "house", "villa"].includes(typeParam)) setTypes([typeParam]);
      if (Number.isFinite(maxPrice) && maxPrice >= 1000000) setBudget(Math.min(maxPrice, MAX_BUDGET));
      if (requestParam) setRequest(requestParam.slice(0, 500));
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [matchLanguage, setMatchLanguage] = useState<"en" | "th">("en");
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState("");
  const matchController = useRef<AbortController | null>(null);
  useEffect(() => () => matchController.current?.abort(), []);
  const clearMatch = () => {
    matchController.current?.abort();
    matchController.current = null;
    setMatching(false);
    setMatchResult(null);
    setMatchError("");
  };
  const submitMatch = async () => {
    if (!request.trim() || matching) return;
    clearMatch();
    const controller = new AbortController();
    matchController.current = controller;
    setMatching(true);
    // The text request is the complete search; do not silently apply stale UI filters.
    setCity(""); setBudget(MAX_BUDGET); setBeds(""); setTypes([]); setFurnished(false);
    setTab("all"); setSort("default");
    try {
      const response = await fetch("/match", {
        method: "POST", headers: { "Content-Type": "application/json" },
        // Let the API infer answer language from the query, independently of UI language.
        body: JSON.stringify({ request: request.trim() }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "MATCH_UNAVAILABLE");
      if (!controller.signal.aborted) {
        setMatchResult(result as MatchResult);
        // Match the API's query-language detection, not the workspace menu language.
        setMatchLanguage(/[\u0e00-\u0e7f]/.test(request) ? "th" : "en");
        if (result.matches[0]) setSelectedId(result.matches[0].property.id);
      }
    } catch (error) {
      if (!controller.signal.aborted) setMatchError(error instanceof Error ? error.message : "MATCH_UNAVAILABLE");
    } finally {
      if (!controller.signal.aborted) { setMatching(false); matchController.current = null; }
    }
  };
  const [mobileFilters, setMobileFilters] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const format = (amount: number) =>
    new Intl.NumberFormat(locale === "en" ? "en-US" : "th-TH").format(amount);
  const reset = () => {
    setCity("");
    setBudget(MAX_BUDGET);
    setBeds("");
    setTypes([]);
    setFurnished(false);
    clearMatch();
    setRequest("");
  };
  // Back to the full, unfiltered list: filters, AI results, tab, sort and any filters passed in the URL.
  const resetAll = () => {
    reset();
    setTab("all");
    setSort("default");
    if (window.location.search) window.history.replaceState(null, "", window.location.pathname);
  };
  const hasChanges = !!(city || beds || types.length || furnished || budget !== MAX_BUDGET || matchResult || request || tab !== "all" || sort !== "default");
  const matchingFilters = properties.filter(
    (p) =>
      (!city || p.city === city) &&
      p.price <= budget &&
      (beds === "" || p.bedrooms === Number(beds)) &&
      (!types.length || types.includes(p.type)) &&
      (!furnished || p.furnished),
  );
  const savedResults = matchingFilters.filter((p) => saved.includes(p.id));
  const filtered = tab === "saved" ? savedResults : matchingFilters;
  const exploreCount = matchResult ? matchResult.matches.length : matchingFilters.length;
  // Sort a display copy so Featured can restore the original AI ranking.
  const visible = matchResult ? matchResult.matches.map((match) => match.property) : [...filtered];
  if (sort === "low") visible.sort((a, b) => a.price - b.price);
  if (sort === "high") visible.sort((a, b) => b.price - a.price);
  const selected = visible.find((p) => p.id === selectedId) ?? visible[0];
  const selectedMatch = matchResult?.matches.find((match) => match.property.id === selected?.id);
  const activeFilters =
    Number(!!city) +
    Number(budget < MAX_BUDGET) +
    Number(beds !== "") +
    Number(!!types.length) +
    Number(furnished);
  const sample = () => {
    setRequest(
      t(
        "A 2-bedroom condo near transit, under ฿6M",
        "คอนโด 2 ห้องนอน ใกล้รถไฟฟ้า งบไม่เกิน 6 ล้านบาท",
      ),
    );
    setBeds("2");
    setBudget(6000000);
    setTypes(["condo"]);
    setCity("");
    setFurnished(false);
    clearMatch();
    setTab("all");
  };

  return (
    <main id="main-content" className="property-workspace">
      <aside
        className={`filter-panel ${mobileFilters ? "mobile-open" : ""}`}
        aria-label={t("Property filters", "ตัวกรองอสังหาฯ")}
      >
        <div className="panel-heading">
          <h2>
            <Icon name="filter" size={18} />
            {t("Your preferences", "ความต้องการของคุณ")}
          </h2>
          <button className="text-button" onClick={reset}>
            {t("Reset", "ล้างค่า")}
          </button>
          <button
            className="icon-button mobile-only"
            onClick={() => setMobileFilters(false)}
            aria-label={t("Close filters", "ปิดตัวกรอง")}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="filter-group">
          <label className="filter-label" htmlFor="city">
            <Icon name="pin" size={17} />
            {t("Location", "ทำเล")}
          </label>
          <div className="location-select" style={{ position: "relative" }}>
            <select
              id="city"
              style={{
                appearance: "none",
                WebkitAppearance: "none",
                backgroundImage: "none",
                paddingRight: 52,
              }}
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                clearMatch();
              }}
            >
              <option value="">{t("All of Thailand", "ทุกเมือง")}</option>
              {Object.entries(cityThai).map(([en, th]) => (
                <option key={en} value={en}>
                  {t(en, th)}
                </option>
              ))}
            </select>
            <span
              className="location-select-arrow"
              style={{
                position: "absolute",
                right: 20,
                top: "50%",
                transform: "translateY(-50%) rotate(90deg)",
                display: "flex",
                pointerEvents: "none",
              }}
              aria-hidden="true"
            >
              <Icon name="chevron" size={14} />
            </span>
          </div>
          <p className="field-note">
            {t("Find your favorite neighborhood.", "เลือกย่านที่ใช่สำหรับคุณ")}
          </p>
        </div>
        <div className="filter-group">
          <label className="filter-label" htmlFor="budget">
            ฿ <span>{t("Maximum price", "ราคาสูงสุด")}</span>
          </label>
          <div className="budget-display">
            ฿{format(budget)}
            <span>THB</span>
          </div>
          <input
            id="budget"
            type="range"
            min="1000000"
            max={MAX_BUDGET}
            step="100000"
            value={budget}
            onChange={(e) => {
              setBudget(Number(e.target.value));
              clearMatch();
            }}
          />
          <div className="range-labels">
            <span>฿1M</span>
            <span>฿30M</span>
          </div>
          <div className="budget-presets">
            {[3000000, 6000000, 10000000].map((amount) => (
              <button
                key={amount}
                className={budget === amount ? "selected" : ""}
                onClick={() => {
                  setBudget(amount);
                  clearMatch();
                }}
              >
                ≤ ฿{amount / 1000000}M
              </button>
            ))}
          </div>
        </div>
        <fieldset className="filter-group">
          <legend className="filter-label">
            <Icon name="bed" size={17} />
            {t("Bedrooms", "ห้องนอน")}
          </legend>
          <div className="bed-options">
            {["", "0", "1", "2", "3", "4"].map((value) => (
              <button
                key={value}
                aria-pressed={beds === value}
                className={beds === value ? "selected" : ""}
                onClick={() => {
                  setBeds(value);
                  clearMatch();
                }}
              >
                {value === ""
                  ? t("Any", "ทั้งหมด")
                  : value === "0"
                    ? t("Studio", "สตูดิโอ")
                    : value}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="filter-group">
          <legend className="filter-label">
            <Icon name="home" size={17} />
            {t("Property type", "ประเภทอสังหาฯ")}
          </legend>
          {["condo", "house", "villa"].map((type) => (
            <label className="checkbox-row" key={type}>
              <input
                type="checkbox"
                checked={types.includes(type)}
                onChange={() => {
                  setTypes((current) =>
                    current.includes(type)
                      ? current.filter((v) => v !== type)
                      : [...current, type],
                  );
                  clearMatch();
                }}
              />
              <span>
                {t(
                  type === "condo"
                    ? "Condominium"
                    : type === "house"
                      ? "House"
                      : "Villa",
                  typeThai[type],
                )}
              </span>
              <small>{properties.filter((p) => p.type === type).length}</small>
            </label>
          ))}
        </fieldset>
        <div className="filter-group">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={furnished}
              onChange={(e) => {
                setFurnished(e.target.checked);
                clearMatch();
              }}
            />
            {t("Fully furnished", "มีเฟอร์นิเจอร์")}
          </label>
        </div>
        <div className="sidebar-cards">
        <div className="sidebar-note">
          <span className="soft-icon">
            <Icon name="spark" />
          </span>
          <h3>
            {t("A little help finding the right property.", "ให้การหาอสังหาฯ เป็นเรื่องง่าย")}
          </h3>
          <p>
            {t(
              "Tell us what matters to you. Explore a more personal way to find your next place.",
              "บอกสิ่งที่สำคัญกับคุณ แล้วค้นหาที่อยู่ใหม่ที่เข้ากับชีวิตคุณ",
            )}
          </p>
          <span className="tiny-label">
            {t("AI matching · Preview", "จับคู่ด้วย AI · ตัวอย่าง")}
          </span>
        </div>
        <div className="sidebar-promo property-promo">
          <span className="promo-kicker">{t("FEATURED COLLECTION · DEMO", "คอลเลกชันแนะนำ · ตัวอย่าง")}</span>
          <span className="promo-icon"><Icon name="home" size={25} /></span>
          <h3>{t("A fresh start, within reach.", "เริ่มต้นใหม่ ในงบที่ใช่")}</h3>
          <p>{t("Explore homes up to ฿6M. A little inspiration for your next chapter.", "สำรวจบ้านในงบไม่เกิน 6 ล้านบาท เป็นไอเดียสำหรับก้าวต่อไปของคุณ")}</p>
          <button onClick={() => { setCity(""); setBudget(6000000); setBeds(""); setTypes([]); setFurnished(false); setTab("all"); clearMatch(); setMobileFilters(false); }}>
            {t("Explore collection", "ดูคอลเลกชัน")}<Icon name="arrow" size={16} />
          </button>
        </div>
        </div>
        <button
          className="primary-button mobile-only"
          onClick={() => setMobileFilters(false)}
        >
          {t("Show properties", "แสดงอสังหาฯ")} ({filtered.length})
        </button>
      </aside>
      <section className="property-main">
        <section className="search-hero">
          <div className="eyebrow">
            <span className="eyebrow-line" />
            {t("A PLACE THAT FEELS LIKE YOU", "พื้นที่ที่เป็นตัวคุณ")}
          </div>
          <h1>
            {t("Find the right ", "ค้นหา")}
            <span>{t("property", "อสังหาฯ")}</span>
            {t(" for you.", " ที่ใช่สำหรับคุณ")}
          </h1>
          <p>
            {t(
              "Good spaces. Better possibilities. Let’s find yours.",
              "พื้นที่ดี ๆ กับความเป็นไปได้ใหม่ ๆ เริ่มต้นค้นหาอสังหาฯ ของคุณ",
            )}
          </p>
          <form
            className="ai-search"
            onSubmit={(e) => {
              e.preventDefault();
              void submitMatch();
            }}
          >
            <span className="search-spark">
              <Icon name="spark" size={23} />
            </span>
            <input
              aria-label={t(
                "Describe your ideal property",
                "บอกความต้องการอสังหาฯ ของคุณ",
              )}
              value={request}
              onChange={(e) => {
                setRequest(e.target.value);
                clearMatch();
              }}
              placeholder={t(
                "Describe your ideal property, in your own words…",
                "อยากได้อสังหาฯ แบบไหน ลองเล่าให้เราฟัง…",
              )}
              maxLength={1000}
              required
            />
            <button className="primary-button" type="submit" disabled={matching || !request.trim()}>
              {matching ? t("Finding matches…", "กำลังค้นหา…") : t("Find matches", "ค้นหาด้วย AI")}
              <Icon name="arrow" size={17} />
            </button>
          </form>
          <p className="field-note">{t("AI searches all listings using your text and resets the sidebar filters.", "AI ค้นหาทุกรายการตามข้อความของคุณ โดยล้างตัวกรองด้านข้าง")}</p>
          <div className="search-suggestions">
            <span>{t("Try a little inspiration:", "ลองเริ่มจาก:")}</span>
            <button onClick={sample}>
              {t(
                "2 beds · near transit · under ฿6M",
                "2 ห้องนอน · ใกล้รถไฟฟ้า · ไม่เกิน 6 ล้าน",
              )}
              <Icon name="arrow" size={13} />
            </button>
          </div>
        </section>
        {(loading || loadError) && (
          <div className="empty-state property-load-state" role={loadError ? "alert" : "status"}>
            <p>{loading
              ? t("Loading properties…", "กำลังโหลดอสังหาฯ…")
              : t("Unable to load properties. Please try again.", "โหลดข้อมูลอสังหาฯ ไม่สำเร็จ กรุณาลองอีกครั้ง")}</p>
            {loadError && <button className="text-button" onClick={() => {
              setLoadError(false);
              setLoading(true);
              setReload((value) => value + 1);
            }}>{t("Try again", "ลองอีกครั้ง")}</button>}
          </div>
        )}
        {matching && <div className="demo-notice match-searching" role="status">
          <Icon name="spark" size={19} />
          <span>{t("Finding suitable properties from your request…", "กำลังค้นหาอสังหาฯ ตามความต้องการของคุณ…")}</span>
          <button className="text-button" onClick={clearMatch}>{t("Cancel", "ยกเลิก")}</button>
        </div>}
        {matchError && <div className="demo-notice" role="alert">
          <span>{matchError === "AI_NOT_CONFIGURED"
            ? t("AI matching is not configured yet. You can still browse properties below.", "ยังไม่ได้ตั้งค่า AI คุณยังดูรายการอสังหาฯ ด้านล่างได้")
            : matchError === "RATE_LIMITED"
              ? t("Too many requests. Please wait a minute and try again.", "มีคำขอมากเกินไป กรุณารอสักครู่แล้วลองอีกครั้ง")
              : t("Unable to match properties right now. Please try again. The cards below are regular listings.", "จับคู่ไม่สำเร็จ กรุณาลองอีกครั้ง รายการด้านล่างเป็นรายการทั่วไป")}</span>
          <button className="text-button" onClick={() => void submitMatch()}>{t("Try again", "ลองอีกครั้ง")}</button>
        </div>}
        <div className="results-toolbar">
          <div className="result-tabs">
            <button
              className={tab === "all" ? "active" : ""}
              onClick={() => { setTab("all"); clearMatch(); }}
            >
              {t("Explore properties", "สำรวจอสังหาฯ")}
              <span>{exploreCount}</span>
            </button>
            <button
              className={tab === "saved" ? "active" : ""}
              onClick={() => { setTab("saved"); clearMatch(); }}
            >
              <Icon name="bookmark" size={15} />
              {t("Saved", "บันทึกไว้")}
              <span>{savedResults.length}</span>
            </button>
          </div>
          <button type="button" className="results-reset" onClick={resetAll} disabled={!hasChanges} title={t("Show every listing again", "แสดงประกาศทั้งหมดอีกครั้ง")} aria-label={t("Reset all filters and results", "ล้างตัวกรองและผลค้นหาทั้งหมด")}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
            <span className="results-reset-label">{t("Reset all", "ล้างทั้งหมด")}</span>
          </button>
          <button
            className="icon-button filter-toggle"
            onClick={() => setMobileFilters(true)}
            aria-label={t("Open filters", "เปิดตัวกรอง")}
          >
            <Icon name="filter" />
            {activeFilters > 0 && activeFilters}
          </button>
          <label className="sort-control">
            <span>{t("Sort:", "เรียง:")}</span>
            <select
              aria-label={t("Sort properties", "เรียงอสังหาฯ")}
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
              }}
            >
              <option value="default">{t("Featured", "รายการแนะนำ")}</option>
              <option value="low">
                {t("Price: low to high", "ราคา: ต่ำไปสูง")}
              </option>
              <option value="high">
                {t("Price: high to low", "ราคา: สูงไปต่ำ")}
              </option>
            </select>
          </label>
        </div>
        {matchResult && (
          <div className="demo-notice" role="status">
            <Icon name="spark" />
            <span>
              {matchResult.summary}
              {matchResult.clarification && <><br />{matchResult.clarification}<br />
                {matchLanguage === "th"
                  ? "เพิ่มรายละเอียดเหล่านี้ในข้อความค้นหาด้านบน แล้วค้นหาอีกครั้ง"
                  : "Add these details to your request above, then search again."}
              </>}
            </span>
            <button
              className="icon-button"
              onClick={() => clearMatch()}
              aria-label={t("Show all properties", "แสดงอสังหาฯ ทั้งหมด")}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
        <div className="results-caption" aria-live="polite">
          <span>
            {visible.length}{" "}
            {t(
              visible.length === 1
                ? "place to picture your next chapter"
                : "places to picture your next chapter",
              "พื้นที่สำหรับบทใหม่ของชีวิตคุณ",
            )}
          </span>
          <span>
            {t("Thailand", "ประเทศไทย")} <Icon name="globe" size={13} />
          </span>
        </div>
        <div
          className={`property-results ${visible.length === 1 ? "single-result" : ""}`}
        >
          <div
            className="listing-grid"
            style={!visible.length ? { gridColumn: "1 / -1" } : undefined}
          >
            {visible.map((p, index) => {
              const match = matchResult?.matches.find((entry) => entry.property.id === p.id);
              return (
                <PropertyCard
                  key={p.id}
                  property={p}
                  rank={matchResult ? index + 1 : null}
                  match={match}
                  selected={selected?.id === p.id}
                  saved={saved.includes(p.id)}
                  format={format}
                  onSelect={() => {
                    setSelectedId(p.id);
                    setDetailOpen(window.matchMedia("(max-width: 1050px)").matches);
                  }}
                  onToggleSave={() => toggleSaved(p.id)}
                />
              );
            })}
            {!visible.length && !loading && !loadError && !matchResult && (
              <div className="empty-state">
                <span className="soft-icon">
                  <Icon name="search" size={26} />
                </span>
                <h2>
                  {tab === "saved"
                    ? t(
                        "Your collection starts here",
                        "เริ่มเก็บรายการที่คุณชอบ",
                      )
                    : t(
                        "A little more room to search?",
                        "ลองขยายเงื่อนไขการค้นหา",
                      )}
                </h2>
                <p>
                  {tab === "saved"
                    ? t(
                        "Save a property with the bookmark icon to find it here.",
                        "กดปุ่มบันทึกบนการ์ด เพื่อเก็บอสังหาฯ ที่คุณชอบไว้ที่นี่",
                      )
                    : t(
                        "No properties match these filters. Try another city or budget.",
                        "ไม่มีรายการตรงกับตัวกรอง ลองเปลี่ยนเมืองหรือเพิ่มงบประมาณ",
                      )}
                </p>
                <button
                  className="secondary-button"
                  onClick={() => {
                    reset();
                    setTab("all");
                  }}
                >
                  {t("Explore all properties", "ดูอสังหาฯ ทั้งหมด")}
                  <Icon name="arrow" size={16} />
                </button>
              </div>
            )}
          </div>
          {selected && (
            <PropertyDetails
              open={detailOpen}
              onOpenChange={setDetailOpen}
              label={t("Selected property", "อสังหาฯ ที่เลือก")}
            >
              <PropertyDetailBody
                property={selected}
                match={selectedMatch}
                saved={saved.includes(selected.id)}
                format={format}
                onClose={() => setDetailOpen(false)}
                onToggleSave={() => toggleSaved(selected.id)}
              />
            </PropertyDetails>
          )}
        </div>
        <footer className="workspace-footer">
          <span>WHAT THE PROPERTY</span>
          <span>
            {t(
              "Thoughtfully finding your next place.",
              "ใส่ใจทุกการค้นหาที่อยู่ใหม่ของคุณ",
            )}
          </span>
          <span>
            {t(
              "Listings from database · AI matching on request",
              "ข้อมูลจากฐานข้อมูล · จับคู่ด้วย AI เมื่อค้นหา",
            )}
          </span>
        </footer>
      </section>
      {/* Floating cross-promotion for the Graspia solar assistant; dismissible for this visit. */}
      {promoOpen && <SolarPromo className="floating" href="/graspia" draggable onClose={() => setPromoOpen(false)} />}
    </main>
  );
}
