import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as gitApi from '../src/git.js';
import {
  REPOSITORY_ENV,
  gitAddAll,
  gitAddedFiles,
  gitChangeCount,
  gitChangedPaths,
  gitCommit,
  gitCommitsAfter,
  gitFindCommit,
  gitFindCommitStarting,
  gitHasCommits,
  gitHasStagedChanges,
  gitHeadEntry,
  gitIgnored,
  gitLastCommit,
  gitNotStaged,
  gitOperationInProgress,
  gitStatus,
  gitStatusExcluding,
  gitToplevel,
  gitUnmergedCount,
  gitUntracked,
} from '../src/git.js';
import { commitAll, repo, temp } from './helpers.js';

test('gitToplevel finds the repository root from a subdirectory, or undefined outside', (t) => {
  const dir = repo(t);
  mkdirSync(join(dir, 'sub'));
  assert.equal(gitToplevel(join(dir, 'sub')), realpathSync(dir));
  assert.equal(gitToplevel(temp(t)), undefined);
});

test('gitToplevel is undefined only outside a repository; other git failures throw', (t) => {
  const dir = repo(t);
  writeFileSync(join(dir, '.git', 'config'), '[broken\n');
  assert.throws(() => gitToplevel(dir), /^Error: git rev-parse に失敗: [^\n]+$/);
  const outside = temp(t);
  const path = process.env.PATH;
  t.after(() => {
    process.env.PATH = path;
  });
  process.env.PATH = '';
  assert.throws(() => gitToplevel(outside), /^Error: git rev-parse に失敗: [^\n]+$/);
});

test('paths from git keep the spaces at the ends of directory names', (t) => {
  const dir = join(temp(t), 'proj ');
  const app = join(dir, ' app');
  mkdirSync(app, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' });
  writeFileSync(join(app, 'a.md'), '');
  assert.equal(gitToplevel(app), realpathSync(dir));
  assert.deepEqual(gitChangedPaths(app, ['a.md']), ['a.md']);
});

test('git calls ignore the variables that point git at another repository', (t) => {
  const dir = repo(t);
  const other = repo(t);
  writeFileSync(join(other, 'o.txt'), 'o\n');
  commitAll(other, 'other');
  t.after(() => {
    for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) delete process.env[name];
  });
  Object.assign(process.env, { GIT_DIR: join(other, '.git'), GIT_WORK_TREE: other, GIT_INDEX_FILE: join(other, '.git', 'index') });
  assert.equal(gitToplevel(dir), realpathSync(dir));
  writeFileSync(join(dir, 'a.txt'), 'a\n');
  assert.deepEqual(gitStatus(dir), ['?? a.txt']);
  gitAddAll(dir);
  gitCommit(dir, 'mine');
  assert.equal(gitLastCommit(dir)?.subject, 'mine');
  assert.equal(gitLastCommit(other)?.subject, 'other');
});

test('tests run git without the user or system configuration and without repository variables', (t) => {
  const dir = repo(t);
  const list = execFileSync('git', ['config', '--list', '--show-origin'], { cwd: dir, encoding: 'utf8' });
  const origins = new Set(list.split('\n').filter(Boolean).map((line) => line.split('\t')[0]));
  assert.deepEqual([...origins], ['file:.git/config']);
  for (const name of REPOSITORY_ENV) assert.equal(process.env[name], undefined, name);
});

test('gitStatus, gitAddAll, gitCommit, and gitLastCommit record a layer', (t) => {
  const dir = repo(t);
  assert.equal(gitLastCommit(dir), undefined);
  writeFileSync(join(dir, 'a.txt'), 'a\n');
  assert.deepEqual(gitStatus(dir), ['?? a.txt']);

  gitAddAll(dir);
  gitCommit(dir, 'layer: L1 scaffold');
  assert.deepEqual(gitStatus(dir), []);
  const commit = gitLastCommit(dir);
  assert.equal(commit?.subject, 'layer: L1 scaffold');
  assert.match(commit?.hash ?? '', /^[0-9a-f]{7,}$/);
});

test('gitStatus handles output larger than 1 MB', (t) => {
  const dir = repo(t);
  const name = 'x'.repeat(200);
  for (let index = 0; index < 6000; index++) writeFileSync(join(dir, `${name}${index}`), '');
  assert.equal(gitStatus(dir).length, 6000);
});

