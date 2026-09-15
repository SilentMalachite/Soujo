import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { brief } from '../src/commands/brief.js';
import { resume } from '../src/commands/resume.js';
import { formatDate } from '../src/state.js';
import { commitAll, project, repo, temp } from './helpers.js';

const NEXT = '次: L3 io\n前提: L2 完了\n確認: io のテストが通る\n注意: なし\neffort: high\n';
const PLAN = '- [x] L1 scaffold — build\n- [x] L2 state — state\n- [ ] L3 io — io\n- [ ] L4 cli — cli\n';
const LOG = '# LOG\n\n## 2026-09-10 節目\nSPEC を書いた\n\n## 2026-09-11 節目\n4層に分けた\n未決: map\n\n## 2026-09-12 L2 state\nx\n';
const NOW = new Date(2026, 8, 15, 12, 0);
const LAYER_DAY = new Date(2026, 8, 11, 10, 0);
const LAST_DAY = new Date(2026, 8, 12, 13, 0);

/** Commits a change in dir as subject, dated date. */
function change(dir: string, subject: string, date: Date): void {
  writeFileSync(join(dir, 'work.txt'), subject);
  commitAll(dir, subject, date);
}

test('brief prints progress, commits after the last layer, the last milestone, the gap, and the next step in five lines', (t) => {
  const dir = project(repo(t), { 'NEXT.md': NEXT, 'PLAN.md': PLAN, 'LOG.md': LOG });
  change(dir, 'layer: L1 scaffold', new Date(2026, 8, 10));
  change(dir, 'layer: L2 state', LAYER_DAY);
  change(dir, 'fix: resolve L2 review findings', LAYER_DAY);
  change(dir, 'docs: explain state', LAST_DAY);
  mkdirSync(join(dir, 'src'));
  assert.deepEqual(brief(join(dir, 'src'), NOW), [
    `進捗: PLAN 2/4 層完了・最終 layer: ${formatDate(LAYER_DAY)} L2 state`,
    '以後: layer 後のコミット 2件: fix: resolve L2 review findings / docs: explain state',
    '節目: 2026-09-11 — 4層に分けた',
    `空白: 最終コミットから 2日（${formatDate(LAST_DAY)}）`,
    resume(dir, NOW)[0],
  ]);
  assert.equal(brief(dir, NOW)[4], '次: L3 io（effort: high）確認: io のテストが通る');
});

test('brief shows at most three subjects oldest first, clipped, and なし when the last commit is the layer commit', (t) => {
  const dir = project(repo(t), { 'NEXT.md': NEXT, 'PLAN.md': PLAN });
  change(dir, 'layer: L2 state', LAYER_DAY);
  assert.deepEqual(brief(dir, NOW).slice(1, 4), [
    '以後: なし',
    '節目: なし',
    `空白: 最終コミットから 4日（${formatDate(LAYER_DAY)}）`,
  ]);

  const long = 'あ'.repeat(80);
  for (const subject of ['fix: a', long, 'fix: c', 'fix: d']) change(dir, subject, LAST_DAY);
  assert.equal(brief(dir, NOW)[1], `以後: layer 後のコミット 4件: fix: a / ${'あ'.repeat(59)}… / fix: c / …`);
});

test('brief counts every commit when there is no layer commit yet, and says so when there is no commit', (t) => {
  const dir = project(repo(t), { 'NEXT.md': NEXT, 'PLAN.md': PLAN, 'LOG.md': LOG });
  assert.deepEqual(brief(dir, NOW).slice(0, 4), [
    '進捗: PLAN 2/4 層完了・最終 layer: コミットがまだない',
    '以後: コミットがまだない',
    '節目: 2026-09-11 — 4層に分けた',
    '空白: コミットがまだない',
  ]);
  change(dir, 'chore: init', LAST_DAY);
  change(dir, 'wip: L1 scaffold', LAST_DAY);
  assert.deepEqual(brief(dir, NOW).slice(0, 2), [
    '進捗: PLAN 2/4 層完了・最終 layer: なし',
    '以後: 最初からのコミット 2件: chore: init / wip: L1 scaffold',
  ]);
});

