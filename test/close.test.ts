import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { close } from '../src/commands/close.js';
import { layerDone } from '../src/commands/layer.js';
import { logRotate } from '../src/commands/log.js';
import { gitLastCommit, gitStatus } from '../src/git.js';
import { commitAll, deadPid, project, repo, temp } from './helpers.js';

const NOW = new Date(2026, 8, 13, 12, 0);
const NEXT = '次: L7 resume-close\n前提: p\n確認: c\n注意: なし\neffort: medium\n';
const PLAN = '- [x] L6 layer-done — d\n- [ ] L7 resume-close — c\n- [ ] L8 map — m\n';
const LOG = '# LOG\n\n## 2026-09-12 L6 layer-done\nold\n';
const STATE = { 'PLAN.md': PLAN, 'LOG.md': LOG, 'NEXT.md': NEXT };
const RESUME = '再開: /soujo:resume（Codex は $resume）';
const ENTRY = '\n## 2026-09-13 L7 resume-close\n';

function read(dir: string, file: string): string {
  return readFileSync(join(dir, '.soujo', file), 'utf8');
}

function writeNext(dir: string, layer: string): void {
  writeFileSync(join(dir, '.soujo', 'NEXT.md'), NEXT.replace('L7 resume-close', layer));
}

/** A committed Soujo project with one uncommitted source change. */
function workingProject(t: TestContext): string {
  const dir = project(repo(t), STATE);
  commitAll(dir, 'layer: L6 layer-done');
  writeFileSync(join(dir, 'resume.ts'), 'export {};\n');
  return dir;
}

test('close refuses state files that are one file and writes and commits nothing', { skip: process.platform === 'win32' }, (t) => {
  const dir = workingProject(t);
  const head = gitLastCommit(dir)?.hash;
  rmSync(join(dir, '.soujo', 'LOG.md'));
  symlinkSync('PLAN.md', join(dir, '.soujo', 'LOG.md'));
  assert.throws(() => close(dir, '中断のわけ', NOW), /^Error: \.soujo\/PLAN\.md の実体が LOG\.md（symlink）の先と同じなので記録をコミットできない$/);
  assert.deepEqual([read(dir, 'PLAN.md'), gitLastCommit(dir)?.hash], [PLAN, head]);
});

test('close after a rotate stopped before its commit logs the interruption once and commits the archive with it', { skip: process.platform === 'win32' }, (t) => {
  const dir = project(repo(t), { ...STATE, 'LOG.md': '# LOG\n\n## 2026-07-01 L0\nz\n\n## 2026-09-12 L6 layer-done\nold\n' });
  commitAll(dir, 'layer: L6 layer-done');
  const hook = join(dir, '.git', 'hooks', 'pre-commit');
  writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  assert.throws(() => logRotate(dir, undefined, NOW), /git commit に失敗/);
  assert.throws(() => close(dir, '途中', NOW), /git commit に失敗/);
  rmSync(hook);

  close(dir, '途中', NOW);
  assert.equal(gitLastCommit(dir)?.subject, 'wip: L7 resume-close');
  assert.equal(read(dir, 'LOG.md'), `${LOG}${ENTRY}中断: 途中\n`);
  assert.equal(read(dir, 'LOG-2026-07.md'), '# LOG 2026-07\n\n## 2026-07-01 L0\nz\n');
  assert.deepEqual(gitStatus(dir), []);
});

function lockIndex(dir: string): () => void {
  const lock = join(dir, '.git', 'index.lock');
  writeFileSync(lock, '');
  return () => rmSync(lock);
}

test('close logs the note as 中断, commits everything as "wip: <layer>", and says how to resume', (t) => {
  const dir = workingProject(t);
  const lines = close(dir, ' 中断：テスト途中\n\nresume だけ完了 ', NOW);
  const commit = gitLastCommit(dir);
  assert.deepEqual(lines, [`中断を LOG に記録・コミット: ${commit?.hash} wip: L7 resume-close`, RESUME]);
  assert.equal(commit?.subject, 'wip: L7 resume-close');
  assert.equal(read(dir, 'LOG.md'), `${LOG}${ENTRY}中断: テスト途中\nresume だけ完了\n`);
  assert.deepEqual(gitStatus(dir), []);
});

