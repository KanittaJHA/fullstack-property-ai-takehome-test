"use client";
import type { Property } from "@contracts/domain/property";
import { MatchReason } from "@/features/properties/match-reason";
import { MatchStatus } from "@/features/properties/match-status";
import { PropertyImage } from "@/features/properties/property-image";
import { localizedProperty, typeThai } from "@/features/properties/property-presentation";
import { useWorkspace } from "@/shell/workspace";
import { Icon } from "@/ui/icon";

/** One listing in the results grid. `rank` is shown after an AI match; `match` adds its status and reason. */
export function PropertyCard({ property, rank, match, selected, saved, format, onSelect, onToggleSave }: {
  property: Property;
  rank: number | null;
  match: { reason: string; alternative?: boolean } | undefined;
  selected: boolean;
  saved: boolean;
  format: (amount: number) => string;
  onSelect: () => void;
  onToggleSave: () => void;
}) {
  const { t, locale } = useWorkspace();
  const local = localizedProperty(property, locale);
  return (
    <article
      className={`property-card ${selected ? "is-selected" : ""}`}
    >
      <button
        className="card-select"
        onClick={onSelect}
        aria-label={`${t("View", "ดูรายละเอียด")} ${local.title}`}
        aria-pressed={selected}
      >
        <div className="card-image-wrap">
          <PropertyImage property={property} />
          <span className="type-badge">
            {t(
              property.type === "condo"
                ? "Condo"
                : property.type === "house"
                  ? "House"
                  : "Villa",
              typeThai[property.type],
            )}
          </span>
          {rank !== null && (
            <span className="rank-badge">0{rank}</span>
          )}
          <span className="image-credit">
            {t("Illustrative photo", "ภาพประกอบ")}
          </span>
        </div>
        <div className="card-content">
          <MatchStatus alternative={match?.alternative} />
          <p className="card-location">
            <Icon name="pin" size={13} />
            {local.area}, {local.city}
          </p>
          <h3>{local.title}</h3>
          <div className="card-facts">
            <span>
              <Icon name="bed" size={15} />
              {property.bedrooms === 0
                ? t("Studio", "สตูดิโอ")
                : `${property.bedrooms} ${t(property.bedrooms === 1 ? "bed" : "beds", "นอน")}`}
            </span>
            <span>
              <Icon name="bath" size={15} />
              {property.bathrooms}{" "}
              {t(property.bathrooms === 1 ? "bath" : "baths", "น้ำ")}
            </span>
            <span>
              <Icon name="size" size={14} />
              {property.size_sqm} {t("m²", "ตร.ม.")}
            </span>
          </div>
          <div className="card-bottom">
            <strong>฿{format(property.price)}</strong>
            <span>{t("For sale", "ขาย")}</span>
          </div>
        </div>
      </button>
      {match && <MatchReason
        text={match.reason}
        propertyTitle={local.title}
      />}
      <button
        className={`save-button ${saved ? "is-saved" : ""}`}
        aria-label={
          saved
            ? t("Unsave property", "เลิกบันทึก")
            : t("Save property", "บันทึกอสังหาฯ")
        }
        aria-pressed={saved}
        onClick={onToggleSave}
      >
        <Icon name="bookmark" size={17} />
      </button>
    </article>
  );
}
