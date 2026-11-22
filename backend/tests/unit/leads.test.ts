import assert from 'node:assert/strict';
import { clientKey, REMOTE_ADDRESS_HEADER } from '../../src/http/client.js';
import test from 'node:test';
import { createApp } from '../../src/app.js';
import { createLeadHandlers } from '../../src/leads/leads.handler.js';
import { sendLeadToWorkflow, WEBHOOK_SECRET_HEADER } from '../../src/leads/lead-webhook.provider.js';
import { leadRequest } from '../../src/leads/leads.validation.js';
import { toLeadSummary, type SubmissionRow } from '../../src/leads/leads.repository.js';
import type { LeadRequest, LeadSummary } from '../../../packages/contracts/src/contracts/leads.js';

const req = (path: string, method = 'GET', body?: string, headers: Record<string, string> = {}) => new Request(`http://localhost:4000${path}`, {
  method, headers: { ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body === undefined ? {} : { body }),
});

test('lead request keeps known string fields only and enforces size limits', () => {
  assert.deepEqual(leadRequest({ name: 'Ann', phone: '0891234567', message: 'Hi', extra: 'dropped', email: '' }), { name: 'Ann', phone: '0891234567', message: 'Hi' });
  assert.equal(leadRequest({ name: 'Ann', message: 'x'.repeat(2001) }), null);
  assert.equal(leadRequest({ name: 42, message: 'Hi' }), null);
  assert.equal(leadRequest([]), null);
  assert.equal(leadRequest(null), null);
});

test('lead routes: public submit is forwarded, the lead list needs an admin session', async () => {
  const old = { ...process.env };
  process.env.ADMIN_ACCESS_CODE = 'test1234';
  process.env.ADMIN_SESSION_SECRET = 'unit-test-secret-that-is-long-enough';
  process.env.FRONTEND_ORIGIN = 'http://localhost:3100';
  const sent: LeadRequest[] = [];
  let reads = 0;
  const leads = createLeadHandlers({
    send: async lead => { sent.push(lead); return { status: 200, body: { ok: true, status: 'received', message: 'Thanks' } }; },
    list: async () => { reads++; return [{ id: 'l1' } as LeadSummary]; },
  });
  const app = createApp({ leads });
  try {
    const ok = await app(req('/leads', 'POST', '{"name":"Ann","phone":"0891234567","message":"Looking for a condo"}'));
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { ok: true, status: 'received', message: 'Thanks' });
    assert.equal(sent.length, 1);

    const bad = await app(req('/leads', 'POST', '{"name":1}'));
    assert.equal(bad.status, 400);
    assert.equal(sent.length, 1, 'invalid shape is not forwarded');
    assert.equal((await app(req('/leads', 'POST', '{"name":"Ann"}', { Origin: 'https://evil.invalid' }))).status, 403);

    assert.equal((await app(req('/leads'))).status, 401);
    assert.equal(reads, 0);
    const login = await app(req('/auth/login', 'POST', '{"code":"test1234"}'));
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const list = await app(req('/leads', 'GET', undefined, { cookie }));
    assert.equal(list.status, 200);
    assert.deepEqual(await list.json(), { leads: [{ id: 'l1' }] });
    assert.equal((await app(req('/leads', 'PUT'))).status, 405);
  } finally {
    process.env = old;
  }
});

test('submit is limited per client and in total before reaching the workflow', async () => {
  let calls = 0;
  const leads = createLeadHandlers({ send: async () => { calls++; return { status: 200, body: { ok: true, status: 'received' } }; } });
  const from = (address: string) => leads.submit(new Request('http://localhost:4000/leads', {
    method: 'POST', headers: { 'Content-Type': 'application/json', [REMOTE_ADDRESS_HEADER]: address }, body: '{"name":"Ann","message":"Hi"}',
  }));
  const oneClient: number[] = [];
  for (let i = 0; i < 6; i++) oneClient.push((await from('10.0.0.1')).status);
  assert.equal(oneClient.filter(s => s === 429).length, 1, 'a 6th post from one client within a minute is limited');
  const manyClients: number[] = [];
  for (let i = 0; i < 26; i++) manyClients.push((await from(`10.0.1.${i}`)).status);
  assert.equal(manyClients.filter(s => s === 429).length, 1, '30 posts a minute in total, whoever sends them');
  assert.equal(calls, 30);
});

