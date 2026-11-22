"use client";
import "./header-responsive.css";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useMemo,
  useEffect,
  useState,
  useRef,
  useSyncExternalStore,
} from "react";
import { Icon } from "@/ui/icon";
import { recordPath } from "./navigation-history";
import { readSaved, subscribeSaved, toggleSaved, serverSaved, parseSaved } from "@/features/properties/saved-properties";
type Locale = "en" | "th";
type Theme = "light" | "dark" | "rainbow";
let currentTheme: Theme = "dark";
function readTheme(): Theme {
  try {
    const saved = localStorage.getItem("property-theme");
    if (saved === "light" || saved === "dark" || saved === "rainbow")
      return saved;
  } catch {
    /* Theme switching still works when storage is unavailable. */
  }
  return currentTheme;
}
function subscribeTheme(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("property-theme-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("property-theme-change", callback);
  };
}
function setTheme(theme: Theme) {
  currentTheme = theme;
  try {
    localStorage.setItem("property-theme", theme);
  } catch {
    /* Use the in-memory choice. */
  }
  window.dispatchEvent(new Event("property-theme-change"));
}
const serverTheme = (): Theme => "dark";
const WorkspaceContext = createContext<{
  theme: Theme;
  setTheme: (theme: Theme) => void;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  saved: string[];
  toggleSaved: (id: string) => void;
} | null>(null);
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, serverTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme =
      theme === "dark" ? "dark" : "light";
  }, [theme]);
  const [locale, setLocale] = useState<Locale>("en");
  const savedSnapshot = useSyncExternalStore(subscribeSaved, readSaved, serverSaved);
  const saved = useMemo(() => parseSaved(savedSnapshot), [savedSnapshot]);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return (
    <WorkspaceContext.Provider
      value={{
        theme,
        setTheme,
        locale,
        setLocale,
        saved,
        toggleSaved,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}
export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("WorkspaceProvider is required");
  return {
    ...context,
    t: (en: string, th: string) => (context.locale === "en" ? en : th),
  };
}
export function Header() {
  const headerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const wideScreen = window.matchMedia("(min-width: 1441px)");
    const onResize = () => { if (wideScreen.matches) setMenuOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    wideScreen.addEventListener("change", onResize);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      wideScreen.removeEventListener("change", onResize);
    };
  }, [menuOpen]);
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const syncHeight = () => document.documentElement.style.setProperty("--site-header-height", `${header.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(syncHeight);
    observer.observe(header);
    syncHeight();
    return () => observer.disconnect();
  }, []);
  const pathname = usePathname();
  useEffect(() => { recordPath(pathname); }, [pathname]);
  const { locale, setLocale, theme, setTheme, t } = useWorkspace();
  return (
    <>
    <header ref={headerRef} className={`site-header${pathname === "/contact" ? " over-hero glass-bar" : ""}`}>
      {pathname === "/graspia" ? (
        <Link className="brand graspia-header-brand" href="/graspia" aria-label="Graspia by What The Property" onClick={(event) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          window.dispatchEvent(new Event("graspia-welcome"));
        }}>
          <span className="graspia-header-mark"><Icon name="spark" size={27} /></span>
          <span className="graspia-header-wordmark">
            <span className="graspia-header-name">graspia<span>.</span></span>
            <span className="graspia-header-byline">by what the property.</span>
          </span>
        </Link>
      ) : <Link className="brand" href="/" aria-label="What The Property">
        <span className="brand-mark">
          <Icon name="home" size={23} />
        </span>
        <span>
          what the
          <span className="brand-second">
            property<span className="brand-dot">.</span>
          </span>
        </span>
      </Link>}
      <div className="compact-header-actions">
        <label className="compact-theme-switch">
          <Icon name={theme === "dark" ? "moon" : theme === "rainbow" ? "rainbow" : "sun"} size={20} />
          <select aria-label={t("Color theme", "ธีมสี")} value={theme} onChange={(event) => setTheme(event.target.value as Theme)}>
            <option value="light">{t("Light", "สว่าง")}</option>
            <option value="dark">{t("Dark", "มืด")}</option>
            <option value="rainbow">{t("Rainbow", "สีรุ้ง")}</option>
          </select>
        </label>
        <div className="workspace-avatar" aria-label={t("Personal workspace", "พื้นที่ทำงานส่วนตัว")}>W</div>
      <button
        ref={menuButtonRef}
        type="button"
        className="header-menu-toggle"
        aria-expanded={menuOpen}
        aria-controls="header-menu"
        aria-label={menuOpen ? t("Close menu", "ปิดเมนู") : t("Open menu", "เปิดเมนู")}
        onClick={() => setMenuOpen((open) => !open)}
      >
        {menuOpen ? <Icon name="close" size={22} /> : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>
      </div>
      <div id="header-menu" className={`header-menu${menuOpen ? " is-open" : ""}`}>
      <nav onClick={(event) => { if ((event.target as Element).closest("a")) setMenuOpen(false); }} className="main-nav" aria-label={t("Main navigation", "เมนูหลัก")}>
        <Link href="/" className={pathname === "/" ? "active" : ""} aria-current={pathname === "/" ? "page" : undefined}>
          <Icon name="home" size={17} />{t("Home", "หน้าแรก")}
        </Link>
        <Link
          href="/properties"
          className={pathname === "/properties" ? "active" : ""}
          aria-current={pathname === "/properties" ? "page" : undefined}
        >
          <Icon name="search" size={17} />
          {t("Property matching", "ค้นหาอสังหาฯ")}
        </Link>
        <Link
          href="/graspia"
          className={pathname === "/graspia" ? "active" : ""}
          aria-current={pathname === "/graspia" ? "page" : undefined}
        >
          <Icon name="chat" size={17} />
          {t("Graspia sales", "ฝ่ายขาย Graspia")}
        </Link>
        <Link href="/contact" className={pathname === "/contact" ? "active" : ""} aria-current={pathname === "/contact" ? "page" : undefined}>
          <Icon name="send" size={17} />{t("Contact", "ติดต่อเรา")}
        </Link>
        <Link href="/leads" className={pathname === "/leads" ? "active" : ""} aria-current={pathname === "/leads" ? "page" : undefined}>
          <Icon name="grid" size={17} />{t("Leads", "ลีด")}
        </Link>
        <Link href="/admin" className={pathname === "/admin" ? "active" : ""} aria-current={pathname === "/admin" ? "page" : undefined}>
          <Icon name="shield" size={17} />{t("Admin", "แอดมิน")}
        </Link>
      </nav>
      <div className="header-right">
        <label className="theme-switch">
          <span
            aria-hidden="true"
            style={{
              display: "flex",
              flexShrink: 0,
              color: theme === "rainbow" ? "var(--blue)" : "inherit",
            }}
          >
            <Icon
              name={
                theme === "dark"
                  ? "moon"
                  : theme === "rainbow"
                    ? "rainbow"
                    : "sun"
              }
              size={16}
              strokeWidth={2.5}
            />
          </span>
          <select
            aria-label={t("Color theme", "ธีมสี")}
            style={{ outline: "none", boxShadow: "none" }}
            value={theme}
            onChange={(event) => setTheme(event.target.value as Theme)}
          >
            <option value="light">{t("Light", "สว่าง")}</option>
            <option value="dark">{t("Dark", "มืด")}</option>
            <option value="rainbow">{t("Rainbow", "สีรุ้ง")}</option>
          </select>
        </label>
        <span className="preview-pill">
          <span style={{ backgroundColor: "#32b76b" }} />
          {t("Workspace", "พื้นที่ทำงาน")}
        </span>
        <div className="language-switch" aria-label={t("Language", "ภาษา")}>
          <Icon name="globe" size={17} />
          <button
            onClick={() => setLocale("en")}
            aria-pressed={locale === "en"}
            className={locale === "en" ? "selected" : ""}
          >
            EN
          </button>
          <span>/</span>
          <button
            onClick={() => setLocale("th")}
            aria-pressed={locale === "th"}
            className={locale === "th" ? "selected" : ""}
          >
            ไทย
          </button>
        </div>
        <div
          className="workspace-avatar"
          aria-label={t("Personal workspace", "พื้นที่ทำงานส่วนตัว")}
        >
          W
        </div>
      </div>
      </div>
    </header>
    </>
  );
}
