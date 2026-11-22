import type { LeadClassification, LeadRequest } from "@contracts/contracts/leads";

type Copy = [en: string, th: string];

/** Rejection reasons returned by the n8n workflow, in customer-friendly words.
 *  Spam reasons are deliberately not listed, so the filter is harder to work around. */
export const rejectionCopy: Record<string, Copy> = {
  name_missing: ["Please enter your name.", "กรุณากรอกชื่อ"],
  name_invalid: ["Please enter your real name without links.", "กรุณากรอกชื่อจริง ไม่ใส่ลิงก์"],
  contact_missing: ["Please add a phone number or an email so we can reply.", "กรุณาใส่เบอร์โทรหรืออีเมลเพื่อให้เราติดต่อกลับ"],
  contact_invalid: ["That phone number or email does not look valid. Please check it.", "เบอร์โทรหรืออีเมลดูไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง"],
  message_missing: ["Please tell us what you are looking for.", "กรุณาบอกเราว่ากำลังมองหาอะไร"],
  message_too_short: ["Please add a little more detail to your message.", "กรุณาเพิ่มรายละเอียดในข้อความอีกเล็กน้อย"],
  message_too_long: ["Your message is too long. Please keep it under 2,000 characters.", "ข้อความยาวเกินไป กรุณาเขียนไม่เกิน 2,000 ตัวอักษร"],
  message_meaningless: ["Please describe what you are looking for in words.", "กรุณาอธิบายสิ่งที่คุณมองหาเป็นข้อความ"],
  invalid_request: ["Some fields are too long or invalid. Please check the form.", "บางช่องยาวเกินไปหรือไม่ถูกต้อง กรุณาตรวจสอบแบบฟอร์ม"],
};
export const classificationCopy: Record<LeadClassification, { label: Copy; note: Copy }> = {
  hot: { label: ["Hot", "ร้อน"], note: ["Ready to act soon. Team alerted.", "พร้อมตัดสินใจ แจ้งทีมแล้ว"] },
  warm: { label: ["Warm", "อุ่น"], note: ["Real interest, no rush yet.", "สนใจจริง แต่ยังไม่รีบ"] },
  cold: { label: ["Cold", "เย็น"], note: ["Just browsing or few details.", "แค่ดูไว้ หรือข้อมูลน้อย"] },
};

/** Synthetic examples so reviewers can try each path quickly, in the language the site is shown in. No real person's details. */
export const exampleLeads: { key: LeadClassification; label: Copy; lead: [en: LeadRequest, th: LeadRequest] }[] = [
  { key: "hot", label: ["Ready buyer", "ผู้ซื้อพร้อมตัดสินใจ"], lead: [{
    name: "Ploy Example", phone: "089 555 0101", email: "ploy.example.lead@gmail.com", area: "Ari",
    budget: "5.5M", message: "I'd like to view 2-bedroom condos near BTS Ari this weekend. My loan is pre-approved and I can pay a deposit.",
  }, {
    name: "พลอย ตัวอย่าง", phone: "089 555 0101", email: "ploy.example.lead@gmail.com", area: "อารีย์",
    budget: "5.5 ล้าน", message: "อยากนัดดูคอนโด 2 ห้องนอนใกล้ BTS อารีย์ เสาร์อาทิตย์นี้ค่ะ สินเชื่อผ่านการอนุมัติแล้ว พร้อมวางเงินจอง",
  }] },
  { key: "warm", label: ["Family house", "บ้านสำหรับครอบครัว"], lead: [{
    name: "Anan Example", phone: "089 555 0102", area: "Bang Na", budget: "8,000,000",
    message: "We are looking for a 3-bedroom house in Bang Na for our family. What options do you have?",
  }, {
    name: "อนันต์ ตัวอย่าง", phone: "089 555 0102", area: "บางนา", budget: "8,000,000",
    message: "กำลังหาบ้าน 3 ห้องนอนแถวบางนาสำหรับครอบครัวครับ มีตัวเลือกอะไรบ้าง",
  }] },
  { key: "cold", label: ["Just browsing", "แค่ดูไว้ก่อน"], lead: [{
    name: "Mali Example", email: "mali.example.lead@gmail.com",
    message: "Just browsing for now. Maybe I will buy something in a few years.",
  }, {
    name: "มะลิ ตัวอย่าง", email: "mali.example.lead@gmail.com",
    message: "แค่ดูไว้ก่อนค่ะ อาจจะซื้อในอีกไม่กี่ปีข้างหน้า",
  }] },
];
