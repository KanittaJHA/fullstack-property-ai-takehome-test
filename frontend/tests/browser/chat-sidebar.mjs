// Graspia conversation sidebar: shown for a new chat, collapses and reopens, survives a reload,
// and is hidden on the landing screen. The chat API is mocked.
// Run: node frontend/tests/browser/chat-sidebar.mjs (with the app running)
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.TEST_BASE_URL || 'http://localhost:3100';
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
let passed = 0;
const pass = label => console.log(`PASS ${++passed}: ${label}`);

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => localStorage.setItem('graspia-view', 'chat'));
  await context.route('**/api/chat/**', route => route.fulfill({
    json: route.request().url().endsWith('/session') ? { ready: true } : { conversations: [] },
  }));
  const page = await context.newPage();
  await page.goto(`${base}/graspia`);
  const sidebar = page.locator('#conversation-sidebar');

  await sidebar.waitFor({ state: 'visible' });
  assert.ok(await page.locator('.sales-workspace').evaluate(workspace => workspace.classList.contains('is-new-chat')));
  pass('a new chat shows the conversation sidebar');

  await page.getByRole('button', { name: 'Collapse conversations', exact: true }).click();
  await sidebar.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Open conversations', exact: true }).click();
  await sidebar.waitFor({ state: 'visible' });
  pass('the sidebar collapses and opens again');

  await page.reload();
  await sidebar.waitFor({ state: 'visible' });
  pass('the sidebar is still there after a reload');

  await page.getByRole('link', { name: 'Graspia by What The Property', exact: true }).click();
  await page.locator('.sales-workspace.is-landing').waitFor();
  await sidebar.waitFor({ state: 'hidden' });
  pass('the landing screen hides the sidebar');
  console.log(`ALL ${passed} PASSED`);
} finally {
  await browser.close();
}
