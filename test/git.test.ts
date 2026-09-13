import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gitAddAll, gitCommit, gitLastCommit, gitStatus, gitToplevel } from '../src/git.js';

function temp(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), 'soujo-git-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function repo(t: TestContext): string {
  const dir = temp(t);
  const run = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  run('init', '-q');
  run('config', 'user.name', 'soujo test');
  run('config', 'user.email', 'test@example.com');
  run('config', 'commit.gpgsign', 'false');
  return dir;
}

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

test('gitCommit with nothing to commit throws a one-line error', (t) => {
  const dir = repo(t);
  assert.throws(() => gitCommit(dir, 'layer: empty'), /^Error: git commit に失敗: [^\n]+$/);
});

test('gitStatus throws a one-line error outside a repository', (t) => {
  assert.throws(() => gitStatus(temp(t)), /^Error: git status に失敗: [^\n]+$/);
});
