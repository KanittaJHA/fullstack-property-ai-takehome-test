import assert from 'node:assert/strict';
import { ESLint } from 'eslint';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const eslint = new ESLint({ cwd: root });
for (const dependency of ['@/backend/properties/listings.repository', '../../../../backend/src/app', '@supabase/supabase-js', '@/server/backend', 'node:crypto']) {
  const [result] = await eslint.lintText(`import '${dependency}';\n`, { filePath: path.join(root, 'src/features/properties/probe.ts') });
  assert.ok(result.messages.some(m => m.ruleId === 'no-restricted-imports'), dependency);
}
for (const dependency of ['@contracts/domain/property', '@/api/auth']) {
  const [result] = await eslint.lintText(`import '${dependency}';\n`, { filePath: path.join(root, 'src/features/properties/probe.ts') });
  assert.ok(!result.messages.some(m => m.ruleId === 'no-restricted-imports'));
}
console.log('PASS: frontend/server boundaries and shared contract imports.');
