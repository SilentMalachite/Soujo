import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { init } from '../src/commands/init.js';
import { layerDone } from '../src/commands/layer.js';
import { logRotate } from '../src/commands/log.js';
import { phaseDone } from '../src/commands/phase.js';
import { gitLastCommit, gitStatus } from '../src/git.js';
import { commitAll, deadPid, project, repo, temp } from './helpers.js';

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
  // Refused after staging: the other records stay staged, NEXT.md is hidden by skip-worktree, the rest is as it was.
  assert.deepEqual(gitStatus(dir), ['M  .soujo/LOG.md', 'M  .soujo/PLAN.md', 'A  .soujo/SPEC.md', ' M src.ts', 'A  staged.ts']);

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
    // The records are staged by now, and stay so; the rest is as it was.
    const staged = ['M  .soujo/LOG.md', 'M  .soujo/NEXT.md', 'M  .soujo/PLAN.md', 'A  .soujo/SPEC.md'];
    assert.deepEqual(gitStatus(dir), [...staged, ' M src.ts', 'A  staged.ts'], hook);

    rmSync(path);
    assert.match(phaseDone(dir, 'converge')[0] ?? '', /^フェーズ「converge」の記録をコミット: /, hook);
    assert.deepEqual(gitStatus(dir), [' M src.ts', 'A  staged.ts'], hook);
  }
});

