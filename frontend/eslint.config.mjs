import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
export default defineConfig([
  ...nextVitals, ...nextTs,
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { patterns: [{
      group: ['**/backend/src/**', '@/backend/**', '@supabase/**'],
      message: 'Frontend communicates with the backend over HTTP; do not import its implementation or DB clients.',
    }] }] },
  },
  {
    files: ['src/{features,api,demo,shell,ui}/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { patterns: [{
      group: ['**/backend/src/**', '@/backend/**', '@supabase/**', '@/server/**', '**/server/**', 'node:*'],
      message: 'Browser modules use HTTP APIs and shared contracts, never server code.',
    }] }] },
  },
  globalIgnores(['.next*/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);
