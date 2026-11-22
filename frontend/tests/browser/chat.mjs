import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { chromium } from 'playwright';

const base = process.env.TEST_BASE_URL || 'http://localhost:3100';
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
const now = () => new Date().toISOString();
let c = { id: randomUUID(), status: 'bot_active', messages: [], handover: false, reason: null, summary: null, confidence: null, createdAt: now(), updatedAt: now() };
const add = (role, content) => { c.messages.push({ id: randomUUID(), role, content, createdAt: now() }); c.updatedAt = now(); };
let failSend = true;
let created = false;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/api/chat/**', async route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (path.endsWith('/session')) return route.fulfill({ json: { ready: true } });
    if (path.endsWith('/conversations')) {
      if (request.method() === 'POST') { created = true; c = { ...c, id: randomUUID(), messages: [], status: 'bot_active', handover: false, reason: null, summary: null }; return route.fulfill({ json: c }); }
      return route.fulfill({ json: { conversations: created ? [c] : [] } });
    }
    if (request.method() === 'POST') {
      if (path.endsWith('/delete')) { created = false; return route.fulfill({ json: { deleted: true } }); }
      if (path.endsWith('/messages')) {
        if (failSend) { failSend = false; return route.fulfill({ status: 503, json: { error: 'CHAT_UNAVAILABLE' } }); }
        add('user', request.postDataJSON().message); add('assistant', 'Home Plus costs 185,000 THB.');
      } else if (path.endsWith('/handover')) {
        c.handover = true; c.reason = 'human_requested'; c.summary = 'Customer requested a sales specialist.'; c.status = 'awaiting_human'; add('system', 'This conversation is queued for the sales team. The AI has stopped replying. You may leave additional details or a preferred contact. A person will follow up when available; no appointment or payment is confirmed.');
      } else if (path.endsWith('/takeover')) { c.status = 'human_active'; add('system', 'A sales specialist has taken over / เจ้าหน้าที่รับช่วงดูแลแล้ว'); }
      else if (path.endsWith('/reply')) add('human', request.postDataJSON().message);
      else if (path.endsWith('/close')) { c.status = 'closed'; add('system', 'Conversation closed / ปิดบทสนทนาแล้ว'); }
    }
    return route.fulfill({ json: c });
  });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/graspia`);
  await page.locator('.is-new-chat .graspia-welcome').waitFor();
  await page.getByLabel('Your message', { exact: true }).fill('What is the price?');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await page.locator('.chat-demo-banner[role=alert]').waitFor();
  assert.equal(await page.getByLabel('Your message', { exact: true }).inputValue(), 'What is the price?');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await page.getByText('Home Plus costs 185,000 THB.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Request a human', exact: true }).first().click();
  await page.getByText('Awaiting a sales representative', { exact: true }).waitFor();
  await page.reload();
  await page.getByText('Awaiting a sales representative', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Sent to sales team', exact: true }).isDisabled(), true);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'Mobile page must not overflow horizontally');
  await page.getByLabel('Your message', { exact: true }).scrollIntoViewIfNeeded();
  if (!process.env.ADMIN_SESSION_SECRET) throw new Error('Set ADMIN_SESSION_SECRET for SSR admin access; never print it.');
  const expires = String(Date.now() + 60000);
  const signature = createHmac('sha256', process.env.ADMIN_SESSION_SECRET).update(expires).digest('hex');
  await context.addCookies([{ name: 'workspace-demo-session', value: `${expires}.${signature}`, url: base, httpOnly: true, sameSite: 'Strict' }]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/admin`);
  await page.getByRole('button', { name: 'Take over', exact: true }).click();
  await page.getByLabel('Reply as a sales specialist', { exact: true }).fill('Hello, a human sales specialist here.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByText('Hello, a human sales specialist here.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Close conversation', exact: true }).click();
  await page.getByText('This conversation is closed.', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Reply as a sales specialist', { exact: true }).isDisabled(), true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'Admin mobile page must not overflow');
  await page.goto(`${base}/graspia`);
  // On narrow screens the first-visit guide tip sits over the history row; a user dismisses it first.
  const tip = page.getByRole('button', { name: 'Dismiss tip', exact: true });
  if (await tip.waitFor({ timeout: 1500 }).then(() => true, () => false)) await tip.click();
  // Below 761px conversation history is a drawer: open it before using a conversation's options.
  await page.getByRole('button', { name: 'Open conversations', exact: true }).first().click();
  await page.getByRole('button', { name: /^Conversation options/ }).click();
  assert.equal(await page.locator('.chat-heading').getByRole('button', { name: 'Delete conversation' }).count(), 0);
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(created, true);
  await page.getByRole('button', { name: /^Conversation options/ }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete chat', exact: true }).click();
  await page.locator('.is-new-chat .graspia-welcome').waitFor();
  assert.equal(created, false);
  await page.reload();
  await page.locator('.is-new-chat .graspia-welcome').waitFor();
  assert.equal(await page.getByRole('button', { name: 'History', exact: true }).count(), 0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'New conversation', exact: true }).click();
  await page.locator('.is-new-chat .graspia-welcome').waitFor();
  const previousId = c.id;
  await page.getByRole('button', { name: 'New conversation', exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Your message');
  assert.notEqual(c.id, previousId);
  assert.equal(await page.locator('.welcome-actions').count(), 0);
  assert.equal(await page.locator('.welcome-compose-tools').isVisible(), true);
  assert.equal(await page.locator('.welcome-suggestions').isVisible(), true);
  assert.equal(await page.locator('.conversation-sidebar').isVisible(), true);
  assert.equal(await page.getByLabel('Your message', { exact: true }).inputValue(), '');
  assert.equal(await page.locator('.sales-context').isVisible(), false);
  await page.getByRole('button', { name: 'Collapse conversations', exact: true }).click();
  assert.equal(await page.locator('.conversation-sidebar').isVisible(), false);
  await page.getByRole('button', { name: 'Open conversations', exact: true }).click();
  assert.equal(await page.locator('.conversation-sidebar').isVisible(), true);
  await page.getByRole('link', { name: 'Graspia by What The Property', exact: true }).click();
  await page.locator('.graspia-welcome').waitFor();
  await page.reload();
  await page.locator('.graspia-welcome').waitFor();
  assert.equal(await page.locator('.conversation-sidebar').isVisible(), false);
  assert.equal(await page.getByRole('button', { name: 'Get started', exact: true }).isVisible(), true);
  assert.equal(await page.locator('.welcome-compose-tools').isVisible(), true);
  assert.equal(await page.getByRole('button', { name: 'History', exact: true }).isVisible(), true);
  for (const viewport of [{width: 1440, height: 900}, {width: 1920, height: 1080}]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(200);
    const overflow = await page.locator('.chat-panel').evaluate(el => el.scrollHeight - el.clientHeight);
    assert.ok(overflow <= 1, `Welcome should fit desktop: ${JSON.stringify(viewport)}, overflow ${overflow}`);
  }
  await page.setViewportSize({width: 390, height: 600});
  await page.waitForTimeout(200);
  assert.equal(await page.locator('.chat-panel').evaluate(el => getComputedStyle(el).overflowY), 'auto');
  await page.setViewportSize({width: 1440, height: 1000});
  await page.getByRole('button', { name: 'Get started', exact: true }).click();
  await page.locator('.is-new-chat .graspia-welcome').waitFor();
  assert.equal(await page.locator('.conversation-sidebar').isVisible(), true);
  assert.deepEqual(errors, []);
  console.log('PASS: saved draft on error, retry, handover and reload, mobile layout, admin takeover, reply and close, new conversation and landing. Chat API mocked; admin sign-in is real.');
} finally { await browser.close(); }
