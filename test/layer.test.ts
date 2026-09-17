import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { layerDone } from '../src/commands/layer.js';
import { logRotate } from '../src/commands/log.js';
import { foldsCase } from '../src/files.js';
import { gitLastCommit, gitStatus } from '../src/git.js';
import { parseLog } from '../src/state.js';
import { markDone } from '../src/state.js';
import { commitAll, deadPid, project, repo, temp } from './helpers.js';

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

test('layer done after a rotate stopped before its commit logs the layer once and commits the archive with it', { skip: process.platform === 'win32' }, (t) => {
  const dir = project(repo(t), { ...STATE, 'LOG.md': '# LOG\n\n## 2026-07-01 L0\nz\n\n## 2026-09-12 L1 scaffold\nold\n' });
  commitAll(dir, 'layer: L1 scaffold');
  const hook = join(dir, '.git', 'hooks', 'pre-commit');
  writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  assert.throws(() => logRotate(dir, undefined, NOW), /git commit に失敗/);
  rmSync(hook);

  layerDone(dir, 'L2 state', 'note', NOW);
  assert.equal(gitLastCommit(dir)?.subject, 'layer: L2 state');
  assert.equal(read(dir, 'LOG.md'), `${LOG}\n## 2026-09-13 L2 state\nnote\n`);
  assert.equal(read(dir, 'LOG-2026-07.md'), '# LOG 2026-07\n\n## 2026-07-01 L0\nz\n');
  assert.equal(parseLog(read(dir, 'LOG.md')).filter((entry) => entry.layer === 'L2 state').length, 1);
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
  for (const note of ['中断: 途中', '\n 中断：途中']) {
    assert.throws(() => layerDone(dir, 'L2 state', note, NOW), /^Error: --note を「中断:」で始めない（close の中断の記録と区別できなくなる）$/);
  }
  assert.deepEqual(before(), snapshot);

  const outsideGit = project(temp(t), STATE);
  assert.throws(() => layerDone(outsideGit, 'L2 state', undefined, NOW), /git リポジトリではない/);
  assert.equal(read(outsideGit, 'PLAN.md'), PLAN);
});

test('layer done refuses while PLAN repeats a layer name, names a layer like a phase, or leaves a fence open, and writes nothing', (t) => {
  const dir = workingProject(t);
  const plans: [string, RegExp][] = [
    [`${PLAN}- [ ] L2 state — again\n`, /^Error: PLAN\.md の層「L2 state」が重複（PLAN\.md を直してから）$/],
    [`${PLAN}\`\`\`\n`, /^Error: PLAN\.md の6行目のコードフェンスが閉じていない（以降の層が読まれない）（PLAN\.md を直してから）$/],
    [`${PLAN}- [ ] spec — SPEC\n`, /^Error: PLAN\.md の層名「spec」がフェーズ名と同じ（/],
    [`${PLAN}- [ ] converge — SPEC\n`, /^Error: PLAN\.md の層名「converge」がフェーズ名と同じ（/],
    [`${PLAN}- [ ] 節目 — LOG\n`, /^Error: PLAN\.md の層名「節目」が LOG の節目と同じ（/],
    [`${PLAN}- [ ] \n`, /^Error: PLAN\.md の6行目の層名が空（PLAN\.md を直してから）$/],
    [`${PLAN}- [ ] L9\tx — a\n`, /^Error: PLAN\.md の6行目の層名に制御文字がある（PLAN\.md を直してから）$/],
  ];
  for (const [plan, error] of plans) {
    writeFileSync(join(dir, '.soujo', 'PLAN.md'), plan);
    assert.throws(() => layerDone(dir, 'L2 state', undefined, NOW), error);
    assert.deepEqual([read(dir, 'PLAN.md'), read(dir, 'LOG.md')], [plan, LOG]);
  }
  assert.equal(gitLastCommit(dir)?.subject, 'layer: L1 scaffold');
});

