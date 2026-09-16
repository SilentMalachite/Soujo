import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { nextCheck, nextSet, nextShow } from '../src/commands/next.js';
import { commitAll, deadPid, project, repo, temp } from './helpers.js';

const NEXT = '次: L2 state\n前提: L1 完了\n確認: npm test が通る\n注意: なし\neffort: medium\n';
// L2 state's completion condition is NEXT.md's 確認, so that next check has nothing to warn about by default.
const PLAN = '- [x] L1 scaffold — build\n- [ ] L2 state — npm test が通る\n';

function readNext(dir: string): string {
  return readFileSync(join(dir, '.soujo', 'NEXT.md'), 'utf8');
}

test('next show prints NEXT.md lines from a subdirectory', (t) => {
  const dir = project(repo(t), { 'NEXT.md': NEXT });
  mkdirSync(join(dir, 'src'));
  assert.deepEqual(nextShow(join(dir, 'src'), false), NEXT.trimEnd().split('\n'));
  assert.deepEqual(nextShow(dir, true), NEXT.trimEnd().split('\n'));
});

test('next set refuses a control character inside a value, also while PLAN has no layers, and writes nothing', (t) => {
  const dir = project(temp(t), { 'NEXT.md': NEXT });
  assert.throws(() => nextSet(dir, { layer: 'a\tb', premise: 'p', check: 'c' }), /^Error: 「次」に制御文字がある$/);
  assert.throws(() => nextSet(dir, { layer: 'a', premise: 'p\u0085q', check: 'c' }), /^Error: 「前提」に制御文字がある$/);
  assert.equal(readNext(dir), NEXT);
});

test('next show reports a missing NEXT.md, and --hook stays silent', (t) => {
  const dir = project(temp(t));
  assert.deepEqual(nextShow(dir, false), ['NEXT.md なし']);
  assert.deepEqual(nextShow(dir, true), []);
});

test('next show adds one line naming what makes NEXT.md unusable, with and without --hook', (t) => {
  const dir = project(temp(t), { 'NEXT.md': '次: L2 state\n前提:\n確認: c\n' });
  const shown = ['次: L2 state', '前提:', '確認: c', 'soujo 警告: 「前提」が空 / 「注意」がない / 「effort」がない'];
  assert.deepEqual(nextShow(dir, false), shown);
  assert.deepEqual(nextShow(dir, true), shown);
  // The line stays bounded as next check's does, naming the first problems and counting the rest.
  const broken = project(temp(t), { 'NEXT.md': 'a\nb\nc\nd\ne\nf\n' });
  assert.match(nextShow(broken, false).at(-1) ?? '', /^soujo 警告: NEXT\.md が5行を超えている（6行） \/ 1行目を読めない: a \/ .+ \/ ほか8件$/);
  // A valid NEXT.md is shown as it is.
  assert.deepEqual(nextShow(project(temp(t), { 'NEXT.md': NEXT }), false), NEXT.trimEnd().split('\n'));
});

test('next show counts the lines it prints, so a blank line at the end is shown as the line it is warned about', (t) => {
  const dir = project(temp(t), { 'NEXT.md': `${NEXT}\n` });
  assert.deepEqual(nextShow(dir, false), [...NEXT.trimEnd().split('\n'), '', 'soujo 警告: NEXT.md が5行を超えている（6行） / 6行目が空行']);
});

