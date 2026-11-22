import type { RefObject } from "react";
import type { ChatStatus } from "@contracts/contracts/chat";
import { Icon } from "@/ui/icon";
import profile from "@/demo/business-profile";

type Translate = (en: string, th: string) => string;

/** The side panel beside the chat: conversation status, business facts, packages and the human team. */
export function SalesContextPanel({ t, open, isEmptyChat, status, handover, closed, requestDisabled, closeRef, onClose, onRequestHuman }: {
  t: Translate;
  open: boolean;
  isEmptyChat: boolean;
  status: ChatStatus | undefined;
  handover: boolean;
  closed: boolean;
  requestDisabled: boolean;
  closeRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onRequestHuman: () => void;
}) {
  return (
    <aside
      id="sales-context-panel"
      aria-label={t("Business information and conversation details", "ข้อมูลธุรกิจและรายละเอียดบทสนทนา")}
      className={`sales-context ${open ? "context-open" : ""}`}
    >
      <div className="panel-heading">
        <div className="context-heading-copy">
          <h2>{isEmptyChat ? t("Information & services", "ข้อมูลและบริการ") : t("Conversation details", "รายละเอียดบทสนทนา")}</h2>
          <p>{isEmptyChat
            ? t("Explore solar packages, service areas, and ways to contact our team.", "ดูแพ็กเกจโซลาร์ พื้นที่ให้บริการ และช่องทางติดต่อทีมงาน")
            : t("Follow conversation status, explore solar packages, and find service hours and contact details when you’re ready to speak with us.", "ติดตามสถานะการสนทนา ดูแพ็กเกจโซลาร์และรายละเอียดบริการ พร้อมเวลาทำการและช่องทางติดต่อเมื่อคุณต้องการพูดคุยกับทีมงาน")}</p>
        </div>
        <button className="icon-button context-toggle" ref={closeRef} type="button" onClick={onClose} aria-label={t("Close details", "ปิดรายละเอียด")}>
          <Icon name="close" size={18} />
        </button>
      </div>
      {!isEmptyChat && <div className="context-section">
        <span className="tiny-label">{t("CONVERSATION STATUS", "สถานะการสนทนา")}</span>
        {/* One card per lifecycle state, matching the chat header. */}
        <div className={`status-card ${closed ? "closed" : status === "human_active" ? "human" : handover ? "waiting" : ""}`}>
          <Icon name={closed ? "check" : status === "human_active" ? "user" : handover ? "clock" : "spark"} size={21} />
          <div>
            <strong>
              {closed
                ? t("Conversation closed", "ปิดบทสนทนาแล้ว")
                : status === "human_active"
                  ? t("A sales specialist is helping you", "เจ้าหน้าที่ฝ่ายขายกำลังดูแลคุณ")
                  : handover
                    ? t("Waiting for the sales team", "รอเจ้าหน้าที่ฝ่ายขาย")
                    : t("Chatting with AI", "กำลังคุยกับ AI")}
            </strong>
            <small>
              {closed
                ? t("Start a new conversation for another question", "เริ่มบทสนทนาใหม่หากมีคำถามเพิ่มเติม")
                : handover
                  ? t("AI replies are paused", "ผู้ช่วย AI หยุดตอบแล้ว")
                  : t("Answers from business knowledge", "ตอบจากข้อมูลธุรกิจ")}
            </small>
          </div>
        </div>
      </div>}
      <div className="context-section">
        <span className="tiny-label">{t("BUSINESS KNOWLEDGE", "ข้อมูลธุรกิจ")}</span>
        <div className="knowledge-heading">
          <span className="sun-avatar"><Icon name="sun" size={19} /></span>
          <div>
            <h3>SunPro Solar</h3>
            <p>{t("Rooftop solar installation", "บริการติดตั้งโซลาร์รูฟท็อป")}</p>
          </div>
        </div>
        <p className="context-description">
          {t("From your first question to your free site survey. Solar made simple.", "จากคำถามแรกสู่การสำรวจหน้างานฟรี ให้โซลาร์เป็นเรื่องง่าย")}
        </p>
        <div className="context-fact">
          <Icon name="pin" size={16} />
          <span>{t("Bangkok & surrounding provinces", "กรุงเทพฯ และจังหวัดโดยรอบ")}</span>
        </div>
        <div className="context-fact">
          <Icon name="clock" size={16} />
          <span>{t("Mon–Sat, 09:00–18:00", "จันทร์–เสาร์ 09:00–18:00")}</span>
        </div>
      </div>
      <div className="context-section">
        <span className="tiny-label">{t("SOLAR PACKAGES", "แพ็กเกจโซลาร์")}</span>
        {profile.products.map((product) => (
          <div className="solar-package" key={product.name}>
            <div className="package-symbol"><Icon name="sun" size={19} /></div>
            <div>
              <h3>{product.name}</h3>
              <p>{t(`${product.warranty_years}-year warranty`, `รับประกัน ${product.warranty_years} ปี`)}</p>
            </div>
            <strong>฿{(product.price_thb / 1000).toFixed(0)}k</strong>
          </div>
        ))}
      </div>
      <div className="context-section">
        <span className="tiny-label">{t("YOUR HUMAN CONNECTION", "ทีมที่พร้อมรับช่วงต่อ")}</span>
        <div className="human-contact">
          <div className="human-avatar">N</div>
          <div>
            <strong>{profile.human_team.sales_contact}</strong>
            <p>{t("Sales specialist", "ผู้เชี่ยวชาญฝ่ายขาย")}</p>
          </div>
        </div>
        <p className="field-note">
          {t("The sales team follows up when available during business hours.", "ทีมฝ่ายขายจะติดต่อต่อเมื่อพร้อมในเวลาทำการ")}
        </p>
        <div className="human-support-card">
          <div className="human-support-hours"><Icon name="clock" size={17} /><div><strong>{t("Team availability", "เวลารับช่วงของทีม")}</strong><span>{profile.human_team.handover_hours}</span></div></div>
          <h3>{t("A person, when you need one.", "มีคนช่วย ในเวลาที่คุณต้องการ")}</h3>
          <p>{t("For a custom quote or a question that needs extra care, ask our sales team.", "หากต้องการใบเสนอราคาเฉพาะหรือมีคำถามที่ต้องดูแลเพิ่มเติม ขอให้ทีมฝ่ายขายรับช่วงดูแลได้")}</p>
          <button disabled={requestDisabled} onClick={onRequestHuman}>
            <Icon name={handover ? "check" : "user"} size={16} />
            {handover ? t("Sent to sales team", "ส่งต่อทีมฝ่ายขายแล้ว") : t("Request a human", "ขอคุยกับเจ้าหน้าที่")}
          </button>
          <small>{t("Your conversation appears in the team inbox", "บทสนทนาจะปรากฏในกล่องข้อความของทีม")}</small>
        </div>
      </div>
    </aside>
  );
}
