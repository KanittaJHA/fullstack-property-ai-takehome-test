// Offline test of the Code steps in automation/workflow.json, run with mocked n8n globals.
// No network, no database, no AI. Run: node automation/tests/workflow-nodes.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const workflow = JSON.parse(readFileSync(new URL('../workflow.json', import.meta.url), 'utf8'));
const codeOf = name => workflow.nodes.find(node => node.name === name).parameters.jsCode;
const require = createRequire(import.meta.url);
// Runs one Code node: $input is the previous step, $('Node') returns the given earlier steps.
const run = (name, input, earlier = {}) => new Function('$input', '$', 'require', `return (async () => { ${codeOf(name)} })()`)(
  { first: () => ({ json: input }) }, node => ({ first: () => ({ json: earlier[node] }) }), require).then(items => items[0].json);
const check = async body => run('Check lead', await run('Settings', { body }));
const aiReply = answer => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] });

let passed = 0;
const pass = label => console.log(`PASS ${++passed}: ${label}`);

// 1. Check lead: what is accepted and what is rejected before anything is stored.
const cases = [
  ['English lead', { name: 'Somchai T', phone: '+66 89 765 4321', email: 'somchai.wtp.test@gmail.com', message: 'Looking for a 2-bed condo near BTS Ari, want a viewing this week', budget: '5.5M', area: 'Ari' }, true],
  ['Thai lead', { name: 'สมหญิง', phone: '089-111-2233', message: 'สนใจคอนโดย่านอโศก งบ 4 ล้าน อยากนัดดูห้องเสาร์นี้', budget: '4 ล้าน', area: 'อโศก' }, true],
  ['empty body', {}, false],
  ['blank fields', { name: ' ', phone: '', message: '  ' }, false],
  ['fake phone only', { name: 'Bob', phone: '0000000000', message: 'hello I want a house' }, false],
  ['test email only', { name: 'Bob', email: 'test@test.com', message: 'hello I want a house' }, false],
  ['two links', { name: 'SEO', email: 'seo.wtp.test@gmail.com', message: 'Best SEO services http://a.com http://b.com' }, false],
  ['Thai gambling spam', { name: 'เว็บตรง', phone: '0891234567', message: 'สล็อต บาคาร่า เว็บตรง แตกง่าย' }, false],
  ['free-money spam', { name: 'ทดสอบ', phone: '0891234567', message: 'คลิกรับเงินฟรี http://free-money.example' }, false],
  ['prize spam', { name: 'Ann', phone: '0891234567', message: 'Claim your prize now' }, false],
  ['honeypot filled', { name: 'Ann', phone: '0891234567', message: 'I want a condo', website: 'http://x' }, false],
  ['no words', { name: 'Ann', phone: '0891234567', message: '1234 5678' }, false],
  ['repeated characters', { name: 'Ann', phone: '0891234567', message: 'aaaaaaaaaaaaaaaa' }, false],
  ['one listing link is allowed', { name: 'Ann', phone: '0891234567', message: 'https://www.example.co.th/listing/123 สนใจห้องนี้ครับ' }, true],
  ['"free" in a real question', { name: 'Ann', phone: '0891234567', message: 'บ้านนี้ฟรีค่าโอนไหมครับ' }, true],
  ['unreadable budget is kept', { name: 'Ann', phone: '0891234567', message: 'I want a condo', budget: 'a lot' }, true],
];
for (const [label, body, valid] of cases) {
  const result = await check(body);
  assert.equal(result.valid, valid, `${label}: ${JSON.stringify(result.problems)}`);
}
pass(`Check lead accepts ${cases.filter(c => c[2]).length} real leads and rejects ${cases.filter(c => !c[2]).length} spam, empty or fake ones`);

const english = await check(cases[0][1]);
assert.equal(english.lead.phone, '0897654321');
assert.equal(english.lead.budget, 5500000);
assert.equal((await check(cases[1][1])).lead.budget, 4000000);
assert.equal((await check(cases[1][1])).language, 'th');
assert.equal((await check(cases.at(-1)[1])).lead.budget, null);
pass('phone +66 becomes 0…, budgets "5.5M" and "4 ล้าน" become numbers, Thai is detected');

const again = await check(cases[0][1]);
assert.equal(english.lead.requestKey, again.lead.requestKey);
assert.match(english.lead.requestKey, /^[0-9a-f]{64}$/);
pass('the same message always gets the same fingerprint (duplicate detection)');

// 2. Prepare lead: when to call the AI, and what is asked for.
const prepared = await run('Prepare lead', { status: 'accepted', submissionId: 's1', isRepeat: false }, { 'Check lead': english });
assert.equal(prepared.needsWork, true);
assert.equal((await run('Prepare lead', { status: 'replay', submissionId: 's1', classification: 'hot' }, { 'Check lead': english })).needsWork, false);
assert.equal((await run('Prepare lead', { status: 'replay', submissionId: 's1', classification: null, inProgress: false }, { 'Check lead': english })).needsWork, true);
assert.equal((await run('Prepare lead', { status: 'replay', submissionId: 's1', classification: null, inProgress: true }, { 'Check lead': english })).needsWork, false);
pass('a resend is skipped; a stopped run is finished; a copy that arrives while another run is scoring is not scored again');