test('gitStatus counts untracked files once per untracked directory whatever status.showUntrackedFiles says', (t) => {
  const dir = repo(t);
  mkdirSync(join(dir, 'new'));
  writeFileSync(join(dir, 'new', 'a.ts'), '');
  writeFileSync(join(dir, 'new', 'b.ts'), '');
  writeFileSync(join(dir, 'c.ts'), '');
  for (const setting of ['no', 'all', 'normal']) {
    execFileSync('git', ['config', 'status.showUntrackedFiles', setting], { cwd: dir });
    assert.deepEqual(gitStatus(dir), ['?? c.ts', '?? new/'], setting);
  }
});

test('gitNotStaged reports files that git add leaves unstaged, and not converted line endings', (t) => {
  const dir = repo(t);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  writeFileSync(join(dir, 'a.md'), 'a\n');
  writeFileSync(join(dir, 'b.md'), 'b\n');
  writeFileSync(join(dir, '.gitattributes'), 'crlf.md text eol=crlf\n');
  writeFileSync(join(dir, 'crlf.md'), 'x\r\n');
  commitAll(dir, 'base');
  git('update-index', '--skip-worktree', 'a.md');
  writeFileSync(join(dir, 'a.md'), 'changed\n');
  writeFileSync(join(dir, 'b.md'), 'changed\n');
  writeFileSync(join(dir, 'crlf.md'), 'y\r\n');
  writeFileSync(join(dir, 'new.md'), 'new\n');
  gitAddAll(dir);
  assert.deepEqual(gitNotStaged(dir, ['a.md', 'b.md', 'crlf.md', 'new.md', 'missing.md']), ['a.md']);
  writeFileSync(join(dir, 'untracked.md'), '');
  assert.deepEqual(gitNotStaged(dir, ['untracked.md']), ['untracked.md']);
});

test('gitNotStaged compares a symlink by its link text and reports a re-pointed skip-worktree symlink', { skip: process.platform === 'win32' }, (t) => {
  const dir = repo(t);
  writeFileSync(join(dir, 'a.md'), 'a\n');
  writeFileSync(join(dir, 'b.md'), 'b\n');
  symlinkSync('a.md', join(dir, 'link.md'));
  symlinkSync('missing.md', join(dir, 'dangling.md'));
  commitAll(dir, 'base');
  assert.deepEqual(gitNotStaged(dir, ['link.md', 'dangling.md', 'a.md']), []);
  execFileSync('git', ['update-index', '--skip-worktree', 'link.md'], { cwd: dir });
  rmSync(join(dir, 'link.md'));
  symlinkSync('b.md', join(dir, 'link.md'));
  gitAddAll(dir);
  assert.deepEqual(gitNotStaged(dir, ['link.md', 'b.md']), ['link.md']);
});

test('gitHasCommits distinguishes an empty repository from a failure', (t) => {
  const dir = repo(t);
  assert.equal(gitHasCommits(dir), false);
  assert.equal(gitFindCommit(dir, 'layer: L1'), undefined);
  writeFileSync(join(dir, 'a.txt'), 'a\n');
  gitAddAll(dir);
  gitCommit(dir, 'first');
  assert.equal(gitHasCommits(dir), true);
  assert.throws(() => gitHasCommits(temp(t)), /^Error: git rev-parse に失敗: [^\n]+$/);
});

test('gitHasStagedChanges works before and after the first commit', (t) => {
  const dir = repo(t);
  gitAddAll(dir);
  assert.equal(gitHasStagedChanges(dir), false);

  writeFileSync(join(dir, 'a.txt'), 'a\n');
  gitAddAll(dir);
  assert.equal(gitHasStagedChanges(dir), true);
  gitCommit(dir, 'first');
  assert.equal(gitHasStagedChanges(dir), false);
  writeFileSync(join(dir, 'a.txt'), 'b\n');
  gitAddAll(dir);
  assert.equal(gitHasStagedChanges(dir), true);
});

test('git.ts has no gitCommitAll: commits go through commitRecords, which checks what is staged', () => {
  assert.equal('gitCommitAll' in gitApi, false);
});

