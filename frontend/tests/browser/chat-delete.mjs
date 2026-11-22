// Deleting a Graspia conversation: an in-app dialog (never the browser's confirm), focus on Cancel,
// Escape and Cancel keep the chat, and a failed delete can be retried. The chat API is mocked.
// Run: node frontend/tests/browser/chat-delete.mjs (with the app running)
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';

const base = process.env.TEST_BASE_URL || 'http://localhost:3100';
const viewport = { width: 1440, height: 1000 };
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
let passed = 0;
const pass = label => console.log(`PASS ${++passed}: ${label}`);

try {
  const context = await browser.newContext({ viewport });
  const now = new Date().toISOString();
  const conversation = { id: randomUUID(), status: 'bot_active', messages: [], title: 'Test chat', createdAt: now, updatedAt: now };
  let deleted = false;
  let deleteAttempts = 0;
  await context.addInitScript(() => localStorage.setItem('graspia-view', 'chat'));
  await context.route('**/api/chat/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/delete')) {
      deleteAttempts++;
      // The first attempt fails, so the retry path is tested too.
      if (deleteAttempts === 1) return route.fulfill({ status: 503, json: { error: 'CHAT_DATABASE_UNAVAILABLE' } });
      deleted = true;
      return route.fulfill({ json: { deleted: true } });
    }
    if (path.endsWith('/session')) return route.fulfill({ json: { ready: true } });
    if (path.endsWith('/conversations')) return route.fulfill({ json: { conversations: deleted ? [] : [conversation] } });
    return route.fulfill({ json: conversation });
  });

  const page = await context.newPage();
  let browserDialogs = 0;
  page.on('dialog', async dialog => { browserDialogs++; await dialog.dismiss(); });
  await page.goto(`${base}/graspia`);
  const dialog = page.getByRole('dialog');
  const openDeleteDialog = async () => {
    await page.getByRole('button', { name: /^Conversation options/ }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await dialog.waitFor();
  };

  await openDeleteDialog();
  const box = await dialog.boundingBox();
  assert.ok(box.width >= 300 && box.width <= 460, 'the dialog has a bounded width');
  assert.ok(Math.abs(box.x + box.width / 2 - viewport.width / 2) < 2, 'the dialog is centred horizontally');
  assert.ok(Math.abs(box.y + box.height / 2 - viewport.height / 2) < 2, 'the dialog is centred vertically');
  assert.equal(await dialog.evaluate(element => getComputedStyle(element).borderRadius), '20px');
  assert.ok(await page.getByRole('button', { name: 'Cancel', exact: true }).evaluate(button => button === document.activeElement));
  pass('the delete dialog is centred, has a 20px corner radius and focuses Cancel');

  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await openDeleteDialog();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(deleteAttempts, 0);
  pass('Escape and Cancel close the dialog without deleting');

  await openDeleteDialog();
  await page.getByRole('button', { name: 'Delete chat', exact: true }).click();
  await dialog.getByRole('alert').waitFor();
  assert.equal(deleted, false);
  await page.getByRole('button', { name: 'Delete chat', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(deleted, true);
  assert.equal(deleteAttempts, 2);
  pass('a failed delete shows an error and can be retried');

  assert.equal(browserDialogs, 0);
  pass('the browser\'s own confirm box is never used');
  console.log(`ALL ${passed} PASSED`);
} finally {
  await browser.close();
}
