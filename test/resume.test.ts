import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { brief } from '../src/commands/brief.js';
import { close } from '../src/commands/close.js';
import { resume } from '../src/commands/resume.js';
import { gitLastCommit, gitStatus } from '../src/git.js';
import { readTemplate } from '../src/files.js';
import { commitAll, project, repo, temp } from './helpers.js';

const NEXT = '次: L3 io\n前提: L2 完了\n確認: io のテストが通る\n注意: なし\neffort: high\n';
const PLAN = '- [x] L1 scaffold — build\n- [x] L2 state — state\n- [ ] L3 io — io\n- [ ] L4 cli — cli のテストが通る\n';
const LOG = '# LOG\n\n## 2026-09-12 L1 scaffold\nold\n\n## 2026-09-13 L2 state\n中断: テスト途中\n二行目\n';
const GO = '再開: /soujo:go（Codex は $go）';

test('resume prints the next step, the last LOG entry, the last commit, and the command in four lines', (t) => {
  const dir = project(repo(t), { 'NEXT.md': NEXT, 'PLAN.md': PLAN, 'LOG.md': LOG });
  commitAll(dir, 'wip: L3 io');
  mkdirSync(join(dir, 'src'));
  assert.deepEqual(resume(join(dir, 'src')), [
    '次: L3 io（effort: high）確認: io のテストが通る',
    '前回: 2026-09-13 L2 state — 中断: テスト途中',
    `コミット: ${gitLastCommit(dir)?.hash} wip: L3 io`,
    GO,
  ]);
});

test('resume degrades the lines of state files that are one file instead of failing', { skip: process.platform === 'win32' }, (t) => {
  const dir = project(repo(t), { 'NEXT.md': NEXT, 'LOG.md': LOG });
  symlinkSync('LOG.md', join(dir, '.soujo', 'PLAN.md'));
  commitAll(dir, 'wip: L3 io');
  const lines = resume(dir);
  assert.equal(lines.length, 4);
  assert.equal(lines[1], '前回: LOG.md を読めない');
});

test('resume reads CRLF files, counts uncommitted changes, and clips long values', (t) => {
  const long = 'あ'.repeat(80);
  const crlf = (text: string) => text.replaceAll('\n', '\r\n');
  const dir = project(repo(t), {
    'NEXT.md': crlf(NEXT.replace('io のテストが通る', long)),
    'PLAN.md': crlf(PLAN),
    'LOG.md': crlf(`${LOG}\n## 2026-09-14  L3 io \n  ${long}  \n`),
  });
  commitAll(dir, long);
  writeFileSync(join(dir, 'a.ts'), '');
  writeFileSync(join(dir, 'b.ts'), '');
  const clipped = `${'あ'.repeat(59)}…`;
  assert.deepEqual(resume(dir), [
    `次: L3 io（effort: high）確認: ${clipped}`,
    `前回: 2026-09-14 L3 io — ${clipped}`,
    `コミット: ${gitLastCommit(dir)?.hash} ${clipped}（未コミット 2件）`,
    GO,
  ]);
});

