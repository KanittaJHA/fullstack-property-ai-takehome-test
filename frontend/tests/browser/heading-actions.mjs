// Header buttons on the team pages (/leads, /admin, /knowledge), English and Thai, every width from 320 to 1600 px:
// no button label breaks onto a second line, the page never scrolls sideways, and on phones the admin
// page keeps a direct way back to the customer chat; on phones the lead list matches the admin layout. Read-only.
// Needs the running app and ADMIN_SESSION_SECRET.
// Run: node --env-file=backend/.env.local frontend/tests/browser/heading-actions.mjs
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { chromium } from 'playwright';

if (!process.env.ADMIN_SESSION_SECRET) throw new Error('Set ADMIN_SESSION_SECRET; never print it.');
const base = process.env.TEST_BASE_URL || 'http://localhost:3100';
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
let passed = 0;
const pass = label => console.log(`PASS ${++passed}: ${label}`);

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const expires = String(Date.now() + 60 * 60 * 1000);
  const signature = createHmac('sha256', process.env.ADMIN_SESSION_SECRET).update(expires).digest('hex');
  await context.addCookies([{ name: 'workspace-demo-session', value: `${expires}.${signature}`, url: base, httpOnly: true, sameSite: 'Strict' }]);
  const page = await context.newPage();

  // Text rows inside each visible header button (icons ignored).
  const wrapped = () => page.$$eval('.workspace-heading-actions :is(.admin-secondary, .primary-button)', buttons => buttons
    .filter(button => button.offsetParent)
    .filter(button => {
      const rows = new Set();
      const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        if (!text.textContent.trim()) continue;
        range.selectNodeContents(text);
        for (const rect of range.getClientRects()) rows.add(Math.round(rect.top));
      }
      return rows.size > 1;
    })
    .map(button => button.textContent.trim()));

  for (const language of ['English', 'ไทย']) {
    const problems = [];
    for (const path of ['/leads', '/admin', '/knowledge']) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${base}${path}`);
      await page.waitForSelector('.workspace-heading-actions');
      if (language === 'ไทย') { await page.getByRole('button', { name: 'ไทย', exact: true }).first().click(); await page.waitForTimeout(300); }
      for (let width = 320; width <= 1600; width += 20) {
        await page.setViewportSize({ width, height: 900 });
        const labels = await wrapped();
        const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        if (labels.length || sideways) problems.push(`${path} ${width}px: ${labels.join(' | ')}${sideways ? ' [scrolls sideways]' : ''}`);
      }
    }
    assert.deepEqual(problems, [], problems.join('\n'));
    pass(`${language}: header button labels stay on one line and no page scrolls sideways, 320–1600 px`);
  }

  await page.goto(`${base}/admin`);
  await page.waitForSelector('.workspace-heading-actions');
  for (const width of [320, 390, 700]) {
    await page.setViewportSize({ width, height: 900 });
    const chat = page.locator('.workspace-heading-actions > .admin-chat-link');
    assert.ok(await chat.isVisible(), `chat link visible at ${width}px`);
    assert.equal(await chat.getAttribute('href'), '/graspia?view=chat');
    assert.ok(await chat.getAttribute('aria-label'), 'icon-only link still has a name');
  }
  pass('admin on phones and tablets: the "Open customer chat" icon is always there');

  // Leads and admin share one phone layout: icon buttons, Lock as an icon, and "Overview" folding the stat cards.
  for (const [path, stats] of [['/admin', '#admin-stats'], ['/leads', '#leads-stats']]) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${base}${path}`);
    await page.waitForSelector('.workspace-heading-actions');
    const toggle = page.locator('.workspace-heading-actions > .admin-stats-toggle');
    assert.equal(await toggle.isVisible(), false, `${path}: no Overview toggle on desktop`);
    assert.ok(await page.locator(stats).isVisible(), `${path}: stat cards shown on desktop`);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await toggle.isVisible(), `${path}: Overview toggle on phones`);
    assert.equal(await page.locator(stats).isVisible(), false, `${path}: stat cards folded on phones`);
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    assert.ok(await page.locator(stats).isVisible(), `${path}: Overview opens the stat cards`);
    const lock = page.locator('.workspace-heading-actions .admin-lock-action');
    assert.equal(await lock.locator('span').isVisible(), false, `${path}: Lock is an icon on phones`);
    assert.ok(await lock.getAttribute('aria-label'));
    // Very narrow phones: Refresh goes (both pages reload on their own), the link to the customer side stays.
    await page.setViewportSize({ width: 320, height: 700 });
    const link = path === '/admin' ? '.admin-chat-link' : '.leads-contact-link';
    assert.ok(await page.locator(`.workspace-heading-actions > ${link}`).isVisible(), `${path}: customer-side link at 320px`);
    const refresh = page.locator('.workspace-heading-actions > .admin-compact-action:not(.admin-chat-link):not(.leads-contact-link)');
    assert.equal(await refresh.isVisible(), false, `${path}: Refresh hidden at 320px`);
  }
  pass('leads and admin match on phones: icon buttons, Lock as an icon, "Overview" folds the stat cards, and the customer-side link stays at 320 px');
  console.log(`ALL ${passed} PASSED`);
} finally {
  await browser.close();
}
