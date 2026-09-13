import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findStateDir, readState, requireStateDir, writeState } from '../src/files.js';

function temp(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), 'soujo-files-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('findStateDir walks up to the nearest .soujo directory and skips .soujo files', (t) => {
  const root = temp(t);
  mkdirSync(join(root, '.soujo'));
  mkdirSync(join(root, 'a', 'b'), { recursive: true });
  writeFileSync(join(root, 'a', '.soujo'), 'not a directory');
  assert.equal(findStateDir(join(root, 'a', 'b')), join(root, '.soujo'));
  assert.equal(findStateDir(join(root, '.soujo')), join(root, '.soujo'));
  assert.equal(requireStateDir(root), join(root, '.soujo'));
});

test('findStateDir returns undefined and requireStateDir throws outside Soujo projects', (t) => {
  const root = temp(t);
  assert.equal(findStateDir(root), undefined);
  assert.throws(() => requireStateDir(root), /^Error: \.soujo\/ が見つからない（soujo init で作る）$/);
});

test('readState returns undefined for a missing file and the text otherwise', (t) => {
  const dir = temp(t);
  assert.equal(readState(dir, 'NEXT.md'), undefined);
  writeFileSync(join(dir, 'NEXT.md'), '次: L1\n');
  assert.equal(readState(dir, 'NEXT.md'), '次: L1\n');
});

test('writeState replaces the file without leaving temporary files', (t) => {
  const dir = temp(t);
  writeState(dir, 'LOG.md', 'one\n');
  writeState(dir, 'LOG.md', 'two\n');
  assert.equal(readState(dir, 'LOG.md'), 'two\n');
  assert.deepEqual(readdirSync(dir), ['LOG.md']);
});

test('writeState writes through a symlink and keeps it', (t) => {
  const root = temp(t);
  mkdirSync(join(root, '.soujo'));
  writeFileSync(join(root, 'PLAN.md'), 'old\n');
  symlinkSync('../PLAN.md', join(root, '.soujo', 'PLAN.md'));
  writeState(join(root, '.soujo'), 'PLAN.md', 'new\n');
  assert.ok(lstatSync(join(root, '.soujo', 'PLAN.md')).isSymbolicLink());
  assert.equal(readFileSync(join(root, 'PLAN.md'), 'utf8'), 'new\n');
});

test('writeState reports a one-line error when the directory is missing', (t) => {
  const dir = join(temp(t), 'missing');
  assert.throws(() => writeState(dir, 'NEXT.md', 'x'), /^Error: NEXT\.md を書けない: [^\n]+$/);
});
