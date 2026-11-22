import type { ChatMessage } from "../../../packages/contracts/src/contracts/chat.js";

/** A new reply this similar to an earlier one (and adding no new numbers) means the bot is
 * going in circles. Measured on real chats: a repeated "is it worth it?" answer scored 0.80,
 * while replies in normal conversations stayed at or below 0.50. */
export const REPEATED_REPLY_THRESHOLD = 0.7;

const normalize = (text: string) => text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
const numbers = (text: string) => new Set(text.replace(/(\d),(?=\d{3}\b)/g, "$1").match(/\d+(?:\.\d+)?/g) ?? []);

function bigrams(text: string) {
  const counts = new Map<string, number>();
  const value = normalize(text);
  for (let i = 0; i < value.length - 1; i++) {
    const pair = value.slice(i, i + 2);
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }
  return counts;
}

/** Dice similarity of character pairs: works for Thai, which has no spaces between words. */
export function replySimilarity(a: string, b: string): number {
  const left = bigrams(a), right = bigrams(b);
  let shared = 0, total = 0;
  for (const [pair, count] of left) { shared += Math.min(count, right.get(pair) ?? 0); total += count; }
  for (const count of right.values()) total += count;
  return total ? (2 * shared) / total : 0;
}

/** True when the reply restates one of the last two assistant replies without new facts.
 * Different packages share wording but not numbers (price, savings, warranty), so a reply that
 * introduces any new number is never treated as a repeat. */
export function repeatsEarlierReply(reply: string, messages: ChatMessage[]): boolean {
  if (!reply.trim()) return false;
  const replyNumbers = numbers(reply);
  return messages.filter(message => message.role === "assistant").slice(-2).some(earlier => {
    const earlierNumbers = numbers(earlier.content);
    const nothingNew = [...replyNumbers].every(value => earlierNumbers.has(value));
    return nothingNew && replySimilarity(reply, earlier.content) >= REPEATED_REPLY_THRESHOLD;
  });
}
