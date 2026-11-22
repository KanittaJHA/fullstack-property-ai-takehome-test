import { Icon } from "@/ui/icon";

type Translate = (en: string, th: string) => string;

/** Bottom of the conversation sidebar: the assistant's promise, a package promo and the connected business. */
export function SidebarCards({ t, busy, onExplorePackages }: { t: Translate; busy: boolean; onExplorePackages: () => void }) {
  return <>
    <div className="sidebar-cards">
      <div className="sidebar-note sales-note">
        <Icon name="shield" size={24} />
        <h3>{t("Helpful. Honest. Human-aware.", "ช่วยเหลือ จริงใจ รู้จังหวะส่งต่อ")}</h3>
        <p>{t("Answers grounded in your business. A human takes over when it matters.", "ตอบจากข้อมูลธุรกิจ และให้คนรับช่วงต่อในเวลาที่เหมาะสม")}</p>
      </div>
      <div className="sidebar-promo solar-promo">
        <span className="promo-kicker">{t("SUNPRO SPOTLIGHT", "แนะนำจาก SUNPRO")}</span>
        <span className="promo-icon"><Icon name="sun" size={25} /></span>
        <h3>{t("Make room for brighter days.", "เริ่มต้นวันใหม่ด้วยพลังงานสะอาด")}</h3>
        <p>{t("Explore solar packages for your home or business, with a free site survey to help you get started.", "สำรวจแพ็กเกจโซลาร์สำหรับบ้านหรือธุรกิจ พร้อมบริการสำรวจหน้างานฟรีเพื่อช่วยคุณเริ่มต้น")}</p>
        <button disabled={busy} onClick={onExplorePackages}>
          {t("Explore solar packages", "ดูแพ็กเกจโซลาร์")}<Icon name="arrow" size={16} />
        </button>
      </div>
    </div>
    <div className="connected-business">
      <span className="sun-avatar"><Icon name="sun" size={21} /></span>
      <div>
        <strong>SunPro Solar</strong>
        <small>{t("Sample business", "ธุรกิจตัวอย่าง")}</small>
      </div>
    </div>
  </>;
}