test('resume clips long layer names too, but keeps them whole inside commands', (t) => {
  const long = `L3 ${'層'.repeat(80)}`;
  const clipped = `L3 ${'層'.repeat(56)}…`;
  const plan = PLAN.replace('L3 io', long);
  const ok = project(temp(t), { 'NEXT.md': NEXT.replace('L3 io', long), 'PLAN.md': plan, 'LOG.md': `# LOG\n\n## 2026-09-13 ${long}\nx\n` });
  const [next, log] = resume(ok);
  assert.equal(next, `次: ${clipped}（effort: high）確認: io のテストが通る`);
  assert.equal(log, `前回: 2026-09-13 ${clipped} — x`);

  const skipped = project(temp(t), { 'NEXT.md': NEXT.replace('L3 io', 'L4 cli'), 'PLAN.md': plan });
  assert.deepEqual([resume(skipped)[0], resume(skipped)[3]], [
    `次: ${clipped}（PLAN で未完了。NEXT.md は「L4 cli」）確認: io`,
    `再開: 「${clipped}」を締めていない → 完了なら soujo layer done '${long}'、途中なら soujo next set --layer='${long}' で次を戻す`,
  ]);

  const missing = project(temp(t), { 'PLAN.md': plan });
  assert.equal(resume(missing)[0], `次: ${clipped}（PLAN から）確認: io`);

  const pending = project(repo(t), { 'NEXT.md': NEXT.replace('L3 io', 'L4 cli'), 'PLAN.md': plan });
  commitAll(pending);
  writeFileSync(join(pending, '.soujo', 'PLAN.md'), plan.replace(`- [ ] ${long}`, `- [x] ${long}`));
  assert.equal(
    resume(pending)[3],
    `再開: 「${clipped}」の layer done が途中（PLAN のチェックが未コミット）→ soujo layer done '${long}' を再実行`,
  );
});

test('resume quotes a layer name inside a command, so that a shell takes it as one argument', (t) => {
  const cases: [string, string, string][] = [
    ['L3 $(touch x)', `'L3 $(touch x)'`, `--layer='L3 $(touch x)'`],
    [`L3 it's`, `'L3 it'\\''s'`, `--layer='L3 it'\\''s'`],
    ['-L3 io', `-- '-L3 io'`, `--layer='-L3 io'`],
  ];
  for (const [layer, positional, option] of cases) {
    const plan = `- [ ] ${layer} — io\n- [ ] L4 cli — cli\n`;
    const dir = project(temp(t), { 'NEXT.md': NEXT.replace('L3 io', 'L4 cli'), 'PLAN.md': plan });
    assert.equal(
      resume(dir)[3],
      `再開: 「${layer}」を締めていない → 完了なら soujo layer done ${positional}、途中なら soujo next set ${option} で次を戻す`,
      layer,
    );
  }
});

test('resume falls back to the next layer of PLAN when NEXT.md is missing, invalid, or finished', (t) => {
  const missing = project(repo(t), { 'PLAN.md': '- [ ] L3 io — io\n', 'LOG.md': '' });
  writeFileSync(join(missing, 'a.ts'), '');
  assert.deepEqual(resume(missing), [
    '次: L3 io（PLAN から）確認: io',
    '前回: LOG.md に記録なし',
    'コミット: まだない（未コミット 2件）',
    `再開: NEXT.md がない → soujo next set で書いてから ${GO.slice(4)}`,
  ]);

  const invalid = project(temp(t), { 'NEXT.md': `${NEXT}補足: x\n`, 'PLAN.md': '- [ ] L3 io\n' });
  assert.deepEqual(resume(invalid), [
    '次: L3 io（PLAN から）確認: 未記入',
    '前回: LOG.md に記録なし',
    'コミット: git リポジトリではない',
    `再開: NEXT.md が無効: 5行を超えている（6行）、6行目を読めない: 補足: x → soujo next set で書いてから ${GO.slice(4)}`,
  ]);

  const finished = project(temp(t), { 'NEXT.md': NEXT.replace('L3 io', 'L2 state'), 'PLAN.md': PLAN });
  assert.deepEqual(resume(finished), [
    '次: L3 io（PLAN から）確認: io',
    '前回: LOG.md に記録なし',
    'コミット: git リポジトリではない',
    `再開: NEXT.md の次「L2 state」は PLAN で完了済み → soujo next set で書いてから ${GO.slice(4)}`,
  ]);
});

test('resume and brief degrade only their git lines when git fails in a repository', (t) => {
  const dir = project(repo(t), { 'NEXT.md': NEXT, 'PLAN.md': PLAN });
  commitAll(dir, 'wip: L3 io');
  writeFileSync(join(dir, '.git', 'config'), '[broken\n');
  assert.equal(resume(dir)[2], 'コミット: git の状態を読めない');
  assert.deepEqual(brief(dir).slice(0, 2), ['進捗: PLAN 2/4 層完了・最終 layer: git の状態を読めない', '以後: git の状態を読めない']);
});

