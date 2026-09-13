import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gitAddAll, gitCommit, gitLastCommit, gitStatus, gitToplevel } from '../src/git.js';
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

test('gitCommit with nothing to commit throws a one-line error', (t) => {
  const dir = repo(t);
  assert.throws(() => gitCommit(dir, 'layer: empty'), /^Error: git commit に失敗: [^\n]+$/);
});

test('gitStatus throws a one-line error outside a repository', (t) => {
  assert.throws(() => gitStatus(temp(t)), /^Error: git status に失敗: [^\n]+$/);
});