test('status, staging, and commits are limited to cwd and below', (t) => {
  const top = repo(t);
  mkdirSync(join(top, 'app'));
  writeFileSync(join(top, 'outside.txt'), 'o\n');
  writeFileSync(join(top, 'app', 'a.txt'), 'a\n');
  gitAddAll(top);
  gitCommit(top, 'base');

  writeFileSync(join(top, 'outside.txt'), 'staged\n');
  execFileSync('git', ['add', 'outside.txt'], { cwd: top });
  writeFileSync(join(top, 'untracked.txt'), '');
  writeFileSync(join(top, 'app', 'b.txt'), 'b\n');
  execFileSync('git', ['rm', '-q', 'app/a.txt'], { cwd: top });
  const app = join(top, 'app');
  assert.deepEqual(gitStatus(app), ['D  app/a.txt', '?? app/']);
  gitAddAll(app);
  assert.equal(gitHasStagedChanges(app), true);
  gitCommit(app, 'app only');
  assert.deepEqual(gitStatus(app), []);
  assert.deepEqual(gitStatus(top), ['M  outside.txt', '?? untracked.txt']);
  gitAddAll(app);
  assert.equal(gitHasStagedChanges(app), false);
});

test('gitStatusExcluding leaves out the given paths literally, and gitChangedPaths tells which given paths changed', (t) => {
  const top = repo(t);
  const app = join(top, 'app');
  mkdirSync(join(app, '.soujo'), { recursive: true });
  writeFileSync(join(app, '.soujo', 'LOG.md'), 'a\n');
  writeFileSync(join(app, '.soujo', 'LOG-2026-08.md'), 'a\n');
  writeFileSync(join(app, '.soujo', 'LOG-2026-0?.md'), 'a\n');
  gitAddAll(top);
  gitCommit(top, 'base');

  writeFileSync(join(top, 'outside.txt'), '');
  writeFileSync(join(app, '.soujo', 'LOG.md'), 'b\n');
  writeFileSync(join(app, '.soujo', 'LOG-2026-09.md'), '');
  execFileSync('git', ['rm', '-q', '.soujo/LOG-2026-08.md'], { cwd: app });
  const excluded = ['.soujo/LOG.md', '.soujo/LOG-2026-09.md', '.soujo/LOG-2026-0?.md'];
  assert.deepEqual(gitStatusExcluding(app, excluded), ['D  app/.soujo/LOG-2026-08.md']);
  assert.deepEqual(gitStatusExcluding(app, [...excluded, '.soujo/LOG-2026-08.md']), []);
  assert.deepEqual(gitChangedPaths(app, [...excluded, '.soujo/LOG-2026-08.md', 'missing.md']), [
    '.soujo/LOG.md',
    '.soujo/LOG-2026-09.md',
    '.soujo/LOG-2026-08.md',
  ]);
  assert.deepEqual(gitChangedPaths(app, []), []);
});

test('gitUnmergedCount counts conflicts in cwd and below', (t) => {
  const dir = repo(t);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  const app = join(dir, 'app');
  const other = join(dir, 'other');
  mkdirSync(app);
  mkdirSync(other);
  writeFileSync(join(app, 'f.txt'), 'base\n');
  writeFileSync(join(other, 'g.txt'), 'base\n');
  commitAll(dir, 'base');
  assert.equal(gitUnmergedCount(dir), 0);
  git('checkout', '-q', '-b', 'side');
  writeFileSync(join(app, 'f.txt'), 'side\n');
  commitAll(dir, 'side');
  git('checkout', '-q', '-');
  writeFileSync(join(app, 'f.txt'), 'main\n');
  commitAll(dir, 'main');
  assert.throws(() => git('merge', '-q', 'side'));
  assert.deepEqual([gitUnmergedCount(dir), gitUnmergedCount(app), gitUnmergedCount(other)], [1, 1, 0]);
});

test('gitIgnored reports ignored paths but not tracked files', (t) => {
  const dir = repo(t);
  mkdirSync(join(dir, '.soujo'));
  writeFileSync(join(dir, '.soujo', 'PLAN.md'), '');
  commitAll(dir, 'track PLAN');
  writeFileSync(join(dir, '.gitignore'), '.soujo/\n');
  assert.deepEqual(gitIgnored(dir, ['.soujo/PLAN.md', '.soujo/LOG.md', 'other.txt']), ['.soujo/LOG.md']);
  assert.throws(() => gitIgnored(temp(t), ['x']), /^Error: git check-ignore に失敗: /);
});

