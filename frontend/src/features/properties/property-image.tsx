"use client";
import type { Property } from "@contracts/domain/property";
import Image from "next/image";
import { useState } from "react";
import { Icon } from "@/ui/icon";
import { useWorkspace } from "@/shell/workspace";
import { propertyPhoto } from "@/features/properties/property-presentation";

/** Illustrative listing photo with a labelled fallback when it cannot load. */
export function PropertyImage({
  property,
  large = false,
}: {
  property: Property;
  large?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const { t } = useWorkspace();
  return failed ? (
    <div className="image-fallback">
      <Icon name="home" size={44} />
      <span>{t("Image unavailable", "ไม่สามารถโหลดรูปได้")}</span>
    </div>
  ) : (
    <Image
      src={propertyPhoto(property)}
      alt={t(
        "Illustrative interior or architecture photo, not the actual property",
        "ภาพประกอบการตกแต่งหรือสถาปัตยกรรม ไม่ใช่ภาพทรัพย์จริง",
      )}
      width={large ? 1000 : 600}
      height={large ? 720 : 430}
      unoptimized
      loading={
        large || property.id === "P001" || property.id === "P002"
          ? "eager"
          : "lazy"
      }
      onError={() => setFailed(true)}
      className="property-image"
    />
  );
}
