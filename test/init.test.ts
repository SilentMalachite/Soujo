import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { init } from '../src/commands/init.js';
import { packageDir, readTemplate } from '../src/files.js';
import { parsePlan, specUnwritten, validateNext, validateSpec } from '../src/state.js';
import { deadPid, repo, temp } from './helpers.js';

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

test('init refuses and creates nothing when git fails for a reason other than being outside a repository', (t) => {
  const dir = repo(t);
  mkdirSync(join(dir, 'sub'));
  writeFileSync(join(dir, '.git', 'config'), '[broken\n');
  assert.throws(() => init(join(dir, 'sub')), /^Error: git rev-parse に失敗: [^\n]+$/);
  assert.equal(existsSync(join(dir, '.soujo')), false);
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

test('init succeeds in a read-only directory that already has every file', { skip: process.platform === 'win32' || process.getuid?.() === 0 }, (t) => {
  const root = temp(t);
  mkdirSync(join(root, '.soujo'));
  for (const path of ALL) writeFileSync(join(root, path), 'mine\n');
  chmodSync(join(root, '.soujo'), 0o555);
  chmodSync(root, 0o555);
  try {
    assert.deepEqual(init(root), [
      `既存のため作らず: ${ALL.join(', ')}`,
      'git リポジトリではない: layer done / close の前に git init が要る',
    ]);
  } finally {
    chmodSync(root, 0o755);
    chmodSync(join(root, '.soujo'), 0o755);
  }
});

test('init in a read-only directory missing one file fails at that file and creates nothing', { skip: process.platform === 'win32' || process.getuid?.() === 0 }, (t) => {
  const root = temp(t);
  mkdirSync(join(root, '.soujo'));
  for (const path of ALL.filter((file) => file !== 'CLAUDE.md')) writeFileSync(join(root, path), 'mine\n');
  chmodSync(join(root, '.soujo'), 0o555);
  chmodSync(root, 0o555);
  try {
    assert.throws(() => init(root), /^Error: CLAUDE\.md を作れない: [^\n]*EACCES/);
    assert.deepEqual(readdirSync(root).sort(), ['.soujo', 'AGENTS.md']);
    assert.deepEqual(readdirSync(join(root, '.soujo')).sort(), ['LOG.md', 'NEXT.md', 'PLAN.md', 'SPEC.md']);
  } finally {
    chmodSync(root, 0o755);
    chmodSync(join(root, '.soujo'), 0o755);
  }
});

test('init removes temporary files left by a killed write, next to CLAUDE.md and AGENTS.md too', (t) => {
  const dir = repo(t);
  mkdirSync(join(dir, '.soujo'));
  const leftovers = [join(dir, '.soujo', `.PLAN.md.${deadPid()}.tmp`), join(dir, `.CLAUDE.md.${process.pid}.tmp`), join(dir, `.AGENTS.md.${deadPid()}.tmp`)];
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

  // Where the file system ignores case, .GIT is .git.
  const intoCasedGit = repo(t);
  if (existsSync(join(intoCasedGit, '.GIT'))) {
    symlinkSync('.GIT/hooks', join(intoCasedGit, '.soujo'));
    assert.throws(() => init(intoCasedGit), /^Error: \.soujo\/SPEC\.md の実体（symlink の先）が\.git の中なので init しない$/);
    assert.deepEqual(readdirSync(join(intoCasedGit, '.git', 'hooks')), hooks);
  }

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

test('init creates what is missing although two state files are one file, and refuses a dangling symlink to where one would be created', { skip: process.platform === 'win32' }, (t) => {
  const same = repo(t);
  mkdirSync(join(same, '.soujo'));
  writeFileSync(join(same, '.soujo', 'PLAN.md'), 'plan\n');
  symlinkSync('PLAN.md', join(same, '.soujo', 'LOG.md'));
  assert.ok(init(same).includes('作成: .soujo/NEXT.md'));
  assert.equal(readFileSync(join(same, '.soujo', 'PLAN.md'), 'utf8'), 'plan\n');

  const dangling = repo(t);
  mkdirSync(join(dangling, '.soujo'));
  symlinkSync('SPEC.md', join(dangling, '.soujo', 'NEXT.md'));
  assert.throws(() => init(dangling), /^Error: \.soujo\/SPEC\.md の場所が NEXT\.md（壊れた symlink）の先と同じなので init しない$/);
  assert.deepEqual(readdirSync(join(dangling, '.soujo')), ['NEXT.md']);
  assert.equal(existsSync(join(dangling, 'CLAUDE.md')), false);
});

test('templates: NEXT.md is valid, PLAN.md has no layers, CLAUDE.md / AGENTS.md are the repository copies without this repository\'s section', () => {
  assert.deepEqual(validateNext(readTemplate('NEXT.md')), []);
  assert.deepEqual(parsePlan(readTemplate('PLAN.md')), []);
  const spec = readTemplate('SPEC.md');
  assert.deepEqual(
    spec.split('\n').filter((line) => line.startsWith('#')),
    ['# SPEC', '## 原則', '## 目的', '## やらないこと', '## 受け入れ基準', '## 技術判断'],
  );
  assert.deepEqual([validateSpec(spec), specUnwritten(spec)], [[], true]);
  // The key forms the template shows as comments are the ones next check accepts once written out.
  const examples = [...spec.matchAll(/^<!-- (- [PA]1 .+) -->$/gm)].map((match) => match[1]);
  assert.deepEqual(examples.map((line) => line?.slice(0, 5)), ['- P1 ', '- A1 ']);
  const filled = spec.replace(/^<!-- (- [PA]1 .+) -->$/gm, '$1');
  assert.deepEqual([validateSpec(filled), specUnwritten(filled)], [[], false]);
  assert.match(readTemplate('NEXT.md'), /^確認: .*原則・目的・やらないこと・受け入れ基準・技術判断/m);
  for (const file of ['CLAUDE.md', 'AGENTS.md']) {
    const template = readTemplate(file);
    const own = readFileSync(join(packageDir(), file), 'utf8');
    assert.ok(own.startsWith(`${template}\n## `), file);
    // A project of any stack gets these files, so nothing about Soujo's own stack or layout.
    assert.doesNotMatch(template, /TypeScript|node:test|dist\/|src\/|templates\//, file);
  }
});
