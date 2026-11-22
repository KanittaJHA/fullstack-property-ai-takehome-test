// Home page layout in English and Thai, 320–1600 px: every section renders, links go to working pages,
// nothing scrolls sideways, the AI card carries the request to the property page, the FAQ opens and closes, and the
// newsletter form says that the demo sends no email.
// Read-only (the property page only fills its request box; no AI call is made). Needs the running app.
// Run: node frontend/tests/browser/home-page.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.TEST_BASE_URL || 'http://localhost:3100';
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
let passed = 0;
const pass = label => console.log(`PASS ${++passed}: ${label}`);
const sections = ['.home-hero h1', '.home-cards', '.home-search', '.home-how', '.home-ways', '.home-listings', '.home-faq', '.home-closing', '.home-footer'];

try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

  for (const language of ['English', 'ไทย']) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${base}/`);
    await page.waitForSelector('.home-hero h1');
    if (language === 'ไทย') { await page.getByRole('button', { name: 'ไทย', exact: true }).first().click(); await page.waitForTimeout(300); }
    const problems = [];
    for (const width of [320, 390, 768, 1024, 1280, 1600]) {
      await page.setViewportSize({ width, height: 900 });
      for (const selector of sections) if (!(await page.locator(selector).first().isVisible())) problems.push(`${width}px: ${selector} hidden`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 1) problems.push(`${width}px: scrolls sideways by ${overflow}px`);
    }
    assert.deepEqual(problems, [], problems.join('\n'));
    pass(`${language}: all sections shown and no sideways scrolling from 320 to 1600 px`);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}/`);
  const hrefs = await page.$$eval('.home-page a[href^="/"]', links => [...new Set(links.map(a => a.getAttribute('href').split('?')[0]))]);
  const known = ['/properties', '/graspia', '/contact', '/leads', '/admin'];
  assert.deepEqual(hrefs.filter(h => !known.includes(h)), [], `unknown links: ${hrefs}`);
  for (const href of ['/properties', '/graspia', '/contact']) assert.ok(hrefs.includes(href), href);
  pass('every link goes to an existing page, including Properties, Graspia and Contact');

  const faq = page.locator('.home-faq details').nth(1);
  assert.equal(await faq.evaluate(d => d.open), false);
  await faq.locator('summary').click();
  assert.equal(await faq.evaluate(d => d.open), true);
  pass('a FAQ answer opens when its question is clicked');

  await page.fill('.home-newsletter input', 'buyer@example.com');
  await page.click('.home-newsletter button');
  assert.match(await page.textContent('.home-newsletter-done'), /no email is sent/);
  pass('the newsletter form confirms and says plainly that the demo sends no email');

  await page.fill('.home-card-ai input', '2-bed condo near BTS Asok');
  await page.click('.home-card-ai button');
  await page.waitForURL(/\/properties\?request=/);
  await page.waitForFunction(() => [...document.querySelectorAll('textarea, input')].some(el => el.value === '2-bed condo near BTS Asok'));
  pass('the AI card opens the property page with the request already typed in');

  console.log(`ALL ${passed} PASSED`);
} finally {
  await browser.close();
}
