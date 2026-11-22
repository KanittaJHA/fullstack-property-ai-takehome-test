import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { createClient } from '../../../backend/node_modules/@supabase/supabase-js/dist/index.mjs';
if (process.env.CHAT_LIVE_TEST !== '1') throw new Error('Set CHAT_LIVE_TEST=1: this uses the real AI and Supabase.');
const base = process.env.TEST_BASE_URL || 'http://localhost:3100';
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage(); page.setDefaultTimeout(60000);
const errors = []; page.on('pageerror', error => errors.push(error.message));
let id;
const post = (path, data) => context.request.post(`${base}/api${path}`, { data, headers: { Origin: base } });
try {
  await page.goto(`${base}/graspia`);
  const send = async text => {
    await page.getByLabel('Your message', { exact: true }).fill(text);
    const response = page.waitForResponse(r => r.request().method() === 'POST' && /\/messages$/.test(new URL(r.url()).pathname));
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    const r = await response; assert.equal(r.status(), 200);
    const c = await r.json(); id = c.id; return c;
  };
  const normal = await send('What is the price of Home Plus 5kW?');
  assert.equal(normal.handover, false);
  assert.match(normal.messages.at(-1).content.replaceAll(',', ''), /185000/);
  const handed = await send('I want to buy Home Plus 5kW. Please have your sales team contact test.customer@example.invalid. My name is Test Customer in Bangkok.');
  assert.equal(handed.handover, true); assert.match(handed.summary, /test.customer@example.invalid/);
  const followup = await send('Additional detail: please contact me in the afternoon.');
  assert.equal(followup.messages.filter(m => m.role === 'assistant').length, 1, 'Bot must stay stopped');
  await page.reload();
  await page.getByLabel('Your message', { exact: true }).waitFor();
  const {data: saved, error} = await db.from('messages').select('id,role,content').eq('conversation_id', id);
  assert.equal(error, null); assert.equal(saved.length, followup.messages.length);
  const outsider = await browser.newContext();
  await outsider.request.post(`${base}/api/chat/session`, { data: {}, headers: {Origin: base} });
  const denied = await outsider.request.get(`${base}/api/chat/conversations/${id}`);
  assert.equal(denied.status(), 404); await outsider.close();
  const login = await post('/auth/login', { code: process.env.ADMIN_ACCESS_CODE });
  assert.equal(login.status(), 200);
  const admin = await context.newPage(); admin.setDefaultTimeout(30000);
  await admin.goto(`${base}/admin`);
  // The inbox lists conversations by their first message; confirm the exact chat by its ID prefix before acting.
  await admin.locator('.admin-queue-item').first().waitFor();
  const candidates = admin.locator('.admin-queue-item').filter({ hasText: 'What is the price of Home Plus 5kW?' });
  let found = false;
  for (let i = 0; !found && i < await candidates.count(); i++) {
    await candidates.nth(i).click();
    found = await admin.locator('h2', { hasText: id.slice(0, 8) }).waitFor({ timeout: 8000 }).then(() => true, () => false);
  }
  assert.ok(found, 'Test conversation must be selected before any admin action');
  await admin.locator('.admin-handover-brief').waitFor();
  // The brief is rebuilt on every customer message after handover, so it matches the latest summary
  // and includes the follow-up sent after the handover.
  assert.equal(await admin.locator('.admin-handover-brief').textContent(), followup.summary);
  assert.match(followup.summary, /please contact me in the afternoon/);
  assert.equal(await admin.locator('.admin-handover-brief').evaluate(e => getComputedStyle(e).whiteSpace), 'pre-wrap');
  await admin.getByRole('button', {name:'Take over', exact:true}).click();
  await admin.getByLabel('Reply as a sales specialist', {exact:true}).fill('Test sales reply: I will follow up about your survey.');
  await admin.getByRole('button', {name:'Send', exact:true}).click();
  await admin.getByText('Test sales reply: I will follow up about your survey.', {exact:true}).waitFor();
  await page.bringToFront();
  await page.getByText('Test sales reply: I will follow up about your survey.', {exact:true}).waitFor();
  const closing = admin.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/close'));
  await admin.getByRole('button', {name:'Close conversation', exact:true}).click();
  assert.equal((await closing).status(), 200);
  await admin.waitForFunction(() => document.querySelector('#admin-reply')?.disabled);
  await page.reload();
  const closedResponse = await context.request.get(`${base}/api/chat/conversations/${id}`);
  assert.equal((await closedResponse.json()).status, 'closed');
  const rejected = await post(`/chat/conversations/${id}/messages`, {requestId:randomUUID(),message:'Must not reopen'});
  assert.equal(rejected.status(), 409);
  await admin.setViewportSize({width:390,height:844});
  assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
  assert.deepEqual(errors, []);
  console.log('PASS: real browser → backend → AI → Supabase; reload, owner isolation, saved summary, stopped bot, admin login/takeover/reply/close, mobile width.');
} finally {
  // Clean up only this isolated visitor's test chats, including a failed first send.
  const cookie = (await context.cookies()).find(c => c.name === 'graspia-visitor');
  if (cookie) {
    const owner = createHash('sha256').update(cookie.value).digest('hex');
    const {data,error}=await db.from('conversations').select('id').eq('owner_token_hash',owner);
    if(error) throw new Error('Test cleanup lookup failed');
    for(const c of data) {
      const result=await db.rpc('graspia_chat_store',{p_action:'delete',p_business:'sunpro-solar',p_payload:{id:c.id,owner}});
      if(result.error) throw new Error('Test cleanup failed');
    }
  }
  await browser.close();
}