test('close without --note commits without logging, and does nothing on a clean tree', (t) => {
  const dir = workingProject(t);
  assert.deepEqual(close(dir, undefined, NOW), [`コミット: ${gitLastCommit(dir)?.hash} wip: L7 resume-close`, RESUME]);
  assert.equal(read(dir, 'LOG.md'), LOG);

  const before = gitLastCommit(dir)?.hash;
  assert.deepEqual(close(dir, undefined, NOW), ['未コミットの変更なし', RESUME]);
  assert.equal(gitLastCommit(dir)?.hash, before);
});

test('close from a subdirectory of a repository without commits', (t) => {
  // Without commits every checked layer counts as uncommitted, so this PLAN has none.
  const dir = project(repo(t), { ...STATE, 'PLAN.md': '- [ ] L7 resume-close — c\n' });
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'a.ts'), '');
  const [line] = close(join(dir, 'src'), 'n', NOW);
  assert.equal(line, `中断を LOG に記録・コミット: ${gitLastCommit(dir)?.hash} wip: L7 resume-close`);
  assert.deepEqual(gitStatus(dir), []);
});

test('close refuses a missing, invalid, or finished NEXT.md and writes nothing', (t) => {
  const dir = workingProject(t);
  const hint = '（soujo next set で書き直してから再実行）';
  const hash = gitLastCommit(dir)?.hash;
  const unchanged = () => assert.deepEqual([read(dir, 'LOG.md'), gitLastCommit(dir)?.hash], [LOG, hash]);

  writeFileSync(join(dir, '.soujo', 'NEXT.md'), `${NEXT}補足: x\n`);
  assert.throws(
    () => close(dir, 'note', NOW),
    new RegExp(`^Error: NEXT\\.md が無効: 5行を超えている（6行）、6行目を読めない: 補足: x${hint}$`),
  );
  unchanged();

  writeNext(dir, 'L6 layer-done');
  assert.throws(() => close(dir, 'note', NOW), new RegExp(`^Error: NEXT\\.md の次「L6 layer-done」は PLAN で完了済み${hint}$`));
  unchanged();

  rmSync(join(dir, '.soujo', 'NEXT.md'));
  assert.throws(() => close(dir, 'note', NOW), new RegExp(`^Error: NEXT\\.md がない${hint}$`));
  unchanged();
});

test('close refuses an invalid note before writing', (t) => {
  const dir = workingProject(t);
  const hash = gitLastCommit(dir)?.hash;
  assert.throws(() => close(dir, ' \n ', NOW), /^Error: --note が空$/);
  assert.throws(() => close(dir, '中断:', NOW), /^Error: --note が空$/);
  assert.throws(() => close(dir, 'a\nb\nc\nd', NOW), /3行まで（4行）/);
  assert.throws(() => close(dir, 'a\n## 2026-09-14 fake', NOW), /見出しの形/);
  assert.deepEqual([read(dir, 'LOG.md'), gitLastCommit(dir)?.hash], [LOG, hash]);
});

test('close refuses an uncommittable repository before writing', (t) => {
  const outsideGit = project(temp(t), STATE);
  assert.throws(() => close(outsideGit, 'note', NOW), /^Error: git リポジトリではないのでコミットできない$/);
  assert.equal(read(outsideGit, 'LOG.md'), LOG);

  const ignoring = workingProject(t);
  writeFileSync(join(ignoring, '.gitignore'), '.soujo/SPEC.md\n');
  writeFileSync(join(ignoring, '.soujo', 'SPEC.md'), '# SPEC\n');
  const hash = gitLastCommit(ignoring)?.hash;
  assert.throws(() => close(ignoring, 'note', NOW), /^Error: \.soujo\/SPEC\.md が git に無視されていて/);
  assert.deepEqual([read(ignoring, 'LOG.md'), gitLastCommit(ignoring)?.hash], [LOG, hash]);

  const merging = workingProject(t);
  writeFileSync(join(merging, '.git', 'MERGE_HEAD'), '');
  assert.throws(() => close(merging, 'note', NOW), /^Error: git の merge が途中なのでコミットしない/);
  assert.equal(read(merging, 'LOG.md'), LOG);

  const sequencing = workingProject(t);
  mkdirSync(join(sequencing, '.git', 'sequencer'));
  assert.throws(() => close(sequencing, 'note', NOW), /^Error: git の cherry-pick \/ revert が途中なのでコミットしない/);
  assert.equal(read(sequencing, 'LOG.md'), LOG);

  const invalidAndOutside = project(temp(t), { ...STATE, 'NEXT.md': '' });
  assert.throws(() => close(invalidAndOutside, 'note', NOW), /git リポジトリではない/);
});

