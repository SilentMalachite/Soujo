import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { phaseDone } from '../src/commands/phase.js';
import { gitLastCommit, gitStatus } from '../src/git.js';
import { commitAll, project, repo, temp } from './helpers.js';

const PLAN = '# PLAN\n\n- [x] L1 scaffold — build\n';
const LOG = '# LOG\n\n## 2026-09-12 L1 scaffold\nold\n';
const next = (layer: string) => `次: ${layer}\n前提: p\n確認: c\n注意: なし\neffort: high\n`;
const STATE = { 'PLAN.md': PLAN, 'LOG.md': LOG, 'NEXT.md': next('converge') };
const HINT = '（先に soujo next set で次の一手を書く）';

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// The paths the last commit changed, relative to the top level.
function committedPaths(dir: string): string[] {
  return git(dir, 'show', '--name-only', '--format=', 'HEAD').split('\n').filter((path) => path !== '');
}

/**
 * A committed project where converge found a gap and handed over: a layer added, its milestone logged, and NEXT.md pointed at
 * it; also a new SPEC.md, a modified source file, and a staged one that belong to someone else's work.
 */
function convergedProject(t: TestContext): string {
  const dir = project(repo(t), STATE);
  writeFileSync(join(dir, 'src.ts'), 'export {};\n');
  commitAll(dir, 'layer: L1 scaffold');
  writeFileSync(join(dir, '.soujo', 'SPEC.md'), '# SPEC\n');
  writeFileSync(join(dir, '.soujo', 'PLAN.md'), `${PLAN}- [ ] L2 fix — b（A1 partial）\n`);
  writeFileSync(join(dir, '.soujo', 'LOG.md'), `${LOG}\n## 2026-09-13 節目\nconverge: 差（A1）\n`);
  writeFileSync(join(dir, '.soujo', 'NEXT.md'), next('L2 fix'));
  writeFileSync(join(dir, 'src.ts'), 'export const changed = 1;\n');
  writeFileSync(join(dir, 'staged.ts'), 'export {};\n');
  git(dir, 'add', 'staged.ts');
  return dir;
}

test('phase done commits only the four records as "phase: <phase>" and leaves every other change as it was', (t) => {
  const dir = convergedProject(t);
  writeFileSync(join(dir, 'untracked.ts'), '');
  const [line, ...rest] = phaseDone(dir, ' converge ');
  const commit = gitLastCommit(dir);
  assert.deepEqual([line, rest], [`フェーズ「converge」の記録をコミット: ${commit?.hash} phase: converge`, []]);
  assert.equal(commit?.subject, 'phase: converge');
  assert.deepEqual(committedPaths(dir), ['.soujo/LOG.md', '.soujo/NEXT.md', '.soujo/PLAN.md', '.soujo/SPEC.md']);
  // Still modified, still staged, still untracked.
  assert.deepEqual(gitStatus(dir), [' M src.ts', 'A  staged.ts', '?? untracked.ts']);
});

test('phase done with nothing uncommitted in the records says so and exits 0, so a re-run is harmless', (t) => {
  const dir = convergedProject(t);
  phaseDone(dir, 'converge');
  const head = gitLastCommit(dir)?.hash;
  assert.deepEqual(phaseDone(dir, 'converge'), ['フェーズ「converge」の記録に未コミットの変更なし']);
  assert.equal(gitLastCommit(dir)?.hash, head);
  assert.deepEqual(gitStatus(dir), [' M src.ts', 'A  staged.ts']);
});

test('phase done commits a symlinked record together with its target, and nothing else next to the target', { skip: process.platform === 'win32' }, (t) => {
  const dir = project(repo(t), { ...STATE, 'NEXT.md': next('plan') });
  commitAll(dir, 'base');
  mkdirSync(join(dir, 'docs'));
  writeFileSync(join(dir, 'docs', 'SPEC.md'), '# SPEC\n');
  writeFileSync(join(dir, 'docs', 'other.md'), 'someone else\n');
  symlinkSync('../docs/SPEC.md', join(dir, '.soujo', 'SPEC.md'));
  const [line] = phaseDone(dir, 'spec');
  assert.match(line ?? '', /^フェーズ「spec」の記録をコミット: [0-9a-f]+ phase: spec$/);
  assert.deepEqual(committedPaths(dir), ['.soujo/SPEC.md', 'docs/SPEC.md']);
  assert.deepEqual(gitStatus(dir), ['?? docs/other.md']);

  // A change made through the symlink is a change of the record.
  writeFileSync(join(dir, 'docs', 'SPEC.md'), '# SPEC\n\n決めた\n');
  phaseDone(dir, 'spec');
  assert.deepEqual(committedPaths(dir), ['docs/SPEC.md']);
});