test('layer done refuses a layer without a completion condition and writes nothing', (t) => {
  const dir = workingProject(t);
  const plan = PLAN.replace('- [ ] L2 state — test', '- [ ] L2 state');
  writeFileSync(join(dir, '.soujo', 'PLAN.md'), plan);
  assert.throws(
    () => layerDone(dir, ' L2 state ', 'note', NOW),
    /^Error: PLAN\.md の4行目の層「L2 state」に完了条件がない（「— <完了条件>」を書いてから）$/,
  );
  assert.deepEqual([read(dir, 'PLAN.md'), read(dir, 'LOG.md')], [plan, LOG]);
  assert.equal(gitLastCommit(dir)?.subject, 'layer: L1 scaffold');
  // The separator left without a condition after it, the way the condition is most often forgotten.
  const dangling = PLAN.replace('- [ ] L2 state — test', '- [ ] L2 state —');
  writeFileSync(join(dir, '.soujo', 'PLAN.md'), dangling);
  assert.throws(
    () => layerDone(dir, 'L2 state', 'note', NOW),
    /^Error: PLAN\.md の4行目の層「L2 state」に完了条件がない（「— <完了条件>」を書いてから）$/,
  );
  assert.deepEqual([read(dir, 'PLAN.md'), read(dir, 'LOG.md')], [dangling, LOG]);

  // A run stopped after PLAN was checked but before the commit is refused too, so the condition cannot be dropped to get past it.
  const checked = PLAN.replace('- [ ] L2 state — test', '- [x] L2 state');
  writeFileSync(join(dir, '.soujo', 'PLAN.md'), checked);
  assert.throws(
    () => layerDone(dir, 'L2 state', 'note', NOW),
    /^Error: PLAN\.md の4行目の層「L2 state」に完了条件がない（「— <完了条件>」を書いてから）$/,
  );
  assert.deepEqual([read(dir, 'PLAN.md'), read(dir, 'LOG.md')], [checked, LOG]);
});

test('layer done ignores a checklist item inside a code fence', (t) => {
  const dir = workingProject(t);
  writeFileSync(join(dir, '.soujo', 'PLAN.md'), `${PLAN}\n\`\`\`\n- [ ] L9 例 — c\n\`\`\`\n`);
  assert.throws(() => layerDone(dir, 'L9 例', 'note', NOW), /^Error: PLAN\.md に層「L9 例」がない$/);
  assert.equal(read(dir, 'LOG.md'), LOG);
});

test('a committed layer is reported as committed even after its completion condition was removed', (t) => {
  const dir = workingProject(t);
  writeFileSync(join(dir, '.soujo', 'PLAN.md'), PLAN.replace('- [x] L1 scaffold — build', '- [x] L1 scaffold'));
  assert.throws(() => layerDone(dir, 'L1 scaffold', 'note', NOW), /^Error: 層「L1 scaffold」はコミット済み（[0-9a-f]+）$/);
  assert.equal(read(dir, 'LOG.md'), LOG);
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
  assert.throws(() => layerDone(dir, 'L2 state', 'n', NOW), /^Error: NEXT\.md が無効: 5行を超えている（6行）、6行目を読めない: 補足: x（/);
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
    /^Error: git add に失敗: .*（PLAN と LOG は記録済み。原因を直して再実行すればコミットだけやり直す）$/,
  );
  const logAfterFailure = read(dir, 'LOG.md');
  assert.match(read(dir, 'PLAN.md'), /- \[x\] L2 state/);
  rmSync(lock);

  const [line] = layerDone(dir, 'L2 state', 'ignored on retry', NOW);
  assert.equal(line, `層「L2 state」のコミットをやり直した: ${gitLastCommit(dir)?.hash} layer: L2 state（追加: state.ts）`);
  assert.equal(read(dir, 'LOG.md'), logAfterFailure);
  assert.deepEqual(gitStatus(dir), []);
});