test('brief counts only the commits that change the project: not other projects in the repository, not empty commits', (t) => {
  const top = repo(t);
  change(top, 'layer: L1 other', LAYER_DAY);
  const dir = project(join(top, 'app'), { 'NEXT.md': NEXT, 'PLAN.md': PLAN });
  assert.deepEqual(brief(dir, NOW).slice(0, 4), [
    '進捗: PLAN 2/4 層完了・最終 layer: コミットがまだない',
    '以後: コミットがまだない',
    '節目: なし',
    '空白: コミットがまだない',
  ]);
  commitAll(top, 'layer: L2 state', LAYER_DAY);
  change(top, 'layer: L9 other', LAST_DAY);
  commitAll(top, 'chore: empty', LAST_DAY);
  assert.deepEqual(brief(dir, NOW).slice(0, 4), [
    `進捗: PLAN 2/4 層完了・最終 layer: ${formatDate(LAYER_DAY)} L2 state`,
    '以後: なし',
    '節目: なし',
    `空白: 最終コミットから 4日（${formatDate(LAYER_DAY)}）`,
  ]);
});

test('brief degrades only the lines of what is missing: no git, no LOG, no PLAN, an invalid NEXT.md', (t) => {
  const dir = project(temp(t), { 'NEXT.md': `${NEXT}補足: x\n`, 'LOG.md': '# LOG\n\n## 2026-09-12 L2 state\n節目\n' });
  assert.deepEqual(brief(dir, NOW), [
    '進捗: PLAN.md がない・最終 layer: git リポジトリではない',
    '以後: git リポジトリではない',
    '節目: なし',
    '空白: git リポジトリではない',
    resume(dir, NOW)[0],
  ]);

  const fallback = project(temp(t), { 'NEXT.md': '', 'PLAN.md': '# PLAN\n', 'SPEC.md': '# SPEC\n目的\n' });
  assert.deepEqual([brief(fallback, NOW)[0], brief(fallback, NOW)[2], brief(fallback, NOW)[4]], [
    '進捗: PLAN.md に層がない・最終 layer: git リポジトリではない',
    '節目: なし',
    '次: なし（PLAN.md に層がない）',
  ]);

  const invalid = project(temp(t), { 'NEXT.md': `${NEXT}補足: x\n`, 'PLAN.md': PLAN });
  assert.equal(brief(invalid, NOW)[4], '次: L3 io（PLAN から）確認: io');
});

test('brief degrades per line when files cannot be read', { skip: process.platform === 'win32' || process.getuid?.() === 0 }, (t) => {
  const dir = project(temp(t), { 'NEXT.md': NEXT, 'PLAN.md': PLAN, 'LOG.md': LOG });
  chmodSync(join(dir, '.soujo', 'LOG.md'), 0o000);
  chmodSync(join(dir, '.soujo', 'PLAN.md'), 0o000);
  assert.deepEqual(brief(dir, NOW), [
    '進捗: PLAN.md を読めない・最終 layer: git リポジトリではない',
    '以後: git リポジトリではない',
    '節目: LOG.md を読めない',
    '空白: git リポジトリではない',
    '次: L3 io（effort: high）確認: io のテストが通る',
  ]);
  chmodSync(join(dir, '.soujo', 'LOG.md'), 0o644);
  chmodSync(join(dir, '.soujo', 'PLAN.md'), 0o644);
});

test('brief shows a git failure instead of claiming there is no commit', { skip: process.platform === 'win32' }, (t) => {
  const dir = project(repo(t), { 'NEXT.md': NEXT, 'PLAN.md': PLAN });
  commitAll(dir);
  writeFileSync(join(dir, '.git', 'HEAD'), 'ref: refs/heads/broken\n');
  writeFileSync(join(dir, '.git', 'refs', 'heads', 'broken'), `${'1234567890'.repeat(4)}\n`);
  assert.deepEqual(brief(dir, NOW).slice(0, 4), [
    '進捗: PLAN 2/4 層完了・最終 layer: git の状態を読めない',
    '以後: git の状態を読めない',
    '節目: なし',
    '空白: git の状態を読めない',
  ]);
});

test('brief outside Soujo projects throws', (t) => {
  assert.throws(() => brief(temp(t), NOW), /\.soujo\/ が見つからない/);
});
