import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../src/cli.js', import.meta.url));

function soujo(...args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
}

test('unknown command prints one stderr line and exits 1', () => {
  const result = soujo('foo');
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'soujo: 不明なコマンド: foo\n');
});

test('missing command prints one stderr line and exits 1', () => {
  const result = soujo();
  assert.equal(result.status, 1);
  assert.equal(result.stderr, 'soujo: コマンドがありません\n');
});

test('newlines in arguments do not break the one-line error', () => {
  const result = soujo('a\nb');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^soujo: [^\n]*\n$/);
});