test('phase done in a subdirectory project commits only its records, and works as the first commit', (t) => {
  const top = repo(t);
  writeFileSync(join(top, 'outside.txt'), 'outside\n');
  git(top, 'add', 'outside.txt');
  // Freshly planned: a layer checked before any commit would be a layer done that stopped before its commit.
  const dir = project(join(top, 'app'), { ...STATE, 'PLAN.md': PLAN.replace('[x]', '[ ]'), 'NEXT.md': next('L1 scaffold') });
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

const NOW = new Date(2026, 8, 13, 10, 0);

// A layer done that stopped before its commit: the PLAN check and the LOG entry written, nothing committed. index.lock makes
// its `git add` fail, as a git that cannot write would.
test('after layer done stops before its commit, phase done refuses as close does, and re-running layer done finishes the layer', (t) => {
  const dir = project(repo(t), { 'PLAN.md': `${PLAN}- [ ] L2 fix — b\n`, 'LOG.md': LOG, 'NEXT.md': next('L2 fix') });
  commitAll(dir, 'layer: L1 scaffold');
  writeFileSync(join(dir, 'fix.ts'), 'export {};\n');
  writeFileSync(join(dir, '.soujo', 'NEXT.md'), next('converge'));
  const lock = join(dir, '.git', 'index.lock');
  writeFileSync(lock, '');
  assert.throws(() => layerDone(dir, 'L2 fix', 'done', NOW), /git add に失敗/);
  rmSync(lock);
  // converge found a gap meanwhile and handed over.
  writeFileSync(join(dir, '.soujo', 'PLAN.md'), `${PLAN}- [x] L2 fix — b\n- [ ] L3 gap — c（A1 partial）\n`);
  writeFileSync(join(dir, '.soujo', 'NEXT.md'), next('L3 gap'));

  const head = gitLastCommit(dir)?.hash;
  const status = gitStatus(dir);
  assert.throws(
    () => phaseDone(dir, 'converge'),
    /^Error: 層「L2 fix」の PLAN のチェックが未コミット（layer done の途中）。先に soujo layer done 'L2 fix' を再実行する$/,
  );
  assert.equal(gitLastCommit(dir)?.hash, head);
  assert.deepEqual(gitStatus(dir), status);
  assert.match(layerDone(dir, 'L2 fix', undefined, NOW)[0] ?? '', /のコミットをやり直した/);
  assert.equal(gitLastCommit(dir)?.subject, 'layer: L2 fix');
});

// A log rotate that stopped before its commit: LOG.md lost its July entry, a new archive has it, nothing committed.
test('after log rotate stops before its commit, phase done refuses, and re-running log rotate finishes it', (t) => {
  const log = '# LOG\n\n## 2026-07-30 L0 old\na\n\n## 2026-09-12 L1 scaffold\nold\n';
  const dir = project(repo(t), { 'PLAN.md': PLAN, 'LOG.md': log, 'NEXT.md': next('L2 fix') });
  commitAll(dir, 'layer: L1 scaffold');
  const september = new Date(2026, 8, 15, 10, 0);
  const lock = join(dir, '.git', 'index.lock');
  writeFileSync(lock, '');
  assert.throws(() => logRotate(dir, undefined, september), /git add に失敗/);
  rmSync(lock);

  const head = gitLastCommit(dir)?.hash;
  const refusal = /^Error: 書庫 \.soujo\/LOG-2026-07\.md の変更が未コミット（log rotate の途中）。先に soujo log rotate を再実行する$/;
  assert.throws(() => phaseDone(dir, 'converge'), refusal);
  assert.equal(gitLastCommit(dir)?.hash, head);
  assert.deepEqual(gitStatus(dir), [' M .soujo/LOG.md', '?? .soujo/LOG-2026-07.md']);
  // Stopped after writing the archive and before LOG.md: the archive alone is enough to refuse.
  writeFileSync(join(dir, '.soujo', 'LOG.md'), log);
  assert.throws(() => phaseDone(dir, 'converge'), refusal);

  writeFileSync(join(dir, '.soujo', 'LOG.md'), '# LOG\n\n## 2026-09-12 L1 scaffold\nold\n');
  assert.match(logRotate(dir, undefined, september)[1] ?? '', /^コミット: [0-9a-f]+ log: rotate 2026-07$/);
  assert.deepEqual(phaseDone(dir, 'converge'), ['フェーズ「converge」の記録に未コミットの変更なし']);
});

test('phase done refuses a record whose symlink target is an untracked file with a credential name, as close does', { skip: process.platform === 'win32' }, (t) => {
  const dir = project(repo(t), { ...STATE, 'NEXT.md': next('plan') });
  commitAll(dir, 'base');
  writeFileSync(join(dir, '.env'), '# SPEC\n');
  symlinkSync('../.env', join(dir, '.soujo', 'SPEC.md'));
  const head = gitLastCommit(dir)?.hash;
  assert.throws(
    () => phaseDone(dir, 'spec'),
    /^Error: \.env は認証情報のファイル名なのでコミットしない（\.gitignore に足すか、コミットするなら先に git add する）$/,
  );
  assert.equal(gitLastCommit(dir)?.hash, head);
  // Refused before anything was staged.
  assert.deepEqual(gitStatus(dir), ['?? .env', '?? .soujo/SPEC.md']);

  // Added with `git add` first, it is committed as the user chose.
  git(dir, 'add', '.env');
  phaseDone(dir, 'spec');
  assert.deepEqual(committedPaths(dir), ['.env', '.soujo/SPEC.md']);
});

test('phase done commits every symlink on the way to a record, a directory\'s included, so that HEAD has no broken link', { skip: process.platform === 'win32' }, (t) => {
  const dir = project(repo(t), { ...STATE, 'NEXT.md': next('plan') });
  commitAll(dir, 'base');
  mkdirSync(join(dir, 'real'));
  writeFileSync(join(dir, 'real', 'SPEC.md'), '# SPEC\n');
  writeFileSync(join(dir, 'real', 'other.md'), 'someone else\n');
  symlinkSync('real', join(dir, 'docs'));
  symlinkSync('../docs/SPEC.md', join(dir, '.soujo', 'SPEC.md'));
  phaseDone(dir, 'spec');
  assert.deepEqual(committedPaths(dir), ['.soujo/SPEC.md', 'docs', 'real/SPEC.md']);
  assert.deepEqual(gitStatus(dir), ['?? real/other.md']);
  // HEAD alone resolves the link: a clone has the record.
  const clone = temp(t);
  git(clone, 'clone', '-q', dir, '.');
  assert.equal(readFileSync(join(clone, '.soujo', 'SPEC.md'), 'utf8'), '# SPEC\n');
});

test('phase done leaves out a symlink on the way to a record that is outside the project', { skip: process.platform === 'win32' }, (t) => {
  const top = repo(t);
  const dir = project(join(top, 'app'), { ...STATE, 'NEXT.md': next('plan') });
  commitAll(top, 'base');
  mkdirSync(join(dir, 'real'));
  writeFileSync(join(dir, 'real', 'SPEC.md'), '# SPEC\n');
  symlinkSync('app/real', join(top, 'shared'));
  symlinkSync('../../shared/SPEC.md', join(dir, '.soujo', 'SPEC.md'));
  phaseDone(dir, 'spec');
  assert.deepEqual(committedPaths(top), ['app/.soujo/SPEC.md', 'app/real/SPEC.md']);
  assert.deepEqual(gitStatus(top), ['?? shared']);
});

test('phase done spec also commits the CLAUDE.md and AGENTS.md soujo init placed while git does not track them', (t) => {
  const dir = repo(t);
  init(dir);
  writeFileSync(join(dir, '.soujo', 'SPEC.md'), '# SPEC\n\n## 目的\nx\n');
  writeFileSync(join(dir, '.soujo', 'NEXT.md'), next('plan'));
  phaseDone(dir, 'spec');
  assert.deepEqual(committedPaths(dir), ['.soujo/LOG.md', '.soujo/NEXT.md', '.soujo/PLAN.md', '.soujo/SPEC.md', 'AGENTS.md', 'CLAUDE.md']);
  assert.deepEqual(gitStatus(dir), []);

  // Tracked, a change to them is the user's: spec leaves it, as the other phases leave them untracked.
  writeFileSync(join(dir, 'CLAUDE.md'), 'mine\n');
  writeFileSync(join(dir, '.soujo', 'SPEC.md'), '# SPEC\n\n## 目的\ny\n');
  phaseDone(dir, 'spec');
  assert.deepEqual(committedPaths(dir), ['.soujo/SPEC.md']);
  assert.deepEqual(gitStatus(dir), [' M CLAUDE.md']);

  const planned = repo(t);
  init(planned);
  writeFileSync(join(planned, '.soujo', 'NEXT.md'), next('L1 scaffold'));
  for (const phase of ['plan', 'converge']) {
    writeFileSync(join(planned, '.soujo', 'LOG.md'), `# LOG\n\n## 2026-09-13 節目\n${phase}\n`);
    phaseDone(planned, phase);
    assert.ok(!committedPaths(planned).some((path) => !path.startsWith('.soujo/')), phase);
    assert.deepEqual(gitStatus(planned), ['?? AGENTS.md', '?? CLAUDE.md'], phase);
  }

  // Ignored, they are no record to commit, and no reason to refuse.
  const ignoring = repo(t);
  writeFileSync(join(ignoring, '.gitignore'), 'CLAUDE.md\n');
  commitAll(ignoring, 'ignore');
  init(ignoring);
  writeFileSync(join(ignoring, '.soujo', 'NEXT.md'), next('plan'));
  phaseDone(ignoring, 'spec');
  assert.ok(committedPaths(ignoring).includes('AGENTS.md'));
  assert.ok(!committedPaths(ignoring).includes('CLAUDE.md'));
});

test('phase done commits a partially staged record as written in the working tree', (t) => {
  const dir = convergedProject(t);
  const plan = `${PLAN}- [ ] L2 fix — b（A1 partial）\n`;
  // As `git add -p` leaves it: the index has part of the change, the working tree all of it.
  writeFileSync(join(dir, '.soujo', 'PLAN.md'), `${PLAN}- [ ] L2 half — b\n`);
  git(dir, 'add', '.soujo/PLAN.md');
  writeFileSync(join(dir, '.soujo', 'PLAN.md'), plan);
  phaseDone(dir, 'converge');
  assert.equal(git(dir, 'show', 'HEAD:.soujo/PLAN.md'), plan);
  assert.deepEqual(gitStatus(dir), [' M src.ts', 'A  staged.ts']);
});

test('phase done leaves another file\'s staged rename as it was', (t) => {
  const dir = convergedProject(t);
  git(dir, 'mv', 'src.ts', 'moved.ts');
  phaseDone(dir, 'converge');
  assert.deepEqual(committedPaths(dir), ['.soujo/LOG.md', '.soujo/NEXT.md', '.soujo/PLAN.md', '.soujo/SPEC.md']);
  assert.deepEqual(gitStatus(dir), ['RM moved.ts', 'A  staged.ts']);
});

// A known limit, left as it is: `git commit --only` writes the commit from a temporary index of HEAD and the given paths, and a
// pre-commit hook's `git add` goes into that one. The file it stages is committed with the records, while the index kept
// afterwards lacks it, so that git shows it as a staged deletion and an untracked file.
test('phase done commits a file a pre-commit hook stages, which the index kept afterwards lacks', { skip: process.platform === 'win32' }, (t) => {
  const dir = convergedProject(t);
  writeFileSync(join(dir, 'extra.txt'), 'extra\n');
  writeFileSync(join(dir, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\ngit add extra.txt\n', { mode: 0o755 });
  phaseDone(dir, 'converge');
  assert.deepEqual(committedPaths(dir), ['.soujo/LOG.md', '.soujo/NEXT.md', '.soujo/PLAN.md', '.soujo/SPEC.md', 'extra.txt']);
  assert.deepEqual(gitStatus(dir), ['D  extra.txt', ' M src.ts', 'A  staged.ts', '?? extra.txt']);
});

// A log rotate that stopped at its staged-as-written check: the archive it appended to is skip-worktree, so git status shows
// LOG.md alone, and committing it would leave the moved entries nowhere in HEAD.
test('phase done refuses a stopped log rotate whose archive is skip-worktree, and re-running log rotate finishes it', (t) => {
  const log = '# LOG\n\n## 2026-07-30 L0 old\na\n\n## 2026-09-12 L1 scaffold\nold\n';
  const dir = project(repo(t), { 'PLAN.md': PLAN, 'LOG.md': log, 'NEXT.md': next('L2 fix'), 'LOG-2026-07.md': '# LOG 2026-07\n\n## 2026-07-10 L0 first\nz\n' });
  commitAll(dir, 'layer: L1 scaffold');
  git(dir, 'update-index', '--skip-worktree', '.soujo/LOG-2026-07.md');
  const september = new Date(2026, 8, 15, 10, 0);
  assert.throws(() => logRotate(dir, undefined, september), /LOG-2026-07\.md の変更を git が拾っていない/);
  assert.deepEqual(gitStatus(dir), ['M  .soujo/LOG.md']);

  const head = gitLastCommit(dir)?.hash;
  assert.throws(
    () => phaseDone(dir, 'converge'),
    /^Error: 書庫 \.soujo\/LOG-2026-07\.md の変更が未コミット（log rotate の途中）。先に soujo log rotate を再実行する$/,
  );
  assert.equal(gitLastCommit(dir)?.hash, head);
  assert.deepEqual(gitStatus(dir), ['M  .soujo/LOG.md']);

  git(dir, 'update-index', '--no-skip-worktree', '.soujo/LOG-2026-07.md');
  assert.match(logRotate(dir, undefined, september)[1] ?? '', /^コミット: [0-9a-f]+ log: rotate 2026-07$/);
  assert.deepEqual(phaseDone(dir, 'converge'), ['フェーズ「converge」の記録に未コミットの変更なし']);
});

// git status hides the deletion of a skip-worktree record, and git add leaves it out.
test('phase done refuses a skip-worktree record deleted by hand as not staged, and a re-run commits the deletion', (t) => {
  const dir = project(repo(t), { ...STATE, 'SPEC.md': '# SPEC\n', 'NEXT.md': next('L2 fix') });
  commitAll(dir, 'base');
  git(dir, 'update-index', '--skip-worktree', '.soujo/SPEC.md');
  rmSync(join(dir, '.soujo', 'SPEC.md'));
  const head = gitLastCommit(dir)?.hash;
  assert.throws(() => phaseDone(dir, 'converge'), /^Error: \.soujo\/SPEC\.md の変更を git が拾っていない（skip-worktree などを確認）$/);
  assert.equal(gitLastCommit(dir)?.hash, head);

  git(dir, 'update-index', '--no-skip-worktree', '.soujo/SPEC.md');
  phaseDone(dir, 'converge');
  assert.deepEqual(committedPaths(dir), ['.soujo/SPEC.md']);
  assert.deepEqual(gitStatus(dir), []);
});

test('phase done spec takes in the CLAUDE.md and AGENTS.md init placed after a run a hook refused staged them', { skip: process.platform === 'win32' }, (t) => {
  const dir = repo(t);
  init(dir);
  writeFileSync(join(dir, '.soujo', 'SPEC.md'), '# SPEC\n\n## 目的\nx\n');
  writeFileSync(join(dir, '.soujo', 'NEXT.md'), next('plan'));
  const hook = join(dir, '.git', 'hooks', 'pre-commit');
  writeFileSync(hook, '#!/bin/sh\necho "secret found" >&2\nexit 1\n', { mode: 0o755 });
  assert.throws(() => phaseDone(dir, 'spec'), /^Error: git commit に失敗: secret found$/);
  assert.ok(gitStatus(dir).includes('A  CLAUDE.md') && gitStatus(dir).includes('A  AGENTS.md'));

  rmSync(hook);
  phaseDone(dir, 'spec');
  assert.deepEqual(committedPaths(dir), ['.soujo/LOG.md', '.soujo/NEXT.md', '.soujo/PLAN.md', '.soujo/SPEC.md', 'AGENTS.md', 'CLAUDE.md']);
  assert.deepEqual(gitStatus(dir), []);
});

// init keeps a CLAUDE.md or AGENTS.md already there, and one it placed that was since changed is the user's too.
test('phase done spec leaves a CLAUDE.md or AGENTS.md that is not what init writes, untracked or staged, as it was', (t) => {
  const dir = repo(t);
  writeFileSync(join(dir, 'CLAUDE.md'), 'mine\n');
  init(dir);
  writeFileSync(join(dir, '.soujo', 'SPEC.md'), '# SPEC\n\n## 目的\nx\n');
  writeFileSync(join(dir, '.soujo', 'NEXT.md'), next('plan'));
  phaseDone(dir, 'spec');
  assert.deepEqual(committedPaths(dir), ['.soujo/LOG.md', '.soujo/NEXT.md', '.soujo/PLAN.md', '.soujo/SPEC.md', 'AGENTS.md']);
  assert.deepEqual(gitStatus(dir), ['?? CLAUDE.md']);
  assert.equal(readFileSync(join(dir, 'CLAUDE.md'), 'utf8'), 'mine\n');

  const edited = repo(t);
  init(edited);
  writeFileSync(join(edited, 'AGENTS.md'), `${readFileSync(join(edited, 'AGENTS.md'), 'utf8')}\n## 追記\n`);
  git(edited, 'add', 'AGENTS.md');
  writeFileSync(join(edited, '.soujo', 'NEXT.md'), next('plan'));
  phaseDone(edited, 'spec');
  assert.deepEqual(committedPaths(edited), ['.soujo/LOG.md', '.soujo/NEXT.md', '.soujo/PLAN.md', '.soujo/SPEC.md', 'CLAUDE.md']);
  assert.deepEqual(gitStatus(edited), ['A  AGENTS.md']);
});

// `git add -A -- docs` stages the symlink and the deletion of every file HEAD or the index has under the directory it replaced.
test('phase done refuses a symlink on the way to a record where HEAD or the index has a directory, before staging', { skip: process.platform === 'win32' }, (t) => {
  const refusal = /^Error: docs はディレクトリだったところにある symlink なので、記録だけをコミットできない（soujo layer done か soujo close で全体と一緒にコミットする）$/;
  const replace = (dir: string) => {
    rmSync(join(dir, 'docs'), { recursive: true });
    mkdirSync(join(dir, 'real'));
    writeFileSync(join(dir, 'real', 'SPEC.md'), '# SPEC\n');
    symlinkSync('real', join(dir, 'docs'));
    symlinkSync('../docs/SPEC.md', join(dir, '.soujo', 'SPEC.md'));
  };
  const committed = project(repo(t), { ...STATE, 'NEXT.md': next('plan') });
  mkdirSync(join(committed, 'docs'));
  writeFileSync(join(committed, 'docs', 'other.txt'), 'someone else\n');
  commitAll(committed, 'base');
  replace(committed);
  const head = gitLastCommit(committed)?.hash;
  const status = gitStatus(committed);
  assert.throws(() => phaseDone(committed, 'spec'), refusal);
  assert.equal(gitLastCommit(committed)?.hash, head);
  assert.deepEqual(gitStatus(committed), status);

  const staged = project(repo(t), { ...STATE, 'NEXT.md': next('plan') });
  commitAll(staged, 'base');
  mkdirSync(join(staged, 'docs'));
  writeFileSync(join(staged, 'docs', 'other.txt'), 'someone else\n');
  git(staged, 'add', 'docs/other.txt');
  replace(staged);
  assert.throws(() => phaseDone(staged, 'spec'), refusal);
  assert.equal(gitLastCommit(staged)?.subject, 'base');
});

test('phase done refuses a record symlink whose target is gone, naming it, before staging', { skip: process.platform === 'win32' }, (t) => {
  const dir = project(repo(t), { ...STATE, 'NEXT.md': next('plan') });
  mkdirSync(join(dir, 'docs'));
  writeFileSync(join(dir, 'docs', 'SPEC.md'), '# SPEC\n');
  symlinkSync('../docs/SPEC.md', join(dir, '.soujo', 'SPEC.md'));
  commitAll(dir, 'base');
  rmSync(join(dir, 'docs', 'SPEC.md'));
  const head = gitLastCommit(dir)?.hash;
  assert.throws(
    () => phaseDone(dir, 'spec'),
    /^Error: \.soujo\/SPEC\.md は先をたどれない symlink（先がないかループ）なので記録をコミットできない（symlink の先を戻すか、実体のファイルに置き換えてから）$/,
  );
  assert.equal(gitLastCommit(dir)?.hash, head);
  assert.deepEqual(gitStatus(dir), [' D docs/SPEC.md']);
});

test('phase done deletes the temporary files a killed init or state write left, as a commit of everything does', (t) => {
  const dir = convergedProject(t);
  const pid = deadPid();
  const leftovers = [join(dir, `.CLAUDE.md.${pid}.tmp`), join(dir, `.AGENTS.md.${pid}.tmp`), join(dir, '.soujo', `.NEXT.md.${pid}.tmp`)];
  for (const path of leftovers) writeFileSync(path, 'half\n');
  phaseDone(dir, 'converge');
  assert.deepEqual(leftovers.filter((path) => existsSync(path)), []);
  assert.deepEqual(committedPaths(dir), ['.soujo/LOG.md', '.soujo/NEXT.md', '.soujo/PLAN.md', '.soujo/SPEC.md']);
  assert.deepEqual(gitStatus(dir), [' M src.ts', 'A  staged.ts']);
});
