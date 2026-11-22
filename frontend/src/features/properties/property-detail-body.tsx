"use client";
import type { Property } from "@contracts/domain/property";
import { MatchReason } from "@/features/properties/match-reason";
import { MatchStatus } from "@/features/properties/match-status";
import { PropertyImage } from "@/features/properties/property-image";
import { localizedProperty, propertyDescription, typeThai } from "@/features/properties/property-presentation";
import { useWorkspace } from "@/shell/workspace";
import { Icon } from "@/ui/icon";

/** The selected listing in full: photo, facts, description, AI reason and save action. */
export function PropertyDetailBody({ property, match, saved, format, onClose, onToggleSave }: {
  property: Property;
  match: { reason: string; alternative?: boolean } | undefined;
  saved: boolean;
  format: (amount: number) => string;
  onClose: () => void;
  onToggleSave: () => void;
}) {
  const { t, locale } = useWorkspace();
  const local = localizedProperty(property, locale);
  return <>
    <div className="detail-topline">
      <span className="tiny-label">
        {t("A CLOSER LOOK", "รู้จักพื้นที่นี้ให้มากขึ้น")}
      </span>
      <button
        className="icon-button mobile-detail-close"
        onClick={onClose}
        aria-label={t("Close details", "ปิดรายละเอียด")}
      >
        <Icon name="close" size={18} />
      </button>
      <span className="detail-id">{property.id}</span>
    </div>
    <div className="detail-image">
      <PropertyImage property={property} large />
      <span className="image-credit">
        {t("Illustrative photo · Unsplash", "ภาพประกอบ · Unsplash")}
      </span>
    </div>
    <div className="detail-body">
      <MatchStatus alternative={match?.alternative} />
      <div className="detail-category">
        <span className="sale-dot" style={{ backgroundColor: "#32b76b" }} />
        {t("AVAILABLE FOR SALE", "ประกาศขาย")}
        <span>{t(property.type, typeThai[property.type])}</span>
      </div>
      <h2>{local.title}</h2>
      <p className="card-location">
        <Icon name="pin" size={15} />
        {local.area},{" "}
        {local.city}
      </p>
      <div className="detail-price">
        ฿{format(property.price)}
        <small>THB</small>
      </div>
      <div className="detail-stats">
        <div>
          <Icon name="bed" />
          <strong>
            {property.bedrooms || t("Studio", "สตูดิโอ")}
          </strong>
          <span>{t("Bedrooms", "ห้องนอน")}</span>
        </div>
        <div>
          <Icon name="bath" />
          <strong>{property.bathrooms}</strong>
          <span>{t("Bathrooms", "ห้องน้ำ")}</span>
        </div>
        <div>
          <Icon name="size" />
          <strong>{property.size_sqm}</strong>
          <span>{t("Square meters", "ตารางเมตร")}</span>
        </div>
      </div>
      <h3 className="section-label">
        {t("About this place", "เกี่ยวกับอสังหาฯ นี้")}
      </h3>
      <p className="detail-description">
        {propertyDescription(property, locale)}
      </p>
      <div className="feature-chips">
        <span>
          <Icon name="train" size={15} />
          {property.near_transit === "none"
            ? t(
                "No nearby rail listed",
                "ไม่มีข้อมูลรถไฟฟ้าใกล้เคียง",
              )
            : property.near_transit}
        </span>
        <span>
          <Icon name="check" size={15} />
          {property.furnished
            ? t("Furnished", "มีเฟอร์นิเจอร์")
            : t("Unfurnished", "ไม่มีเฟอร์นิเจอร์")}
        </span>
      </div>
      {match?.reason ? <MatchReason
        key={property.id}
        text={match?.reason}
        propertyTitle={local.title}
        variant="detail"
      /> : <div className="detail-insight">
        <Icon name="spark" size={20} />
        <div>
          <h3>{t("Find a property that fits your needs", "ค้นหาอสังหาฯ ที่เหมาะกับคุณ")}</h3>
          <p>{t(
            "Describe your ideal property above and select Find matches to see which properties fit your needs and why.",
            "บอกความต้องการอสังหาฯ ในช่องด้านบน แล้วกดค้นหาด้วย AI เพื่อดูอสังหาฯ ที่ตรงกับคุณพร้อมเหตุผล",
          )}</p>
        </div>
      </div>}
      <button
        className={`primary-button full-width ${saved ? "saved-primary" : ""}`}
        onClick={onToggleSave}
      >
        <Icon
          name={saved ? "check" : "bookmark"}
          size={17}
        />
        {saved
          ? t("Saved to your collection", "บันทึกในรายการโปรดแล้ว")
          : t("Save this property", "บันทึกอสังหาฯ นี้")}
      </button>
      <p className="detail-footnote">
        {t(
          "Sample listing data · Photos are illustrative",
          "ข้อมูลตัวอย่าง · รูปไม่ใช่ภาพทรัพย์จริง",
        )}
      </p>
    </div>
  </>;
}
