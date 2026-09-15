import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
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
  isDotGit,
  isRunning,
  isSymlink,
  pathKey,
  place,
  sameFile,
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
  stateTemps,
  symlinkTargetParts,
  writeState,
} from '../src/files.js';
import { deadPid, livePid, temp } from './helpers.js';

test('symlinkTargetParts leaves a relative link unresolved and takes an absolute one through real paths', { skip: process.platform === 'win32' }, (t) => {
  assert.deepEqual(symlinkTargetParts('/nowhere', '.soujo/PLAN.md', '../docs/./PLAN.md'), ['.soujo', '..', 'docs', '.', 'PLAN.md']);
  assert.deepEqual(symlinkTargetParts('/nowhere', 'PLAN.md', '../../PLAN.md'), ['.', '..', '..', 'PLAN.md']);
  const root = temp(t);
  mkdirSync(join(root, 'docs'));
  symlinkSync('docs', join(root, 'linked'));
  assert.deepEqual(symlinkTargetParts(root, '.soujo/LOG.md', join(realpathSync(root), 'missing', 'LOG.md')), ['missing', 'LOG.md']);
  assert.deepEqual(symlinkTargetParts(realpathSync(root), '.soujo/LOG.md', join(root, 'linked', 'LOG.md')), ['docs', 'LOG.md']);
});

test('symlinkTargetParts splits a relative link at "\\" only where that is a separator', () => {
  assert.deepEqual(symlinkTargetParts('/nowhere', '.soujo/PLAN.md', '..\\docs/PLAN.md', '\\'), ['.soujo', '..', 'docs', 'PLAN.md']);
  assert.deepEqual(symlinkTargetParts('/nowhere', '.soujo/PLAN.md', '..\\docs/PLAN.md', '/'), ['.soujo', '..\\docs', 'PLAN.md']);
});

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

test('pluginDir finds .claude/plugins or .codex/plugins in any letter case, where findStateDir sees no project', (t) => {
  const root = temp(t);
  for (const host of ['.claude', '.codex']) {
    const copy = join(root, host, 'plugins', 'cache', 'soujo', 'soujo', 'abc');
    mkdirSync(join(copy, '.soujo'), { recursive: true });
    mkdirSync(join(copy, 'src'));
    for (const dir of [copy, join(copy, 'src'), join(copy, '.soujo'), join(root, host, 'plugins'), join(root, host, 'plugins', 'missing', 'deeper')]) {
      assert.equal(pluginDir(dir), `${host}/plugins`, dir);
      assert.equal(findStateDir(dir), undefined, dir);
    }
    assert.throws(() => requireStateDir(copy), /^Error: \.soujo\/ が見つからない（soujo init で作る）$/);
  }

  const cased = temp(t);
  for (const [host, plugins, found] of [['.Claude', 'Plugins', '.claude/plugins'], ['.CODEX', 'PLUGINS', '.codex/plugins']] as const) {
    const copy = join(cased, host, plugins, 'cache', 'x');
    mkdirSync(join(copy, '.soujo'), { recursive: true });
    assert.equal(pluginDir(copy), found, copy);
    assert.equal(findStateDir(copy), undefined, copy);
  }

  for (const near of [['.claude'], ['.claude', 'plugins-old'], ['claude', 'plugins'], ['.codex', 'plugin'], ['plugins', '.claude'], ['.claude', 'x', 'plugins']]) {
    mkdirSync(join(root, ...near, '.soujo'), { recursive: true });
    assert.equal(pluginDir(join(root, ...near)), undefined, near.join('/'));
    assert.equal(findStateDir(join(root, ...near)), join(root, ...near, '.soujo'), near.join('/'));
  }
});

test('findStateDir never reaches a .soujo above an install cache without .git', (t) => {
  const root = temp(t);
  mkdirSync(join(root, '.soujo'));
  mkdirSync(join(root, 'plain', 'x'), { recursive: true });
  assert.equal(findStateDir(join(root, 'plain', 'x')), join(root, '.soujo'));
  for (const host of ['.claude', '.codex']) {
    // Claude Code's install cache copies the working tree without .git; x has no .soujo of its own, y has one.
    const bare = join(root, host, 'plugins', 'cache', 'x');
    const copy = join(root, host, 'plugins', 'cache', 'y');
    mkdirSync(join(bare, 'src'), { recursive: true });
    mkdirSync(join(copy, '.soujo'), { recursive: true });
    for (const dir of [bare, join(bare, 'src'), copy]) assert.equal(findStateDir(dir), undefined, dir);
  }
});

