import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { layerDone } from '../src/commands/layer.js';
import { gitLastCommit, gitStatus } from '../src/git.js';
import { markDone } from '../src/state.js';
import { commitAll, project, repo, temp } from './helpers.js';

const NOW = new Date(2026, 8, 13, 12, 0);
const PLAN = '# PLAN\n\n- [x] L1 scaffold — build\n- [ ] L2 state — test\n- [ ] L10 later — c\n';
const LOG = '# LOG\n\n## 2026-09-12 L1 scaffold\nold\n';
const NEXT = '次: L3 io\n前提: p\n確認: c\n注意: なし\neffort: medium\n';
const STATE = { 'PLAN.md': PLAN, 'LOG.md': LOG, 'NEXT.md': NEXT };

function read(dir: string, file: string): string {
  return readFileSync(join(dir, '.soujo', file), 'utf8');
}

/** A committed Soujo project with one uncommitted source change. */
function workingProject(t: TestContext): string {
  const dir = project(repo(t), STATE);
  commitAll(dir, 'layer: L1 scaffold');
  writeFileSync(join(dir, 'state.ts'), 'export {};\n');
  return dir;
}

test('layer done checks PLAN, appends LOG, and commits everything as "layer: <layer>"', (t) => {
  const dir = workingProject(t);
  const [line] = layerDone(dir, ' L2 state ', '一行目\n二行目', NOW);
  const commit = gitLastCommit(dir);
  assert.equal(line, `層「L2 state」を完了: ${commit?.hash} layer: L2 state（追加: state.ts）`);
  assert.equal(commit?.subject, 'layer: L2 state');
  assert.equal(read(dir, 'PLAN.md'), PLAN.replace('- [ ] L2 state', '- [x] L2 state'));
  assert.equal(read(dir, 'LOG.md'), `${LOG}\n## 2026-09-13 L2 state\n一行目\n二行目\n`);
  assert.deepEqual(gitStatus(dir), []);
});