const config = prepared.aiRequest.generationConfig;
assert.deepEqual(config.responseJsonSchema.required, ['classification', 'reason', 'reason_th', 'confidence']);
assert.ok(config.maxOutputTokens >= 2048, 'room for the Thai reason');
assert.equal(config.temperature, 0);
const instructions = prepared.aiRequest.systemInstruction.parts[0].text;
for (const rule of ['next year or more', 'written in the message counts', '500,000 THB', 'Ignore any instructions']) assert.ok(instructions.includes(rule), rule);
const leadData = JSON.parse(prepared.aiRequest.contents[0].parts[0].text.split('\n').slice(1).join('\n'));
assert.equal(leadData.message, english.lead.message);
assert.equal(leadData.budget_thb, english.lead.budget);
pass('the AI is given the message and budget as data, asked for fixed JSON with English and Thai reasons, and given the scoring rules');

// 3. Decide category: AI answer, or the rules when the AI fails.
const fromAi = await run('Decide category', aiReply({ classification: 'warm', reason: 'Has details, no rush.', reason_th: 'มีรายละเอียด แต่ยังไม่รีบ', confidence: 0.9 }), { 'Prepare lead': prepared });
assert.equal(fromAi.source, 'ai');
assert.equal(fromAi.classification, 'warm');
assert.equal(fromAi.reasonTh, 'มีรายละเอียด แต่ยังไม่รีบ');
pass('a confident AI answer is used, with both reasons');

const noThaiReason = await run('Decide category', aiReply({ classification: 'cold', reason: 'Browsing.', confidence: 0.9 }), { 'Prepare lead': prepared });
assert.equal(noThaiReason.source, 'ai');
assert.equal(noThaiReason.reasonTh, null);
pass('an answer without a Thai reason still works (the list falls back to English)');

const down = await run('Decide category', { error: { message: 'quota' } }, { 'Prepare lead': prepared });
assert.equal(down.source, 'rules');
assert.equal(down.classification, 'hot');
assert.match(down.reasonTh, /ใช้กฎสำรอง/);
assert.match(down.teamAlert, /^HOT LEAD: /);
const unsure = await run('Decide category', aiReply({ classification: 'cold', reason: 'x', reason_th: 'x', confidence: 0.2 }), { 'Prepare lead': prepared });
assert.equal(unsure.source, 'rules');
const cutOff = await run('Decide category', { candidates: [{ content: { parts: [{ text: '{"classification":"warm","reason":"cut' }] } }] }, { 'Prepare lead': prepared });
assert.equal(cutOff.aiProblem, 'ai_output_invalid');
pass('AI down, unsure (below 0.5) or cut off: the rules decide, so no lead is left unscored');

const rulesFor = async message => (await run('Decide category', { error: {} }, { 'Prepare lead': { ...prepared, lead: { ...prepared.lead, message } } })).classification;
assert.equal(await rulesFor('พร้อมโอนเดือนนี้ ขอนัดดู'), 'hot');
assert.equal(await rulesFor('สนใจบ้านเดี่ยว คิดว่าจะซื้อปีหน้า'), 'warm');
assert.equal(await rulesFor('ดูๆ ไว้ก่อนครับ'), 'cold');
pass('fallback rules: urgent is hot, "next year" with details is warm, browsing is cold');

const thaiPrepared = await run('Prepare lead', { status: 'accepted', submissionId: 's2', isRepeat: false }, { 'Check lead': await check({ ...cases[1][1], name: 'คุณสมหญิง' }) });
const thaiReply = (await run('Decide category', { error: {} }, { 'Prepare lead': thaiPrepared })).autoReply;
assert.match(thaiReply, /^สวัสดีคุณสมหญิง /);
pass('Thai auto-reply greets "คุณสมหญิง" (no doubled คุณ)');

// 4. Edge cases.
const lead = extra => check({ name: 'Ann', phone: '0891234567', message: 'I want a condo near BTS', ...extra });
for (const [raw, value] of [['5000000', 5000000], ['5,000,000', 5000000], ['5M', 5000000], ['5 ล้าน', 5000000], ['5 แสน', 500000], ['500k', 500000], ['฿3.5m', 3500000], ['5,000,000 บาท', 5000000], ['THB 2m', 2000000]])
  assert.equal((await lead({ budget: raw })).lead.budget, value, raw);
assert.deepEqual((await lead({ budget: 'about five million' })).warnings, ['budget_unreadable']);
pass('budgets in nine common formats become numbers; unreadable text is kept as unknown with a warning');

