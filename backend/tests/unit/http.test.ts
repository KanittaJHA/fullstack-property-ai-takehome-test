import assert from 'node:assert/strict';
import { createAdminHandlers } from '../../src/auth/admin.handler.js';
import { REMOTE_ADDRESS_HEADER } from '../../src/http/client.js';
import test from 'node:test';
import { createApp } from '../../src/app.js';
import { sign } from '../../src/auth/admin-session.js';
import type { BusinessProfile } from '../../../packages/contracts/src/domain/business-profile.js';

test('standalone HTTP API: auth, authorization, origin, logout and failure isolation', async () => {
  const old = { ...process.env };
  process.env.ADMIN_ACCESS_CODE = 'test1234';
  process.env.ADMIN_SESSION_SECRET = 'unit-test-secret-that-is-long-enough';
  process.env.FRONTEND_ORIGIN = 'http://localhost:3100';
  delete process.env.NODE_ENV;
  let reads = 0;
  const app = createApp({
    listings: async () => Response.json([{ id: 'fixture' }]),
    match: async () => Response.json({ matches: [] }),
    profile: async () => { reads++; return { business_name: 'Test' } as BusinessProfile; },
  });
  const req = (path: string, method = 'GET', body?: string, headers: Record<string, string> = {}) => new Request(`http://localhost:4000${path}`, {
    method, headers: { ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body === undefined ? {} : { body }),
  });
  try {
    assert.equal((await app(req('/health'))).status, 200);
    assert.equal((await app(req('/listings'))).status, 200);
    assert.equal((await app(req('/business-profile'))).status, 401);
    assert.equal(reads, 0);
    assert.equal((await app(req('/auth/login', 'POST', '{"code":"test1234"}', { Origin: 'https://evil.invalid' }))).status, 403);
    assert.equal((await app(req('/auth/logout', 'POST', '{}', { 'Sec-Fetch-Site': 'cross-site' }))).status, 403);
    assert.equal((await app(req('/auth/login', 'POST', '{"code":"test1234"}', { 'Content-Type': 'text/plain' }))).status, 415);
    assert.equal((await app(req('/auth/login', 'POST', '{'))).status, 400);
    assert.equal((await app(req('/auth/login', 'POST', '{"code":"wrong123"}'))).status, 401);
    const login = await app(req('/auth/login', 'POST', '{"code":"test1234"}', { Origin: 'http://localhost:3100' }));
    assert.equal(login.status, 200);
    const setCookie = login.headers.get('set-cookie')!;
    assert.match(setCookie, /HttpOnly/); assert.match(setCookie, /SameSite=Strict/);
    const cookie = setCookie.split(';')[0];
    const session = await app(req('/auth/session', 'GET', undefined, { Cookie: cookie }));
    assert.deepEqual(await session.json(), { authenticated: true });
    assert.equal((await app(req('/business-profile', 'GET', undefined, { Cookie: cookie }))).status, 200);
    assert.equal(reads, 1);
    assert.equal((await app(req('/business-profile', 'GET', undefined, { Cookie: cookie + 'corrupt' }))).status, 401);
    const expired = String(Date.now() - 1);
    assert.equal((await app(req('/business-profile', 'GET', undefined, { Cookie: `workspace-demo-session=${expired}.${sign(expired)}` }))).status, 401);
    assert.match((await app(req('/auth/logout', 'POST', '{}'))).headers.get('set-cookie')!, /Max-Age=0/);
    assert.equal((await app(req('/auth/session', 'DELETE'))).status, 405);
    assert.equal((await app(req('/unknown'))).status, 404);
    const failing = createApp({ listings: async () => { throw new Error('secret detail'); }, match: async () => Response.json({}), profile: async () => { throw new Error('secret'); } });
    const failure = await failing(req('/listings'));
    assert.equal(failure.status, 503); assert.doesNotMatch(await failure.text(), /secret/);
    process.env.NODE_ENV = 'production';
    assert.match((await app(req('/auth/login', 'POST', '{"code":"test1234"}'))).headers.get('set-cookie')!, /Secure/);
    const limited = createApp();
    for (let i = 0; i < 20; i++) await limited(req('/auth/login', 'POST', '{"code":"test1234"}'));
    assert.equal((await limited(req('/auth/login', 'POST', '{"code":"test1234"}'))).status, 429);
  } finally {
    for (const key of ['ADMIN_ACCESS_CODE', 'ADMIN_SESSION_SECRET', 'FRONTEND_ORIGIN', 'NODE_ENV']) {
      if (old[key] === undefined) delete process.env[key]; else process.env[key] = old[key];
    }
  }
});

test('admin login is limited per client, so one caller cannot lock the team out', async () => {
  const saved = { code: process.env.ADMIN_ACCESS_CODE, secret: process.env.ADMIN_SESSION_SECRET };
  process.env.ADMIN_ACCESS_CODE = 'test1234';
  process.env.ADMIN_SESSION_SECRET = 'isolated-login-limit-test-secret-at-least-32';
  const admin = createAdminHandlers();
  const login = (address: string, code: string) => admin.login(new Request('http://localhost:4000/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', [REMOTE_ADDRESS_HEADER]: address }, body: JSON.stringify({ code }),
  }));
  try {
    const attacker: number[] = [];
    for (let i = 0; i < 11; i++) attacker.push((await login('10.0.0.66', 'wrong123')).status);
    assert.deepEqual([attacker.slice(0, 10).every(status => status === 401), attacker[10]], [true, 429]);
    assert.equal((await login('10.0.0.7', 'test1234')).status, 200, 'the team can still sign in from elsewhere');
  } finally {
    for (const [name, value] of [['ADMIN_ACCESS_CODE', saved.code], ['ADMIN_SESSION_SECRET', saved.secret]] as const) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
