import type { ChatMessage } from "../../../packages/contracts/src/contracts/chat.js";

export type ReplyLanguage = "th" | "en";

/** Main language of a text; quoted passages do not count. Null when it has no letters (e.g. "5kW?"). */
export function languageOf(text: string): ReplyLanguage | null {
  const plain = text.replace(/"[^"]*"|“[^”]*”|'[^']{2,}'|‘[^’]*’/g, " ");
  const thai = plain.match(/[ก-๛]/g)?.length ?? 0;
  const latin = plain.match(/[a-z]/gi)?.length ?? 0;
  if (!thai && !latin) return null;
  // Thai words carry more meaning per letter than product names such as "Home Plus 5kW".
  return thai >= latin * 0.3 ? "th" : "en";
}

/** The language of the customer's latest question; language-neutral turns continue the previous one. */
export function expectedReplyLanguage(messages: ChatMessage[]): ReplyLanguage | null {
  for (const message of messages.filter(m => m.role === "user").reverse()) {
    const language = languageOf(message.content);
    if (language) return language;
  }
  return null;
}

export function replyLanguageErrors(expected: ReplyLanguage | null, reply: string): string[] {
  const actual = languageOf(reply);
  return expected && actual && actual !== expected ? [`LANGUAGE:reply in ${expected === "th" ? "Thai" : "English"}`] : [];
}
