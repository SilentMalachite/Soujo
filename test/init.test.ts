import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { init } from '../src/commands/init.js';
import { packageDir, readTemplate } from '../src/files.js';
import { parsePlan, validateNext } from '../src/state.js';
import { repo, temp } from './helpers.js';

const ALL = ['.soujo/SPEC.md', '.soujo/PLAN.md', '.soujo/LOG.md', '.soujo/NEXT.md', 'CLAUDE.md', 'AGENTS.md'];

test('init creates state files and instruction files at the git top level', (t) => {
  const dir = repo(t);
  mkdirSync(join(dir, 'sub'));
  assert.deepEqual(init(join(dir, 'sub')), ALL.map((path) => `作成: ${path}`));
  for (const path of ALL) {
    assert.equal(readFileSync(join(dir, path), 'utf8'), readTemplate(path.replace('.soujo/', '')), path);
  }
  assert.equal(existsSync(join(dir, 'sub', '.soujo')), false);
});

test('init outside git uses the current directory, never overwrites, and lists skipped files on one line', (t) => {
  const dir = temp(t);
  mkdirSync(join(dir, '.soujo'));
  writeFileSync(join(dir, 'CLAUDE.md'), 'mine\n');
  writeFileSync(join(dir, '.soujo', 'NEXT.md'), 'mine\n');
  assert.deepEqual(init(dir), [
    '作成: .soujo/SPEC.md',
    '作成: .soujo/PLAN.md',
    '作成: .soujo/LOG.md',
    '作成: AGENTS.md',
    '既存のため作らず: .soujo/NEXT.md, CLAUDE.md',
    'git リポジトリではない: layer done / close の前に git init が要る',
  ]);
  assert.equal(readFileSync(join(dir, 'CLAUDE.md'), 'utf8'), 'mine\n');
  assert.equal(readFileSync(join(dir, '.soujo', 'NEXT.md'), 'utf8'), 'mine\n');
  assert.deepEqual(init(dir), [`既存のため作らず: ${ALL.join(', ')}`, 'git リポジトリではない: layer done / close の前に git init が要る']);
});

test('init removes temporary files left by a killed write, next to CLAUDE.md and AGENTS.md too', (t) => {
  const dir = repo(t);
  mkdirSync(join(dir, '.soujo'));
  const leftovers = [join(dir, '.soujo', '.PLAN.md.99999.tmp'), join(dir, `.CLAUDE.md.${process.pid}.tmp`), join(dir, '.AGENTS.md.7.tmp')];
  for (const path of leftovers) writeFileSync(path, 'half');
  writeFileSync(join(dir, '.soujo', 'notes.tmp'), 'mine');
  assert.deepEqual(init(dir), ALL.map((path) => `作成: ${path}`));
  assert.deepEqual(leftovers.filter((path) => existsSync(path)), []);
  assert.equal(readFileSync(join(dir, '.soujo', 'notes.tmp'), 'utf8'), 'mine');
  assert.equal(readFileSync(join(dir, 'CLAUDE.md'), 'utf8'), readTemplate('CLAUDE.md'));
});

test('init refuses a .soujo/ or state file whose real path is outside the project or inside .git, and creates nothing', { skip: process.platform === 'win32' }, (t) => {
  const outside = temp(t);
  const linked = repo(t);
  symlinkSync(outside, join(linked, '.soujo'));
  assert.throws(() => init(linked), /^Error: \.soujo\/SPEC\.md の実体（symlink の先）がプロジェクトの外なので init しない$/);
  assert.deepEqual(readdirSync(outside), []);
  assert.equal(existsSync(join(linked, 'CLAUDE.md')), false);

  const intoGit = repo(t);
  symlinkSync('.git/hooks', join(intoGit, '.soujo'));
  const hooks = readdirSync(join(intoGit, '.git', 'hooks'));
  assert.throws(() => init(intoGit), /^Error: \.soujo\/SPEC\.md の実体（symlink の先）が\.git の中なので init しない$/);
  assert.deepEqual(readdirSync(join(intoGit, '.git', 'hooks')), hooks);

  const file = repo(t);
  mkdirSync(join(file, '.soujo'));
  writeFileSync(join(outside, 'LOG.md'), 'theirs\n');
  symlinkSync(join(outside, 'LOG.md'), join(file, '.soujo', 'LOG.md'));
  assert.throws(() => init(file), /^Error: \.soujo\/LOG\.md の実体（symlink の先）がプロジェクトの外なので init しない$/);
  assert.deepEqual(readdirSync(join(file, '.soujo')), ['LOG.md']);

  const inside = repo(t);
  mkdirSync(join(inside, 'records'));
  symlinkSync('records', join(inside, '.soujo'));
  init(inside);
  assert.equal(readFileSync(join(inside, 'records', 'NEXT.md'), 'utf8'), readTemplate('NEXT.md'));
});

test('templates: NEXT.md is valid, PLAN.md has no layers, CLAUDE.md / AGENTS.md are the repository copies without this repository\'s section', () => {
  assert.deepEqual(validateNext(readTemplate('NEXT.md')), []);
  assert.deepEqual(parsePlan(readTemplate('PLAN.md')), []);
  for (const file of ['CLAUDE.md', 'AGENTS.md']) {
    const template = readTemplate(file);
    const own = readFileSync(join(packageDir(), file), 'utf8');
    assert.ok(own.startsWith(`${template}\n## `), file);
    // A project of any stack gets these files, so nothing about Soujo's own stack or layout.
    assert.doesNotMatch(template, /TypeScript|node:test|dist\/|src\/|templates\//, file);
  }
});
