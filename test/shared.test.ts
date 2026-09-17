import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  clip,
  commandArg,
  commitRecords,
  describeInvalidNext,
  headState,
  missingEntries,
  optionArg,
  requireCommittable,
  requireCommittableFiles,
  requireNext,
  resumable,
  skill,
  uncommittedLogs,
} from '../src/commands/shared.js';
import { gitLastCommit } from '../src/git.js';
import { commitAll, project, repo, temp } from './helpers.js';

const NEXT = '次: L3 io\n前提: p\n確認: c\n注意: なし\neffort: medium\n';

test('commandArg quotes a layer name for the shell, and keeps one starting with "-" out of the options', () => {
  assert.equal(commandArg('L3 io'), `'L3 io'`);
  assert.equal(commandArg('L3 $(touch x)`rm`'), `'L3 $(touch x)\`rm\`'`);
  assert.equal(commandArg(`L3 it's`), `'L3 it'\\''s'`);
  assert.equal(commandArg('L3 "io"'), `'L3 "io"'`);
  assert.equal(commandArg(''), `''`);
  assert.equal(commandArg('-L3 io'), `-- '-L3 io'`);
  assert.equal(commandArg('--note'), `-- '--note'`);
});

test('optionArg attaches the layer name to the option, so that one starting with "-" is still its value', () => {
  assert.equal(optionArg('--layer', 'L3 io'), `--layer='L3 io'`);
  assert.equal(optionArg('--layer', '-L3 io'), `--layer='-L3 io'`);
  assert.equal(optionArg('--layer', `L3 it's`), `--layer='L3 it'\\''s'`);
});

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

test('missingEntries lists entries absent from present, counting repeated entries', () => {
  const a = { date: '2026-08-01', layer: 'L1', lines: ['a'] };
  const b = { date: '2026-08-02', layer: 'L2', lines: ['b'] };
  const same = (entry: typeof a) => entry;
  assert.deepEqual(missingEntries([a, b, a], [a], same), [b, a]);
  assert.deepEqual(missingEntries([a, b], [b, a, a], same), []);
  assert.deepEqual(missingEntries([{ ...a, lines: ['a', 'x'] }], [a], same), [{ ...a, lines: ['a', 'x'] }]);
  const blocks = [{ entry: a, id: 1 }, { entry: b, id: 2 }];
  assert.deepEqual(missingEntries(blocks, [b], ({ entry }) => entry), [{ entry: a, id: 1 }]);
});