test('after a failed commit, re-running close keeps the logged entry and retries only the commit', (t) => {
  const dir = workingProject(t);
  let unlock = lockIndex(dir);
  assert.throws(
    () => close(dir, 'テスト途中', NOW),
    /^Error: git add に失敗: .*（中断は LOG に記録済み。原因を直して同じコマンドを再実行すればコミットだけやり直す）$/,
  );
  const logAfterFailure = read(dir, 'LOG.md');
  assert.equal(logAfterFailure, `${LOG}${ENTRY}中断: テスト途中\n`);
  assert.throws(() => close(dir, 'テスト途中', NOW), /git add に失敗/);
  unlock();

  assert.deepEqual(close(dir, 'テスト途中', new Date(2026, 8, 14)), [
    `中断は LOG に記録済み・コミット: ${gitLastCommit(dir)?.hash} wip: L7 resume-close`,
    RESUME,
  ]);
  assert.equal(read(dir, 'LOG.md'), logAfterFailure);
  assert.deepEqual(gitStatus(dir), []);

  writeFileSync(join(dir, 'more.ts'), '');
  unlock = lockIndex(dir);
  assert.throws(() => close(dir, '二回目', NOW), /git add に失敗/);
  unlock();
  const [line] = close(dir, '言い換え', NOW);
  assert.match(line ?? '', /^中断は LOG に記録済み（今回の note は追記しない）・コミット: [0-9a-f]+ wip: L7 resume-close$/);
  assert.equal(read(dir, 'LOG.md'), `${logAfterFailure}${ENTRY}中断: 二回目\n`);
});

test('a re-run of close keeps its uncommitted 中断 entry when another entry was added after it', (t) => {
  const dir = workingProject(t);
  const unlock = lockIndex(dir);
  assert.throws(() => close(dir, 'テスト途中', NOW), /git add に失敗/);
  unlock();
  const log = `${read(dir, 'LOG.md')}\n## 2026-09-13 L8 map\nmemo\n`;
  writeFileSync(join(dir, '.soujo', 'LOG.md'), log);
  assert.match(close(dir, 'テスト途中', NOW)[0] ?? '', /^中断は LOG に記録済み・コミット: [0-9a-f]+ wip: L7 resume-close$/);
  assert.equal(read(dir, 'LOG.md'), log);
});

test('a later close with the same note after a successful one is logged again', (t) => {
  const dir = workingProject(t);
  close(dir, 'テスト途中', NOW);
  writeFileSync(join(dir, 'more.ts'), '');
  const [line] = close(dir, 'テスト途中', NOW);
  assert.match(line ?? '', /^中断を LOG に記録・コミット: /);
  assert.equal(read(dir, 'LOG.md'), `${LOG}${ENTRY}中断: テスト途中\n${ENTRY}中断: テスト途中\n`);
});

test('a failed commit without --note says how to resume', (t) => {
  const dir = workingProject(t);
  const unlock = lockIndex(dir);
  assert.throws(() => close(dir, undefined, NOW), /^Error: git add に失敗: .*（記録したものはない。原因を直して同じコマンドを再実行する）$/);
  unlock();
});

test('close commits nothing while git does not pick up the 中断 entry, on a re-run too, and commits once it does', (t) => {
  const dir = workingProject(t);
  const skipWorktree = (flag: string) => execFileSync('git', ['update-index', flag, '.soujo/LOG.md'], { cwd: dir });
  skipWorktree('--skip-worktree');
  const before = gitLastCommit(dir)?.hash;
  const message =
    /^Error: \.soujo\/LOG\.md の変更を git が拾っていない（skip-worktree などを確認）（中断は LOG に記録済み。原因を直して同じコマンドを再実行すればコミットだけやり直す）$/;
  assert.throws(() => close(dir, 'note', NOW), message);
  assert.throws(() => close(dir, 'note', NOW), message);
  assert.equal(gitLastCommit(dir)?.hash, before);
  assert.equal(read(dir, 'LOG.md'), `${LOG}${ENTRY}中断: note\n`);

  skipWorktree('--no-skip-worktree');
  assert.match(close(dir, 'note', NOW)[0] ?? '', /^中断は LOG に記録済み・コミット: [0-9a-f]+ wip: L7 resume-close$/);
  assert.deepEqual(gitStatus(dir), []);
});

