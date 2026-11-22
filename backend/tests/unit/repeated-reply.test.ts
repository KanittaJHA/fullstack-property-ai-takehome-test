import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repeatsEarlierReply, replySimilarity, REPEATED_REPLY_THRESHOLD } from "../../src/chat/repeated-reply.js";
import { ChatRepository } from "../../src/chat/chat.repository.js";
import { ChatService } from "../../src/chat/chat.service.js";
import type { ChatMessage } from "../../../packages/contracts/src/contracts/chat.js";
const profile = JSON.parse(readFileSync(new URL("../../../data/business-profile.json", import.meta.url), "utf8"));
const msg = (role: ChatMessage["role"], content: string, i = 0): ChatMessage => ({ id: `${role}${i}${content.length}`, role, content, createdAt: "2026-11-16T00:00:00.000Z" });

// Replies recorded in a real "is it worth it?" chat (reply 2 repeated reply 1 after "I still don't get it").
const first = "การติดตั้งระบบโซลาร์เซลล์ช่วยประหยัดค่าไฟได้ครับ อย่างเช่นแพ็กเกจ Home Starter 3kW ราคา 120,000 บาท ประหยัดค่าไฟ 1,500-2,500 บาทต่อเดือน รับประกัน 10 ปี หรือแพ็กเกจ Home Plus 5kW ราคา 185,000 บาท ประหยัดค่าไฟ 3,000-4,500 บาทต่อเดือน รับประกัน 12 ปี ทั้งนี้การประหยัดที่แท้จริงขึ้นอยู่กับการสำรวจหน้างานครับ สนใจรับบริการสำรวจพื้นที่หน้างานฟรีไหมครับ";
const repeat = "การติดตั้งโซลาร์เซลล์ช่วยลดค่าใช้จ่ายด้านไฟฟ้าได้ครับ เช่น แพ็กเกจ Home Starter 3kW ราคา 120,000 บาท ประหยัดค่าไฟ 1,500-2,500 บาทต่อเดือน รับประกัน 10 ปี หรือ Home Plus 5kW ราคา 185,000 บาท ประหยัดค่าไฟ 3,000-4,500 บาทต่อเดือน รับประกัน 12 ปี ตัวเลขประหยัดเป็นช่วงประมาณการและจะขึ้นอยู่กับการสำรวจหน้างานครับ สนใจให้เราจัดเจ้าหน้าที่ไปสำรวจหน้างานให้ฟรีไหมครับ";

test("a near-identical answer to an earlier reply is a repeat", () => {
  assert.ok(replySimilarity(first, repeat) >= REPEATED_REPLY_THRESHOLD);
  assert.equal(repeatsEarlierReply(repeat, [msg("user", "ติดโซลาร์คุ้มไหมครับ"), msg("assistant", first), msg("user", "ยังไม่เข้าใจ ตกลงคุ้มไหม")]), true);
  assert.equal(repeatsEarlierReply("Home Plus 5kW costs 185,000 THB. Would you like a free survey?", [msg("assistant", "Home Plus 5kW costs 185,000 THB. Would you like a free survey?")]), true);
});

test("a different explanation, a different package or the first reply is not a repeat", () => {
  const history = [msg("user", "ติดโซลาร์คุ้มไหมครับ"), msg("assistant", first), msg("user", "ยังไม่เข้าใจ ตกลงคุ้มไหม")];
  assert.equal(repeatsEarlierReply("ความคุ้มขึ้นอยู่กับค่าไฟของบ้านคุณครับ ถ้าค่าไฟสูง ยิ่งประหยัดได้มาก ตอนนี้ค่าไฟเดือนละประมาณเท่าไหร่ครับ", history), false);
  // Same sentence template, different package: new numbers mean new facts.
  assert.equal(repeatsEarlierReply("Home Starter 3kW costs 120,000 THB, saves 1,500-2,500 THB per month and has a 10-year warranty. Would you like a free survey?",
    [msg("assistant", "Home Plus 5kW costs 185,000 THB, saves 3,000-4,500 THB per month and has a 12-year warranty. Would you like a free survey?")]), false);
  assert.equal(repeatsEarlierReply(first, [msg("user", "ติดโซลาร์คุ้มไหมครับ")]), false);
  assert.equal(repeatsEarlierReply("", [msg("assistant", first)]), false);
  // Only the last two assistant replies count.
  assert.equal(repeatsEarlierReply(repeat, [msg("assistant", first, 1), msg("assistant", "a", 2), msg("assistant", "b", 3)]), false);
});

test("the service hands a repeated answer to a person instead of sending it", async () => {
  const dir = mkdtempSync(join(tmpdir(), "graspia-loop-"));
  const repo = new ChatRepository(join(dir, "chat.sqlite"));
  try {
    const replies = [first, repeat];
    const service = new ChatService(repo, async () => profile, async () => ({ reply: replies.shift()!, reason: null, confidence: 0.95 }));
    const c = repo.create("owner");
    const one = await service.send(c.id, "owner", crypto.randomUUID(), "ติดโซลาร์คุ้มไหมครับ");
    assert.equal(one.status, "bot_active");
    const two = await service.send(c.id, "owner", crypto.randomUUID(), "ยังไม่เข้าใจ ตกลงคุ้มไหม");
    assert.equal(two.status, "awaiting_human");
    assert.equal(two.reason, "conversation_loop");
    assert.equal(two.messages.filter(m => m.role === "assistant").length, 1, "the repeated answer is not shown to the customer");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