test('gitOperationInProgress reports an unfinished rebase or merge', (t) => {
  const dir = repo(t);
  assert.equal(gitOperationInProgress(dir), undefined);
  mkdirSync(join(dir, '.git', 'rebase-merge'));
  assert.equal(gitOperationInProgress(dir), 'rebase');
  writeFileSync(join(dir, '.git', 'MERGE_HEAD'), '');
  assert.equal(gitOperationInProgress(dir), 'merge');

  const sequencing = repo(t);
  mkdirSync(join(sequencing, '.git', 'sequencer'));
  assert.equal(gitOperationInProgress(sequencing), 'cherry-pick / revert');
});

test('gitHeadEntry reads a file or symlink at HEAD relative to cwd, literally, or undefined', { skip: process.platform === 'win32' }, (t) => {
  const dir = repo(t);
  const sub = join(dir, 'sub');
  mkdirSync(join(sub, '.soujo'), { recursive: true });
  assert.equal(gitHeadEntry(sub, '.soujo/PLAN.md'), undefined);
  writeFileSync(join(sub, '.soujo', 'PLAN.md'), 'committed\n');
  writeFileSync(join(sub, '.soujo', 'LOG-0[1].md'), 'bracket\n');
  writeFileSync(join(dir, 'other.txt'), 'other\n');
  symlinkSync('../../other.txt', join(sub, '.soujo', 'LOG.md'));
  commitAll(dir, 'first');
  writeFileSync(join(sub, '.soujo', 'PLAN.md'), 'working tree\n');
  assert.deepEqual(gitHeadEntry(sub, '.soujo/PLAN.md'), { symlink: false, content: 'committed\n' });
  assert.deepEqual(gitHeadEntry(sub, '.soujo/LOG.md'), { symlink: true, content: '../../other.txt' });
  assert.deepEqual(gitHeadEntry(sub, '.soujo/LOG-0[1].md'), { symlink: false, content: 'bracket\n' });
  assert.deepEqual(gitHeadEntry(sub, '.soujo/../../other.txt'), { symlink: false, content: 'other\n' });
  for (const path of ['.soujo/NEXT.md', '.soujo', '.soujo/LOG-01.md', '../../outside.txt']) {
    assert.equal(gitHeadEntry(sub, path), undefined, path);
  }
});

test('gitAddedFiles lists only the files added in cwd and below', (t) => {
  const top = repo(t);
  mkdirSync(join(top, 'app'));
  writeFileSync(join(top, 'app', 'a.txt'), '');
  writeFileSync(join(top, 'b.txt'), '');
  commitAll(top, 'both');
  assert.deepEqual(gitAddedFiles(join(top, 'app')), ['app/a.txt']);
  assert.deepEqual(gitAddedFiles(top), ['app/a.txt', 'b.txt']);
});

test('gitChangeCount counts status lines, and reads no further than its limit', (t) => {
  const dir = repo(t);
  assert.deepEqual(gitChangeCount(dir), { count: 0, truncated: false });
  for (let index = 0; index < 100; index++) writeFileSync(join(dir, `f${String(index).padStart(3, '0')}`), '');
  assert.deepEqual(gitChangeCount(dir), { count: 100, truncated: false });
  // "?? f000" is 8 bytes a line, so 100 bytes hold 12 whole lines; git may have written more before it was stopped.
  const cut = gitChangeCount(dir, 100);
  assert.equal(cut.truncated, true);
  assert.ok(cut.count >= 12 && cut.count <= 100, String(cut.count));
  assert.throws(() => gitChangeCount(temp(t)), /^Error: git status に失敗: [^\n]+$/);
});

test('gitUntracked lists each untracked file in cwd and below that git does not ignore, relative to cwd', (t) => {
  const top = repo(t);
  mkdirSync(join(top, 'app', 'new'), { recursive: true });
  writeFileSync(join(top, 'app', 'new', '.env'), '');
  writeFileSync(join(top, 'app', 'ignored.key'), '');
  writeFileSync(join(top, 'app', '.gitignore'), '*.key\n');
  writeFileSync(join(top, 'outside.env'), '');
  assert.deepEqual(gitUntracked(join(top, 'app')), ['.gitignore', 'new/.env']);
});