test('per-client limits use the connection address; X-Forwarded-For only behind a trusted proxy', () => {
  const old = process.env.TRUSTED_PROXY;
  const request = new Request('http://localhost:4000/leads', { headers: { [REMOTE_ADDRESS_HEADER]: '127.0.0.1', 'X-Forwarded-For': '6.6.6.6, 203.0.113.7' } });
  try {
    delete process.env.TRUSTED_PROXY;
    assert.equal(clientKey(request), '127.0.0.1', 'a client cannot choose its own key');
    process.env.TRUSTED_PROXY = 'true';
    assert.equal(clientKey(request), '203.0.113.7', 'the hop added by the trusted proxy, not the one the client sent');
  } finally {
    if (old === undefined) delete process.env.TRUSTED_PROXY; else process.env.TRUSTED_PROXY = old;
  }
});

test('webhook provider relays known answers and fails closed on anything else', async () => {
  const oldFetch = globalThis.fetch;
  const oldUrl = process.env.N8N_LEAD_WEBHOOK_URL;
  const oldSecret = process.env.N8N_LEAD_WEBHOOK_SECRET;
  const lead = { name: 'Ann', message: 'Hi' };
  try {
    globalThis.fetch = async () => assert.fail('no call without a URL and a secret');
    delete process.env.N8N_LEAD_WEBHOOK_URL;
    process.env.N8N_LEAD_WEBHOOK_SECRET = 'test-secret';
    assert.deepEqual(await sendLeadToWorkflow(lead), { status: 503, body: { ok: false, status: 'unavailable' } });
    process.env.N8N_LEAD_WEBHOOK_URL = 'https://n8n.example/webhook/property-lead';
    delete process.env.N8N_LEAD_WEBHOOK_SECRET;
    assert.deepEqual(await sendLeadToWorkflow(lead), { status: 503, body: { ok: false, status: 'unavailable' } }, 'the secret is required');
    process.env.N8N_LEAD_WEBHOOK_SECRET = 'test-secret';

    globalThis.fetch = async () => Response.json({ ok: false, status: 'rejected', reasons: ['spam_links', 7], secret: 'x' }, { status: 400 });
    assert.deepEqual(await sendLeadToWorkflow(lead), { status: 400, body: { ok: false, status: 'rejected', reasons: ['spam_links'] } });

    globalThis.fetch = async () => Response.json({ ok: false, status: 'rate_limited' }, { status: 429 });
    assert.equal((await sendLeadToWorkflow(lead)).status, 429);

    globalThis.fetch = async () => new Response('<html>error</html>', { status: 500 });
    assert.deepEqual(await sendLeadToWorkflow(lead), { status: 503, body: { ok: false, status: 'unavailable' } });

    globalThis.fetch = async () => { throw new Error('network'); };
    assert.equal((await sendLeadToWorkflow(lead)).status, 503);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.N8N_LEAD_WEBHOOK_URL; else process.env.N8N_LEAD_WEBHOOK_URL = oldUrl;
    if (oldSecret === undefined) delete process.env.N8N_LEAD_WEBHOOK_SECRET; else process.env.N8N_LEAD_WEBHOOK_SECRET = oldSecret;
  }
});

test('lead request: all six brief fields and the honeypot are kept, each with its own size limit', () => {
  const full = { name: 'Ann', phone: '0891234567', email: 'ann.wtp.test@gmail.com', message: 'Looking for a condo', budget: '5M', area: 'Ari', website: '' };
  assert.deepEqual(leadRequest(full), { name: 'Ann', phone: '0891234567', email: 'ann.wtp.test@gmail.com', message: 'Looking for a condo', budget: '5M', area: 'Ari' });
  assert.equal(leadRequest({ ...full, website: 'http://bot.example' })?.website, 'http://bot.example', 'the honeypot reaches the workflow, which rejects it');
  for (const [field, max] of [['name', 120], ['phone', 40], ['email', 254], ['message', 2000], ['budget', 40], ['area', 120]] as const) {
    assert.ok(leadRequest({ ...full, [field]: 'x'.repeat(max) }), `${field} at its limit`);
    assert.equal(leadRequest({ ...full, [field]: 'x'.repeat(max + 1) }), null, `${field} over its limit`);
  }
  assert.equal(leadRequest({ ...full, budget: 5000000 }), null, 'numbers are not accepted as text');
});