test('layer done without --note logs only the heading', (t) => {
  const dir = workingProject(t);
  layerDone(dir, 'L2 state', undefined, NOW);
  assert.match(read(dir, 'LOG.md'), /\n## 2026-09-13 L2 state\n$/);
});

test('layer done writes nothing on invalid input', (t) => {
  const dir = workingProject(t);
  const before = () => [read(dir, 'PLAN.md'), read(dir, 'LOG.md'), gitStatus(dir).join('\n')];
  const snapshot = before();
  assert.throws(() => layerDone(dir, 'L2', undefined, NOW), /PLAN\.md に層「L2」がない/);
  assert.throws(() => layerDone(dir, 'L2 state', 'a\nb\nc\nd', NOW), /3行まで（4行）/);
  assert.throws(() => layerDone(dir, 'L2 state', '## 2026-09-14 fake', NOW), /## /);
  assert.deepEqual(before(), snapshot);

  const outsideGit = project(temp(t), STATE);
  assert.throws(() => layerDone(outsideGit, 'L2 state', undefined, NOW), /git リポジトリではない/);
  assert.equal(read(outsideGit, 'PLAN.md'), PLAN);
});

test('layer done refuses without a usable NEXT.md and writes nothing', (t) => {
  const dir = workingProject(t);
  const nextPath = join(dir, '.soujo', 'NEXT.md');
  const hint = '（先に soujo next set で次の一手を書く）';
  const unchanged = () => assert.deepEqual([read(dir, 'PLAN.md'), read(dir, 'LOG.md')], [PLAN, LOG]);

  rmSync(nextPath);
  assert.throws(() => layerDone(dir, 'L2 state', 'n', NOW), new RegExp(`^Error: NEXT\\.md がない${hint}$`));
  unchanged();

  writeFileSync(nextPath, `${NEXT}補足: x\n`);
  assert.throws(() => layerDone(dir, 'L2 state', 'n', NOW), /^Error: NEXT\.md が無効: NEXT\.md が5行を超えている（6行）、/);
  unchanged();

  writeFileSync(nextPath, NEXT.replace('L3 io', 'L2 state'));
  assert.throws(() => layerDone(dir, 'L2 state', 'n', NOW), new RegExp(`^Error: NEXT\\.md の次がまだ「L2 state」${hint}$`));
  unchanged();
});

test('layer done refuses a layer that is already committed and writes nothing', (t) => {
  const dir = workingProject(t);
  assert.throws(() => layerDone(dir, 'L1 scaffold', undefined, NOW), /^Error: 層「L1 scaffold」はコミット済み（[0-9a-f]+）$/);
  assert.equal(read(dir, 'LOG.md'), LOG);

  assert.match(layerDone(dir, 'L10 later', undefined, NOW)[0] ?? '', /を完了/);
  const snapshot = read(dir, 'LOG.md');
  assert.throws(() => layerDone(dir, 'L10 later', undefined, NOW), /はコミット済み/);
  assert.equal(read(dir, 'LOG.md'), snapshot);
});

test('after a failed commit, re-running retries only the commit without a second LOG entry', (t) => {
  const dir = workingProject(t);
  const lock = join(dir, '.git', 'index.lock');
  writeFileSync(lock, '');
  assert.throws(
    () => layerDone(dir, 'L2 state', 'note', NOW),
    /^Error: git add に失敗: .*（PLAN と LOG は記録済み。再実行でコミットだけやり直す）$/,
  );
  const logAfterFailure = read(dir, 'LOG.md');
  assert.match(read(dir, 'PLAN.md'), /- \[x\] L2 state/);
  rmSync(lock);

  const [line] = layerDone(dir, 'L2 state', 'ignored on retry', NOW);
  assert.equal(line, `層「L2 state」のコミットをやり直した: ${gitLastCommit(dir)?.hash} layer: L2 state（追加: state.ts）`);
  assert.equal(read(dir, 'LOG.md'), logAfterFailure);
  assert.deepEqual(gitStatus(dir), []);
});

test('if interrupted after checking PLAN but before LOG, re-running appends LOG once and commits', (t) => {
  const dir = workingProject(t);
  writeFileSync(join(dir, '.soujo', 'PLAN.md'), markDone(PLAN, 'L2 state'));
  const [line] = layerDone(dir, 'L2 state', 'note', NOW);
  assert.match(line ?? '', /のコミットをやり直した/);
  assert.equal(read(dir, 'LOG.md'), `${LOG}\n## 2026-09-13 L2 state\nnote\n`);
});

test('a layer checked in a commit with another subject is refused, not treated as interrupted', (t) => {
  const dir = project(repo(t), STATE);
  commitAll(dir, 'feat: squashed early layers');
  writeFileSync(join(dir, 'secret.env'), 'TOKEN=x\n');
  assert.throws(
    () => layerDone(dir, 'L1 scaffold', undefined, NOW),
    /^Error: 層「L1 scaffold」は PLAN のチェックごとコミット済み（件名が「layer: L1 scaffold」ではない）$/,
  );
  assert.equal(read(dir, 'LOG.md'), LOG);
  assert.deepEqual(gitStatus(dir), ['?? secret.env']);
});

test('layer done refuses during an unfinished merge and with unmerged files', (t) => {
  const git = (dir: string, ...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  const conflicted = (): string => {
    const dir = workingProject(t);
    rmSync(join(dir, 'state.ts'));
    writeFileSync(join(dir, 'f.txt'), 'base\n');
    commitAll(dir, 'base');
    return dir;
  };

  const merging = conflicted();
  git(merging, 'checkout', '-q', '-b', 'side');
  writeFileSync(join(merging, 'f.txt'), 'side\n');
  commitAll(merging, 'side');
  git(merging, 'checkout', '-q', '-');
  writeFileSync(join(merging, 'f.txt'), 'main\n');
  commitAll(merging, 'main');
  assert.throws(() => git(merging, 'merge', '-q', 'side'));
  assert.throws(() => layerDone(merging, 'L2 state', undefined, NOW), /git の merge が途中なのでコミットしない/);
  assert.equal(read(merging, 'PLAN.md'), PLAN);

  const stashed = conflicted();
  writeFileSync(join(stashed, 'f.txt'), 'stash\n');
  git(stashed, 'stash', '-q');
  writeFileSync(join(stashed, 'f.txt'), 'main\n');
  commitAll(stashed, 'main');
  assert.throws(() => git(stashed, 'stash', 'pop', '-q'));
  assert.throws(() => layerDone(stashed, 'L2 state', undefined, NOW), /競合が未解決のファイルが 1件ある/);
  assert.equal(read(stashed, 'PLAN.md'), PLAN);
});

test('layer done lists at most five added files', (t) => {
  const dir = workingProject(t);
  for (const name of ['a', 'b', 'c', 'd', 'e', 'f']) writeFileSync(join(dir, `${name}.ts`), '');
  const [line] = layerDone(dir, 'L2 state', undefined, NOW);
  assert.match(line ?? '', /（追加: a\.ts, b\.ts, c\.ts, d\.ts, e\.ts ほか2件）$/);
});

test('layer done works as the first commit of a repository', (t) => {
  const dir = project(repo(t), STATE);
  layerDone(dir, 'L2 state', undefined, NOW);
  assert.equal(gitLastCommit(dir)?.subject, 'layer: L2 state');
});
