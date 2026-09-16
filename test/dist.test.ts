import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageDir } from '../src/files.js';
import { testFiles } from './helpers.js';

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

// npm link and npm i -g make the bin executable in place; building it executable keeps git from seeing a mode change afterwards.
test('dist/cli.js is executable (run npm run build when this fails)', { skip: process.platform === 'win32' }, () => {
  // Only the owner bit: a restrictive umask checks out 750 or 700, which is still executable.
  assert.equal(statSync(join(packageDir(), 'dist', 'cli.js')).mode & 0o100, 0o100, 'dist/cli.js に実行ビットがない');
});

// test/run.ts lists the files, since cmd.exe, which npm runs scripts in on Windows, expands no glob and node 20 takes none.
test('npm test runs every test file without a glob', () => {
  const { scripts } = JSON.parse(readFileSync(join(packageDir(), 'package.json'), 'utf8')) as { scripts: Record<string, string> };
  assert.doesNotMatch(scripts.test ?? '', /[*?]/);
  assert.match(scripts.test ?? '', / && node \.test-dist\/test\/run\.js$/);
  const compiled = fileURLToPath(new URL('.', import.meta.url));
  const sources = readdirSync(join(packageDir(), 'test')).filter((name) => name.endsWith('.test.ts'));
  assert.deepEqual(testFiles(compiled), sources.map((name) => join(compiled, name.replace(/\.ts$/, '.js'))).sort());
});