test('phase done refuses a name that is not a phase, naming the three, and commits nothing', (t) => {
  const dir = convergedProject(t);
  const head = gitLastCommit(dir)?.hash;
  for (const name of ['Converge', 'L2 fix', '節目', '']) {
    assert.throws(() => phaseDone(dir, name), new RegExp(`^Error: フェーズ「${name}」はない（spec / plan / converge のどれか）$`));
  }
  assert.equal(gitLastCommit(dir)?.hash, head);
});

test('phase done refuses without a NEXT.md that has moved past the phase, and commits nothing', (t) => {
  const dir = convergedProject(t);
  const head = gitLastCommit(dir)?.hash;
  const nextPath = join(dir, '.soujo', 'NEXT.md');
  const status = gitStatus(dir);

  writeFileSync(nextPath, next('converge'));
  assert.throws(() => phaseDone(dir, 'converge'), new RegExp(`^Error: NEXT\\.md の次がまだ「converge」${HINT}$`));
  writeFileSync(nextPath, ` ${next(' plan ')}`);
  assert.throws(() => phaseDone(dir, ' plan'), new RegExp(`^Error: NEXT\\.md の次がまだ「plan」${HINT}$`));
  writeFileSync(nextPath, `${next('L2 fix')}補足: x\n`);
  assert.throws(() => phaseDone(dir, 'converge'), new RegExp(`^Error: NEXT\\.md が無効: 5行を超えている（6行）、6行目を読めない: 補足: x${HINT}$`));
  rmSync(nextPath);
  assert.throws(() => phaseDone(dir, 'converge'), new RegExp(`^Error: NEXT\\.md がない${HINT}$`));

  assert.equal(gitLastCommit(dir)?.hash, head);
  // Nothing was staged either: the records are as they were before each refusal.
  assert.deepEqual(gitStatus(dir), status.map((record) => (record === ' M .soujo/NEXT.md' ? ' D .soujo/NEXT.md' : record)));
});