test('resume points to spec or plan when PLAN has no layer to do', (t) => {
  const cases: [Record<string, string>, string, string][] = [
    [{ 'SPEC.md': readTemplate('SPEC.md') }, '次: なし（SPEC.md が未作成）', '再開: NEXT.md がない → /soujo:spec（Codex は $spec）'],
    [{}, '次: なし（SPEC.md が未作成）', '再開: NEXT.md がない → /soujo:spec（Codex は $spec）'],
    [{ 'SPEC.md': '# SPEC\n目的\n' }, '次: なし（PLAN.md がない）', '再開: NEXT.md がない → /soujo:plan（Codex は $plan）'],
    [
      { 'SPEC.md': '# SPEC\n目的\n', 'PLAN.md': '# PLAN\n', 'NEXT.md': '' },
      '次: なし（PLAN.md に層がない）',
      '再開: NEXT.md が無効: 空 → /soujo:plan（Codex は $plan）',
    ],
    [
      { 'SPEC.md': '# SPEC\n目的\n', 'PLAN.md': '- [x] L1 — c\n' },
      '次: なし（PLAN は全層完了）',
      '再開: NEXT.md がない → 層を足すなら /soujo:plan（Codex は $plan）',
    ],
  ];
  for (const [files, next, command] of cases) {
    assert.deepEqual(
      resume(project(temp(t), files)),
      [next, '前回: LOG.md に記録なし', 'コミット: git リポジトリではない', command],
      JSON.stringify(files),
    );
  }
});

test('resume names the unclosed layer when NEXT.md was moved on before layer done', (t) => {
  const dir = project(repo(t), { 'NEXT.md': NEXT.replace('L3 io', 'L4 cli'), 'PLAN.md': PLAN });
  commitAll(dir);
  assert.deepEqual(resume(dir), [
    '次: L3 io（PLAN で未完了。NEXT.md は「L4 cli」）確認: io',
    '前回: LOG.md に記録なし',
    `コミット: ${gitLastCommit(dir)?.hash} test commit`,
    `再開: 「L3 io」を締めていない → 完了なら soujo layer done 'L3 io'、途中なら soujo next set --layer='L3 io' で次を戻す`,
  ]);

  writeFileSync(join(dir, '.soujo', 'NEXT.md'), NEXT.replace('L3 io', 'plan'));
  assert.deepEqual(resume(dir)[0], '次: L3 io（PLAN で未完了。NEXT.md は「plan」）確認: io');
});

test('resume says to re-run layer done when a PLAN check is not committed yet', (t) => {
  const dir = project(repo(t), { 'NEXT.md': NEXT.replace('L3 io', 'L4 cli'), 'PLAN.md': PLAN });
  commitAll(dir);
  writeFileSync(join(dir, '.soujo', 'PLAN.md'), PLAN.replace('- [ ] L3 io', '- [x] L3 io'));
  assert.deepEqual(resume(dir), [
    '次: L4 cli（effort: high）確認: io のテストが通る',
    '前回: LOG.md に記録なし',
    `コミット: ${gitLastCommit(dir)?.hash} test commit（未コミット 1件）`,
    `再開: 「L3 io」の layer done が途中（PLAN のチェックが未コミット）→ soujo layer done 'L3 io' を再実行`,
  ]);
});

test('resume and close do not take committed checks for uncommitted ones after PLAN.md is moved behind a symlink', { skip: process.platform === 'win32' }, (t) => {
  const dir = project(repo(t), { 'NEXT.md': NEXT, 'PLAN.md': PLAN, 'LOG.md': LOG });
  commitAll(dir, 'chore: base');
  mkdirSync(join(dir, 'docs'));
  renameSync(join(dir, '.soujo', 'PLAN.md'), join(dir, 'docs', 'PLAN.md'));
  symlinkSync('../docs/PLAN.md', join(dir, '.soujo', 'PLAN.md'));
  assert.equal(resume(dir)[3], GO);
  close(dir, 'PLAN を移した', new Date());
  assert.equal(gitLastCommit(dir)?.subject, 'wip: L3 io');
  assert.deepEqual(gitStatus(dir), []);
});

