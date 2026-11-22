// Run from backend: node --env-file=.env.local tests/integration/check-business-profile.mjs
// Read-only integration check; never logs credentials or profile contents.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
assert(url && secret && publishable, 'Configure the Supabase URL, publishable key and server secret first.');
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const server = createClient(url, secret, options);
const { data, error } = await server.from('business_profiles').select('profile')
  .eq('id', 'sunpro-solar').abortSignal(AbortSignal.timeout(10000)).single();
assert(!error && data, 'Server could not read the business profile. Check setup and key.');
const source = JSON.parse(await readFile(new URL('../../../data/business-profile.json', import.meta.url), 'utf8'));
assert.deepEqual(data.profile, source, 'Stored profile differs from the original fixture.');
const publicClient = createClient(url, publishable, options);
const publicResult = await publicClient.from('business_profiles').select('id')
  .abortSignal(AbortSignal.timeout(10000));
assert(publicResult.error?.code === '42501', 'Expected public access to be denied by table permissions.');
console.log('PASS: business profile matches the source; public access is denied.');