test('requireCommittableFiles refuses archives leaving the project or ignored by git', { skip: process.platform === 'win32' }, (t) => {
  const dir = project(repo(t));
  assert.doesNotThrow(() => requireCommittableFiles(dir, []));
  assert.doesNotThrow(() => requireCommittableFiles(dir, ['LOG-2026-08.md']));

  writeFileSync(join(dir, '.gitignore'), '.soujo/LOG-*.md\n');
  assert.throws(() => requireCommittableFiles(dir, ['LOG-2026-08.md']), /^Error: \.soujo\/LOG-2026-08\.md が git に無視されていて/);

  const elsewhere = join(temp(t), 'archive.md');
  writeFileSync(elsewhere, '');
  symlinkSync(elsewhere, join(dir, '.soujo', 'LOG-2026-07.md'));
  assert.throws(
    () => requireCommittableFiles(dir, ['LOG-2026-07.md']),
    /^Error: \.soujo\/LOG-2026-07\.md の実体（symlink の先）がプロジェクトの外なので記録をコミットできない$/,
  );

  symlinkSync('../.git/config', join(dir, '.soujo', 'LOG-2026-06.md'));
  assert.throws(
    () => requireCommittableFiles(dir, ['LOG-2026-06.md']),
    /^Error: \.soujo\/LOG-2026-06\.md の実体（symlink の先）が\.git の中なので記録をコミットできない$/,
  );
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

// The credential check reads every untracked file name; past the limit the rest was never seen, so staging everything is refused.
test('requireCommittable refuses when it could not read every untracked file name', (t) => {
  const dir = project(repo(t), { 'NEXT.md': NEXT });
  const name = 'x'.repeat(200);
  for (let index = 0; index < 400; index += 1) writeFileSync(join(dir, `${name}${index}`), '');
  assert.doesNotThrow(() => requireCommittable(dir));
  assert.throws(() => requireCommittable(dir, 1024), /^Error: 未追跡のファイルが多すぎて認証情報のファイル名を確認できないのでコミットしない/);
  // A credential name among the ones that were read is the more useful of the two, so it is reported first.
  writeFileSync(join(dir, '.env'), '');
  assert.throws(() => requireCommittable(dir, 1024), /^Error: \.env は認証情報のファイル名なのでコミットしない/);
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

test('headState reads the entry at HEAD, a symlink through its target at HEAD, whatever the working tree has now', { skip: process.platform === 'win32' }, (t) => {
  const dir = project(repo(t), { 'PLAN.md': 'committed\n' });
  mkdirSync(join(dir, 'docs'));
  writeFileSync(join(dir, 'docs', 'LOG.md'), 'target at HEAD\n');
  symlinkSync('../docs/LOG.md', join(dir, '.soujo', 'LOG.md'));
  commitAll(dir);

  renameSync(join(dir, '.soujo', 'PLAN.md'), join(dir, 'docs', 'PLAN.md'));
  writeFileSync(join(dir, 'docs', 'PLAN.md'), 'moved\n');
  symlinkSync('../docs/PLAN.md', join(dir, '.soujo', 'PLAN.md'));
  assert.equal(headState(dir, 'PLAN.md'), 'committed\n');

  rmSync(join(dir, '.soujo', 'LOG.md'));
  writeFileSync(join(dir, '.soujo', 'LOG.md'), 'regular now\n');
  assert.equal(headState(dir, 'LOG.md'), 'target at HEAD\n');
});

test('headState follows absolute and chained symlinks at HEAD, and is undefined for a symlink loop', { skip: process.platform === 'win32' }, (t) => {
  const top = repo(t);
  const dir = project(join(top, 'app'));
  writeFileSync(join(dir, 'real.md'), 'real\n');
  symlinkSync(join(dir, 'real.md'), join(dir, 'absolute.md'));
  symlinkSync('../absolute.md', join(dir, '.soujo', 'PLAN.md'));
  symlinkSync('../loop.md', join(dir, '.soujo', 'LOG.md'));
  symlinkSync('.soujo/LOG.md', join(dir, 'loop.md'));
  commitAll(top);
  assert.equal(headState(dir, 'PLAN.md'), 'real\n');
  assert.equal(headState(dir, 'LOG.md'), undefined);
});

test('headState follows a symlinked directory in the path at HEAD, taking ".." after it from its target', { skip: process.platform === 'win32' }, (t) => {
  const dir = project(repo(t));
  mkdirSync(join(dir, 'docs', 'sub'), { recursive: true });
  writeFileSync(join(dir, 'docs', 'PLAN.md'), 'through a directory\n');
  writeFileSync(join(dir, 'docs', 'LOG.md'), 'after the target\n');
  writeFileSync(join(dir, 'LOG.md'), 'lexical\n');
  symlinkSync('docs', join(dir, 'alias'));
  symlinkSync('docs/sub', join(dir, 'deep'));
  symlinkSync('../alias/PLAN.md', join(dir, '.soujo', 'PLAN.md'));
  symlinkSync('../deep/../LOG.md', join(dir, '.soujo', 'LOG.md'));
  commitAll(dir);
  assert.equal(headState(dir, 'PLAN.md'), 'through a directory\n');
  assert.equal(headState(dir, 'LOG.md'), 'after the target\n');
});

test('commitRecords refuses when git add leaves the re-pointed symlink of a state file unstaged', { skip: process.platform === 'win32' }, (t) => {
  const dir = project(repo(t), { 'NEXT.md': NEXT });
  writeFileSync(join(dir, 'PLAN-a.md'), 'a\n');
  writeFileSync(join(dir, 'PLAN-b.md'), 'b\n');
  symlinkSync('../PLAN-a.md', join(dir, '.soujo', 'PLAN.md'));
  commitAll(dir, 'base');
  execFileSync('git', ['update-index', '--skip-worktree', '.soujo/PLAN.md'], { cwd: dir });
  rmSync(join(dir, '.soujo', 'PLAN.md'));
  symlinkSync('../PLAN-b.md', join(dir, '.soujo', 'PLAN.md'));
  writeFileSync(join(dir, 'state.ts'), '');
  assert.throws(() => commitRecords(dir, 'layer: L1'), /^Error: \.soujo\/PLAN\.md の変更を git が拾っていない/);
  assert.equal(gitLastCommit(dir)?.subject, 'base');
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
