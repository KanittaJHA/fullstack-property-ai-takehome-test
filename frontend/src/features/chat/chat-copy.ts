import type { ChatMessage, Conversation } from "@contracts/contracts/chat";
type Translate = (en: string, th: string) => string;
const queued = [
  "This conversation is queued for the sales team. The AI has stopped replying. You may leave additional details or a preferred contact. A person will follow up when available; no appointment or payment is confirmed.",
  "ส่งบทสนทนาให้ทีมฝ่ายขายแล้ว ผู้ช่วย AI หยุดตอบ คุณฝากข้อความหรือข้อมูลติดต่อเพิ่มเติมได้ เจ้าหน้าที่จะเข้ามาดูแลต่อเมื่อพร้อม ยังไม่มีการยืนยันนัดหรือรับชำระเงิน",
];
/** System notices the backend writes when staff take over or close a conversation. */
export const TAKEOVER_NOTICE = "A sales specialist has taken over / เจ้าหน้าที่รับช่วงดูแลแล้ว";
export const CLOSED_NOTICE = "Conversation closed / ปิดบทสนทนาแล้ว";

export function isHandoverNotice(message: ChatMessage) {
  return message.role === "system" && queued.includes(message.content);
}

// Keep the handover card in the language used when the conversation was handed over.
export function handoverTranslator(messages: ChatMessage[], fallback: Translate): Translate {
  const notice = messages.find(isHandoverNotice);
  const source = notice ?? messages.findLast(message => message.role === "user");
  if (!source) return fallback;
  const thai = /[\u0e00-\u0e7f]/.test(source.content);
  return (en, th) => thai ? th : en;
}

/** The language the customer is writing in: their latest message that contains letters
 * (Thai script → Thai, otherwise Latin → English). Before any message, the interface language. */
export function conversationLanguage(messages: ChatMessage[], fallback: "en" | "th"): "en" | "th" {
  for (const message of [...messages].reverse()) {
    if (message.role !== "user") continue;
    if (/[\u0e00-\u0e7f]/.test(message.content)) return "th";
    if (/[a-z]/i.test(message.content)) return "en";
  }
  return fallback;
}

// Text of the "waiting for the sales team" card, shared by the customer chat and /admin.
export const handoverNoticeCopy = {
  title: ["Awaiting a sales representative", "อยู่ระหว่างรอเจ้าหน้าที่ฝ่ายขาย"],
  body: ["Your request has been forwarded to our sales team. You may provide additional details while awaiting a response.", "ส่งคำขอให้ทีมฝ่ายขายแล้ว คุณสามารถฝากข้อความเพิ่มเติมได้ระหว่างรอ"],
} as const;

/** Translates only notices the application wrote; real chat content is shown as written. */
export function messageLabel(message: ChatMessage, t: Translate) {
  if (message.role === "user" && message.content === "Please connect me to a human / ขอคุยกับเจ้าหน้าที่")
    return t("I’d like to speak with your team.", "ขอคุยกับเจ้าหน้าที่");
  if (message.role !== "system") return message.content;
  // The backend selects the notice language from the user's message.
  // Keep that language even when the interface is set to a different locale.
  if (message.content === queued[0]) return "Your conversation is waiting for our sales team. You can leave a message or contact details while you wait.";
  if (message.content === queued[1]) return "ส่งเรื่องให้ทีมฝ่ายขายแล้ว ระหว่างรอเจ้าหน้าที่ คุณสามารถฝากข้อความหรือข้อมูลติดต่อไว้ได้";
  if (message.content === CLOSED_NOTICE) return t("This conversation has been closed.", "บทสนทนานี้ปิดแล้ว");
  if (message.content === TAKEOVER_NOTICE) return t("A sales specialist has joined the conversation.", "เจ้าหน้าที่ฝ่ายขายเข้ามาดูแลบทสนทนาแล้ว");
  return message.content;
}

