// Tests the lead database functions (migrations 006–009) with synthetic leads, then deletes every lead it created.
// Needs SUPABASE_URL, SUPABASE_SECRET_KEY and SUPABASE_PUBLISHABLE_KEY.
// Run: node --env-file=backend/.env.local automation/tests/database.test.mjs
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '../../backend/node_modules/@supabase/supabase-js/dist/index.mjs';

for (const name of ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_PUBLISHABLE_KEY']) if (!process.env[name]) throw new Error(`Set ${name}; never print it.`);
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const key = () => createHash('sha256').update(randomUUID()).digest('hex');
const created = new Set();
const intake = async lead => {
  const { data, error } = await db.rpc('lead_intake', { p_lead: lead });
  if (error) throw new Error(`lead_intake: ${error.message}`);
  if (data.leadId) created.add(data.leadId);
  return data;
};
const record = async (action, payload) => {
  const { data, error } = await db.rpc('lead_record', { p_action: action, p_payload: payload });
  if (error) throw new Error(`lead_record: ${error.message}`);
  return data;
};
// Synthetic contact details: a random phone and a reserved .invalid email domain.
const tag = Date.now().toString().slice(-6);
const phone = `089${tag}1`;
const email = `test.lead.${tag}@example.invalid`;
let passed = 0;
const pass = label => console.log(`PASS ${++passed}: ${label}`);

try {
  const k1 = key();
  const first = await intake({ name: 'Test Lead', phone, email, message: 'Looking for a condo near BTS', budget: '5000000', area: 'Bangkok', requestKey: k1 });
  assert.equal(first.status, 'accepted'); assert.equal(first.isRepeat, false);
  pass('new lead accepted');

  const replay = await intake({ name: 'Test Lead', phone, email, message: 'Looking for a condo near BTS', requestKey: k1 });
  assert.equal(replay.status, 'replay'); assert.equal(replay.submissionId, first.submissionId);
  pass('same fingerprint is a replay, no new row');

  // Migration 008: while the first run holds the lease, a copy is not scored again; after it runs out, a copy takes over.
  assert.equal(replay.inProgress, true);
  await db.from('lead_submissions').update({ processing_until: new Date(Date.now() - 1000).toISOString() }).eq('id', first.submissionId);
  const takeover = await intake({ name: 'Test Lead', phone, email, message: 'Looking for a condo near BTS', requestKey: k1 });
  assert.equal(takeover.inProgress, false);
  const again = await intake({ name: 'Test Lead', phone, email, message: 'Looking for a condo near BTS', requestKey: k1 });
  assert.equal(again.inProgress, true);
  pass('processing lease: a copy within 2 minutes is "in progress"; after a stopped run the next copy takes over');

  const repeat = await intake({ name: 'Test Lead', phone: `+66 ${phone.slice(1, 3)} ${phone.slice(3)}`, message: 'Still interested', requestKey: key() });
  assert.equal(repeat.status, 'accepted'); assert.equal(repeat.isRepeat, true); assert.equal(repeat.leadId, first.leadId);
  pass('+66 phone format matches the same customer');

  const byEmail = await intake({ name: 'Test Lead', email: email.toUpperCase(), message: 'Third message', requestKey: key() });
  assert.equal(byEmail.leadId, first.leadId);
  pass('upper-case email matches the same customer');

  const limited = await intake({ name: 'Test Lead', phone, message: 'Fourth in 10 minutes', requestKey: key() });
  assert.equal(limited.status, 'rate_limited');
  pass('4th message in 10 minutes is rate-limited');

  for (const bad of [
    { name: '', phone: '0812345678', message: 'x', requestKey: key() },
    { name: 'A', phone: '123', message: 'x', requestKey: key() },
    { name: 'A', email: 'not-an-email', message: 'x', requestKey: key() },
    { name: 'A', phone: '0812345678', message: '   ', requestKey: key() },
    { name: 'A', phone: '0812345678', message: 'x', requestKey: 'short' },
  ]) assert.equal((await intake(bad)).status, 'invalid');
  pass('empty name, fake phone, bad email, blank message and bad fingerprint are invalid');

  const badBudget = await intake({ name: 'Other Lead', email: `other.${tag}@example.invalid`, message: 'Hi', budget: 'a lot', requestKey: key() });
  assert.equal(badBudget.status, 'accepted');
  pass('a budget that is not a number is stored as unknown instead of failing');

  // Migration 009: a message sent with an existing customer's phone cannot rename them or attach another email.
  const victimPhone = `089${tag}2`;
  const victim = await intake({ name: 'Real Customer', phone: victimPhone, message: 'Looking for a condo', requestKey: key() });
  const spoof = await intake({ name: 'Someone Else', phone: victimPhone, email: `spoof.${tag}@example.invalid`, message: 'Send details to me', requestKey: key() });
  assert.equal(spoof.leadId, victim.leadId);
  const { data: kept } = await db.from('leads').select('name,email,email_key,submission_count').eq('id', victim.leadId).single();
  assert.deepEqual(kept, { name: 'Real Customer', email: null, email_key: null, submission_count: 2 });
  pass("a repeat message keeps the customer's name and contacts as first given");

  await record('classify', { submissionId: first.submissionId, classification: 'hot', source: 'ai', reason: 'Clear budget and area', reasonTh: 'มีงบและทำเลชัดเจน' });
  const { data: lead } = await db.from('leads').select('latest_classification,submission_count,phone_key,email_key').eq('id', first.leadId).single();
  assert.equal(lead.latest_classification, 'hot'); assert.equal(lead.submission_count, 3);
  assert.equal(lead.phone_key, phone); assert.equal(lead.email_key, email);
  const { data: scored } = await db.from('lead_submissions').select('classification_reason,classification_reason_th').eq('id', first.submissionId).single();
  assert.equal(scored.classification_reason, 'Clear budget and area');
  assert.equal(scored.classification_reason_th, 'มีงบและทำเลชัดเจน');
  pass('category and both reasons saved (migration 007); customer counts 3 messages');

  const a1 = await record('notify', { submissionId: first.submissionId, kind: 'team_alert', status: 'failed', channel: 'webhook' });
  const a2 = await record('notify', { submissionId: first.submissionId, kind: 'team_alert', status: 'sent', channel: 'webhook' });
  assert.equal(a1.attempts, 1); assert.equal(a2.attempts, 2);
  const { data: notes } = await db.from('lead_notifications').select('status').eq('submission_id', first.submissionId);
  assert.equal(notes.length, 1); assert.equal(notes[0].status, 'sent');
  pass('a repeated notification updates one row (attempts 2)');

  await assert.rejects(record('classify', { submissionId: first.submissionId, classification: 'urgent', source: 'ai' }));
  pass('an unknown category is rejected');

  const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data: leaked } = await anon.from('leads').select('id');
  assert.ok(!leaked || leaked.length === 0);
  const { error: anonCall } = await anon.rpc('lead_intake', { p_lead: { name: 'x' } });
  assert.ok(anonCall);
  pass('the public key cannot read leads or call the functions');
  console.log(`ALL ${passed} PASSED`);
} finally {
  for (const id of created) {
    const { error } = await db.from('leads').delete().eq('id', id);
    if (error) console.error('cleanup failed for one test lead');
  }
  const { count } = await db.from('leads').select('id', { count: 'exact', head: true }).in('id', [...created]);
  console.log(`cleanup: ${created.size} test leads deleted, ${count ?? '?'} remain`);
}
