import type { Property } from "@contracts/domain/property";
const thai: Record<
  string,
  { title: string; description: string; area: string }
> = {
  P001: {
    title: "คอนโด 2 ห้องนอน ใกล้ BTS อโศก",
    area: "อโศก",
    description:
      "ห้องมุมสว่าง บรรยากาศเหมาะกับครอบครัว พร้อมสระว่ายน้ำและฟิตเนส",
  },
  P002: {
    title: "คอนโด 1 ห้องนอน ย่านทองหล่อ",
    area: "ทองหล่อ",
    description: "ย่านคึกคัก รายล้อมด้วยคาเฟ่และแหล่งบันเทิง เหมาะกับคนโสด",
  },
  P003: {
    title: "บ้านกว้าง 3 ห้องนอน บางนา",
    area: "บางนา",
    description: "ย่านที่พักอาศัยเงียบสงบ มีสวนส่วนตัวและโรงเรียนใกล้เคียง",
  },
  P004: {
    title: "สตูดิโอราคาคุ้มค่า รัชดา",
    area: "รัชดา",
    description:
      "ห้องเริ่มต้นราคาเข้าถึงง่าย เหมาะกับการปล่อยเช่า ใกล้ตลาดกลางคืน",
  },
  P005: {
    title: "คอนโดครอบครัว 3 ห้องนอน พญาไท",
    area: "พญาไท",
    description:
      "ห้องขนาดใหญ่สำหรับครอบครัว ชั้นบนพร้อมวิวเมือง ใกล้แอร์พอร์ตเรลลิงก์",
  },
  P006: {
    title: "พูลวิลล่า 2 ห้องนอน เชียงใหม่",
    area: "หางดง",
    description: "วิวภูเขา สระว่ายน้ำส่วนตัว บรรยากาศสงบ ใกล้โรงเรียนนานาชาติ",
  },
  P007: {
    title: "คอนโด 1 ห้องนอน เมืองเก่าเชียงใหม่",
    area: "เมืองเก่า",
    description: "เดินถึงวัดและตลาด เหมาะกับผู้ทำงานทางไกล",
  },
  P008: {
    title: "บ้านหรู 4 ห้องนอน สุขุมวิท",
    area: "สุขุมวิท",
    description:
      "บ้านระดับพรีเมียม พร้อมลิฟต์ส่วนตัวและระบบสมาร์ตโฮม ในย่านชาวต่างชาติ",
  },
  P009: {
    title: "คอนโด 2 ห้องนอน ราคาคุ้มค่า นนทบุรี",
    area: "บางใหญ่",
    description:
      "คุ้มค่าสำหรับครอบครัว ใกล้ห้างใหญ่และรถไฟฟ้า ในย่านที่กำลังเติบโต",
  },
  P010: {
    title: "คอนโดติดทะเล 2 ห้องนอน พัทยา",
    area: "จอมเทียน",
    description: "วิวทะเล ติดชายหาด เหมาะกับการลงทุนปล่อยเช่าในย่านท่องเที่ยว",
  },
};
export const cityThai: Record<string, string> = {
  Bangkok: "กรุงเทพฯ",
  "Chiang Mai": "เชียงใหม่",
  Nonthaburi: "นนทบุรี",
  Pattaya: "พัทยา",
};
export const typeThai: Record<string, string> = {
  condo: "คอนโด",
  house: "บ้าน",
  villa: "วิลล่า",
};
export const localizedProperty = (p: Property, locale: "en" | "th") =>
  locale === "th" ? { ...p, ...thai[p.id], city: cityThai[p.city] } : p;

export function propertyDescription(p: Property, locale: "en" | "th") {
  const local = localizedProperty(p, locale);
  if (locale === "th") {
    const rooms = p.bedrooms === 0 ? "รูปแบบสตูดิโอ" : `${p.bedrooms} ห้องนอน`;
    return `${local.description} พื้นที่ ${p.size_sqm} ตร.ม. ${rooms} พร้อม ${p.bathrooms} ห้องน้ำ ตั้งอยู่ในย่าน${local.area} ${local.city} ${p.furnished ? "มีเฟอร์นิเจอร์ให้แล้ว" : "ไม่มีเฟอร์นิเจอร์ สามารถเลือกตกแต่งในสไตล์ของคุณเอง"}`;
  }
  const rooms =
    p.bedrooms === 0
      ? "a studio layout"
      : `${p.bedrooms} bedroom${p.bedrooms === 1 ? "" : "s"}`;
  return `${local.description} Set in ${p.area}, ${p.city}, this ${p.size_sqm} m² property offers ${rooms} and ${p.bathrooms} bathroom${p.bathrooms === 1 ? "" : "s"}. ${p.furnished ? "Furnishings are included." : "Offered unfurnished, with room to make it your own."}`;
}
// Editorial illustrations only; original listing data stays unchanged.
const photos: Record<string, string> = {
  P001: "photo-1600210492486-724fe5c67fb0",
  P002: "photo-1522708323590-d24dbb6b0267",
  P003: "photo-1600596542815-ffad4c1539a9",
  P004: "photo-1502672260266-1c1ef2d93688",
  P005: "photo-1600607687920-4e2a09cf159d",
  P006: "photo-1613490493576-7fde63acd811",
  P007: "photo-1493809842364-78817add7ffb",
  P008: "photo-1600607687939-ce8a6c25118c",
  P009: "photo-1484154218962-a197022b5858",
  P010: "photo-1512917774080-9991f1c4c750",
};
/** Editorial photo for a listing ID (same image as its card). */
export function propertyPhoto(p: Property) {
  return `https://images.unsplash.com/${photos[p.id]}?auto=format&fit=crop&w=1000&q=85`;
}