test('a failed LOG write says PLAN is recorded, and re-running resumes from LOG', (t) => {
  const dir = workingProject(t);
  const blocker = join(dir, '.soujo', `.LOG.md.${process.pid}.tmp`);
  mkdirSync(blocker);
  assert.throws(
    () => layerDone(dir, 'L2 state', 'note', NOW),
    /^Error: LOG\.md を書けない: .*（PLAN は記録済み。原因を直して再実行すれば LOG 追記からやり直す）$/,
  );
  assert.match(read(dir, 'PLAN.md'), /- \[x\] L2 state/);
  assert.equal(read(dir, 'LOG.md'), LOG);
  rmSync(blocker, { recursive: true });

  assert.match(layerDone(dir, 'L2 state', 'note', NOW)[0] ?? '', /のコミットをやり直した/);
  assert.equal(read(dir, 'LOG.md'), `${LOG}\n## 2026-09-13 L2 state\nnote\n`);
});

test('layer done refuses when .soujo/ files are git-ignored, and reports when git picks up nothing', (t) => {
  for (const ignoredFile of ['.soujo/LOG.md', '.soujo/SPEC.md']) {
    const ignoring = repo(t);
    writeFileSync(join(ignoring, '.gitignore'), `${ignoredFile}\n`);
    commitAll(ignoring, 'ignore before it is tracked');
    project(ignoring, { ...STATE, 'SPEC.md': '# SPEC\n' });
    assert.throws(
      () => layerDone(ignoring, 'L2 state', undefined, NOW),
      new RegExp(`^Error: ${ignoredFile.replaceAll('.', '\\.')} が git に無視されていて記録がコミットに残らない`),
    );
    assert.equal(read(ignoring, 'PLAN.md'), PLAN);
  }

  const recorded = '（PLAN と LOG は記録済み。原因を直して再実行すればコミットだけやり直す）';
  for (const withSource of [false, true]) {
    const skipping = workingProject(t);
    if (!withSource) rmSync(join(skipping, 'state.ts'));
    execFileSync('git', ['update-index', '--skip-worktree', '.soujo/PLAN.md', '.soujo/LOG.md'], { cwd: skipping });
    const before = gitLastCommit(skipping)?.hash;
    assert.throws(
      () => layerDone(skipping, 'L2 state', undefined, NOW),
      new RegExp(`^Error: \\.soujo/PLAN\\.md, \\.soujo/LOG\\.md の変更を git が拾っていない（skip-worktree などを確認）${recorded}$`),
      `with a source change: ${withSource}`,
    );
    assert.equal(gitLastCommit(skipping)?.hash, before);
  }
});

test('layer done commits nothing while NEXT.md is not staged as written, and a re-run commits it', (t) => {
  const dir = workingProject(t);
  execFileSync('git', ['update-index', '--skip-worktree', '.soujo/NEXT.md'], { cwd: dir });
  writeFileSync(join(dir, '.soujo', 'NEXT.md'), NEXT.replace('L3 io', 'L10 later'));
  const before = gitLastCommit(dir)?.hash;
  assert.throws(() => layerDone(dir, 'L2 state', 'note', NOW), /^Error: \.soujo\/NEXT\.md の変更を git が拾っていない/);
  assert.equal(gitLastCommit(dir)?.hash, before);

  execFileSync('git', ['update-index', '--no-skip-worktree', '.soujo/NEXT.md'], { cwd: dir });
  assert.match(layerDone(dir, 'L2 state', 'note', NOW)[0] ?? '', /のコミットをやり直した/);
  assert.deepEqual(gitStatus(dir), []);
  assert.equal(read(dir, 'LOG.md'), `${LOG}\n## 2026-09-13 L2 state\nnote\n`);
});

