import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { ChatRepository } from "../../src/chat/chat.repository.js";
import { ChatService } from "../../src/chat/chat.service.js";
import { expectedReplyLanguage, languageOf, replyLanguageErrors } from "../../src/chat/reply-language.js";
import type { ChatMessage } from "../../../packages/contracts/src/contracts/chat.js";
const profile = JSON.parse(readFileSync(new URL("../../../data/business-profile.json", import.meta.url), "utf8"));
const user = (content: string): ChatMessage => ({ id: randomUUID(), role: "user", content, createdAt: "" });

test("question language ignores product names and quotes; neutral turns continue the previous language", () => {
  assert.equal(languageOf("สนใจ Home Plus 5kW ครับ"), "th");
  assert.equal(languageOf("Hi, what's the price of Home Plus 5kW?"), "en");
  assert.equal(languageOf('What does "ประหยัดค่าไฟ" mean for Home Plus?'), "en");
  assert.equal(languageOf("5kW?"), "en");
  assert.equal(languageOf("185,000?"), null);
  assert.equal(expectedReplyLanguage([user("Home Plus ราคาเท่าไหร่"), user("120,000?")]), "th");
  assert.equal(expectedReplyLanguage([user("ราคาเท่าไหร่"), user("And the warranty?")]), "en");
});

test("a reply in the wrong language is flagged", () => {
  assert.deepEqual(replyLanguageErrors("th", "I cannot change product prices."), ["LANGUAGE:reply in Thai"]);
  assert.deepEqual(replyLanguageErrors("en", "Home Plus 5kW ราคา 185,000 บาท"), ["LANGUAGE:reply in English"]);
  assert.deepEqual(replyLanguageErrors("th", "Home Plus 5kW ราคา 185,000 บาท"), []);
  assert.deepEqual(replyLanguageErrors(null, "anything"), []);
});

test("wrong-language drafts are regenerated, never saved", async () => {
  for (const repaired of [true, false]) {
    const repo = new ChatRepository(":memory:");
    const english = "Home Plus 5kW costs 185,000 THB. Would you like a free site survey?";
    const thai = "Home Plus 5kW ราคา 185,000 บาท สนใจนัดสำรวจหน้างานฟรีไหมครับ";
    let calls = 0;
    try {
      const service = new ChatService(repo, async () => profile, async (_profile, _messages, correction) => {
        calls++;
        if (calls === 2) assert.deepEqual(correction?.errors, ["LANGUAGE:reply in Thai"]);
        return { reply: calls === 2 && repaired ? thai : english, reason: null, confidence: .95 };
      });
      const chat = repo.create("owner");
      const result = await service.send(chat.id, "owner", randomUUID(), "Home Plus 5kW ราคาเท่าไหร่");
      assert.equal(calls, 2);
      assert.equal(result.messages.some(m => m.content === english), false);
      if (repaired) assert.equal(result.messages.at(-1)?.content, thai);
      else assert.equal(result.reason, "uncertain");
    } finally { repo.close(); }
  }
});