/** Message time as shown in both chats, e.g. "10:05 AM" or "10:05 น.". */
export function formatMessageTime(iso: string, locale: "en" | "th") {
  const time = new Date(iso).toLocaleTimeString(locale === "th" ? "th-TH" : "en-US", { hour: "2-digit", minute: "2-digit", hour12: locale !== "th" });
  return locale === "th" ? `${time} น.` : time;
}

export function conversationTitle(conversation: Conversation, t: Translate) {
  const text = conversation.title ?? conversation.messages.find(m => m.role === "user")?.content;
  if (!text) return t("New chat", "แชตใหม่");
  if (["Please connect me to a human / ขอคุยกับเจ้าหน้าที่", "ขอคุยกับเจ้าหน้าที่", "I’d like to speak with your team."].includes(text))
    return t("Speak with our team", "ติดต่อเจ้าหน้าที่");
  return text.replace(/\s+/g, " ").trim().slice(0, 120);
}

// Readable text for error codes from the chat API and client. Says whether retrying can help;
// raw codes are not shown to people (they stay on the element as data-error-code).
export function chatErrorMessage(code: string, t: Translate): { text: string; retry: boolean } {
  switch (code) {
    case "MESSAGE_LIMIT": return { retry: false, text: t("This conversation has reached its message limit. Please start a new conversation.", "บทสนทนานี้มีข้อความครบจำนวนสูงสุดแล้ว กรุณาเริ่มบทสนทนาใหม่") };
    case "CONVERSATION_LIMIT": return { retry: false, text: t("You have reached the maximum number of conversations. Delete an older conversation to start a new one.", "คุณมีบทสนทนาครบจำนวนสูงสุดแล้ว กรุณาลบบทสนทนาเก่าก่อนเริ่มใหม่") };
    case "CONVERSATION_CLOSED": return { retry: false, text: t("This conversation is closed. Please start a new conversation.", "บทสนทนานี้ปิดแล้ว กรุณาเริ่มบทสนทนาใหม่") };
    case "NOT_FOUND": return { retry: false, text: t("This conversation is no longer available.", "ไม่พบบทสนทนานี้แล้ว") };
    case "SESSION_REQUIRED": case "UNAUTHORIZED": return { retry: false, text: t("Your session has expired. Please reload the page.", "เซสชันหมดอายุ กรุณาโหลดหน้าใหม่") };
    case "RATE_LIMITED": return { retry: true, text: t("Too many requests. Please wait a moment and try again. Your draft is kept.", "มีคำขอมากเกินไป กรุณารอสักครู่แล้วลองอีกครั้ง ข้อความที่พิมพ์ยังอยู่") };
    case "TURN_IN_PROGRESS": return { retry: true, text: t("A reply is still being prepared. Please wait a moment and try again.", "กำลังเตรียมคำตอบอยู่ กรุณารอสักครู่แล้วลองอีกครั้ง") };
    case "REVISION_CONFLICT": case "INVALID_TRANSITION": case "REQUEST_ID_CONFLICT": return { retry: true, text: t("This conversation was just updated. Please check the latest messages and try again.", "บทสนทนาเพิ่งมีการเปลี่ยนแปลง กรุณาตรวจสอบข้อความล่าสุดแล้วลองอีกครั้ง") };
    case "INVALID_REQUEST": case "INVALID_REQUEST_ID": case "INVALID_READ_RECEIPT": return { retry: true, text: t("The request could not be processed. Please check your message and try again.", "ไม่สามารถดำเนินการคำขอได้ กรุณาตรวจสอบข้อความแล้วลองอีกครั้ง") };
    default: return { retry: true, text: t("The service is temporarily unavailable. Your draft is kept; please try again.", "ระบบไม่พร้อมใช้งานชั่วคราว ข้อความที่พิมพ์ยังอยู่ กรุณาลองอีกครั้ง") };
  }
}