test('a re-run after an interruption before LOG does not take an earlier 中断 entry of the layer for its record', (t) => {
  const dir = project(repo(t), { ...STATE, 'LOG.md': `${LOG}\n## 2026-09-12 L2 state\n中断: 途中\n` });
  commitAll(dir, 'wip: L2 state');
  writeFileSync(join(dir, 'state.ts'), 'export {};\n');
  writeFileSync(join(dir, '.soujo', 'PLAN.md'), markDone(PLAN, 'L2 state'));
  assert.match(layerDone(dir, 'L2 state', '完了', NOW)[0] ?? '', /のコミットをやり直した/);
  assert.equal(read(dir, 'LOG.md'), `${LOG}\n## 2026-09-12 L2 state\n中断: 途中\n\n## 2026-09-13 L2 state\n完了\n`);
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

  writeFileSync(join(dir, '.soujo', 'PLAN.md'), PLAN.replace('- [x] L1 scaffold', '- [ ] L1 scaffold'));
  assert.throws(() => layerDone(dir, 'L1 scaffold', undefined, NOW), /は PLAN のチェックごとコミット済み/);
  assert.equal(read(dir, 'LOG.md'), LOG);
});

test('a re-run still refuses an invalid note before committing', (t) => {
  const dir = workingProject(t);
  const lock = join(dir, '.git', 'index.lock');
  writeFileSync(lock, '');
  assert.throws(() => layerDone(dir, 'L2 state', 'note', NOW), /git add に失敗/);
  rmSync(lock);
  const before = [read(dir, 'LOG.md'), gitLastCommit(dir)?.hash];
  assert.throws(() => layerDone(dir, 'L2 state', 'a\nb\nc\nd', NOW), /3行まで（4行）/);
  assert.throws(() => layerDone(dir, 'L2 state', '中断: 途中', NOW), /「中断:」で始めない/);
  assert.deepEqual([read(dir, 'LOG.md'), gitLastCommit(dir)?.hash], before);
});

test('a re-run finds its uncommitted LOG entry after later entries, and when LOG has as many entries as HEAD', (t) => {
  const memo = '\n## 2026-09-12 L3 io\nmemo\n';
  const dir = project(repo(t), { ...STATE, 'LOG.md': `${LOG}${memo}` });
  commitAll(dir, 'layer: L1 scaffold');
  writeFileSync(join(dir, 'state.ts'), 'export {};\n');
  const lock = join(dir, '.git', 'index.lock');
  writeFileSync(lock, '');
  assert.throws(() => layerDone(dir, 'L2 state', 'note', NOW), /git add に失敗/);
  rmSync(lock);
  const logged = read(dir, 'LOG.md');

  const later = `${logged}\n## 2026-09-13 L3 io\nlater\n`;
  writeFileSync(join(dir, '.soujo', 'LOG.md'), later);
  writeFileSync(lock, '');
  assert.throws(() => layerDone(dir, 'L2 state', 'note', NOW), /git add に失敗/);
  rmSync(lock);
  assert.equal(read(dir, 'LOG.md'), later);

  // The memo entry of HEAD removed: as many entries as HEAD, one of them this layer's.
  const replaced = logged.replace(memo, '');
  writeFileSync(join(dir, '.soujo', 'LOG.md'), replaced);
  assert.match(layerDone(dir, 'L2 state', 'note', NOW)[0] ?? '', /のコミットをやり直した/);
  assert.equal(read(dir, 'LOG.md'), replaced);
});

test('leftover temporary files from a killed write are removed, not committed', (t) => {
  const dir = workingProject(t);
  const leftover = join(dir, '.soujo', `.PLAN.md.${deadPid()}.tmp`);
  writeFileSync(leftover, 'half');
  const [line] = layerDone(dir, 'L2 state', undefined, NOW);
  assert.match(line ?? '', /（追加: state\.ts）$/);
  assert.equal(existsSync(leftover), false);
  assert.deepEqual(gitStatus(dir), []);
});

