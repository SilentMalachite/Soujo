import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import {
  archiveFile,
  archiveFiles,
  archiveMonth,
  createFile,
  ensureStateDir,
  findStateDir,
  isSymlink,
  leftoverTemps,
  packageDir,
  pluginDir,
  readState,
  readTemplate,
  removeLeftoverTemps,
  removeTempsOf,
  requireState,
  requireStateDir,
  statePath,
  stateTarget,
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

test('pluginDir finds .claude/plugins or .codex/plugins in the real path, where findStateDir sees no project', { skip: process.platform === 'win32' }, (t) => {
  const root = temp(t);
  const copy = join(root, '.claude', 'plugins', 'cache', 'soujo', 'soujo', 'abc');
  mkdirSync(join(copy, '.soujo'), { recursive: true });
  mkdirSync(join(copy, 'src'));
  mkdirSync(join(root, '.codex', 'plugins'), { recursive: true });
  assert.equal(pluginDir(copy), '.claude/plugins');
  assert.equal(pluginDir(join(copy, 'src')), '.claude/plugins');
  assert.equal(pluginDir(join(root, '.claude', 'plugins')), '.claude/plugins');
  assert.equal(pluginDir(join(root, '.codex', 'plugins')), '.codex/plugins');
  assert.equal(pluginDir(join(root, '.codex', 'plugins', 'missing')), '.codex/plugins');
  assert.equal(findStateDir(copy), undefined);
  assert.equal(findStateDir(join(copy, 'src')), undefined);
  assert.throws(() => requireStateDir(copy), /^Error: \.soujo\/ が見つからない（soujo init で作る）$/);

  // A symlink into the copy is caught; one from a plugin directory to an ordinary project is not.
  const project = join(root, 'project');
  mkdirSync(join(project, '.soujo'), { recursive: true });
  symlinkSync(copy, join(root, 'link'));
  symlinkSync(project, join(root, '.codex', 'plugins', 'project'));
  assert.equal(pluginDir(join(root, 'link')), '.claude/plugins');
  assert.equal(findStateDir(join(root, 'link')), undefined);
  assert.equal(pluginDir(join(root, '.codex', 'plugins', 'project')), undefined);
  assert.equal(realpathSync(findStateDir(join(root, '.codex', 'plugins', 'project')) ?? ''), realpathSync(join(project, '.soujo')));

  for (const near of [['.claude'], ['.claude', 'plugins-old'], ['claude', 'plugins'], ['.codex', 'plugin'], ['plugins', '.claude'], ['.claude', 'x', 'plugins']]) {
    mkdirSync(join(root, ...near, '.soujo'), { recursive: true });
    assert.equal(pluginDir(join(root, ...near)), undefined, near.join('/'));
    assert.equal(findStateDir(join(root, ...near)), join(root, ...near, '.soujo'), near.join('/'));
  }
});

test('readState returns undefined for a missing file and the text otherwise', (t) => {
  const dir = temp(t);
  assert.equal(readState(dir, 'NEXT.md'), undefined);
  assert.equal(readState(join(dir, 'missing'), 'NEXT.md'), undefined);
  writeFileSync(join(dir, 'NEXT.md'), '次: L1\n');
  assert.equal(readState(dir, 'NEXT.md'), '次: L1\n');
});

test('readState follows symlinks only inside the project and outside .git, and reads only regular files', { skip: process.platform === 'win32' }, (t) => {
  const outside = temp(t);
  writeFileSync(join(outside, 'secret'), 'token\n');
  const root = temp(t);
  const dir = join(root, '.soujo');
  mkdirSync(dir);
  mkdirSync(join(root, '.git'));
  writeFileSync(join(root, '.git', 'config'), 'token\n');
  writeFileSync(join(root, 'PLAN.md'), 'plan\n');
  symlinkSync('../PLAN.md', join(dir, 'PLAN.md'));
  symlinkSync(join(outside, 'secret'), join(dir, 'LOG.md'));
  symlinkSync('../.git/config', join(dir, 'NEXT.md'));
  symlinkSync('/dev/null', join(dir, 'SPEC.md'));
  assert.equal(readState(dir, 'PLAN.md'), 'plan\n');
  assert.throws(() => readState(dir, 'LOG.md'), /^Error: LOG\.md を読まない: 実体（symlink の先）がプロジェクトの外$/);
  assert.throws(() => readState(dir, 'NEXT.md'), /^Error: NEXT\.md を読まない: 実体（symlink の先）が\.git の中$/);
  assert.throws(() => readState(dir, 'SPEC.md'), /^Error: SPEC\.md を読まない: 実体（symlink の先）がプロジェクトの外$/);

  const fifo = temp(t);
  mkdirSync(join(fifo, '.soujo'));
  execFileSync('mkfifo', [join(fifo, '.soujo', 'NEXT.md')]);
  assert.throws(() => readState(join(fifo, '.soujo'), 'NEXT.md'), /^Error: NEXT\.md を読めない: 通常のファイルではない$/);

  const linkedDir = temp(t);
  symlinkSync(outside, join(linkedDir, '.soujo'));
  writeFileSync(join(outside, 'NEXT.md'), 'token\n');
  assert.throws(() => readState(join(linkedDir, '.soujo'), 'NEXT.md'), /を読まない: 実体（symlink の先）がプロジェクトの外$/);
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

test('writeState refuses symlinks to files outside the project or inside .git and writes nothing', { skip: process.platform === 'win32' }, (t) => {
  const outside = join(temp(t), 'config');
  writeFileSync(outside, 'keep\n');
  const root = temp(t);
  const dir = join(root, '.soujo');
  mkdirSync(dir);
  mkdirSync(join(root, '.git'));
  writeFileSync(join(root, '.git', 'config'), 'keep\n');
  symlinkSync(outside, join(dir, 'LOG.md'));
  symlinkSync('../.git/config', join(dir, 'NEXT.md'));
  assert.deepEqual(stateTarget(dir, 'LOG.md'), { path: realpathSync(outside), problem: 'プロジェクトの外' });
  assert.throws(() => writeState(dir, 'LOG.md', 'x'), /^Error: LOG\.md を書かない: 実体（symlink の先）がプロジェクトの外$/);
  assert.throws(() => writeState(dir, 'NEXT.md', 'x'), /^Error: NEXT\.md を書かない: 実体（symlink の先）が\.git の中$/);
  assert.equal(readFileSync(outside, 'utf8'), 'keep\n');
  assert.equal(readFileSync(join(root, '.git', 'config'), 'utf8'), 'keep\n');

  const linkedDir = temp(t);
  symlinkSync(dirname(outside), join(linkedDir, '.soujo'));
  assert.throws(() => writeState(join(linkedDir, '.soujo'), 'PLAN.md', 'x'), /を書かない: 実体（symlink の先）がプロジェクトの外$/);
  assert.equal(existsSync(join(dirname(outside), 'PLAN.md')), false);
});

test('writeState never writes through an existing temporary path, and removes only what it created', { skip: process.platform === 'win32' }, (t) => {
  const outside = join(temp(t), 'victim');
  writeFileSync(outside, 'keep\n');
  const dir = temp(t);
  writeFileSync(join(dir, 'NEXT.md'), 'old\n');
  const planted = join(dir, `.NEXT.md.${process.pid}.tmp`);
  symlinkSync(outside, planted);
  assert.throws(() => writeState(dir, 'NEXT.md', 'new\n'), /^Error: NEXT\.md を書けない: [^\n]*EEXIST/);
  assert.equal(readFileSync(outside, 'utf8'), 'keep\n');
  assert.equal(readState(dir, 'NEXT.md'), 'old\n');
  assert.ok(lstatSync(planted).isSymbolicLink());

  removeLeftoverTemps(dir);
  assert.equal(isSymlink(planted), false);
  assert.equal(readFileSync(outside, 'utf8'), 'keep\n');
  writeState(dir, 'NEXT.md', 'new\n');
  assert.equal(readState(dir, 'NEXT.md'), 'new\n');
});

test('writeState keeps the permissions of the file and of a symlink target', { skip: process.platform === 'win32' }, (t) => {
  const root = temp(t);
  const dir = join(root, '.soujo');
  mkdirSync(dir);
  writeFileSync(join(dir, 'LOG.md'), 'old\n', { mode: 0o600 });
  chmodSync(join(dir, 'LOG.md'), 0o600);
  writeFileSync(join(root, 'PLAN.md'), 'old\n');
  chmodSync(join(root, 'PLAN.md'), 0o640);
  symlinkSync('../PLAN.md', join(dir, 'PLAN.md'));
  writeState(dir, 'LOG.md', 'new\n');
  writeState(dir, 'PLAN.md', 'new\n');
  assert.equal(statSync(join(dir, 'LOG.md')).mode & 0o777, 0o600);
  assert.equal(statSync(join(root, 'PLAN.md')).mode & 0o777, 0o640);
  assert.equal(readFileSync(join(root, 'PLAN.md'), 'utf8'), 'new\n');
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

test('archiveFile names a month only, archiveMonth reads it back, and archiveFiles lists the archives in .soujo/', (t) => {
  assert.equal(archiveFile('2026-08'), 'LOG-2026-08.md');
  assert.equal(archiveMonth('LOG-2026-08.md'), '2026-08');
  for (const month of ['2026-8', '2026-13', '../../x', '2026-08/..', '']) assert.throws(() => archiveFile(month), /^Error: 月は YYYY-MM: /, month);
  assert.throws(() => archiveMonth('LOG-2026-13.md'), /^Error: 状態ファイルの名前ではない: LOG-2026-13\.md$/);

  const dir = join(temp(t), '.soujo');
  assert.deepEqual(archiveFiles(dir), []);
  mkdirSync(dir);
  for (const name of ['LOG-2026-09.md', 'LOG-2026-07.md', 'LOG.md', 'LOG-2026-7.md', 'LOG-2026-13.md', 'LOG-2026-08.md.bak', '.LOG-2026-06.md.1.tmp']) {
    writeFileSync(join(dir, name), '');
  }
  assert.deepEqual(archiveFiles(dir), ['LOG-2026-07.md', 'LOG-2026-09.md']);
});

test('stateTarget refuses names other than the state files and archives, so no name leaves .soujo/', (t) => {
  const dir = join(temp(t), '.soujo');
  mkdirSync(dir);
  writeFileSync(join(dir, 'LOG-2026-08.md'), 'archived\n');
  assert.equal(readState(dir, 'LOG-2026-08.md'), 'archived\n');
  writeState(dir, 'LOG-2026-09.md', 'new\n');
  assert.equal(readFileSync(join(dir, 'LOG-2026-09.md'), 'utf8'), 'new\n');
  for (const name of ['LOG-../../x.md', 'LOG-/../../x.md', 'LOG-2026-08.md/../../x', 'LOG-2026-13.md', 'notes.md']) {
    assert.throws(() => stateTarget(dir, name as 'LOG-x.md'), /^Error: 状態ファイルの名前ではない: /, name);
    assert.throws(() => statePath(name as 'LOG-x.md'), /^Error: 状態ファイルの名前ではない: /, name);
    assert.throws(() => writeState(dir, name as 'LOG-x.md', ''), /^Error: [^\n]* を書けない: 状態ファイルの名前ではない: /, name);
  }
  assert.equal(statePath('LOG-2026-08.md'), '.soujo/LOG-2026-08.md');
});

test('leftoverTemps lists and removeLeftoverTemps deletes temporary files of archives, existing or not', { skip: process.platform === 'win32' }, (t) => {
  const root = temp(t);
  const dir = join(root, '.soujo');
  mkdirSync(dir);
  writeFileSync(join(dir, 'LOG-2026-08.md'), '');
  mkdirSync(join(root, 'records'));
  writeFileSync(join(root, 'records', 'LOG.md'), '');
  symlinkSync('../records/LOG.md', join(dir, 'LOG.md'));
  const leftovers = [join(dir, '.LOG-2026-08.md.12.tmp'), join(dir, '.LOG-2026-07.md.34.tmp'), join(root, 'records', '.LOG.md.5.tmp')];
  const kept = [join(dir, '.LOG-2026-7.md.34.tmp'), join(dir, '.LOG-2026-13.md.34.tmp'), join(dir, '.LOG-2026-07.md.tmp')];
  for (const path of [...leftovers, ...kept]) writeFileSync(path, '');
  assert.deepEqual(leftoverTemps(dir).sort(), ['.soujo/.LOG-2026-07.md.34.tmp', '.soujo/.LOG-2026-08.md.12.tmp', 'records/.LOG.md.5.tmp']);
  assert.deepEqual(leftoverTemps(join(root, 'missing', '.soujo')), []);
  removeLeftoverTemps(dir);
  assert.deepEqual(leftoverTemps(dir), []);
  assert.deepEqual(leftovers.filter((path) => existsSync(path)), []);
  assert.deepEqual(kept.filter((path) => !existsSync(path)), []);
});

test('removeLeftoverTemps leaves files next to a symlink target outside the project', { skip: process.platform === 'win32' }, (t) => {
  const elsewhere = temp(t);
  writeFileSync(join(elsewhere, 'LOG.md'), '');
  writeFileSync(join(elsewhere, '.LOG.md.123.tmp'), 'not ours');
  const root = temp(t);
  mkdirSync(join(root, '.soujo'));
  symlinkSync(join(elsewhere, 'LOG.md'), join(root, '.soujo', 'LOG.md'));
  removeLeftoverTemps(join(root, '.soujo'));
  assert.ok(existsSync(join(elsewhere, '.LOG.md.123.tmp')));
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

test('createFile creates only when nothing exists, including symlinks, and leaves no temporary file', (t) => {
  const dir = temp(t);
  assert.equal(createFile(join(dir, 'a.md'), 'first\n'), true);
  assert.equal(createFile(join(dir, 'a.md'), 'second\n'), false);
  assert.equal(readFileSync(join(dir, 'a.md'), 'utf8'), 'first\n');
  symlinkSync('missing-target.md', join(dir, 'link.md'));
  assert.equal(createFile(join(dir, 'link.md'), 'x'), false);
  assert.deepEqual(readdirSync(dir).sort(), ['a.md', 'link.md']);
  assert.equal(statSync(join(dir, 'a.md')).nlink, 1);
});

test('createFile never writes through an existing temporary path, and removeTempsOf clears it', { skip: process.platform === 'win32' }, (t) => {
  const outside = join(temp(t), 'victim');
  writeFileSync(outside, 'keep\n');
  const dir = temp(t);
  const planted = join(dir, `.CLAUDE.md.${process.pid}.tmp`);
  symlinkSync(outside, planted);
  writeFileSync(join(dir, '.CLAUDE.md.77.tmp'), 'half');
  assert.throws(() => createFile(join(dir, 'CLAUDE.md'), 'x'), /^Error: CLAUDE\.md を作れない: [^\n]*EEXIST/);
  assert.equal(readFileSync(outside, 'utf8'), 'keep\n');
  assert.equal(existsSync(join(dir, 'CLAUDE.md')), false);

  removeTempsOf(join(dir, 'CLAUDE.md'));
  assert.deepEqual(readdirSync(dir), []);
  assert.equal(createFile(join(dir, 'CLAUDE.md'), 'x'), true);
});

test('packageDir finds the soujo package root and readTemplate reads from templates/', () => {
  const pkg = JSON.parse(readFileSync(join(packageDir(), 'package.json'), 'utf8')) as { name: string };
  assert.equal(pkg.name, 'soujo');
  assert.match(readTemplate('LOG.md'), /^# LOG/);
});
