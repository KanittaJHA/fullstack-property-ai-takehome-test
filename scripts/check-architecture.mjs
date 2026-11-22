import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../backend/package.json', import.meta.url));
const ts = require('typescript');

async function* sourceFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(file);
    else if (/\.tsx?$/.test(entry.name)) yield file;
  }
}

const failures = [];
for (const layer of ['backend/src', 'packages/contracts/src']) {
  for await (const file of sourceFiles(path.join(root, layer))) {
    const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const label = path.relative(root, file);
    function inspect(node) {
      const specifier = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
        ? node.moduleSpecifier
        : ts.isCallExpression(node) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(source) === 'require')
          ? node.arguments[0] : undefined;
      if (specifier && ts.isStringLiteral(specifier)) {
        const name = specifier.text;
        const resolved = name.startsWith('.') ? path.resolve(path.dirname(file), name) : name;
        if (
          /^(next(?:\/|$)|react(?:-dom)?(?:\/|$)|server-only$|@\/|@data\/)/.test(name) ||
          ['frontend', 'data', 'database'].some(folder => resolved.startsWith(path.join(root, folder) + path.sep))
        ) failures.push(`${label}: disallowed dependency ${name}`);
      }
      ts.forEachChild(node, inspect);
    }
    inspect(source);

    if (layer === 'packages/contracts/src') {
      for (const statement of source.statements) {
        const typeOnly = ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement) ||
          (ts.isImportDeclaration(statement) && statement.importClause?.isTypeOnly) ||
          (ts.isExportDeclaration(statement) && statement.isTypeOnly);
        if (!typeOnly) failures.push(`${label}: shared contracts must contain types only`);
      }
    }
  }
}
assert.equal(failures.length, 0, failures.join('\n'));
console.log('PASS: backend dependencies and type-only shared contracts.');