test('pluginDir follows symlinks: one into a plugin directory is caught, one from there to an ordinary project is not', { skip: process.platform === 'win32' }, (t) => {
  const root = temp(t);
  const copy = join(root, '.claude', 'plugins', 'cache', 'soujo', 'soujo', 'abc');
  mkdirSync(join(copy, '.soujo'), { recursive: true });
  mkdirSync(join(root, '.codex', 'plugins'), { recursive: true });
  const project = join(root, 'project');
  mkdirSync(join(project, '.soujo'), { recursive: true });
  symlinkSync(copy, join(root, 'link'));
  symlinkSync(project, join(root, '.codex', 'plugins', 'project'));
  assert.equal(pluginDir(join(root, 'link')), '.claude/plugins');
  assert.equal(findStateDir(join(root, 'link')), undefined);
  assert.equal(pluginDir(join(root, '.codex', 'plugins', 'project')), undefined);
  assert.equal(realpathSync(findStateDir(join(root, '.codex', 'plugins', 'project')) ?? ''), realpathSync(join(project, '.soujo')));
});

test('pluginDir follows the symlinks of the nearest resolvable ancestor when the real path fails', { skip: process.platform === 'win32' || process.getuid?.() === 0 }, (t) => {
  const root = temp(t);
  const cache = join(root, '.codex', 'plugins', 'cache');
  const locked = join(cache, 'locked');
  mkdirSync(join(locked, 'inner'), { recursive: true });
  symlinkSync('loop', join(cache, 'loop'));
  symlinkSync(cache, join(root, 'link'));
  chmodSync(locked, 0o000);
  try {
    const cases: [string, string][] = [[join(root, 'link', 'locked', 'inner'), 'EACCES'], [join(root, 'link', 'loop', 'x'), 'ELOOP'], [join(root, 'link', 'missing'), 'ENOENT']];
    for (const [dir, code] of cases) {
      assert.throws(() => realpathSync(dir), { code }, dir);
      assert.equal(pluginDir(dir), '.codex/plugins', dir);
    }
  } finally {
    chmodSync(locked, 0o755);
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
  assert.deepEqual(stateTarget(dir, 'LOG.md'), { path: realpathSync(outside), problem: { text: '実体（symlink の先）がプロジェクトの外', elsewhere: true } });
  assert.throws(() => writeState(dir, 'LOG.md', 'x'), /^Error: LOG\.md を書かない: 実体（symlink の先）がプロジェクトの外$/);
  assert.throws(() => writeState(dir, 'NEXT.md', 'x'), /^Error: NEXT\.md を書かない: 実体（symlink の先）が\.git の中$/);
  assert.equal(readFileSync(outside, 'utf8'), 'keep\n');
  assert.equal(readFileSync(join(root, '.git', 'config'), 'utf8'), 'keep\n');

  const linkedDir = temp(t);
  symlinkSync(dirname(outside), join(linkedDir, '.soujo'));
  assert.throws(() => writeState(join(linkedDir, '.soujo'), 'PLAN.md', 'x'), /を書かない: 実体（symlink の先）がプロジェクトの外$/);
  assert.equal(existsSync(join(dirname(outside), 'PLAN.md')), false);
});

test('isDotGit takes the names a file system may hand to .git, so that none of them is followed', () => {
  for (const name of ['.git', '.GIT', '.Git', '.git.', '.git ', '.git. .', '.git::$INDEX_ALLOCATION', 'GIT~1', 'git~2', '.g‌it']) {
    assert.equal(isDotGit(name), true, name);
  }
  for (const name of ['git', '.gitignore', '.github', '.gitmodules', 'agit', '.soujo', '.', '..', 'LOG.md', '']) {
    assert.equal(isDotGit(name), false, name);
  }
});

test('pathKey compares paths in NFC, and ignores letter case only where told to', () => {
  assert.equal(pathKey('/p/Á.md', false), pathKey('/p/Á.md', false));
  assert.notEqual(pathKey('/p/LOG.md', false), pathKey('/p/log.md', false));
  assert.equal(pathKey('/p/LOG.md', true), pathKey('/p/log.md', true));
});

test('sameFile takes one inode for one file only when the path, or the size and creation time, agree as well', () => {
  const file = { key: '/p/a.md', inode: '1:2', size: 10n, birthtime: 5n };
  assert.equal(sameFile(file, { ...file }), true);
  assert.equal(sameFile(file, { ...file, key: '/p/A.MD' }), true);
  // An inode repeated by the file system (ReFS, some FUSE and SMB mounts) is not enough by itself.
  assert.equal(sameFile(file, { ...file, key: '/p/b.md', size: 11n }), false);
  assert.equal(sameFile({ key: '/p/a.md' }, { key: '/p/a.md' }), true);
  assert.equal(sameFile({ key: '/p/a.md' }, { key: '/p/b.md' }), false);
});

test('stateTarget takes .git in any letter case as .git, since the file system may ignore case', { skip: process.platform === 'win32' }, (t) => {
  const root = temp(t);
  const dir = join(root, '.soujo');
  mkdirSync(dir);
  mkdirSync(join(root, '.GIT'));
  writeFileSync(join(root, '.GIT', 'config'), 'keep\n');
  symlinkSync('../.GIT/config', join(dir, 'NEXT.md'));
  assert.deepEqual(stateTarget(dir, 'NEXT.md'), {
    path: realpathSync(join(root, '.GIT', 'config')),
    problem: { text: '実体（symlink の先）が.git の中', elsewhere: true },
  });
  assert.throws(() => readState(dir, 'NEXT.md'), /^Error: NEXT\.md を読まない: 実体（symlink の先）が\.git の中$/);
  assert.throws(() => writeState(dir, 'NEXT.md', 'x'), /^Error: NEXT\.md を書かない: 実体（symlink の先）が\.git の中$/);
  assert.equal(readFileSync(join(root, '.GIT', 'config'), 'utf8'), 'keep\n');
});

test('stateTarget refuses a state file or archive that is the same file as another one, naming the symlink', { skip: process.platform === 'win32' }, (t) => {
  const root = temp(t);
  const dir = join(root, '.soujo');
  mkdirSync(dir);
  mkdirSync(join(root, 'docs'));
  writeFileSync(join(dir, 'LOG.md'), 'log\n');
  writeFileSync(join(root, 'docs', 'PLAN.md'), 'plan\n');
  symlinkSync('LOG.md', join(dir, 'LOG-2026-08.md'));
  symlinkSync('../docs/PLAN.md', join(dir, 'PLAN.md'));
  symlinkSync('docs', join(root, 'alias'));
  symlinkSync('../alias/PLAN.md', join(dir, 'NEXT.md'));
  assert.deepEqual(stateTarget(dir, 'LOG-2026-08.md'), {
    path: realpathSync(join(dir, 'LOG.md')),
    problem: { text: '実体（symlink の先）が LOG.md と同じ' },
  });
  assert.equal(stateTarget(dir, 'LOG.md').problem?.text, '実体が LOG-2026-08.md（symlink）の先と同じ');
  assert.throws(() => writeState(dir, 'LOG-2026-08.md', 'x'), /^Error: LOG-2026-08\.md を書かない: 実体（symlink の先）が LOG\.md と同じ$/);
  assert.throws(() => writeState(dir, 'PLAN.md', 'x'), /^Error: PLAN\.md を書かない: 実体（symlink の先）が NEXT\.md と同じ$/);
  assert.throws(() => readState(dir, 'NEXT.md'), /^Error: NEXT\.md を読まない: 実体（symlink の先）が PLAN\.md と同じ$/);
  assert.deepEqual([readFileSync(join(dir, 'LOG.md'), 'utf8'), readFileSync(join(root, 'docs', 'PLAN.md'), 'utf8')], ['log\n', 'plan\n']);
  assert.deepEqual(stateTarget(dir, 'SPEC.md'), { path: join(realpathSync(dir), 'SPEC.md') });
});

test('stateTarget refuses state files a hard link makes one file, on every platform', (t) => {
  const dir = temp(t);
  writeFileSync(join(dir, 'PLAN.md'), 'plan\n');
  linkSync(join(dir, 'PLAN.md'), join(dir, 'LOG.md'));
  assert.equal(stateTarget(dir, 'LOG.md').problem?.text, '実体が PLAN.md と同じ（hard link）');
  assert.throws(() => writeState(dir, 'LOG.md', 'x'), /^Error: LOG\.md を書かない: 実体が PLAN\.md と同じ（hard link）$/);
  assert.throws(() => readState(dir, 'LOG.md'), /^Error: LOG\.md を読まない: 実体が PLAN\.md と同じ（hard link）$/);
  assert.equal(readFileSync(join(dir, 'PLAN.md'), 'utf8'), 'plan\n');
});

test('stateTarget refuses a dangling symlink leading to where another state file or archive is created, only for writing', { skip: process.platform === 'win32' }, (t) => {
  const dir = join(temp(t), '.soujo');
  mkdirSync(dir);
  symlinkSync('missing.md', join(dir, 'LOG-2026-07.md'));
  symlinkSync('LOG-2026-07.md', join(dir, 'LOG-2026-08.md'));
  symlinkSync('SPEC.md', join(dir, 'NEXT.md'));
  symlinkSync('missing.md', join(dir, 'PLAN.md'));
  assert.deepEqual(stateTarget(dir, 'LOG-2026-07.md').problem, {
    text: '場所が LOG-2026-08.md（壊れた symlink）の先と同じ',
    whenWritten: true,
  });
  assert.deepEqual(stateTarget(dir, 'LOG-2026-08.md').problem, {
    text: '壊れた symlink の先が LOG-2026-07.md（まだ無い）と同じ',
    whenWritten: true,
  });
  assert.equal(stateTarget(dir, 'SPEC.md').problem?.text, '場所が NEXT.md（壊れた symlink）の先と同じ');
  assert.throws(() => writeState(dir, 'LOG-2026-07.md', 'x'), /^Error: LOG-2026-07\.md を書かない: 場所が LOG-2026-08\.md（壊れた symlink）の先と同じ$/);
  assert.ok(lstatSync(join(dir, 'LOG-2026-07.md')).isSymbolicLink());
  // Reading is left alone: nothing is shared until one of them is written, and a missing file stays missing.
  assert.equal(readState(dir, 'SPEC.md'), undefined);
  assert.equal(readState(dir, 'LOG-2026-08.md'), undefined);
  // Two dangling symlinks to one missing file are each replaced by a file of their own.
  assert.deepEqual(stateTarget(dir, 'PLAN.md'), { path: join(realpathSync(dir), 'PLAN.md') });
});

test('stateTarget follows a link part by part, through several links and past "..", as the operating system does', { skip: process.platform === 'win32' }, (t) => {
  const root = temp(t);
  const dir = join(root, '.soujo');
  mkdirSync(join(dir, 'sub'), { recursive: true });
  symlinkSync('.soujo/sub', join(root, 'up'));
  symlinkSync('../up/../LOG-2026-07.md', join(dir, 'LOG-2026-08.md'));
  assert.equal(stateTarget(dir, 'LOG-2026-08.md').problem?.text, '壊れた symlink の先が LOG-2026-07.md（まだ無い）と同じ');

  const chained = join(temp(t), '.soujo');
  mkdirSync(chained);
  symlinkSync('x.md', join(chained, 'LOG-2026-08.md'));
  symlinkSync('LOG-2026-07.md', join(chained, 'x.md'));
  assert.equal(stateTarget(chained, 'LOG-2026-08.md').problem?.text, '壊れた symlink の先が LOG-2026-07.md（まだ無い）と同じ');

  const loop = join(temp(t), '.soujo');
  mkdirSync(loop);
  symlinkSync('SPEC.md', join(loop, 'NEXT.md'));
  symlinkSync('NEXT.md', join(loop, 'SPEC.md'));
  assert.equal(stateTarget(loop, 'NEXT.md').problem, undefined);
});

test('stateTarget takes a differently cased link target for the same place only where the file system ignores case', { skip: process.platform === 'win32' }, (t) => {
  const dir = join(temp(t), '.soujo');
  mkdirSync(dir);
  writeFileSync(join(dir, 'probe'), '');
  const ignoresCase = existsSync(join(dir, 'PROBE'));
  rmSync(join(dir, 'probe'));
  symlinkSync('log-2026-07.md', join(dir, 'LOG-2026-08.md'));
  assert.equal(stateTarget(dir, 'LOG-2026-08.md').problem?.whenWritten, ignoresCase ? true : undefined);
  assert.equal(stateTarget(dir, 'LOG-2026-07.md').problem?.whenWritten, ignoresCase ? true : undefined);
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
  const gone = deadPid();
  const leftovers = [join(dir, `.LOG.md.${gone}.tmp`), join(dir, `.NEXT.md.${gone}.tmp`), join(root, `.PLAN.real.md.${gone}.tmp`)];
  const kept = [join(dir, '.LOG.md.tmp'), join(dir, '.LOG.md.12a.tmp'), join(dir, 'notes.tmp'), join(root, `.PLAN.md.${gone}.tmp`)];
  for (const path of [...leftovers, ...kept]) writeFileSync(path, '');
  mkdirSync(join(dir, `.SPEC.md.${gone}.tmp`));

  removeLeftoverTemps(dir);
  assert.deepEqual(leftovers.filter((path) => existsSync(path)), []);
  assert.deepEqual(kept.filter((path) => !existsSync(path)), []);
  assert.ok(existsSync(join(dir, `.SPEC.md.${gone}.tmp`)));
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
  const gone = deadPid();
  const leftovers = [join(dir, `.LOG-2026-08.md.${gone}.tmp`), join(dir, `.LOG-2026-07.md.${gone}.tmp`), join(root, 'records', `.LOG.md.${gone}.tmp`)];
  const kept = [join(dir, `.LOG-2026-7.md.${gone}.tmp`), join(dir, `.LOG-2026-13.md.${gone}.tmp`), join(dir, '.LOG-2026-07.md.tmp')];
  for (const path of [...leftovers, ...kept]) writeFileSync(path, '');
  assert.deepEqual(leftoverTemps(dir).sort(), [
    `.soujo/.LOG-2026-07.md.${gone}.tmp`,
    `.soujo/.LOG-2026-08.md.${gone}.tmp`,
    `records/.LOG.md.${gone}.tmp`,
  ]);
  assert.deepEqual(leftoverTemps(join(root, 'missing', '.soujo')), []);
  removeLeftoverTemps(dir);
  assert.deepEqual(leftoverTemps(dir), []);
  assert.deepEqual(leftovers.filter((path) => existsSync(path)), []);
  assert.deepEqual(kept.filter((path) => !existsSync(path)), []);
});

test('removeLeftoverTemps deletes the temporary files of an archive refused for being another one, which are in .soujo/ all the same', { skip: process.platform === 'win32' }, (t) => {
  const root = temp(t);
  const dir = join(root, '.soujo');
  mkdirSync(dir);
  writeFileSync(join(dir, 'LOG.md'), 'log\n');
  symlinkSync('LOG-2026-07.md', join(dir, 'LOG-2026-08.md'));
  const leftover = join(dir, `.LOG-2026-07.md.${process.pid}.tmp`);
  writeFileSync(leftover, 'half');
  assert.deepEqual(leftoverTemps(dir), [`.soujo/.LOG-2026-07.md.${process.pid}.tmp`]);
  removeLeftoverTemps(dir);
  assert.equal(existsSync(leftover), false);
});

test('removeLeftoverTemps leaves files next to a symlink target outside the project', { skip: process.platform === 'win32' }, (t) => {
  const elsewhere = temp(t);
  writeFileSync(join(elsewhere, 'LOG.md'), '');
  const kept = join(elsewhere, `.LOG.md.${deadPid()}.tmp`);
  writeFileSync(kept, 'not ours');
  const root = temp(t);
  mkdirSync(join(root, '.soujo'));
  symlinkSync(join(elsewhere, 'LOG.md'), join(root, '.soujo', 'LOG.md'));
  removeLeftoverTemps(join(root, '.soujo'));
  assert.ok(existsSync(kept));
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
  writeFileSync(join(dir, `.CLAUDE.md.${deadPid()}.tmp`), 'half');
  assert.throws(() => createFile(join(dir, 'CLAUDE.md'), 'x'), /^Error: CLAUDE\.md を作れない: [^\n]*EEXIST/);
  assert.equal(readFileSync(outside, 'utf8'), 'keep\n');
  assert.equal(existsSync(join(dir, 'CLAUDE.md')), false);

  removeTempsOf(join(dir, 'CLAUDE.md'));
  assert.deepEqual(readdirSync(dir), []);
  assert.equal(createFile(join(dir, 'CLAUDE.md'), 'x'), true);
});

// A hard link on a file system that has none: it fails as FAT and exFAT do, so that place has to copy instead.
function noLinks(): never {
  const error = new Error('hard links are not supported') as NodeJS.ErrnoException;
  error.code = 'EPERM';
  throw error;
}

test('place copies where hard links cannot be made, and never puts the file over what is already there', (t) => {
  const dir = temp(t);
  const source = join(dir, `.fresh.md.${process.pid}.tmp`);
  writeFileSync(source, 'new\n');

  const taken = join(dir, 'taken.md');
  writeFileSync(taken, 'keep\n');
  assert.equal(place(source, taken, noLinks), false);
  assert.equal(readFileSync(taken, 'utf8'), 'keep\n');

  if (process.platform !== 'win32') {
    const dangling = join(dir, 'dangling.md');
    symlinkSync('missing.md', dangling);
    assert.equal(place(source, dangling, noLinks), false);
    assert.equal(existsSync(join(dir, 'missing.md')), false);
  }

  // Copied, not renamed: nothing is moved onto a path, so an entry appearing in between is never replaced.
  const fresh = join(dir, 'fresh.md');
  assert.equal(place(source, fresh, noLinks), true);
  assert.equal(readFileSync(fresh, 'utf8'), 'new\n');
  assert.equal(readFileSync(source, 'utf8'), 'new\n');
});

test('place deletes only the file it created itself when the copy fails', (t) => {
  const dir = temp(t);

  // The copy cannot even open its own file: what is at path belongs to whoever put it there, so it is left alone.
  const theirs = join(dir, 'theirs.md');
  writeFileSync(theirs, 'keep\n');
  assert.equal(place(join(dir, '.theirs.md.1.tmp'), theirs, noLinks), false);
  assert.equal(readFileSync(theirs, 'utf8'), 'keep\n');

  // The copy opens the file and then fails: the empty file it made is cleared rather than left as the created one.
  const half = join(dir, 'half.md');
  assert.throws(() => place(join(dir, '.half.md.1.tmp'), half, noLinks), /ENOENT/);
  assert.equal(existsSync(half), false);
});

test('place refuses a file that appears between the hard link and the copy, and leaves it as it is', (t) => {
  const dir = temp(t);
  const source = join(dir, `.late.md.${process.pid}.tmp`);
  writeFileSync(source, 'new\n');
  const late = join(dir, 'late.md');
  // Nothing is there when the hard link is tried, and something is by the time the copy runs, as another process would do.
  const raced = (): never => {
    writeFileSync(late, 'theirs\n');
    const error = new Error('hard links are not supported') as NodeJS.ErrnoException;
    error.code = 'EPERM';
    throw error;
  };
  assert.equal(place(source, late, raced), false);
  assert.equal(readFileSync(late, 'utf8'), 'theirs\n');
});

test('isRunning tells a pid that is still running from one that has exited, and never claims the own', (t) => {
  assert.equal(isRunning(process.pid), false);
  assert.equal(isRunning(livePid(t)), true);
  assert.equal(isRunning(deadPid()), false);
  for (const pid of [0, -1, Number.NaN, 2 ** 53]) assert.equal(isRunning(pid), false, String(pid));
});

test('leftoverTemps, removeLeftoverTemps, and removeTempsOf leave the temporary file of a write still running, which stateTemps lists', (t) => {
  const root = temp(t);
  const dir = join(root, '.soujo');
  mkdirSync(dir);
  const gone = deadPid();
  const live = livePid(t);
  const running = join(dir, `.LOG.md.${live}.tmp`);
  // A number no process of ours can have is not a pid to spare the file for: a leading zero, and past the safe range.
  const leftovers = [
    join(dir, `.PLAN.md.${process.pid}.tmp`),
    join(dir, `.NEXT.md.${gone}.tmp`),
    join(dir, '.SPEC.md.09.tmp'),
    join(dir, '.SPEC.md.9007199254740993.tmp'),
  ];
  for (const path of [running, ...leftovers]) writeFileSync(path, 'half');

  assert.deepEqual(leftoverTemps(dir).sort(), [
    `.soujo/.NEXT.md.${gone}.tmp`,
    `.soujo/.PLAN.md.${process.pid}.tmp`,
    '.soujo/.SPEC.md.09.tmp',
    '.soujo/.SPEC.md.9007199254740993.tmp',
  ]);
  // Not a leftover to delete, but still a file in the working tree, which the commit checks must not count as a change.
  assert.ok(stateTemps(dir).includes(`.soujo/.LOG.md.${live}.tmp`));
  removeLeftoverTemps(dir);
  assert.ok(existsSync(running));
  assert.deepEqual(leftovers.filter((path) => existsSync(path)), []);

  const theirs = join(root, `.CLAUDE.md.${live}.tmp`);
  writeFileSync(theirs, 'half');
  removeTempsOf(join(root, 'CLAUDE.md'));
  assert.ok(existsSync(theirs));
});

test('packageDir finds the soujo package root and readTemplate reads from templates/', () => {
  const pkg = JSON.parse(readFileSync(join(packageDir(), 'package.json'), 'utf8')) as { name: string };
  assert.equal(pkg.name, 'soujo');
  assert.match(readTemplate('LOG.md'), /^# LOG/);
});