test('next show says a NEXT.md that is there but empty is empty, and only a missing one is missing', (t) => {
  for (const text of ['', ' \n\n']) {
    const dir = project(temp(t), { 'NEXT.md': text });
    assert.deepEqual(nextShow(dir, false), ['soujo 警告: NEXT.md が空'], JSON.stringify(text));
    assert.deepEqual(nextShow(dir, true), ['soujo 警告: NEXT.md が空'], JSON.stringify(text));
  }
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

test('next set removes temporary files a killed write left, one with its own process id included', (t) => {
  const dir = project(temp(t), { 'NEXT.md': 'old\n' });
  const leftovers = [`.NEXT.md.${process.pid}.tmp`, `.LOG.md.${deadPid()}.tmp`].map((name) => join(dir, '.soujo', name));
  for (const path of leftovers) writeFileSync(path, 'half');
  nextSet(dir, { layer: 'L2 state', premise: 'L1 完了', check: 'npm test が通る' });
  assert.equal(readNext(dir), NEXT);
  assert.deepEqual(leftovers.filter((path) => existsSync(path)), []);
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

test('next set refuses a layer missing from PLAN.md except spec and plan, and any layer while PLAN.md has none', (t) => {
  const dir = project(temp(t), { 'NEXT.md': NEXT, 'PLAN.md': PLAN });
  const base = { premise: 'p', check: 'c' };
  assert.throws(() => nextSet(dir, { ...base, layer: 'L2' }), /^Error: NEXT\.md を書かない: PLAN\.md に層「L2」がない/);
  assert.throws(() => nextSet(dir, { ...base, layer: 'L2 state — test' }), /PLAN\.md に層「L2 state — test」がない/);
  assert.equal(readNext(dir), NEXT);
  for (const layer of [' L2 state ', 'L1 scaffold', 'spec', 'plan']) {
    assert.deepEqual(nextSet(dir, { ...base, layer }), [`NEXT.md を更新: 次: ${layer.trim()}`]);
  }
  const empty = project(temp(t), { 'PLAN.md': '# PLAN\n' });
  assert.deepEqual(nextSet(empty, { ...base, layer: 'L1' }), ['NEXT.md を更新: 次: L1']);
});

test('next set writes effort high for spec and plan, and refuses any other effort for them', (t) => {
  const dir = project(temp(t), { 'NEXT.md': NEXT, 'PLAN.md': PLAN });
  const base = { premise: 'p', check: 'c' };
  const accepted: [string, string | undefined][] = [['plan', undefined], [' spec ', undefined], ['plan', 'high'], ['\tplan', ' high ']];
  for (const [layer, effort] of accepted) {
    assert.deepEqual(nextSet(dir, { ...base, layer, effort }), [`NEXT.md を更新: 次: ${layer.trim()}`]);
    assert.equal(readNext(dir), `次: ${layer.trim()}\n前提: p\n確認: c\n注意: なし\neffort: high\n`, `${layer} ${effort}`);
  }
  nextSet(dir, { ...base, layer: 'L2 state' });
  const before = readNext(dir);
  assert.match(before, /\neffort: medium\n$/);
  const refused: [string, string | undefined, RegExp][] = [
    ['plan', 'medium', /^Error: NEXT\.md を書かない: 層「plan」の effort は high 固定（--effort を外して再実行）$/],
    [' spec ', 'low', /^Error: NEXT\.md を書かない: 層「spec」の effort は high 固定（--effort を外して再実行）$/],
    ['\tspec', ' xhigh ', /^Error: NEXT\.md を書かない: 層「spec」の effort は high 固定/],
    // Unknown and multi-line values are reported as for any layer, before the fixed effort.
    ['plan', 'HIGH', /^Error: NEXT\.md を書かない: effort は low\|medium\|high\|xhigh のどれか: HIGH$/],
    ['plan', 'max', /^Error: NEXT\.md を書かない: effort は/],
    ['plan', '', /^Error: NEXT\.md を書かない: /],
    ['plan', 'high\n', /「effort」は1行で書く/],
    ['plan\n', 'medium', /「次」は1行で書く/],
    // Phases match exactly, so "Plan" is an ordinary layer and missing from PLAN.md.
    ['Plan', undefined, /PLAN\.md に層「Plan」がない/],
  ];
  for (const [layer, effort, error] of refused) {
    assert.throws(() => nextSet(dir, { ...base, layer, effort }), error, `${layer} ${effort}`);
    assert.equal(readNext(dir), before, `${layer} ${effort}`);
  }
  assert.throws(() => nextSet(temp(t), { ...base, layer: 'plan', effort: 'medium' }), /\.soujo\/ が見つからない/);
});

test('next set refuses while PLAN.md repeats a layer name or names a layer like a phase, and writes nothing', (t) => {
  const base = { premise: 'p', check: 'c' };
  const repeated = project(temp(t), { 'NEXT.md': NEXT, 'PLAN.md': `${PLAN}- [ ] L2 state — again\n` });
  for (const layer of ['L2 state', 'plan']) {
    assert.throws(
      () => nextSet(repeated, { ...base, layer }),
      /^Error: NEXT\.md を書かない: PLAN\.md の層「L2 state」が重複（PLAN\.md を直してから）$/,
    );
  }
  assert.equal(readNext(repeated), NEXT);

  const phase = project(temp(t), { 'NEXT.md': NEXT, 'PLAN.md': `${PLAN}- [ ] plan — PLAN を書く\n` });
  assert.throws(() => nextSet(phase, { ...base, layer: 'L2 state' }), /PLAN\.md の層名「plan」がフェーズ名と同じ/);
  assert.equal(readNext(phase), NEXT);

  const milestone = project(temp(t), { 'NEXT.md': NEXT, 'PLAN.md': `${PLAN}- [ ] 節目 — LOG に書く\n` });
  for (const layer of ['L2 state', '節目']) {
    assert.throws(() => nextSet(milestone, { ...base, layer }), /^Error: NEXT\.md を書かない: PLAN\.md の層名「節目」が LOG の節目と同じ（/);
  }
  assert.equal(readNext(milestone), NEXT);
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

  // The 確認 of a layer already done is not compared: the layer being the wrong one is the problem to fix, and the one to name.
  const finished = project(temp(t), { 'NEXT.md': NEXT.replace('L2 state', 'L1 scaffold'), 'PLAN.md': PLAN });
  assert.deepEqual(nextCheck(finished, false), ['soujo 警告: NEXT.md の次「L1 scaffold」は PLAN で完了済み']);
});

test('next check warns when NEXT.md moved past a layer that was never closed', (t) => {
  // As for a finished layer, the 確認 of a layer reached too early is not compared.
  const dir = project(temp(t), { 'NEXT.md': NEXT.replace('L2 state', 'L3 io'), 'PLAN.md': `${PLAN}- [ ] L3 io — io\n` });
  assert.deepEqual(nextCheck(dir, false), ['soujo 警告: NEXT.md の次「L3 io」より前の「L2 state」が PLAN で未完了']);

  const plan = project(temp(t), { 'NEXT.md': NEXT.replace('L2 state', 'plan'), 'PLAN.md': PLAN });
  assert.deepEqual(nextCheck(plan, false), ['soujo 警告: NEXT.md の次「plan」より前の「L2 state」が PLAN で未完了']);
});

test('next check warns about repeated layer names and layers named like a phase, even without NEXT.md', (t) => {
  const done = '- [x] L1 scaffold — build\n- [x] plan — PLAN\n- [x] L1 scaffold — again\n- [x] 節目 — LOG\n';
  const dir = project(temp(t), { 'NEXT.md': NEXT.replace('L2 state', 'plan'), 'PLAN.md': done });
  assert.deepEqual(nextCheck(dir, false), [
    'soujo 警告: PLAN.md の層名「plan」がフェーズ名と同じ / PLAN.md の層「L1 scaffold」が重複 / PLAN.md の層名「節目」が LOG の節目と同じ',
  ]);
  const missing = project(temp(t), { 'PLAN.md': done });
  assert.match(nextCheck(missing, false)[0] ?? '', /^soujo 警告: NEXT\.md がない \/ PLAN\.md の層名「plan」/);
});

test('next check and next set point at the line of an empty or control-character layer name', (t) => {
  const plan = `- [x] L1 scaffold — build\n- [ ] \n- [ ] L2\tstate — test\n`;
  const dir = project(temp(t), { 'NEXT.md': NEXT, 'PLAN.md': plan });
  assert.deepEqual(nextCheck(dir, false), [
    'soujo 警告: PLAN.md の2行目の層名が空 / PLAN.md の3行目の層名に制御文字がある',
  ]);
  assert.throws(() => nextSet(dir, { layer: 'L1 scaffold', premise: 'p', check: 'c' }), /PLAN\.md の2行目の層名が空/);
  assert.equal(readFileSync(join(dir, '.soujo', 'NEXT.md'), 'utf8'), NEXT);
});

test('next check warns about a layer left without a completion condition, before layer done refuses it', (t) => {
  const plan = '- [x] L1 scaffold — build\n- [ ] L2 state\n- [ ] L3 io —\n';
  const dir = project(temp(t), { 'NEXT.md': NEXT, 'PLAN.md': plan });
  assert.deepEqual(nextCheck(dir, false), [
    'soujo 警告: PLAN.md の2行目の層「L2 state」に完了条件がない / PLAN.md の3行目の層「L3 io」に完了条件がない',
  ]);
  // next set writes anyway: an unwritten condition is not a reason to lose the next step.
  nextSet(dir, { layer: 'L2 state', premise: 'p', check: 'c' });
  assert.match(readNext(dir), /^次: L2 state$/m);
});

test('next check warns when 確認 in NEXT.md is not the completion condition PLAN gives the layer', (t) => {
  const differs = project(temp(t), { 'NEXT.md': NEXT, 'PLAN.md': PLAN.replace('npm test が通る', 'test') });
  assert.deepEqual(nextCheck(differs, false), [
    'soujo 警告: NEXT.md の確認が PLAN の層「L2 state」の完了条件と違う（PLAN に合わせて soujo next set）',
  ]);
  // Whitespace runs compare equal, so a condition re-spaced by hand is not a difference.
  const same = project(temp(t), { 'NEXT.md': NEXT, 'PLAN.md': PLAN.replace('npm test', 'npm\ttest ') });
  assert.deepEqual(nextCheck(same, false), []);
  // Nothing to compare against: a phase, and a layer left without a completion condition (named by that warning alone).
  const phase = project(temp(t), { 'NEXT.md': NEXT.replace('L2 state', 'plan'), 'PLAN.md': '- [x] L1 scaffold — build\n' });
  assert.deepEqual(nextCheck(phase, false), []);
  const none = project(temp(t), { 'NEXT.md': NEXT, 'PLAN.md': '- [x] L1 scaffold — build\n- [ ] L2 state\n' });
  assert.deepEqual(nextCheck(none, false), ['soujo 警告: PLAN.md の2行目の層「L2 state」に完了条件がない']);
});

test('next check keeps its one line bounded, naming the first problems and counting the rest', (t) => {
  const dir = project(temp(t), { 'PLAN.md': '- [ ] \n- [ ] \n- [ ] \n- [ ] \n- [ ] \n' });
  assert.deepEqual(nextCheck(dir, false), [
    'soujo 警告: NEXT.md がない / PLAN.md の1行目の層名が空 / PLAN.md の2行目の層名が空 / PLAN.md の3行目の層名が空 / ほか2件',
  ]);
});

test('next show --hook and next check never read a state file through a symlink leaving the project', { skip: process.platform === 'win32' }, (t) => {
  const secret = join(temp(t), 'secret');
  writeFileSync(secret, '次: token-123\n');
  const dir = project(temp(t), { 'PLAN.md': PLAN });
  symlinkSync(secret, join(dir, '.soujo', 'NEXT.md'));
  assert.deepEqual(nextShow(dir, true), []);
  assert.throws(() => nextShow(dir, false), /^Error: NEXT\.md を読まない: 実体（symlink の先）がプロジェクトの外$/);
  const [line] = nextCheck(dir, true);
  assert.doesNotMatch(line ?? '', /token-123/);
  assert.match(line ?? '', /NEXT\.md を読まない: 実体（symlink の先）がプロジェクトの外/);
});

test('next check counts untracked files even when git hides them from status', (t) => {
  const dir = project(repo(t), { 'NEXT.md': NEXT, 'PLAN.md': PLAN });
  commitAll(dir);
  execFileSync('git', ['config', 'status.showUntrackedFiles', 'no'], { cwd: dir });
  writeFileSync(join(dir, 'new.ts'), '');
  assert.deepEqual(nextCheck(dir, false), ['soujo 警告: 未コミットの変更 1件']);
});

test('next check suggests log rotate once it would move entries of two past months', (t) => {
  const now = new Date(2026, 8, 15, 10, 0);
  const warning = 'soujo 警告: LOG.md に移せる過去2か月分のエントリ（soujo log rotate）';
  const cases: [string, string[]][] = [
    ['## 2026-08-31 L1\na\n\n## 2026-09-01 L2\nb\n', []],
    ['## 2026-07-01 L0\nz\n\n## 2026-08-31 L1\na\n\n## 2026-09-01 L2\nb\n', [warning]],
    // Current and future months, dates naming no month, and the last entry are not moved, so they never warn.
    ['## 2026-07-01 L0\nz\n\n## 2026-13-01 typo\nx\n\n## 2026-09-01 L1\na\n\n## 2027-01-01 typo\ny\n\n## 2026-06-01 L2\nb\n', []],
  ];
  for (const [log, expected] of cases) {
    const dir = project(temp(t), { 'NEXT.md': NEXT, 'PLAN.md': PLAN, 'LOG.md': `# LOG\n\n${log}` });
    assert.deepEqual(nextCheck(dir, false, now), expected, log);
  }
});

test('next check reports an unreadable LOG.md together with the other warnings', { skip: process.platform === 'win32' }, (t) => {
  const secret = join(temp(t), 'secret');
  writeFileSync(secret, '## 2026-01-01 token-123\n');
  const linked = project(temp(t), { 'PLAN.md': PLAN });
  symlinkSync(secret, join(linked, '.soujo', 'LOG.md'));
  assert.deepEqual(nextCheck(linked, false), ['soujo 警告: NEXT.md がない / LOG.md を読まない: 実体（symlink の先）がプロジェクトの外']);

  // A state file that is another one is refused the same way, and each file that cannot be read is named on its own.
  const shared = project(temp(t), { 'LOG.md': `# LOG\n\n${PLAN}` });
  symlinkSync('LOG.md', join(shared, '.soujo', 'PLAN.md'));
  assert.deepEqual(nextCheck(shared, false), [
    'soujo 警告: NEXT.md がない / PLAN.md を読まない: 実体（symlink の先）が LOG.md と同じ / LOG.md を読まない: 実体が PLAN.md（symlink）の先と同じ',
  ]);
});

test('next check reports an unreadable PLAN.md together with the warnings about NEXT.md', (t) => {
  const dir = project(temp(t), { 'NEXT.md': `${NEXT}補足: x\n` });
  mkdirSync(join(dir, '.soujo', 'PLAN.md'));
  const [line] = nextCheck(dir, false);
  assert.match(line ?? '', /^soujo 警告: NEXT\.md が5行を超えている（6行） \/ 6行目を読めない: 補足: x \/ PLAN\.md を読めない: /);
});

test('next check reports a git failure together with the other warnings', (t) => {
  const dir = project(repo(t), { 'PLAN.md': PLAN });
  writeFileSync(join(dir, '.git', 'config'), '[broken\n');
  const [line] = nextCheck(dir, false);
  assert.match(line ?? '', /^soujo 警告: NEXT\.md がない \/ 未コミットの変更を確認できない: git rev-parse に失敗: .+$/);
});

test('next check --hook returns a systemMessage JSON line', (t) => {
  const dir = project(temp(t));
  assert.deepEqual(nextCheck(dir, true), [JSON.stringify({ systemMessage: 'soujo 警告: NEXT.md がない' })]);
});

test('next check reports an unreadable NEXT.md together with the other warnings, and never throws', (t) => {
  const dir = project(temp(t));
  mkdirSync(join(dir, '.soujo', 'NEXT.md'));
  writeFileSync(join(dir, '.soujo', 'PLAN.md'), '- [ ] L2 state\n');
  const [line] = nextCheck(dir, false);
  assert.match(line ?? '', /^soujo 警告: NEXT\.md を読めない: .+ \/ PLAN\.md の1行目の層「L2 state」に完了条件がない$/);
});
