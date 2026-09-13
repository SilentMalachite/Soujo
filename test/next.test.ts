import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { nextCheck, nextSet, nextShow } from '../src/commands/next.js';
import { commitAll, project, repo, temp } from './helpers.js';

const NEXT = '次: L2 state\n前提: L1 完了\n確認: npm test が通る\n注意: なし\neffort: medium\n';
const PLAN = '- [x] L1 scaffold — build\n- [ ] L2 state — test\n';

function readNext(dir: string): string {
  return readFileSync(join(dir, '.soujo', 'NEXT.md'), 'utf8');
}

test('next show prints NEXT.md lines from a subdirectory', (t) => {
  const dir = project(temp(t), { 'NEXT.md': NEXT });
  mkdirSync(join(dir, 'src'));
  assert.deepEqual(nextShow(join(dir, 'src'), false), NEXT.trimEnd().split('\n'));
  assert.deepEqual(nextShow(dir, true), NEXT.trimEnd().split('\n'));
});

test('next show reports a missing NEXT.md, and --hook stays silent', (t) => {
  const dir = project(temp(t));
  assert.deepEqual(nextShow(dir, false), ['NEXT.md なし']);
  assert.deepEqual(nextShow(dir, true), []);
});

test('next show outside Soujo projects throws, and --hook stays silent', (t) => {
  const dir = temp(t);
  assert.throws(() => nextShow(dir, false), /\.soujo\/ が見つからない/);
  assert.deepEqual(nextShow(dir, true), []);
});

test('next set rewrites NEXT.md with defaults', (t) => {
  const dir = project(temp(t), { 'NEXT.md': 'old\n' });
  assert.deepEqual(nextSet(dir, { layer: 'L2 state', premise: 'L1 完了', check: 'npm test が通る' }), [
    'NEXT.md を更新: 次: L2 state',
  ]);
  assert.equal(readNext(dir), NEXT);
  nextSet(dir, { layer: 'L3', premise: 'p', check: 'c', caution: '遅い', effort: 'xhigh' });
  assert.match(readNext(dir), /^注意: 遅い\neffort: xhigh\n$/m);
});

test('next set writes nothing for invalid values', (t) => {
  const dir = project(temp(t), { 'NEXT.md': NEXT });
  const base = { layer: 'L3', premise: 'p', check: 'c' };
  assert.throws(() => nextSet(dir, { ...base, effort: 'max' }), /^Error: NEXT\.md を書かない: effort は/);
  assert.throws(() => nextSet(dir, { ...base, layer: ' ' }), /「次」が空/);
  assert.throws(() => nextSet(dir, { ...base, check: 'a\nb' }), /「確認」は1行で書く/);
  assert.equal(readNext(dir), NEXT);
  assert.throws(() => nextSet(temp(t), base), /\.soujo\/ が見つからない/);
});

test('next check is silent for a clean tree with a valid NEXT.md, and outside Soujo projects', (t) => {
  const dir = project(repo(t), { 'NEXT.md': NEXT, 'PLAN.md': PLAN });
  commitAll(dir);
  assert.deepEqual(nextCheck(dir, false), []);
  assert.deepEqual(nextCheck(dir, true), []);
  assert.deepEqual(nextCheck(temp(t), true), []);
});

test('next check warns in one line about every problem', (t) => {
  const dir = project(repo(t), { 'NEXT.md': `${NEXT}補足: x\n`, 'PLAN.md': PLAN });
  assert.deepEqual(nextCheck(dir, false), [
    'soujo 警告: NEXT.md が5行を超えている（6行） / 6行目を読めない: 補足: x / 未コミットの変更 1件',
  ]);
});

test('next check warns about a missing NEXT.md and a NEXT.md pointing to a finished layer', (t) => {
  const missing = project(temp(t), { 'PLAN.md': PLAN });
  assert.deepEqual(nextCheck(missing, false), ['soujo 警告: NEXT.md がない']);

  const finished = project(temp(t), { 'NEXT.md': NEXT.replace('L2 state', 'L1 scaffold'), 'PLAN.md': PLAN });
  assert.deepEqual(nextCheck(finished, false), ['soujo 警告: NEXT.md の次「L1 scaffold」は PLAN で完了済み']);
});

test('next check --hook returns a systemMessage JSON line', (t) => {
  const dir = project(temp(t));
  assert.deepEqual(nextCheck(dir, true), [JSON.stringify({ systemMessage: 'soujo 警告: NEXT.md がない' })]);
});

test('next check turns unexpected failures into a warning instead of throwing', (t) => {
  const dir = project(temp(t));
  mkdirSync(join(dir, '.soujo', 'NEXT.md'));
  writeFileSync(join(dir, '.soujo', 'PLAN.md'), PLAN);
  const [line] = nextCheck(dir, false);
  assert.match(line ?? '', /^soujo 警告: 確認できない: NEXT\.md を読めない: /);
});
