import type { ChatMessage as Message } from "@contracts/contracts/chat";
import { Icon } from "@/ui/icon";
import { CLOSED_NOTICE, formatMessageTime, handoverNoticeCopy, isHandoverNotice, messageLabel } from "@/features/chat/chat-copy";

type Translate = (en: string, th: string) => string;
type Receipt = { text: string; read: boolean } | null;

/** One entry in the customer's chat thread: a handover notice, a status event, or a message bubble. */
export function ChatMessage({ message, receipt, locale, t, handoverText }: {
  message: Message;
  receipt: Receipt;
  locale: "en" | "th";
  t: Translate;
  /** Translates handover wording into the language the customer is chatting in. */
  handoverText: Translate;
}) {
  const time = <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt, locale)}</time>;

  if (isHandoverNotice(message)) return (
    <div className="handover-event">
      <span className="handover-icon" aria-hidden="true">
        <Icon name="clock" size={18} />
      </span>
      <div>
        <h3>{handoverText(...handoverNoticeCopy.title)}</h3>
        <p>{handoverText(...handoverNoticeCopy.body)}</p>
        {time}
      </div>
    </div>
  );

  if (message.role === "system") {
    const closed = message.content === CLOSED_NOTICE;
    // The closed notice is interface text and follows the UI language; other notices follow the customer's language.
    const translate = closed ? t : handoverText;
    return (
      <div className={`sales-system-event ${closed ? "resolved" : "active"}`}>
        <Icon name={closed ? "check" : "user"} size={17} />
        <div>
          <span className="sales-system-event-label">{translate("Status", "สถานะ")}</span>
          <p>{messageLabel(message, translate)}</p>
          {time}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`message-row ${message.role === "user" ? "user" : "assistant"}`}
      data-read-id={message.role === "human" || message.role === "assistant" ? message.id : undefined}
    >
      <span className={`message-avatar ${message.role === "user" ? "customer-avatar" : message.role === "human" ? "staff-avatar" : ""}`}>
        {/* Staff replies get a person icon so they are not mistaken for the AI assistant. */}
        {message.role === "user" ? "W" : <Icon name={message.role === "human" ? "user" : "sun"} size={17} />}
      </span>
      <div className="message-content">
        <span className="message-author">
          {message.role === "assistant" ? "SunPro Assistant" : message.role === "human" ? t("Sales specialist", "เจ้าหน้าที่ฝ่ายขาย") : t("You", "คุณ")}
        </span>
        <div className="message-bubble">{messageLabel(message, t)}</div>
        <span className="message-meta">
          {receipt && (
            <span style={{ marginInlineEnd: 10, whiteSpace: "nowrap" }}>
              <span aria-hidden="true">{receipt.read ? "✓✓ " : "✓ "}</span>
              {receipt.text}
            </span>
          )}
          {formatMessageTime(message.createdAt, locale)}
        </span>
      </div>
    </div>
  );
}
