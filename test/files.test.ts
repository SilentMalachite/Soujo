import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createFile,
  ensureStateDir,
  findStateDir,
  packageDir,
  readState,
  readTemplate,
  removeLeftoverTemps,
  requireState,
  requireStateDir,
  writeState,
} from '../src/files.js';
import { temp } from './helpers.js';

test('findStateDir walks up to the nearest .soujo directory and skips .soujo files', (t) => {
  const root = temp(t);
  mkdirSync(join(root, '.soujo'));
  mkdirSync(join(root, 'a', 'b'), { recursive: true });
  writeFileSync(join(root, 'a', '.soujo'), 'not a directory');
  assert.equal(findStateDir(join(root, 'a', 'b')), join(root, '.soujo'));
  assert.equal(findStateDir(join(root, '.soujo')), join(root, '.soujo'));
  assert.equal(requireStateDir(root), join(root, '.soujo'));
});

test('findStateDir stops at the git top level instead of using an outer project', (t) => {
  const root = temp(t);
  mkdirSync(join(root, '.soujo'));
  mkdirSync(join(root, 'repo', '.git'), { recursive: true });
  mkdirSync(join(root, 'repo', 'src'));
  mkdirSync(join(root, 'worktree'));
  writeFileSync(join(root, 'worktree', '.git'), 'gitdir: elsewhere\n');
  assert.equal(findStateDir(join(root, 'repo', 'src')), undefined);
  assert.equal(findStateDir(join(root, 'worktree')), undefined);

  mkdirSync(join(root, 'repo', '.soujo'));
  assert.equal(findStateDir(join(root, 'repo', 'src')), join(root, 'repo', '.soujo'));
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

test('removeLeftoverTemps deletes only writeState temporary files, next to symlink targets too', (t) => {
  const root = temp(t);
  const dir = join(root, '.soujo');
  mkdirSync(dir);
  writeFileSync(join(root, 'PLAN.real.md'), '');
  symlinkSync('../PLAN.real.md', join(dir, 'PLAN.md'));
  const leftovers = [join(dir, '.LOG.md.123.tmp'), join(dir, '.NEXT.md.9.tmp'), join(root, '.PLAN.real.md.456.tmp')];
  const kept = [join(dir, '.LOG.md.tmp'), join(dir, '.LOG.md.12a.tmp'), join(dir, 'notes.tmp'), join(root, '.PLAN.md.456.tmp')];
  for (const path of [...leftovers, ...kept]) writeFileSync(path, '');
  mkdirSync(join(dir, '.SPEC.md.7.tmp'));

  removeLeftoverTemps(dir);
  assert.deepEqual(leftovers.filter((path) => existsSync(path)), []);
  assert.deepEqual(kept.filter((path) => !existsSync(path)), []);
  assert.ok(existsSync(join(dir, '.SPEC.md.7.tmp')));
});

test('requireState throws for a missing file', (t) => {
  assert.throws(() => requireState(temp(t), 'PLAN.md'), /^Error: PLAN\.md がない（soujo init で作る）$/);
});

test('ensureStateDir creates .soujo/ once and fails in one line when a file is in the way', (t) => {
  const root = temp(t);
  assert.equal(ensureStateDir(root), join(root, '.soujo'));
  assert.equal(ensureStateDir(root), join(root, '.soujo'));
  const blocked = join(root, 'blocked');
  mkdirSync(blocked);
  writeFileSync(join(blocked, '.soujo'), '');
  assert.throws(() => ensureStateDir(blocked), /^Error: \.soujo\/ を作れない: [^\n]+$/);
});

test('createFile creates only when nothing exists, including symlinks', (t) => {
  const dir = temp(t);
  assert.equal(createFile(join(dir, 'a.md'), 'first\n'), true);
  assert.equal(createFile(join(dir, 'a.md'), 'second\n'), false);
  assert.equal(readFileSync(join(dir, 'a.md'), 'utf8'), 'first\n');
  symlinkSync('missing-target.md', join(dir, 'link.md'));
  assert.equal(createFile(join(dir, 'link.md'), 'x'), false);
});

test('packageDir finds the soujo package root and readTemplate reads from templates/', () => {
  const pkg = JSON.parse(readFileSync(join(packageDir(), 'package.json'), 'utf8')) as { name: string };
  assert.equal(pkg.name, 'soujo');
  assert.match(readTemplate('LOG.md'), /^# LOG/);
});
