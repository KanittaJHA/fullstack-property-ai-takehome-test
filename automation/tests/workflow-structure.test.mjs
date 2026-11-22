// Checks automation/workflow.json against the Task 3 brief, step by step: the path every kind of lead takes,
// the reliability settings, and that the exported file is safe to publish. Offline: no n8n, AI or database.
// Run: node automation/tests/workflow-structure.test.mjs (also part of npm run check)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const text = readFileSync(new URL('../workflow.json', import.meta.url), 'utf8');
const workflow = JSON.parse(text);
const node = name => { const found = workflow.nodes.find(n => n.name === name); assert.ok(found, `node "${name}" exists`); return found; };
// Output n of a node -> the names of the nodes it feeds (n8n: IF true = 0, false = 1; HTTP success = 0, error = 1).
const next = (name, output = 0) => (workflow.connections[name]?.main?.[output] ?? []).map(link => link.node);
const condition = name => node(name).parameters.conditions.conditions[0].leftValue;
let passed = 0;
const pass = label => console.log(`PASS ${++passed}: ${label}`);

// Brief 1: receive the lead through a webhook (JSON: name, phone, email, message, budget, area).
const webhook = node('New lead (webhook)');
assert.equal(webhook.type, 'n8n-nodes-base.webhook');
assert.equal(webhook.parameters.httpMethod, 'POST');
assert.equal(webhook.parameters.responseMode, 'responseNode', 'the caller gets the outcome, not just "workflow started"');
assert.equal(webhook.parameters.authentication, 'headerAuth', 'only callers with the shared secret header reach the workflow');
const checkCode = node('Check lead').parameters.jsCode;
for (const field of ['name', 'phone', 'email', 'message', 'budget', 'area']) assert.match(checkCode, new RegExp(`body\\.${field}\\b`), field);
assert.deepEqual(next('New lead (webhook)'), ['Settings']);
assert.deepEqual(next('Settings'), ['Check lead']);
pass('brief 1: a POST webhook reads all six fields and answers with the outcome');

// Brief 2: validate before anything is stored.
assert.deepEqual(next('Check lead'), ['Lead looks real?']);
assert.equal(condition('Lead looks real?'), '={{ $json.valid }}');
assert.deepEqual(next('Lead looks real?', 0), ['Save lead'], 'valid leads are saved');
assert.deepEqual(next('Lead looks real?', 1), ['Reply: rejected'], 'invalid leads are answered, not saved');
assert.equal(node('Reply: rejected').parameters.options.responseCode, 400);
assert.deepEqual(next('Reply: rejected'), []);
for (const rule of ['name_missing', 'contact_missing', 'message_missing', 'spam_links', 'spam_keywords', 'spam_honeypot', 'spam_repeated_characters', 'phone_invalid', 'email_fake'])
  assert.ok(checkCode.includes(rule), rule);
pass('brief 2: spam, empty and fake entries are rejected (400) before the save step');

// Brief 3: save to a store (Supabase), with a safe answer when the store is down.
assert.match(node('Save lead').parameters.url, /\/rest\/v1\/rpc\/lead_intake$/);
assert.deepEqual(next('Save lead', 0), ['Prepare lead']);
assert.deepEqual(next('Save lead', 1), ['Reply: try again later'], 'a failed save tells the customer to retry');
assert.equal(node('Reply: try again later').parameters.options.responseCode, 503);
pass('brief 3: valid leads are saved in Supabase; if that fails the customer is told to try again (503)');

// Brief 4: AI classifies hot / warm / cold from the message and budget, with a fallback.
const ai = node('AI: classify lead');
assert.match(ai.parameters.url, /generativelanguage\.googleapis\.com/);
assert.match(node('Prepare lead').parameters.jsCode, /enum: \['hot', 'warm', 'cold'\]/);
assert.equal(ai.onError, 'continueRegularOutput', 'an AI failure continues to the rules instead of stopping the run');
assert.deepEqual(next('AI: classify lead'), ['Decide category']);
assert.deepEqual(next('Decide category'), ['Save category']);
assert.match(node('Save category').parameters.jsonBody, /p_action: 'classify'/);
pass('brief 4: the AI gets the message and budget and must answer hot / warm / cold; if it fails, rules decide');

// Brief 5: hot -> notify the team; warm / cold -> no urgent notification.
assert.deepEqual(next('Save category'), ['Hot lead?']);
assert.match(condition('Hot lead?'), /classification === 'hot'/);
assert.deepEqual(next('Hot lead?', 0), ['Notify sales team'], 'hot leads alert the team');
assert.deepEqual(next('Hot lead?', 1), ['Send auto-reply'], 'warm and cold skip the alert');
assert.match(node('Notify sales team').parameters.jsonBody, /kind: 'team_alert'/);
const notifiers = workflow.nodes.filter(n => /team_alert/.test(n.parameters?.jsonBody ?? ''));
assert.deepEqual(notifiers.map(n => n.name), ['Notify sales team'], 'the team is alerted from one place only');
pass('brief 5: only the "hot" branch reaches the team alert; warm and cold go straight to the auto-reply');

