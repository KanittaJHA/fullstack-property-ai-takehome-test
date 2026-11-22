import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { productFactErrors } from "../../src/chat/product-facts.js";
import { ChatRepository } from "../../src/chat/chat.repository.js";
import { ChatService } from "../../src/chat/chat.service.js";
const profile = JSON.parse(readFileSync(new URL("../../../data/business-profile.json", import.meta.url), "utf8"));
const good = "Home Plus 5kW ราคา 185,000 บาท ประหยัด 3,000–4,500 บาทต่อเดือน รับประกัน 12 ปี";
const bad = good.replace("4,500", "4,000");
test("checks catalog values instead of capping savings at the customer's bill", () => {
  assert.deepEqual(productFactErrors(profile, "Home Plus 5kW costs 185,000 THB. Actual savings depend on the site survey.", ""), []);
  assert.ok(productFactErrors(profile, "Home Plus 5kW และ Home Starter 3kW ทั้งสองแพ็กเกจรับประกัน 10 และ 12 ปีตามลำดับ", "").some(error => error.startsWith("AMBIGUOUS_WARRANTY")));
  assert.deepEqual(productFactErrors(profile, good, "ค่าไฟ 4000 บาท"), []);
  assert.deepEqual(productFactErrors(profile, bad, "ค่าไฟ 4000 บาท"), ["SAVINGS:Home Plus 5kW"]);
  assert.deepEqual(productFactErrors(profile, "Home Starter 3kW ราคา 185000 บาท รับประกัน 12 ปี ส่วน " + good, ""), ["PRICE:Home Starter 3kW", "WARRANTY:Home Starter 3kW"]);
  assert.deepEqual(productFactErrors(profile, good, "เปรียบเทียบ Home Starter 3kW กับ Home Plus 5kW"), ["MISSING_PRODUCT:Home Starter 3kW"]);
  assert.deepEqual(productFactErrors(profile, "Home Plus 5kW ประหยัด 4000 บาทต่อเดือน", ""), ["SAVINGS_RANGE_REQUIRED:Home Plus 5kW"]);
});
test("accepts correct savings ranges whatever the word order; still rejects wrong ones", () => {
  for (const reply of [
    "แพ็กเกจ Home Plus 5kW ราคา 185,000 บาท ประหยัดค่าไฟต่อเดือน 3,000-4,500 บาท และรับประกัน 12 ปีครับ",
    "Home Plus 5kW costs 185,000 THB with monthly savings of 3,000 to 4,500 THB and a 12-year warranty.",
    "Home Plus 5kW ราคา 185,000 บาท ประหยัดเดือนละ 3,000–4,500 บาท ติดตั้ง 1-2 วัน รับประกัน 12 ปี",
  ]) assert.deepEqual(productFactErrors(profile, reply, ""), [], reply);
  assert.deepEqual(productFactErrors(profile, "Home Plus 5kW ประหยัดค่าไฟต่อเดือน 3,000-5,000 บาท", ""), ["SAVINGS:Home Plus 5kW"]);
  assert.deepEqual(productFactErrors(profile, "Home Plus 5kW monthly savings of 2,000 to 4,500 THB", ""), ["SAVINGS:Home Plus 5kW"]);
});
for (const repaired of [true, false]) {
  test(`invalid drafts are not saved; correction succeeds=${repaired}`, async () => {
    const repo = new ChatRepository(":memory:");
    let calls = 0;
    try {
      const service = new ChatService(repo, async () => profile, async (_profile, _messages, correction) => {
        calls++;
        if (calls === 2) { assert.deepEqual(correction?.errors, ["SAVINGS:Home Plus 5kW"]); assert.ok(correction!.timeoutMs <= 20000); }
        return { reply: calls === 2 && repaired ? good : bad, reason: null, confidence: .95 };
      });
      const chat = repo.create("owner");
      const requestId = randomUUID();
      const text = "บ้านมีแอร์ 3 เครื่อง ค่าไฟ 4000 บาท แนะนำอะไร";
      const result = await service.send(chat.id, "owner", requestId, text);
      assert.equal(calls, 2);
      assert.equal(result.messages.some(m => m.role === "assistant" && m.content === bad), false);
      assert.equal(result.status, repaired ? "bot_active" : "awaiting_human");
      if (repaired) assert.equal(result.messages.at(-1)?.content, good);
      else assert.equal(result.reason, "uncertain");
      await service.send(chat.id, "owner", requestId, text);
      assert.equal(calls, 2);
    } finally { repo.close(); }
  });
}

test("replies may not promise that solar is definitely or very worth it", () => {
  const claims = (reply: string) => productFactErrors(profile, reply, "ติดโซลาร์คุ้มไหมครับ").filter(error => error.startsWith("UNSUPPORTED_VALUE_CLAIM"));
  for (const reply of [
    "การติดโซลาร์เซลล์จะคุ้มค่ามากครับ โดยจะช่วยประหยัดค่าไฟได้ในระยะยาว",
    "ติดแล้วคุ้มแน่นอนครับ",
    "คุ้มชัวร์ครับ",
    "Solar is definitely worth it for your home.",
    "It will pay for itself within a few years.",
  ]) assert.equal(claims(reply).length, 1, reply);
  for (const reply of [
    "ความคุ้มค่าขึ้นอยู่กับค่าไฟฟ้าในแต่ละเดือนของคุณครับ ค่าไฟยิ่งมากยิ่งคุ้มมากขึ้น",
    "Whether it is worth it depends on your electricity bill and the site survey.",
    "ไม่ทราบว่าค่าไฟเดือนละประมาณเท่าไหร่ครับ",
  ]) assert.equal(claims(reply).length, 0, reply);
});

test("savings ranges must be a package's published range, never merged across packages", () => {
  const unpublished = (reply: string) => productFactErrors(profile, reply, "ลงทุนติดโซลาร์แล้วจะได้ทุนคืนไหมครับ").filter(error => error.startsWith("UNPUBLISHED_SAVINGS_RANGE"));
  for (const reply of [
    "การประหยัดค่าไฟจะอยู่ที่ประมาณ 1,500-9,000 บาทต่อเดือนขึ้นอยู่กับขนาดแพ็กเกจ",
    "Solar can save you about 1,500-9,000 THB a month depending on the package.",
    "ประหยัดได้ 2,000-3,000 บาทต่อเดือน",
    "โซลาร์ช่วยลดค่าไฟได้ 1,500-9,000 บาทต่อเดือน",
  ]) assert.equal(unpublished(reply).length, 1, reply);
  for (const reply of [
    "Home Starter 3kW ราคา 120,000 บาท ประหยัด 1,500-2,500 บาทต่อเดือน รับประกัน 10 ปี",
    "บ้านค่าไฟสูง เช่น Home Plus 5kW ประหยัดได้ประมาณ 3,000-4,500 บาทต่อเดือน",
    "Business 10kW saves 6,000-9,000 THB per month.",
    "ช่วยประหยัดได้ครับ ถ้าค่าไฟของคุณประมาณ 3,000-4,000 บาทต่อเดือน แนะนำให้สำรวจหน้างานฟรี",
    "If your bill is 3,000-4,000 THB a month, a survey will confirm the savings.",
  ]) assert.equal(unpublished(reply).length, 0, reply);
});
