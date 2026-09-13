import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { close } from '../src/commands/close.js';
import { gitLastCommit, gitStatus } from '../src/git.js';
import { commitAll, project, repo, temp } from './helpers.js';

const NOW = new Date(2026, 8, 13, 12, 0);
const NEXT = '次: L7 resume-close\n前提: p\n確認: c\n注意: なし\neffort: medium\n';
const LOG = '# LOG\n\n## 2026-09-12 L6 layer-done\nold\n';
const STATE = { 'PLAN.md': '- [ ] L7 resume-close — c\n', 'LOG.md': LOG, 'NEXT.md': NEXT };
const RESUME = '再開: /soujo:resume（Codex は $resume）';

function read(dir: string, file: string): string {
  return readFileSync(join(dir, '.soujo', file), 'utf8');
}

/** A committed Soujo project with one uncommitted source change. */
function workingProject(t: TestContext): string {
  const dir = project(repo(t), STATE);
  commitAll(dir, 'layer: L6 layer-done');
  writeFileSync(join(dir, 'resume.ts'), 'export {};\n');
  return dir;
}

test('close logs the note as 中断, commits everything as "wip: <layer>", and says how to resume', (t) => {
  const dir = workingProject(t);
  const lines = close(dir, ' テスト途中\n\nresume だけ完了 ', NOW);
  const commit = gitLastCommit(dir);
  assert.deepEqual(lines, [`中断を LOG に記録・コミット: ${commit?.hash} wip: L7 resume-close`, RESUME]);
  assert.equal(commit?.subject, 'wip: L7 resume-close');
  assert.equal(read(dir, 'LOG.md'), `${LOG}\n## 2026-09-13 L7 resume-close\n中断: テスト途中\nresume だけ完了\n`);
  assert.deepEqual(gitStatus(dir), []);
});

test('close without --note commits without logging, and does nothing on a clean tree', (t) => {
  const dir = workingProject(t);
  const [line] = close(dir, undefined, NOW);
  assert.equal(line, `コミット: ${gitLastCommit(dir)?.hash} wip: L7 resume-close`);
  assert.equal(read(dir, 'LOG.md'), LOG);

  const before = gitLastCommit(dir)?.hash;
  assert.deepEqual(close(dir, undefined, NOW), ['未コミットの変更なし', RESUME]);
  assert.equal(gitLastCommit(dir)?.hash, before);
});

test('close refuses a missing or invalid NEXT.md and writes nothing', (t) => {
  const dir = workingProject(t);
  const nextPath = join(dir, '.soujo', 'NEXT.md');
  const hint = '（soujo next set で直してから再実行）';
  const unchanged = (hash: string | undefined) => {
    assert.equal(read(dir, 'LOG.md'), LOG);
    assert.equal(gitLastCommit(dir)?.hash, hash);
  };
  const hash = gitLastCommit(dir)?.hash;

  writeFileSync(nextPath, `${NEXT}補足: x\n`);
  assert.throws(
    () => close(dir, 'note', NOW),
    new RegExp(`^Error: NEXT\\.md が無効: NEXT\\.md が5行を超えている（6行）、6行目を読めない: 補足: x${hint}$`),
  );
  unchanged(hash);

  rmSync(nextPath);
  assert.throws(() => close(dir, 'note', NOW), new RegExp(`^Error: NEXT\\.md がない${hint}$`));
  unchanged(hash);
});

test('close refuses an invalid note and an uncommittable repository before writing', (t) => {
  const dir = workingProject(t);
  const hash = gitLastCommit(dir)?.hash;
  assert.throws(() => close(dir, ' \n ', NOW), /^Error: --note が空$/);
  assert.throws(() => close(dir, 'a\nb\nc\nd', NOW), /3行まで（4行）/);
  assert.throws(() => close(dir, 'a\n## 2026-09-14 fake', NOW), /見出しの形/);
  assert.deepEqual([read(dir, 'LOG.md'), gitLastCommit(dir)?.hash], [LOG, hash]);

  const outsideGit = project(temp(t), STATE);
  assert.throws(() => close(outsideGit, 'note', NOW), /^Error: git リポジトリではないのでコミットできない$/);
  assert.equal(read(outsideGit, 'LOG.md'), LOG);

  const ignoring = repo(t);
  writeFileSync(join(ignoring, '.gitignore'), '.soujo/NEXT.md\n');
  project(ignoring, STATE);
  assert.throws(() => close(ignoring, 'note', NOW), /\.soujo\/NEXT\.md が git に無視されていて/);
  assert.equal(read(ignoring, 'LOG.md'), LOG);
});

test('after a failed commit, re-running the same close retries only the commit', (t) => {
  const dir = workingProject(t);
  const lock = join(dir, '.git', 'index.lock');
  writeFileSync(lock, '');
  assert.throws(
    () => close(dir, 'テスト途中', NOW),
    /^Error: git add に失敗: .*（中断は LOG に記録済み。原因を直して同じコマンドを再実行すればコミットだけやり直す）$/,
  );
  const logAfterFailure = read(dir, 'LOG.md');
  assert.match(logAfterFailure, /\n## 2026-09-13 L7 resume-close\n中断: テスト途中\n$/);
  rmSync(lock);

  const [line] = close(dir, 'テスト途中', NOW);
  assert.equal(line, `中断は LOG に記録済み・コミット: ${gitLastCommit(dir)?.hash} wip: L7 resume-close`);
  assert.equal(read(dir, 'LOG.md'), logAfterFailure);
  assert.deepEqual(gitStatus(dir), []);
});

test('a different note after an earlier close is logged again, and leftover temporary files are not committed', (t) => {
  const dir = workingProject(t);
  close(dir, 'first', NOW);
  writeFileSync(join(dir, '.soujo', '.LOG.md.99999.tmp'), 'half');
  const [line] = close(dir, 'second', NOW);
  assert.match(line ?? '', /^中断を LOG に記録・コミット: /);
  assert.match(read(dir, 'LOG.md'), /中断: first\n\n## 2026-09-13 L7 resume-close\n中断: second\n$/);
  assert.equal(existsSync(join(dir, '.soujo', '.LOG.md.99999.tmp')), false);
  assert.deepEqual(gitStatus(dir), []);
});