test('webhook provider posts the lead as JSON and relays only known fields', async () => {
  const oldFetch = globalThis.fetch;
  const oldUrl = process.env.N8N_LEAD_WEBHOOK_URL;
  const oldSecret = process.env.N8N_LEAD_WEBHOOK_SECRET;
  process.env.N8N_LEAD_WEBHOOK_URL = 'https://n8n.example/webhook/property-lead';
  process.env.N8N_LEAD_WEBHOOK_SECRET = 'test-secret';
  const calls: { url: string; init: RequestInit }[] = [];
  try {
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), init: init! });
      return Response.json({ ok: true, status: 'received', message: 'Thanks', internal: 'not for the browser', reasons: 'not-a-list' });
    };
    const lead = { name: 'Ann', phone: '0891234567', message: 'Looking for a condo', budget: '5M', area: 'Ari' };
    const result = await sendLeadToWorkflow(lead);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://n8n.example/webhook/property-lead');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal((calls[0].init.headers as Record<string, string>)[WEBHOOK_SECRET_HEADER], 'test-secret', 'the webhook secret is sent');
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), lead);
    assert.ok(calls[0].init.signal, 'the call has a time limit');
    assert.deepEqual(result, { status: 200, body: { ok: true, status: 'received', message: 'Thanks' } });

    globalThis.fetch = async () => Response.json({ ok: false }, { status: 200 });
    assert.equal((await sendLeadToWorkflow(lead)).status, 503, 'an answer without a status is treated as unavailable');
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.N8N_LEAD_WEBHOOK_URL; else process.env.N8N_LEAD_WEBHOOK_URL = oldUrl;
    if (oldSecret === undefined) delete process.env.N8N_LEAD_WEBHOOK_SECRET; else process.env.N8N_LEAD_WEBHOOK_SECRET = oldSecret;
  }
});

test('a database row becomes the lead card the sales team sees', () => {
  const row: SubmissionRow = {
    id: 's1', message: 'Looking for a condo near BTS Ari', budget: '5500000', area: 'Ari', is_repeat: true,
    classification: 'hot', classification_source: 'ai', classification_reason: 'Ready to view this week.', classification_reason_th: 'พร้อมดูห้องสัปดาห์นี้',
    created_at: '2026-11-21T10:00:00Z',
    leads: { name: 'Ann', phone: '0891234567', email: null, submission_count: 2 },
    lead_notifications: [
      { kind: 'team_alert', status: 'sent', channel: 'team log (simulated)', attempts: 1, detail: { alert: 'HOT LEAD: Ann' } },
      { kind: 'auto_reply', status: 'sent', channel: 'sms (simulated)', attempts: 2, detail: { to: '0891234567', text: 'Hi Ann, thank you.' } },
    ],
  };
  const card = toLeadSummary(row);
  assert.equal(card.budget, 5500000, 'a numeric string from the database becomes a number');
  assert.equal(card.classificationReasonTh, 'พร้อมดูห้องสัปดาห์นี้');
  assert.equal(card.submissionCount, 2);
  assert.equal(card.isRepeat, true);
  assert.deepEqual(card.notifications, [
    { kind: 'team_alert', status: 'sent', channel: 'team log (simulated)', attempts: 1, text: 'HOT LEAD: Ann', to: null, error: null },
    { kind: 'auto_reply', status: 'sent', channel: 'sms (simulated)', attempts: 2, text: 'Hi Ann, thank you.', to: '0891234567', error: null },
  ]);
  // The admin-only list shows where each message went; the raw detail object from the database is never passed through.
  assert.ok(!JSON.stringify(card).includes('"detail"'), 'only known notification fields reach the browser');

  // A lead saved before migration 007, without a category yet, and with no budget.
  const older = toLeadSummary({ ...row, budget: null, classification: null, classification_source: null, classification_reason: null,
    classification_reason_th: undefined, leads: null, lead_notifications: [] });
  assert.equal(older.budget, null);
  assert.equal(older.classification, null);
  assert.equal(older.classificationReasonTh, null);
  assert.equal(older.name, '');
  assert.equal(older.submissionCount, 1);
  assert.deepEqual(older.notifications, []);
});
