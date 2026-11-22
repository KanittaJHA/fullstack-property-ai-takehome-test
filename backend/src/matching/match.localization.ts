// Presentation-only translations; matching continues to use original catalog values.
const thaiNames: Record<string, string> = {
  bangkok: "กรุงเทพฯ", "chiang mai": "เชียงใหม่", nonthaburi: "นนทบุรี", pattaya: "พัทยา",
  condo: "คอนโด", house: "บ้าน", villa: "วิลล่า",
  asok: "อโศก", thonglor: "ทองหล่อ", "bang na": "บางนา",
  "huai khwang": "ห้วยขวาง", "phaya thai": "พญาไท",
  "phrom phong": "พร้อมพงษ์", "bang yai": "บางใหญ่",
};

export const thaiMatchName = (value: string): string => thaiNames[value.trim().toLowerCase()] ?? value;

export function thaiTransit(value: string): string {
  if (value.trim().toLowerCase() === "none") return "ไม่มีข้อมูลรถไฟฟ้าใกล้เคียง";
  const match = /^(BTS|MRT)\s+(.+?)\s*\((\d+(?:\.\d+)?)\s*(km|m)\)$/i.exec(value.trim());
  if (!match) return value;
  const [, network, station, distance, unit] = match;
  return `${network.toUpperCase()} ${thaiMatchName(station)} (${distance} ${unit.toLowerCase() === "km" ? "กิโลเมตร" : "เมตร"})`;
}
