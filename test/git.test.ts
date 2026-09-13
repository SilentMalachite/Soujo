import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  gitAddAll,
  gitAddedFiles,
  gitCommit,
  gitCommitAll,
  gitFindCommit,
  gitHasCommits,
  gitHasStagedChanges,
  gitHeadFile,
  gitIgnored,
  gitLastCommit,
  gitOperationInProgress,
  gitStatus,
  gitToplevel,
} from '../src/git.js';
import { repo, temp } from './helpers.js';

test('gitToplevel finds the repository root from a subdirectory, or undefined outside', (t) => {
  const dir = repo(t);
  mkdirSync(join(dir, 'sub'));
  assert.equal(gitToplevel(join(dir, 'sub')), realpathSync(dir));
  assert.equal(gitToplevel(temp(t)), undefined);
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
  execFileSync('git', ['config', 'status.showUntrackedFiles', 'all'], { cwd: dir });
  mkdirSync(join(dir, 'many'));
  const name = 'x'.repeat(200);
  for (let index = 0; index < 6000; index++) writeFileSync(join(dir, 'many', `${name}${index}`), '');
  assert.equal(gitStatus(dir).length, 6000);
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

test('gitHasStagedChanges and gitCommitAll work before and after the first commit', (t) => {
  const dir = repo(t);
  assert.equal(gitHasStagedChanges(dir), false);
  assert.equal(gitCommitAll(dir, 'nothing'), false);
  assert.equal(gitHasCommits(dir), false);

  writeFileSync(join(dir, 'a.txt'), 'a\n');
  assert.equal(gitCommitAll(dir, 'first'), true);
  assert.equal(gitLastCommit(dir)?.subject, 'first');
  assert.equal(gitHasStagedChanges(dir), false);
  assert.equal(gitCommitAll(dir, 'clean'), false);
  assert.equal(gitLastCommit(dir)?.subject, 'first');
});

test('gitIgnored reports ignored paths but not tracked files', (t) => {
  const dir = repo(t);
  mkdirSync(join(dir, '.soujo'));
  writeFileSync(join(dir, '.soujo', 'PLAN.md'), '');
  gitCommitAll(dir, 'track PLAN');
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
});

test('gitHeadFile reads a file at HEAD relative to cwd, or undefined', (t) => {
  const dir = repo(t);
  mkdirSync(join(dir, 'sub', '.soujo'), { recursive: true });
  assert.equal(gitHeadFile(join(dir, 'sub'), '.soujo/PLAN.md'), undefined);
  writeFileSync(join(dir, 'sub', '.soujo', 'PLAN.md'), 'committed\n');
  writeFileSync(join(dir, 'other.txt'), '');
  gitAddAll(dir);
  gitCommit(dir, 'first');
  writeFileSync(join(dir, 'sub', '.soujo', 'PLAN.md'), 'working tree\n');
  assert.equal(gitHeadFile(join(dir, 'sub'), '.soujo/PLAN.md'), 'committed\n');
  assert.equal(gitHeadFile(join(dir, 'sub'), '.soujo/LOG.md'), undefined);
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

test('gitCommit with nothing to commit throws a one-line error', (t) => {
  const dir = repo(t);
  assert.throws(() => gitCommit(dir, 'layer: empty'), /^Error: git commit に失敗: [^\n]+$/);
});

test('gitStatus throws a one-line error outside a repository', (t) => {
  assert.throws(() => gitStatus(temp(t)), /^Error: git status に失敗: [^\n]+$/);
});