test('resume degrades per line when files cannot be read',{ skip: process.platform === 'win32' || process.getuid?.() === 0 }, (t) => {
  const dir = project(temp(t), { 'NEXT.md': NEXT, 'PLAN.md': PLAN, 'LOG.md': LOG });
  chmodSync(join(dir, '.soujo', 'LOG.md'), 0o000);
  assert.deepEqual(resume(dir).slice(0, 2), ['次: L3 io（effort: high）確認: io のテストが通る', '前回: LOG.md を読めない']);

  chmodSync(join(dir, '.soujo', 'PLAN.md'), 0o000);
  mkdirSync(join(dir, 'next'));
  const unreadable = project(join(dir, 'next'), { 'PLAN.md': PLAN });
  mkdirSync(join(unreadable, '.soujo', 'NEXT.md'));
  assert.deepEqual(resume(unreadable)[3], `再開: NEXT.md を読めない → soujo next set で書いてから ${GO.slice(4)}`);
  assert.deepEqual(resume(dir), ['次: L3 io（effort: high）確認: io のテストが通る', '前回: LOG.md を読めない', 'コミット: git リポジトリではない', GO]);
  writeFileSync(join(dir, '.soujo', 'NEXT.md'), '');
  assert.deepEqual(resume(dir), [
    '次: 不明（PLAN.md を読めない）',
    '前回: LOG.md を読めない',
    'コミット: git リポジトリではない',
    '再開: NEXT.md が無効: 空 → PLAN.md を読めるようにしてから soujo resume',
  ]);
  chmodSync(join(dir, '.soujo', 'LOG.md'), 0o644);
  chmodSync(join(dir, '.soujo', 'PLAN.md'), 0o644);
});

test('resume shows a git failure instead of claiming there is no commit', { skip: process.platform === 'win32' }, (t) => {
  const dir = project(repo(t), { 'NEXT.md': NEXT, 'PLAN.md': PLAN });
  commitAll(dir);
  writeFileSync(join(dir, '.git', 'HEAD'), 'ref: refs/heads/broken\n');
  writeFileSync(join(dir, '.git', 'refs', 'heads', 'broken'), `${'1234567890'.repeat(4)}\n`);
  assert.equal(resume(dir)[2], 'コミット: git の状態を読めない');
});

test('resume points to soujo brief from three days after the last commit, whatever 再開 says', (t) => {
  const dir = project(repo(t), { 'NEXT.md': NEXT, 'PLAN.md': PLAN });
  const last = new Date(2026, 8, 12, 18, 0);
  commitAll(dir, 'layer: L2 state', last);
  assert.equal(resume(dir, new Date(2026, 8, 15, 17, 59))[3], GO);
  assert.equal(resume(dir, new Date(2026, 8, 15, 18, 0))[3], `${GO}・3日ぶり: 先に soujo brief`);
  assert.equal(resume(dir, new Date(2026, 9, 1))[3], `${GO}・18日ぶり: 先に soujo brief`);

  writeFileSync(join(dir, '.soujo', 'PLAN.md'), PLAN.replace('- [ ] L3 io', '- [x] L3 io'));
  assert.equal(
    resume(dir, new Date(2026, 8, 20))[3],
    `再開: 「L3 io」の layer done が途中（PLAN のチェックが未コミット）→ soujo layer done 'L3 io' を再実行・7日ぶり: 先に soujo brief`,
  );
  assert.equal(resume(project(temp(t), { 'NEXT.md': NEXT, 'PLAN.md': PLAN }), new Date(2030, 0, 1))[3], GO);
});

test('resume outside Soujo projects throws', (t) => {
  assert.throws(() => resume(temp(t)), /\.soujo\/ が見つからない/);
});