test('close without --note commits nothing while a changed NEXT.md is not staged as written', (t) => {
  const dir = workingProject(t);
  execFileSync('git', ['update-index', '--skip-worktree', '.soujo/NEXT.md'], { cwd: dir });
  writeFileSync(join(dir, '.soujo', 'NEXT.md'), NEXT.replace('前提: p', '前提: q'));
  const before = gitLastCommit(dir)?.hash;
  assert.throws(
    () => close(dir, undefined, NOW),
    /^Error: \.soujo\/NEXT\.md の変更を git が拾っていない（skip-worktree などを確認）（記録したものはない。原因を直して同じコマンドを再実行する）$/,
  );
  assert.equal(gitLastCommit(dir)?.hash, before);
});

test('after layer done stops before its commit, close refuses and re-running layer done finishes the layer', (t) => {
  const dir = workingProject(t);
  writeNext(dir, 'L8 map');
  const unlock = lockIndex(dir);
  assert.throws(() => layerDone(dir, 'L7 resume-close', 'done', NOW), /git add に失敗/);
  unlock();

  const hash = gitLastCommit(dir)?.hash;
  assert.throws(
    () => close(dir, 'note', NOW),
    /^Error: 層「L7 resume-close」の PLAN のチェックが未コミット（layer done の途中）。先に soujo layer done "L7 resume-close" を再実行する$/,
  );
  assert.equal(gitLastCommit(dir)?.hash, hash);
  assert.match(layerDone(dir, 'L7 resume-close', undefined, NOW)[0] ?? '', /のコミットをやり直した/);
  assert.equal(gitLastCommit(dir)?.subject, 'layer: L7 resume-close');
});

test('closed between next set and layer done, the wip commit and 中断 entry name the unclosed layer', (t) => {
  const dir = workingProject(t);
  writeNext(dir, 'L8 map');
  assert.match(close(dir, 'テスト途中', NOW)[0] ?? '', /wip: L7 resume-close$/);
  assert.equal(read(dir, 'LOG.md'), `${LOG}${ENTRY}中断: テスト途中\n`);

  layerDone(dir, 'L7 resume-close', 'done', NOW);
  assert.equal(gitLastCommit(dir)?.subject, 'layer: L7 resume-close');
  assert.match(read(dir, 'LOG.md'), /中断: テスト途中\n\n## 2026-09-13 L7 resume-close\ndone\n$/);
});

test('stopped between next set --layer plan and layer done of the last layer, close names that layer', (t) => {
  const dir = project(repo(t), { ...STATE, 'PLAN.md': '- [x] L6 layer-done — d\n- [ ] L7 resume-close — c\n' });
  commitAll(dir, 'layer: L6 layer-done');
  writeNext(dir, 'plan');
  writeFileSync(join(dir, 'resume.ts'), '');
  assert.match(close(dir, 'テスト途中', NOW)[0] ?? '', /wip: L7 resume-close$/);
  assert.equal(read(dir, 'LOG.md'), `${LOG}${ENTRY}中断: テスト途中\n`);
});

test('close keeps CRLF in LOG.md, flattens control characters, and removes leftover temporary files', (t) => {
  const dir = project(repo(t), { ...STATE, 'LOG.md': LOG.replaceAll('\n', '\r\n') });
  commitAll(dir);
  const leftover = join(dir, '.soujo', `.LOG.md.${deadPid()}.tmp`);
  writeFileSync(leftover, 'half');
  close(dir, 'a\rb\tc', NOW);
  assert.equal(read(dir, 'LOG.md'), `${LOG}${ENTRY}中断: a b c\n`.replaceAll('\n', '\r\n'));
  assert.equal(existsSync(leftover), false);
  assert.deepEqual(gitStatus(dir), []);
});
