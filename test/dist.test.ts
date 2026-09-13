import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageDir } from '../src/files.js';

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => (entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]))
    .sort();
}

// npm test compiles src/ afresh into .test-dist/src/ with the same compiler options as dist/.
// hooks call dist/cli.js directly, so a forgotten `npm run build` must fail the tests.
test('dist/ matches the current src/ (run npm run build when this fails)', () => {
  const fresh = fileURLToPath(new URL('../src/', import.meta.url));
  const built = join(packageDir(), 'dist');
  const freshFiles = files(fresh).map((path) => relative(fresh, path));
  assert.deepEqual(files(built).map((path) => relative(built, path)), freshFiles, 'dist/ のファイル構成が古い');
  for (const path of freshFiles) {
    assert.equal(readFileSync(join(built, path), 'utf8'), readFileSync(join(fresh, path), 'utf8'), `dist/${path} が古い`);
  }
});