test('a failure while listing added files still reports the successful commit', { skip: process.platform === 'win32' }, (t) => {
  const dir = workingProject(t);
  const bin = temp(t);
  const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
  writeFileSync(join(bin, 'git'), `#!/bin/sh\n[ "$1" = diff-tree ] && exit 1\nexec "${realGit}" "$@"\n`, { mode: 0o755 });
  const path = process.env.PATH;
  process.env.PATH = `${bin}:${path}`;
  try {
    const [line] = layerDone(dir, 'L2 state', undefined, NOW);
    assert.match(line ?? '', /^層「L2 state」を完了: [0-9a-f]+ layer: L2 state（追加ファイルの一覧は取得できなかった）$/);
  } finally {
    process.env.PATH = path;
  }
  assert.equal(gitLastCommit(dir)?.subject, 'layer: L2 state');
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

test('layer done is not refused by unmerged files outside the project', (t) => {
  const top = repo(t);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: top, stdio: 'ignore' });
  writeFileSync(join(top, 'f.txt'), 'base\n');
  const dir = project(join(top, 'app'), STATE);
  commitAll(top, 'base');
  writeFileSync(join(top, 'f.txt'), 'stash\n');
  git('stash', '-q');
  writeFileSync(join(top, 'f.txt'), 'main\n');
  commitAll(top, 'main');
  assert.throws(() => git('stash', 'pop', '-q'));
  writeFileSync(join(dir, 'state.ts'), '');
  layerDone(dir, 'L2 state', undefined, NOW);
  assert.equal(gitLastCommit(dir)?.subject, 'layer: L2 state');
  assert.deepEqual(gitStatus(top), ['UU f.txt']);
});

test('layer done commits nothing while a changed SPEC.md is not staged as written', (t) => {
  const dir = project(repo(t), { ...STATE, 'SPEC.md': '# SPEC\n' });
  commitAll(dir, 'layer: L1 scaffold');
  execFileSync('git', ['update-index', '--skip-worktree', '.soujo/SPEC.md'], { cwd: dir });
  writeFileSync(join(dir, '.soujo', 'SPEC.md'), '# SPEC\n\n決めた\n');
  const before = gitLastCommit(dir)?.hash;
  assert.throws(() => layerDone(dir, 'L2 state', undefined, NOW), /^Error: \.soujo\/SPEC\.md の変更を git が拾っていない（skip-worktree などを確認）/);
  assert.equal(gitLastCommit(dir)?.hash, before);
});

test('layer done refuses an untracked credential file before writing, and commits one added by hand', (t) => {
  const dir = workingProject(t);
  mkdirSync(join(dir, 'config'));
  for (const name of ['.env', 'config/id_rsa', '.env.example', 'a.pem', 'b.key']) writeFileSync(join(dir, name), 'x\n');
  assert.throws(
    () => layerDone(dir, 'L2 state', undefined, NOW),
    /^Error: \.env, a\.pem, b\.key ほか1件 は認証情報のファイル名なのでコミットしない（\.gitignore に足すか、コミットするなら先に git add する）$/,
  );
  assert.equal(read(dir, 'PLAN.md'), PLAN);
  writeFileSync(join(dir, '.gitignore'), '.env\n*.pem\n*.key\n');
  execFileSync('git', ['add', 'config/id_rsa'], { cwd: dir });
  layerDone(dir, 'L2 state', undefined, NOW);
  assert.deepEqual(gitStatus(dir), []);
  assert.equal(gitLastCommit(dir)?.subject, 'layer: L2 state');
});

test('layer done refuses a credential file named in another letter case only where the file system ignores case', (t) => {
  const dir = workingProject(t);
  mkdirSync(join(dir, 'config'));
  writeFileSync(join(dir, '.NPMRC'), 'x\n');
  writeFileSync(join(dir, 'config', 'ID_RSA'), 'x\n');
  if (foldsCase(dir)) {
    assert.throws(() => layerDone(dir, 'L2 state', undefined, NOW), /^Error: \.NPMRC, config\/ID_RSA は認証情報のファイル名なのでコミットしない/);
    assert.equal(read(dir, 'PLAN.md'), PLAN);
  } else {
    layerDone(dir, 'L2 state', undefined, NOW);
    assert.equal(gitLastCommit(dir)?.subject, 'layer: L2 state');
  }
});