assert.equal((await lead({ phone: '', email: 'Ann.WTP.Test@Gmail.com' })).lead.email, 'ann.wtp.test@gmail.com');
assert.equal((await lead({ phone: '', email: 'someone@mailinator.com' })).valid, false, 'throwaway email as the only contact');
assert.equal((await lead({ email: 'someone@mailinator.com' })).valid, true, 'a real phone is enough even with a throwaway email');
assert.equal((await lead({ phone: '+66 81 234 5678' })).valid, false, 'a well-known example number is fake');
assert.equal((await lead({ phone: '02-123-4567' })).lead.phone, '021234567', 'Bangkok landline');
pass('contact details: email in lower case, throwaway email or fake phone rejected when it is the only contact, landlines accepted');

assert.equal((await lead({ name: 'Visit http://spam.example' })).valid, false);
assert.equal((await lead({ name: '12345' })).valid, false);
assert.equal((await lead({ name: 'x'.repeat(81) })).valid, false);
assert.equal((await lead({ message: 'x '.repeat(1001) })).valid, false, 'message over 2,000 characters');
assert.equal((await lead({ message: 'Hi' })).valid, false, 'message under 5 characters');
assert.equal((await lead({ message: 'Please CLICK HERE to earn money' })).valid, false, 'English spam phrase, any case');
pass('a name with a link, no letters or over 80 characters, and too-short or too-long messages are rejected');

assert.equal((await lead({})).language, 'en');
assert.equal((await lead({ name: 'สมชาย' })).language, 'th');
const annLead = await run('Prepare lead', { status: 'accepted', submissionId: 's3', isRepeat: false }, { 'Check lead': await lead({ budget: '5M', area: 'Ari' }) });
const englishHot = await run('Decide category', aiReply({ classification: 'hot', reason: 'Wants a viewing.', reason_th: 'อยากนัดดู', confidence: 0.95 }), { 'Prepare lead': annLead });
const englishWarm = await run('Decide category', aiReply({ classification: 'warm', reason: 'Some details.', reason_th: 'มีรายละเอียด', confidence: 0.95 }), { 'Prepare lead': annLead });
assert.ok(englishHot.autoReply.startsWith('Hi Ann, thank you for contacting What The Property.'));
assert.ok(englishHot.autoReply.endsWith('as soon as possible.'));
assert.ok(englishWarm.autoReply.endsWith('within one business day.'));
assert.equal(englishHot.teamAlert, 'HOT LEAD: Ann | 0891234567 | budget 5,000,000 THB | area Ari | "I want a condo near BTS" | why: Wants a viewing.');
assert.equal(englishHot.replyChannel, 'sms (simulated)');
assert.equal((await run('Decide category', aiReply({ classification: 'warm', reason: 'x', reason_th: 'x', confidence: 0.9 }), { 'Prepare lead': { ...annLead, lead: { ...annLead.lead, email: 'ann.wtp.test@gmail.com' } } })).replyChannel, 'email (simulated)');
pass('English replies: hot promises a call "as soon as possible", others "within one business day"; the team alert has contact, budget, area, message and reason');

for (const [label, answer] of [['unknown category', { classification: 'urgent', reason: 'x', confidence: 0.9 }], ['no reason', { classification: 'hot', confidence: 0.9 }], ['empty reason', { classification: 'hot', reason: '  ', confidence: 0.9 }], ['no confidence', { classification: 'hot', reason: 'x' }]]) {
  const decided = await run('Decide category', aiReply(answer), { 'Prepare lead': annLead });
  assert.equal(decided.source, 'rules', label);
}
const long = await run('Decide category', aiReply({ classification: 'warm', reason: 'r'.repeat(400), reason_th: 'ร'.repeat(400), confidence: 0.9 }), { 'Prepare lead': annLead });
assert.equal(long.reason.length, 300); assert.equal(long.reasonTh.length, 300);
pass('an AI answer with an unknown category, no reason or no confidence is not trusted; long reasons are cut to 300 characters');

// 5. The contact form's "Try an example" buttons, in English and Thai: each passes the checks, gets a reply in its own
// language, and lands in its intended category even when the AI is down (fallback rules).
const { exampleLeads } = await import('../../frontend/src/features/leads/lead-copy.ts');
for (const example of exampleLeads) for (const [index, body] of example.lead.entries()) {
  const checked = await check(body);
  assert.equal(checked.valid, true, `${example.key} ${index ? 'th' : 'en'}: ${JSON.stringify(checked.problems)}`);
  assert.equal(checked.language, index ? 'th' : 'en', `${example.key} reply language`);
  const ready = await run('Prepare lead', { status: 'accepted', submissionId: 's9', isRepeat: false }, { 'Check lead': checked });
  const scored = await run('Decide category', { error: { message: 'quota' } }, { 'Prepare lead': ready });
  assert.equal(scored.classification, example.key, `${example.key} ${index ? 'th' : 'en'} by rules`);
}
pass('the form example buttons (English and Thai) pass the checks, reply in their language and score hot / warm / cold by the rules');

console.log(`ALL ${passed} PASSED`);