// Brief 6: every saved lead gets an auto-reply, and the customer sees it.
assert.deepEqual(next('Notify sales team'), ['Send auto-reply'], 'hot leads also get the auto-reply');
assert.match(node('Send auto-reply').parameters.jsonBody, /kind: 'auto_reply'/);
assert.deepEqual(next('Send auto-reply'), ['Reply: received']);
assert.match(node('Reply: received').parameters.responseBody, /autoReply/);
pass('brief 6: hot, warm and cold leads all pass the auto-reply step, and its text is returned to the customer');

// Duplicates and rate limit (bonus): a resend is answered without scoring, notifying or replying again.
assert.equal(condition('New submission?'), '={{ $json.needsWork }}');
assert.deepEqual(next('Prepare lead'), ['New submission?']);
assert.deepEqual(next('New submission?', 0), ['AI: classify lead']);
assert.deepEqual(next('New submission?', 1), ['Reply: already received']);
// Evaluate the answer's n8n expressions for each database outcome.
const replay = node('Reply: already received').parameters;
const evaluate = (expression, status) => new Function('$json', `return (${expression.replace(/^=\{\{|\}\}$/g, '')})`)({ intake: { status } });
assert.deepEqual(['replay', 'rate_limited', 'invalid'].map(status => evaluate(replay.options.responseCode, status)), [200, 429, 400]);
assert.deepEqual(evaluate(replay.responseBody, 'replay'), { ok: true, status: 'already_received' });
assert.deepEqual(evaluate(replay.responseBody, 'rate_limited'), { ok: false, status: 'rate_limited' });
assert.match(checkCode, /createHash\('sha256'\)/, 'each message gets a fingerprint');
pass('duplicates and rate limit: resends get "already received", too many messages get 429, neither is scored again');

// Reliability: every call to an outside service retries and has a time limit.
for (const name of ['Save lead', 'AI: classify lead', 'Save category', 'Notify sales team', 'Send auto-reply']) {
  const step = node(name);
  assert.equal(step.retryOnFail, true, `${name} retries`);
  assert.ok(step.maxTries >= 2 && step.waitBetweenTries >= 1000, `${name} waits between tries`);
  assert.ok(step.parameters.options.timeout > 0 && step.parameters.options.timeout <= 20000, `${name} has a time limit`);
}
for (const name of ['Save category', 'Notify sales team', 'Send auto-reply']) assert.equal(node(name).onError, 'continueRegularOutput', `${name} failing does not stop the run`);
pass('reliability: all five outside calls retry with a pause and a time limit; once the lead is saved, a failed step after it still ends in the customer\'s reply');

// Every path ends in exactly one answer to the caller, and nothing is left unconnected.
const replies = workflow.nodes.filter(n => n.type === 'n8n-nodes-base.respondToWebhook').map(n => n.name).sort();
assert.deepEqual(replies, ['Reply: already received', 'Reply: received', 'Reply: rejected', 'Reply: try again later']);
for (const n of workflow.nodes.filter(n => !n.type.includes('stickyNote') && !replies.includes(n.name))) assert.ok(next(n.name).length > 0 || next(n.name, 1).length > 0, `${n.name} leads somewhere`);
pass('every path ends in one of four answers: received, already received / too many, rejected, try again later');

// Safe to publish: no keys, no project URLs, credentials referenced by name only.
assert.doesNotMatch(text, /AIza[0-9A-Za-z_-]{20,}|sb_secret_|sb_publishable_|eyJhbGciOi/, 'no API keys');
assert.doesNotMatch(text, /https:\/\/(?!YOUR-PROJECT-REF)[a-z0-9]{20}\.supabase\.co/, 'no real Supabase project URL');
assert.doesNotMatch(text, /\.app\.n8n\.cloud/, 'no n8n instance URL');
assert.match(node('Settings').parameters.jsCode, /https:\/\/YOUR-PROJECT-REF\.supabase\.co/);
for (const n of workflow.nodes.filter(n => n.credentials)) assert.equal(Object.values(n.credentials)[0].id, 'REPLACE_ME', `${n.name} has no real credential id`);
pass('the exported file holds no keys, project URLs or credential ids');

// Deliverables: the README a non-developer reads covers what the brief asks for, and the screenshots are linked.
const guide = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
for (const heading of ['## Why n8n', '## What happens to a message', '## How the AI scores a lead', '## Reliability: retries, failures and duplicates', '## Setup', '## Testing and results'])
  assert.ok(guide.includes(heading), heading);
for (const topic of [/retr(y|ies)/i, /fail/i, /duplicate/i, /rate|too many/i, /same phone or email/i]) assert.match(guide, topic);
pass('the guide explains why n8n, each step, the scoring, retries, failures, duplicates, setup and tests');

console.log(`ALL ${passed} PASSED`);
