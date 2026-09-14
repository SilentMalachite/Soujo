import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  clip,
  describeInvalidNext,
  headState,
  requireCommittable,
  requireNext,
  resumable,
  skill,
  uncommittedLogs,
} from '../src/commands/shared.js';
import { commitAll, project, repo, temp } from './helpers.js';

const NEXT = '次: L3 io\n前提: p\n確認: c\n注意: なし\neffort: medium\n';

test('skill names both hosts, and clip shortens long text by characters', () => {
  assert.equal(skill('go'), '/soujo:go（Codex は $go）');
  assert.equal(clip('あいう', 3), 'あいう');
  assert.equal(clip('あいうえ', 3), 'あい…');
  assert.equal(clip('😀😀😀😀', 3), '😀😀…');
});

test('describeInvalidNext and requireNext report problems without repeating NEXT.md', (t) => {
  assert.equal(describeInvalidNext(['NEXT.md が空']), 'NEXT.md が無効: 空');
  const dir = project(temp(t));
  assert.throws(() => requireNext(join(dir, '.soujo'), '（hint）'), /^Error: NEXT\.md がない（hint）$/);
  writeFileSync(join(dir, '.soujo', 'NEXT.md'), `${NEXT}補足: x\n`);
  assert.throws(
    () => requireNext(join(dir, '.soujo'), '（hint）'),
    /^Error: NEXT\.md が無効: 5行を超えている（6行）、6行目を読めない: 補足: x（hint）$/,
  );
  writeFileSync(join(dir, '.soujo', 'NEXT.md'), NEXT);
  assert.equal(requireNext(join(dir, '.soujo'), '').layer, 'L3 io');
});

test('uncommittedLogs lists entries HEAD lacks wherever they are, counting repeated entries', () => {
  const a = '## 2026-09-12 L1\na\n';
  const b = '## 2026-09-13 L2\nb\n';
  const c = '## 2026-09-13 L3\nc\n';
  const entry = (layer: string, line: string) => ({ date: layer === 'L1' ? '2026-09-12' : '2026-09-13', layer, lines: [line] });
  assert.deepEqual(uncommittedLogs(`${a}${b}`, undefined), [entry('L1', 'a'), entry('L2', 'b')]);
  assert.deepEqual(uncommittedLogs(`${a}${b}`, a), [entry('L2', 'b')]);
  assert.deepEqual(uncommittedLogs(`${a}${b}${c}`, a), [entry('L2', 'b'), entry('L3', 'c')]);
  // As many entries as HEAD, one replaced.
  assert.deepEqual(uncommittedLogs(`${a}${c}`, `${a}${b}`), [entry('L3', 'c')]);
  assert.deepEqual(uncommittedLogs(`${b}${a}${b}`, `${a}${b}`), [entry('L2', 'b')]);
  assert.deepEqual(uncommittedLogs(a, `${a}${b}`), []);
});

test('requireCommittable refuses each unsafe state',{ skip: process.platform === 'win32' }, (t) => {
  assert.throws(() => requireCommittable(project(temp(t))), /^Error: git リポジトリではないのでコミットできない$/);

  const clean = project(repo(t), { 'NEXT.md': NEXT });
  assert.doesNotThrow(() => requireCommittable(clean));

  const rebasing = project(repo(t));
  mkdirSync(join(rebasing, '.git', 'rebase-merge'));
  assert.throws(() => requireCommittable(rebasing), /^Error: git の rebase が途中なのでコミットしない/);

  const ignoring = project(repo(t), { 'LOG.md': '' });
  writeFileSync(join(ignoring, '.gitignore'), '.soujo/LOG.md\n');
  assert.throws(() => requireCommittable(ignoring), /^Error: \.soujo\/LOG\.md が git に無視されていて/);

  const linked = repo(t);
  project(join(linked, 'real'));
  symlinkSync('real/.soujo', join(linked, '.soujo'));
  assert.throws(() => requireCommittable(linked), /^Error: \.soujo\/ が symlink なので記録をコミットできない/);

  const sequencing = project(repo(t));
  mkdirSync(join(sequencing, '.git', 'sequencer'));
  assert.throws(() => requireCommittable(sequencing), /^Error: git の cherry-pick \/ revert が途中なのでコミットしない/);

  const ignoredTarget = project(repo(t));
  mkdirSync(join(ignoredTarget, 'records'));
  writeFileSync(join(ignoredTarget, 'records', 'PLAN.md'), '');
  writeFileSync(join(ignoredTarget, '.gitignore'), 'records/\n');
  symlinkSync('../records/PLAN.md', join(ignoredTarget, '.soujo', 'PLAN.md'));
  assert.throws(() => requireCommittable(ignoredTarget), /^Error: records\/PLAN\.md が git に無視されていて/);

  const outsideTarget = project(repo(t));
  const elsewhere = join(temp(t), 'LOG.md');
  writeFileSync(elsewhere, '');
  symlinkSync(elsewhere, join(outsideTarget, '.soujo', 'LOG.md'));
  assert.throws(
    () => requireCommittable(outsideTarget),
    /^Error: \.soujo\/LOG\.md の実体（symlink の先）がプロジェクトの外なので記録をコミットできない$/,
  );
});

test('headState reads the committed file, following a symlinked state file', { skip: process.platform === 'win32' }, (t) => {
  const dir = project(repo(t), { 'PLAN.md': 'committed\n' });
  assert.equal(headState(dir, 'PLAN.md'), undefined);
  commitAll(dir);
  writeFileSync(join(dir, '.soujo', 'PLAN.md'), 'working\n');
  assert.equal(headState(dir, 'PLAN.md'), 'committed\n');

  writeFileSync(join(dir, 'LOG.md'), 'target\n');
  symlinkSync('../LOG.md', join(dir, '.soujo', 'LOG.md'));
  commitAll(dir);
  assert.equal(headState(dir, 'LOG.md'), 'target\n');
});

test('resumable appends what is recorded to the error', () => {
  assert.equal(resumable(() => 1, 'x'), 1);
  assert.throws(
    () =>
      resumable(() => {
        throw new Error('失敗');
      }, '記録済み'),
    /^Error: 失敗（記録済み）$/,
  );
});