test('gitAddedFiles lists files added by HEAD, including the root commit', (t) => {
  const dir = repo(t);
  writeFileSync(join(dir, 'a.txt'), 'a\n');
  gitAddAll(dir);
  gitCommit(dir, 'root');
  assert.deepEqual(gitAddedFiles(dir), ['a.txt']);
  writeFileSync(join(dir, 'a.txt'), 'changed\n');
  mkdirSync(join(dir, '日本語'));
  writeFileSync(join(dir, '日本語', 'b.txt'), '');
  gitAddAll(dir);
  gitCommit(dir, 'second');
  assert.deepEqual(gitAddedFiles(dir), ['日本語/b.txt']);
});

test('gitFindCommit matches the whole subject only', (t) => {
  const dir = repo(t);
  for (const subject of ['layer: L10 later', 'fix: mention layer: L1 in passing']) {
    writeFileSync(join(dir, `${subject.length}.txt`), subject);
    gitAddAll(dir);
    gitCommit(dir, subject);
  }
  assert.equal(gitFindCommit(dir, 'layer: L1'), undefined);
  assert.equal(gitFindCommit(dir, 'layer: L10 later')?.subject, 'layer: L10 later');
});

test('gitFindCommitStarting finds the latest subject with the prefix, and gitCommitsAfter lists later commits oldest first', (t) => {
  const dir = repo(t);
  assert.equal(gitFindCommitStarting(dir, 'layer: '), undefined);
  assert.deepEqual(gitCommitsAfter(dir), []);
  const date = new Date(2026, 8, 12, 9, 30);
  for (const subject of ['layer: L1', 'fix: mention\tlayer: L9', 'layer: L2', 'fix: a', 'docs: b']) {
    writeFileSync(join(dir, 'f.txt'), subject);
    commitAll(dir, subject, date);
  }
  const layer = gitFindCommitStarting(dir, 'layer: ');
  assert.equal(layer?.subject, 'layer: L2');
  assert.equal(layer?.date.getTime(), Math.floor(date.getTime() / 1000) * 1000);
  assert.deepEqual(gitCommitsAfter(dir, layer?.hash).map((commit) => commit.subject), ['fix: a', 'docs: b']);
  assert.deepEqual(gitCommitsAfter(dir).map((commit) => commit.subject), ['layer: L1', 'fix: mention\tlayer: L9', 'layer: L2', 'fix: a', 'docs: b']);
  assert.equal(gitLastCommit(dir)?.subject, 'docs: b');
});

test('gitLastCommit, gitFindCommit, gitFindCommitStarting, and gitCommitsAfter see only the commits that change cwd and below', (t) => {
  const top = repo(t);
  const app = join(top, 'app');
  const other = join(top, 'other');
  mkdirSync(app);
  mkdirSync(other);
  const change = (dir: string, subject: string) => {
    writeFileSync(join(dir, 'f.txt'), subject);
    commitAll(top, subject);
  };
  change(app, 'layer: L1 app');
  change(other, 'layer: L2 same');
  change(app, 'fix: app');
  change(other, 'layer: L3 other');
  commitAll(top, 'chore: empty');
  assert.equal(gitFindCommit(app, 'layer: L2 same'), undefined);
  assert.equal(gitFindCommit(other, 'layer: L2 same')?.subject, 'layer: L2 same');
  const layer = gitFindCommitStarting(app, 'layer: ');
  assert.equal(layer?.subject, 'layer: L1 app');
  assert.deepEqual(gitCommitsAfter(app, layer?.hash).map((commit) => commit.subject), ['fix: app']);
  assert.deepEqual(gitCommitsAfter(app).map((commit) => commit.subject), ['layer: L1 app', 'fix: app']);
  assert.equal(gitCommitsAfter(top).length, 4);
  assert.equal(gitLastCommit(app)?.subject, 'fix: app');
  assert.equal(gitLastCommit(top)?.subject, 'layer: L3 other');
});

test('gitCommit with nothing to commit throws a one-line error', (t) => {
  const dir = repo(t);
  assert.throws(() => gitCommit(dir, 'layer: empty'), /^Error: git commit に失敗: [^\n]+$/);
});

test('gitStatus throws a one-line error outside a repository', (t) => {
  assert.throws(() => gitStatus(temp(t)), /^Error: git status に失敗: [^\n]+$/);
});