test('phase done refuses outside a repository, during an unfinished merge, and with unmerged files', (t) => {
  const outside = project(temp(t), { ...STATE, 'NEXT.md': next('L2 fix') });
  assert.throws(() => phaseDone(outside, 'converge'), /^Error: git リポジトリではないのでコミットできない$/);

  const conflicted = (): string => {
    const dir = project(repo(t), { ...STATE, 'NEXT.md': next('L2 fix') });
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
  writeFileSync(join(merging, '.soujo', 'LOG.md'), `${LOG}\n## 2026-09-13 節目\nx\n`);
  assert.throws(() => phaseDone(merging, 'converge'), /^Error: git の merge が途中なのでコミットしない（終えるか中止してから）$/);
  assert.equal(gitLastCommit(merging)?.subject, 'main');

  const stashed = conflicted();
  writeFileSync(join(stashed, 'f.txt'), 'stash\n');
  git(stashed, 'stash', '-q');
  writeFileSync(join(stashed, 'f.txt'), 'main\n');
  commitAll(stashed, 'main');
  assert.throws(() => git(stashed, 'stash', 'pop', '-q'));
  writeFileSync(join(stashed, '.soujo', 'LOG.md'), `${LOG}\n## 2026-09-13 節目\nx\n`);
  assert.throws(() => phaseDone(stashed, 'converge'), /^Error: 競合が未解決のファイルが 1件あるのでコミットしない$/);
  assert.equal(gitLastCommit(stashed)?.subject, 'main');
});

test('phase done refuses a record that git ignores, or a symlinked .soujo/, and commits nothing', { skip: process.platform === 'win32' }, (t) => {
  const ignoring = repo(t);
  writeFileSync(join(ignoring, '.gitignore'), '.soujo/LOG.md\n');
  commitAll(ignoring, 'ignore before it is tracked');
  project(ignoring, { ...STATE, 'NEXT.md': next('L2 fix') });
  assert.throws(
    () => phaseDone(ignoring, 'converge'),
    /^Error: \.soujo\/LOG\.md が git に無視されていて記録がコミットに残らない（\.gitignore などから外してから）$/,
  );
  assert.equal(gitLastCommit(ignoring)?.subject, 'ignore before it is tracked');
  assert.deepEqual(gitStatus(ignoring), ['?? .soujo/']);

  const linked = repo(t);
  project(join(linked, 'records'), { ...STATE, 'NEXT.md': next('L2 fix') });
  symlinkSync('records/.soujo', join(linked, '.soujo'));
  assert.throws(() => phaseDone(linked, 'converge'), /^Error: \.soujo\/ が symlink なので記録をコミットできない/);
});

test('phase done commits nothing while a record is not staged as written, and a re-run commits it', (t) => {
  const dir = convergedProject(t);
  const head = gitLastCommit(dir)?.hash;
  git(dir, 'update-index', '--skip-worktree', '.soujo/NEXT.md');
  assert.throws(() => phaseDone(dir, 'converge'), /^Error: \.soujo\/NEXT\.md の変更を git が拾っていない（skip-worktree などを確認）$/);
  assert.equal(gitLastCommit(dir)?.hash, head);

  git(dir, 'update-index', '--no-skip-worktree', '.soujo/NEXT.md');
  phaseDone(dir, 'converge');
  assert.deepEqual(committedPaths(dir), ['.soujo/LOG.md', '.soujo/NEXT.md', '.soujo/PLAN.md', '.soujo/SPEC.md']);
});

// Only staging the whole project takes an untracked file in, so its name is no reason to refuse a commit of four paths.
test('phase done is not refused by an untracked credential file elsewhere, and leaves it untracked', (t) => {
  const dir = convergedProject(t);
  writeFileSync(join(dir, '.env'), 'TOKEN=x\n');
  phaseDone(dir, 'converge');
  assert.equal(gitLastCommit(dir)?.subject, 'phase: converge');
  assert.ok(!committedPaths(dir).includes('.env'));
  assert.deepEqual(gitStatus(dir), [' M src.ts', 'A  staged.ts', '?? .env']);
});

test('phase done runs the hooks: a refusing one is reported in one line, commits nothing, and a re-run commits', { skip: process.platform === 'win32' }, (t) => {
  for (const hook of ['pre-commit', 'commit-msg']) {
    const dir = convergedProject(t);
    const head = gitLastCommit(dir)?.hash;
    const path = join(dir, '.git', 'hooks', hook);
    writeFileSync(path, '#!/bin/sh\necho "secret found" >&2\nexit 1\n', { mode: 0o755 });
    assert.throws(() => phaseDone(dir, 'converge'), /^Error: git commit に失敗: secret found$/, hook);
    assert.equal(gitLastCommit(dir)?.hash, head, hook);
    // The records are staged by now; the rest is as it was.
    assert.deepEqual(gitStatus(dir).filter((record) => !record.includes('.soujo/')), [' M src.ts', 'A  staged.ts'], hook);

    rmSync(path);
    assert.match(phaseDone(dir, 'converge')[0] ?? '', /^フェーズ「converge」の記録をコミット: /, hook);
    assert.deepEqual(gitStatus(dir), [' M src.ts', 'A  staged.ts'], hook);
  }
});

test('phase done in a subdirectory project commits only its records, and works as the first commit', (t) => {
  const top = repo(t);
  writeFileSync(join(top, 'outside.txt'), 'outside\n');
  git(top, 'add', 'outside.txt');
  const dir = project(join(top, 'app'), { ...STATE, 'NEXT.md': next('L1 scaffold') });
  writeFileSync(join(dir, 'app.ts'), '');
  mkdirSync(join(dir, 'src'));
  const [line] = phaseDone(join(dir, 'src'), 'plan');
  assert.match(line ?? '', /^フェーズ「plan」の記録をコミット: [0-9a-f]+ phase: plan$/);
  assert.deepEqual(committedPaths(top), ['app/.soujo/LOG.md', 'app/.soujo/NEXT.md', 'app/.soujo/PLAN.md']);
  assert.deepEqual(gitStatus(top), ['A  outside.txt', '?? app/app.ts']);
});

test('phase done commits a record deleted by hand, staged or not', (t) => {
  const dir = project(repo(t), { ...STATE, 'SPEC.md': '# SPEC\n', 'NEXT.md': next('L2 fix') });
  commitAll(dir, 'base');
  git(dir, 'rm', '-q', '.soujo/SPEC.md');
  rmSync(join(dir, '.soujo', 'LOG.md'));
  phaseDone(dir, 'converge');
  assert.deepEqual(committedPaths(dir), ['.soujo/LOG.md', '.soujo/SPEC.md']);
  assert.deepEqual(gitStatus(dir), []);
});
