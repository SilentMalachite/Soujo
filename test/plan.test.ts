import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { planList, planNext } from '../src/commands/plan.js';
import { project, repo, temp } from './helpers.js';

const PLAN = '# PLAN\n\n- [x] L1 scaffold — build が通る\n- [ ] L2 state — テストが通る\n- [ ] L3 io\n';

test('plan list shows every layer with its state, from a subdirectory too', (t) => {
  const dir = project(repo(t), { 'PLAN.md': PLAN });
  mkdirSync(join(dir, 'src'));
  assert.deepEqual(planList(join(dir, 'src')), ['[x] L1 scaffold', '[ ] L2 state', '[ ] L3 io']);
});

test('plan next shows the first unfinished layer and its completion condition', (t) => {
  assert.deepEqual(planNext(project(temp(t), { 'PLAN.md': PLAN })), ['次: L2 state', '確認: テストが通る']);
  const noCondition = PLAN.replace('- [ ] L2 state — テストが通る\n', '');
  assert.deepEqual(planNext(project(temp(t), { 'PLAN.md': noCondition })), ['次: L3 io', '確認: 未記入']);
});

test('plan commands report an empty or finished plan in one line', (t) => {
  const empty = project(temp(t), { 'PLAN.md': '# PLAN\n' });
  assert.deepEqual(planList(empty), ['PLAN.md に層がない']);
  assert.deepEqual(planNext(empty), ['PLAN.md に層がない']);
  assert.deepEqual(planNext(project(temp(t), { 'PLAN.md': '- [x] L1 — c\n' })), ['全層完了']);
});

// A read-only view says what makes PLAN.md unusable, since next check and layer done refuse over it and a fence left open
// hides every layer after it.
test('plan list and plan next name what makes PLAN.md invalid before its layers', (t) => {
  const broken = project(temp(t), { 'PLAN.md': `${PLAN}\n\`\`\`\n- [ ] L4 example — x\n` });
  const problem = 'PLAN.md が無効: PLAN.md の7行目のコードフェンスが閉じていない（以降の層が読まれない）';
  assert.deepEqual(planList(broken), [problem, '[x] L1 scaffold', '[ ] L2 state', '[ ] L3 io']);
  assert.deepEqual(planNext(broken), [problem, '次: L2 state', '確認: テストが通る']);
});

test('plan commands throw without PLAN.md or outside Soujo projects', (t) => {
  assert.throws(() => planList(project(temp(t))), /PLAN\.md がない/);
  assert.throws(() => planNext(temp(t)), /\.soujo\/ が見つからない/);
});
