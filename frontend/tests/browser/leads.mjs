// Task 3 pages in a real browser: the contact form (/contact) and the sales team's lead list (/leads).
// All /api/leads calls are mocked, so nothing reaches n8n, the AI or the database.
// Needs the running app and ADMIN_SESSION_SECRET (for the lead list).
// Run: node --env-file=backend/.env.local frontend/tests/browser/leads.mjs
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { chromium } from 'playwright';

if (!process.env.ADMIN_SESSION_SECRET) throw new Error('Set ADMIN_SESSION_SECRET for the lead list; never print it.');
const base = process.env.TEST_BASE_URL || 'http://localhost:3100';
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
let passed = 0;
const pass = label => console.log(`PASS ${++passed}: ${label}`);
const errorsOf = page => { const errors = []; page.on('console', m => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(m.text()); }); return errors; };

try {
  // Contact form ---------------------------------------------------------------------------
  const contact = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  let reply = { status: 200, json: { status: 'received', message: 'Hi Example, thank you for contacting What The Property.' } };
  const posts = [];
  await contact.route('**/api/leads', route => {
    if (route.request().method() !== 'POST') return route.continue();
    posts.push(route.request().postDataJSON());
    return route.fulfill({ status: reply.status, json: reply.json });
  });
  const page = await contact.newPage();
  const contactErrors = errorsOf(page);
  await page.goto(`${base}/contact`);
  await page.waitForSelector('.lead-panel form');
  const names = () => page.$$eval('.lead-panel form :is(input, textarea)', fields => fields.map(f => f.name));

  // Chrome would offer saved addresses or earlier entries; field names change per form to prevent it.
  const firstNames = await names();
  assert.ok(firstNames.every(name => /^lf-[a-g]-[a-z0-9]+$/.test(name)), firstNames.join());
  assert.equal(await page.$eval('#lf-a', e => e.getAttribute('autocomplete')), 'lead-form-no-fill');
  pass('form fields use neutral, per-visit names so the browser offers no saved details');

  await page.fill('#lf-a', 'Example');
  await page.fill('#lf-f', 'ok');
  await page.click('.lead-submit');
  assert.equal(posts.length, 0, 'a too-short message is not sent');
  await page.fill('#lf-f', 'Looking for a condo');
  await page.click('.lead-submit');
  assert.equal(posts.length, 0, 'no phone and no email is not sent');
  await page.getByRole('alert').getByText('Please add a phone number or an email').waitFor();
  pass('too-short message and missing contact are stopped in the browser');

  await page.fill('#lf-b', '0890000999');
  await page.click('.lead-submit');
  await page.waitForSelector('.lead-result.success');
  assert.equal(posts.at(-1).message, 'Looking for a condo');
  assert.match(await page.textContent('.lead-result.success h2'), /Your message was received/);
  assert.match(await page.textContent('.lead-auto-reply'), /thank you for contacting/);
  pass('accepted: centred success screen with the auto-reply');

  await page.click('.lead-result.success .lead-light-button');
  assert.equal(await page.inputValue('#lf-a'), '');
  assert.ok((await names()).every((name, i) => name !== firstNames[i]), 'new field names after "Send another message"');
  pass('"Send another message" clears the form and renews the field names');

  for (const [status, json, heading] of [
    [400, { status: 'rejected', reasons: ['spam_keywords'] }, 'looks like spam'],
    [400, { status: 'rejected', reasons: ['name_invalid'] }, 'check your details'],
    [429, { status: 'rate_limited' }, 'Too many messages'],
    [503, { status: 'unavailable' }, 'could not send'],
  ]) {
    reply = { status, json };
    await page.fill('#lf-a', 'Example'); await page.fill('#lf-b', '0890000999'); await page.fill('#lf-f', 'Typed message to keep');
    await page.click('.lead-submit');
    await page.waitForSelector('.lead-result.failure');
    assert.match(await page.textContent('.lead-result.failure h2'), new RegExp(heading));
    await page.click('.lead-result.failure .lead-light-button');
    assert.equal(await page.inputValue('#lf-f'), 'Typed message to keep');
  }
  pass('spam, invalid, too many and unavailable: red screen, and "Edit and try again" keeps what was typed');

  // "Try an example" fills the form in the language the site is shown in.
  await page.click('.lead-example.cold');
  assert.match(await page.inputValue('#lf-f'), /^Just browsing/);
  await page.getByRole('button', { name: 'ไทย', exact: true }).first().click();
  for (const [key, area] of [['hot', 'อารีย์'], ['warm', 'บางนา'], ['cold', '']]) {
    await page.click(`.lead-example.${key}`);
    assert.match(await page.inputValue('#lf-f'), /[฀-๿]/, `${key} message in Thai`);
    assert.match(await page.inputValue('#lf-a'), /ตัวอย่าง$/, `${key} name in Thai`);
    if (area) assert.ok((await page.$$eval('.lead-panel form input', inputs => inputs.map(i => i.value))).includes(area), `${key} area in Thai`);
  }
  pass('"Try an example" fills the form in English or Thai, following the site language');
  assert.deepEqual(contactErrors, []);
  await contact.close();

  // Lead list ------------------------------------------------------------------------------
  const team = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const expires = String(Date.now() + 60000);
  const signature = createHmac('sha256', process.env.ADMIN_SESSION_SECRET).update(expires).digest('hex');
  await team.addCookies([{ name: 'workspace-demo-session', value: `${expires}.${signature}`, url: base, httpOnly: true, sameSite: 'Strict' }]);
  const kinds = ['hot', 'warm', 'cold'];
  const messages = ['สนใจคอนโดแถวอารีย์ครับ', 'Looking for a house in Bang Na', 'มีทาวน์โฮมแถวรามอินทราไหมครับ'];
  const leads = Array.from({ length: 30 }, (_, i) => ({
    id: `lead-${i}`, name: `Example ${i + 1}`, phone: `08900009${String(i).padStart(2, '0')}`, email: null,
    message: i === 0 ? `${messages[0]} ${'with a lot more detail about the budget, the timeline and the family. '.repeat(4)}` : messages[i % 3],
    budget: 3000000, area: 'Bangkok', isRepeat: i === 1, submissionCount: i === 1 ? 2 : 1,
    classification: kinds[i % 3], classificationSource: i === 2 ? 'rules' : 'ai',
    classificationReason: `Reason ${i + 1} in English.`, classificationReasonTh: `เหตุผลที่ ${i + 1}`,
    createdAt: new Date(Date.now() - i * 60000).toISOString(),
    notifications: [{ kind: 'auto_reply', status: 'sent', channel: 'sms (simulated)', attempts: 1, text: `Auto-reply ${i + 1}`, to: null, error: null }],
  }));
  // Lead 1 (hot) left an email: the team alert and an auto-reply by (simulated) email were logged.
  Object.assign(leads[0], { email: 'example.one@lead.test', notifications: [
    { kind: 'team_alert', status: 'sent', channel: 'team log (simulated)', attempts: 1, text: 'HOT LEAD: Example 1', to: null, error: null },
    { kind: 'auto_reply', status: 'sent', channel: 'email (simulated)', attempts: 1, text: 'Auto-reply 1', to: 'example.one@lead.test', error: null },
  ] });
  await team.route('**/api/leads', route => route.request().method() === 'GET' ? route.fulfill({ json: { leads } }) : route.continue());
  const list = await team.newPage();
  const listErrors = errorsOf(list);
  await list.goto(`${base}/leads`);
  await list.waitForSelector('.lead-item');
  const cards = () => list.locator('.lead-item').count();

  assert.equal(await cards(), 12);
  await list.getByRole('button', { name: /Show more \(18 more\)/ }).click();
  assert.equal(await cards(), 24);
  await list.getByRole('button', { name: /Show more \(6 more\)/ }).click();
  assert.equal(await cards(), 30);
  assert.equal(await list.locator('.leads-more').count(), 0);
  pass('12 cards first, then "Show more" adds 12 at a time until all 30 are shown');

  const heights = await list.$$eval('.lead-item', items => [...new Set(items.map(item => Math.round(item.getBoundingClientRect().height)))]);
  assert.equal(heights.length, 1, `card heights ${heights}`);
  pass('every card has the same height, even with a long message');

  await list.locator('.lead-item').first().getByRole('button', { name: 'Read more' }).first().click();
  const dialog = list.locator('.lead-dialog');
  assert.equal(await dialog.evaluate(d => d.open), true);
  await dialog.getByText('with a lot more detail').first().waitFor();
  await dialog.getByText('Auto-reply 1').waitFor();
  assert.deepEqual(await dialog.locator('.lead-delivery').allTextContents(), ['Logged for example.one@lead.test (simulated)']);
  await list.keyboard.press('Escape');
  assert.equal(await dialog.evaluate(d => d.open), false);
  pass('"Read more" opens the full message, reason, team alert and auto-reply, with who the simulated reply was logged for; Esc closes it');

  assert.deepEqual(await list.locator('.lead-item').nth(0).locator('.lead-note').allTextContents(), ['Team alerted (simulated)', 'Auto-reply · Email (simulated)']);
  assert.equal(await list.locator('.lead-item').nth(1).locator('.lead-note').last().textContent(), 'Auto-reply · SMS (simulated)');
  pass('cards label the team alert and the simulated auto-reply channel (email or SMS)');

  await list.click('.leads-segment .hot');
  assert.equal(await cards(), 10);
  assert.match(await list.textContent('.lead-stat.selected'), /Hot/);
  await list.click('.lead-stat.cold');
  assert.match(await list.textContent('.leads-segment .active'), /Cold/);
  pass('hot / warm / cold buttons and the stat cards stay in step');

  await list.click('.leads-segment .all');
  await list.fill('.leads-search input', '0890000905');
  assert.equal(await cards(), 1);
  await list.fill('.leads-search input', 'บางนา');
  assert.equal(await cards(), 0);
  await list.getByText('No leads match these filters.').waitFor();
  await list.getByRole('button', { name: 'Clear filters' }).click();
  await list.selectOption('.leads-select select', 'townhouse');
  assert.equal(await cards(), 10);
  assert.match(await list.textContent('.lead-stat.all .admin-stat-value strong'), /^10$/);
  pass('search by phone, empty result message, property type filter; stat counts follow the filters');

  await list.getByRole('button', { name: 'Clear filters' }).click();
  await list.getByRole('button', { name: 'ไทย', exact: true }).click();
  await list.getByText('เหตุผลที่ 1').first().waitFor();
  await list.getByText('ใช้กฎสำรอง').first().waitFor();
  await list.getByText(/SMS \(จำลอง\)/).first().waitFor();
  await list.getByRole('button', { name: 'EN', exact: true }).click();
  pass('in Thai the list shows the Thai reason, "ใช้กฎสำรอง" and "SMS (จำลอง)"');

  await list.setViewportSize({ width: 390, height: 844 });
  assert.equal(await list.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no sideways scroll on mobile');
  pass('mobile width: no sideways scrolling');
  assert.deepEqual(listErrors, []);
  await team.close();

  console.log(`ALL ${passed} PASSED`);
} finally {
  await browser.close();
}
