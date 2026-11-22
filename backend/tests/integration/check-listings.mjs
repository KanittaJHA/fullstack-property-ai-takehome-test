// Run with the development server and seeded Supabase project available.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = JSON.parse(await readFile(new URL('../../../data/listings.json', import.meta.url), 'utf8'));
const base = process.env.TEST_BASE_URL || 'http://localhost:3100';
const cases = [
  ['', source],
  ['?city=Bangkok&maxPrice=6000000&bedrooms=2', source.filter(p => p.id === 'P001')],
  ['?bedrooms=0', source.filter(p => p.id === 'P004')],
  ['?maxPrice=0', []],
  ['?city=Unknown', []],
  ['?city=bangkok', source.filter(p => p.city === 'Bangkok')],
  ['?city=CHIANG%20MAI', source.filter(p => p.city === 'Chiang Mai')],
  ['?city=Bang%25', []],
  ['?city=Pattay_', []],
];
for (const [query, expected] of cases) {
  const response = await fetch(`${base}/listings${query}`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), expected);
}
for (const query of ['?maxPrice=-1', '?bedrooms=1.2', '?bedrooms=abc', '?city=', '?maxPrice=Infinity']) {
  const response = await fetch(`${base}/listings${query}`);
  assert.equal(response.status, 400);
}
console.log('PASS: source fidelity, filters, empty results, and invalid inputs.');
