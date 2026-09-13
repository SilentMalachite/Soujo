import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { resume } from '../src/commands/resume.js';
import { gitLastCommit } from '../src/git.js';
import { commitAll, project, repo, temp } from './helpers.js';

const NEXT = '次: L3 io\n前提: L2 完了\n確認: io のテストが通る\n注意: なし\neffort: high\n';
const PLAN = '- [x] L1 scaffold — build\n- [ ] L2 state — state のテストが通る\n';
const LOG = '# LOG\n\n## 2026-09-12 L1 scaffold\nold\n\n## 2026-09-13 L2 state\n中断: テスト途中\n二行目\n';

test('resume prints the next step, the last LOG entry, the last commit, and the command in four lines', (t) => {
  const dir = project(repo(t), { 'NEXT.md': NEXT, 'PLAN.md': PLAN, 'LOG.md': LOG });
  commitAll(dir, 'wip: L3 io');
  mkdirSync(join(dir, 'src'));
  assert.deepEqual(resume(join(dir, 'src')), [
    '次: L3 io（effort: high）確認: io のテストが通る',
    '前回: 2026-09-13 L2 state — 中断: テスト途中',
    `コミット: ${gitLastCommit(dir)?.hash} wip: L3 io`,
    '再開: /soujo:go（Codex は $go）',
  ]);
});

test('resume falls back to the next layer of PLAN when NEXT.md is missing or invalid', (t) => {
  const missing = project(repo(t), { 'PLAN.md': PLAN, 'LOG.md': '# LOG\n\n## 2026-09-13 L1 scaffold\n' });
  assert.deepEqual(resume(missing), [
    '次: L2 state（PLAN から）確認: state のテストが通る',
    '前回: 2026-09-13 L1 scaffold',
    'コミット: まだない',
    '再開: NEXT.md がない → soujo next set で書いてから /soujo:go（Codex は $go）',
  ]);

  const invalid = project(temp(t), { 'NEXT.md': `${NEXT}補足: x\n`, 'PLAN.md': '- [ ] L2 state\n' });
  assert.deepEqual(resume(invalid), [
    '次: L2 state（PLAN から）確認: 未記入',
    '前回: LOG.md に記録なし',
    'コミット: git リポジトリではない',
    '再開: NEXT.md が無効（NEXT.md が5行を超えている（6行） ほか1件） → soujo next set で書いてから /soujo:go（Codex は $go）',
  ]);
});

test('resume points to plan when PLAN has no layer to do', (t) => {
  const empty = project(temp(t), { 'NEXT.md': '' });
  assert.deepEqual(resume(empty)[0], '次: なし（PLAN.md に層がない）');
  assert.deepEqual(resume(empty)[3], '再開: NEXT.md が無効（NEXT.md が空） → /soujo:plan（Codex は $plan）');

  const finished = project(temp(t), { 'PLAN.md': '- [x] L1 scaffold — build\n' });
  assert.deepEqual(resume(finished)[0], '次: なし（PLAN は全層完了）');
  assert.deepEqual(resume(finished)[3], '再開: NEXT.md がない → 続けるなら /soujo:plan（Codex は $plan） で層を足す');
});

test('resume outside Soujo projects throws', (t) => {
  assert.throws(() => resume(temp(t)), /\.soujo\/ が見つからない/);
});