test('layer done lists at most five added files', (t) => {
  const dir = workingProject(t);
  for (const name of ['a', 'b', 'c', 'd', 'e', 'f']) writeFileSync(join(dir, `${name}.ts`), '');
  const [line] = layerDone(dir, 'L2 state', undefined, NOW);
  assert.match(line ?? '', /（追加: a\.ts, b\.ts, c\.ts, d\.ts, e\.ts ほか2件）$/);
});

test('layer done in a subdirectory project commits only that subdirectory', (t) => {
  const top = repo(t);
  writeFileSync(join(top, 'outside.txt'), 'outside\n');
  commitAll(top, 'base');
  writeFileSync(join(top, 'outside.txt'), 'changed\n');
  const dir = project(join(top, 'app'), STATE);
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'state.ts'), '');
  const [line] = layerDone(join(dir, 'src'), 'L2 state', undefined, NOW);
  assert.match(line ?? '', /（追加: app\/\.soujo\/LOG\.md, app\/\.soujo\/NEXT\.md, app\/\.soujo\/PLAN\.md, app\/src\/state\.ts）$/);
  assert.deepEqual(gitStatus(top), [' M outside.txt']);
});

test('layer done is not refused by a layer commit of the same name in another project of the repository', (t) => {
  const top = repo(t);
  project(join(top, 'other'), STATE);
  commitAll(top, 'layer: L2 state');
  const dir = project(join(top, 'app'), STATE);
  layerDone(dir, 'L2 state', undefined, NOW);
  assert.equal(gitLastCommit(dir)?.subject, 'layer: L2 state');
  assert.deepEqual(gitStatus(top), []);
  assert.throws(() => layerDone(dir, 'L2 state', undefined, NOW), /^Error: 層「L2 state」はコミット済み/);
});

test('layer done follows a symlinked PLAN.md to the committed target',{ skip: process.platform === 'win32' }, (t) => {
  const dir = workingProject(t);
  writeFileSync(join(dir, 'PLAN.md'), PLAN.replace('- [ ] L2 state', '- [x] L2 state'));
  rmSync(join(dir, '.soujo', 'PLAN.md'));
  symlinkSync('../PLAN.md', join(dir, '.soujo', 'PLAN.md'));
  commitAll(dir, 'feat: L2 without layer done');
  assert.throws(() => layerDone(dir, 'L2 state', undefined, NOW), /は PLAN のチェックごとコミット済み/);
});

test('layer done refuses state files that are one file, naming the symlink, and writes and commits nothing', { skip: process.platform === 'win32' }, (t) => {
  const dir = workingProject(t);
  const head = gitLastCommit(dir)?.hash;
  rmSync(join(dir, '.soujo', 'LOG.md'));
  symlinkSync('PLAN.md', join(dir, '.soujo', 'LOG.md'));
  assert.throws(() => layerDone(dir, 'L2 state', undefined, NOW), /^Error: \.soujo\/PLAN\.md の実体が LOG\.md（symlink）の先と同じなので記録をコミットできない$/);
  assert.deepEqual([read(dir, 'PLAN.md'), read(dir, 'NEXT.md'), gitLastCommit(dir)?.hash], [PLAN, NEXT, head]);
});

test('layer done refuses a symlinked .soujo/ directory', { skip: process.platform === 'win32' }, (t) => {
  const dir = repo(t);
  const real = project(join(dir, 'records'), STATE);
  symlinkSync('records/.soujo', join(dir, '.soujo'));
  assert.throws(() => layerDone(dir, 'L2 state', undefined, NOW), /^Error: \.soujo\/ が symlink なので記録をコミットできない/);
  assert.equal(read(real, 'PLAN.md'), PLAN);
});

test('layer done works as the first commit of a repository', (t) => {
  const dir = project(repo(t), STATE);
  layerDone(dir, 'L2 state', undefined, NOW);
  assert.equal(gitLastCommit(dir)?.subject, 'layer: L2 state');
});
