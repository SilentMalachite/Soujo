import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendLog,
  appendedEntries,
  archiveLog,
  daysBetween,
  formatDate,
  formatItem,
  formatNext,
  isMonth,
  lastLog,
  lastMilestone,
  logLines,
  logMonth,
  logMonths,
  markDone,
  newlyDone,
  nextLayer,
  nextStatus,
  parseLog,
  parseNext,
  parsePlan,
  printable,
  removedEntries,
  requireMonth,
  rotateLog,
  validateNext,
  validatePlan,
} from '../src/state.js';

const NEXT = '次: L2 state\n前提: L1 完了\n確認: npm test が通る\n注意: なし\neffort: medium\n';

const PLAN = [
  '# PLAN',
  '',
  '- [x] L1 scaffold — build が通る',
  '- [ ] L2 state — 9関数 — テストあり',
  '- [ ] L3 io',
  '',
].join('\n');

test('formatNext applies defaults and round-trips through parseNext', () => {
  const text = formatNext({ layer: 'L2 state', premise: 'L1 完了', check: 'npm test が通る' });
  assert.equal(text, NEXT);
  assert.deepEqual(parseNext(text), {
    layer: 'L2 state',
    premise: 'L1 完了',
    check: 'npm test が通る',
    caution: 'なし',
    effort: 'medium',
  });
});

test('formatNext keeps given caution and effort, and refuses multi-line values', () => {
  const text = formatNext({ layer: 'L', premise: 'p', check: 'c', caution: '遅い', effort: 'high' });
  assert.match(text, /^注意: 遅い$/m);
  assert.match(text, /^effort: high$/m);
  assert.throws(() => formatNext({ layer: 'a\nb', premise: 'p', check: 'c' }), /「次」は1行/);
});

test('parseNext accepts full-width colons and returns undefined when invalid', () => {
  assert.equal(parseNext(NEXT.replaceAll(': ', '：'))?.layer, 'L2 state');
  assert.equal(parseNext('次: L2 state\n'), undefined);
});

test('validateNext accepts a valid file', () => {
  assert.deepEqual(validateNext(NEXT), []);
  assert.deepEqual(validateNext(NEXT.replaceAll('\n', '\r\n')), []);
});

test('validateNext reports every problem', () => {
  assert.deepEqual(validateNext(''), ['NEXT.md が空']);
  assert.ok(validateNext(`${NEXT}補足: 6行目\n`).includes('NEXT.md が5行を超えている（6行）'));
  assert.deepEqual(validateNext('次: L2\n次: L3\n前提: \n確認: c\neffort: max\n'), [
    '「次」が重複',
    '「前提」が空',
    '「注意」がない',
    'effort は low|medium|high|xhigh のどれか: max',
  ]);
  assert.ok(validateNext(NEXT.replace('注意: なし', '')).includes('4行目が空行'));
  assert.ok(validateNext(NEXT.replace('注意: なし', 'メモ')).includes('4行目を読めない: メモ'));
});

test('validateNext counts trailing blank lines toward the limit, with LF and CRLF', () => {
  for (const text of [`${NEXT}\n\n\n`, `${NEXT}\n\n\n`.replaceAll('\n', '\r\n')]) {
    const problems = validateNext(text);
    assert.ok(problems.includes('NEXT.md が5行を超えている（8行）'), JSON.stringify(problems));
    assert.ok(problems.includes('6行目が空行'));
  }
  assert.deepEqual(validateNext(NEXT.slice(0, -1)), []);
  assert.deepEqual(validateNext(' \n\n'), ['NEXT.md が空']);
});

test('appendLog keeps the existing text as an exact prefix and follows its line break', () => {
  const entry = { date: '2026-09-13', layer: 'L1', lines: ['a'] };
  const block = '## 2026-09-13 L1\na\n';
  const crlfBlock = block.replaceAll('\n', '\r\n');
  const cases: [string, string][] = [
    ['x  ', `x  \n\n${block}`],
    ['x\n', `x\n\n${block}`],
    ['x\n\n\n', `x\n\n\n${block}`],
    ['x\r\n', `x\r\n\r\n${crlfBlock}`],
    ['x\r\n\r\n', `x\r\n\r\n${crlfBlock}`],
    ['# LOG\r\n\r\nx', `# LOG\r\n\r\nx\r\n\r\n${crlfBlock}`],
  ];
  for (const [text, expected] of cases) assert.equal(appendLog(text, entry), expected, JSON.stringify(text));
});

test('printable and logLines turn control characters into spaces', () => {
  const [lineSeparator, bell] = [String.fromCharCode(0x2028), String.fromCharCode(7)];
  assert.equal(printable(`a\rb\tc\nd${lineSeparator}e${bell}`), 'a b c d e ');
  assert.deepEqual(logLines([' a\r\n\r\n b\rc ', `\t${lineSeparator}`]), ['a', 'b c']);
  assert.equal(appendLog('', { date: '2026-09-13', layer: 'L1', lines: ['a\rb'] }), '## 2026-09-13 L1\na b\n');
  assert.throws(() => appendLog('', { date: '2026-09-13', layer: 'L1\rx', lines: [] }), /制御文字なし/);
});

test('printable turns C1 controls into spaces and leaves printable Latin-1 alone', () => {
  const [nextLine, apc] = [String.fromCharCode(0x85), String.fromCharCode(0x9f)];
  const [padding, delete_] = [String.fromCharCode(0x80), String.fromCharCode(0x7f)];
  assert.equal(printable(`a${nextLine}b${apc}c${padding}d${delete_}e`), 'a b c d e');
  assert.equal(printable('a b­cÿd'), 'a b­cÿd');
  assert.deepEqual(logLines([`a${nextLine}b`]), ['a b']);
  assert.throws(() => appendLog('', { date: '2026-09-13', layer: `L1${apc}`, lines: [] }), /制御文字なし/);
});

test('appendLog refuses any line lastLog would read as a heading, and only those', () => {
  const entry = { date: '2026-09-13', layer: 'L1', lines: ['a'] };
  assert.throws(() => appendLog('', { ...entry, lines: ['##\t2026-09-14 fake'] }), /見出しの形/);
  assert.throws(() => appendLog('', { ...entry, lines: ['##   2026-09-14   fake'] }), /見出しの形/);
  const log = appendLog('', { ...entry, lines: ['## メモ', '#2026-09-14 x'] });
  assert.deepEqual(lastLog(log), { date: '2026-09-13', layer: 'L1', lines: ['## メモ', '#2026-09-14 x'] });
});

test('parsePlan reads checklist items and splits at the first separator', () => {
  assert.deepEqual(parsePlan(PLAN), [
    { layer: 'L1 scaffold', condition: 'build が通る', done: true },
    { layer: 'L2 state', condition: '9関数 — テストあり', done: false },
    { layer: 'L3 io', condition: '', done: false },
  ]);
  assert.equal(parsePlan('- [X] L1 — c\r\n')[0]?.done, true);
  assert.equal(parsePlan('- [X] L1 — c\r\n')[0]?.condition, 'c');
});

test('parsePlan accepts common separator variants but not hyphens inside words', () => {
  for (const separator of ['—', '–', '--', '-']) {
    assert.deepEqual(parsePlan(`- [ ] L1 scaffold ${separator} build  が通る\n`), [
      { layer: 'L1 scaffold', condition: 'build  が通る', done: false },
    ], separator);
  }
  assert.deepEqual(parsePlan('- [ ] L4 init-plan-log\n- [ ] L5 a-b —c\n'), [
    { layer: 'L4 init-plan-log', condition: '', done: false },
    { layer: 'L5 a-b —c', condition: '', done: false },
  ]);
  assert.equal(markDone('- [ ] L1 - c\n', 'L1'), '- [x] L1 - c\n');
});

test('long whitespace runs are processed in linear time', () => {
  const spaces = ' '.repeat(200_000);
  const started = performance.now();
  validateNext(`a${spaces}b${spaces}`);
  parsePlan(`- [ ] L1${spaces}x${spaces}y\n`);
  appendLog(`a${spaces}b${spaces}`, { date: '2026-09-13', layer: 'L1', lines: [] });
  assert.ok(performance.now() - started < 1000, `took ${Math.round(performance.now() - started)}ms`);
});

test('formatItem shows a layer with its checkbox', () => {
  assert.deepEqual(parsePlan(PLAN).map(formatItem), ['[x] L1 scaffold', '[ ] L2 state', '[ ] L3 io']);
});

test('nextLayer returns the first unfinished layer or undefined', () => {
  assert.equal(nextLayer(parsePlan(PLAN))?.layer, 'L2 state');
  assert.equal(nextLayer(parsePlan('- [x] L1 — c\n')), undefined);
});

test('markDone checks only the named layer and keeps the rest of the text', () => {
  const marked = markDone(PLAN, 'L2 state');
  assert.equal(marked, PLAN.replace('- [ ] L2 state', '- [x] L2 state'));
  assert.equal(markDone(marked, 'L2 state'), marked);
  assert.equal(markDone('- [ ] L1 — c\r\n', 'L1'), '- [x] L1 — c\r\n');
});

test('markDone throws for an unknown or partial layer name', () => {
  assert.throws(() => markDone(PLAN, 'L2'), /PLAN.md に層「L2」がない/);
});

test('appendLog adds an entry after a blank line and flattens multi-line notes', () => {
  const entry = { date: '2026-09-13', layer: 'L2 state', lines: ['一行目\n二行目', '三行目'] };
  assert.equal(appendLog('', entry), '## 2026-09-13 L2 state\n一行目\n二行目\n三行目\n');
  assert.equal(
    appendLog('# LOG\n\n## 2026-09-12 plan\nx\n\n', { ...entry, lines: [] }),
    '# LOG\n\n## 2026-09-12 plan\nx\n\n## 2026-09-13 L2 state\n',
  );
});

test('appendLog refuses entries that break the format', () => {
  const entry = { date: '2026-09-13', layer: 'L2 state', lines: ['a'] };
  assert.throws(() => appendLog('', { ...entry, lines: ['a', 'b', 'c', 'd'] }), /3行まで（4行）/);
  assert.throws(() => appendLog('', { ...entry, layer: ' ' }), /層名/);
  for (const date of ['2026/09/13', '2026-13-01', '2026-00-01', '2026-09-00', '2026-09-32', '2026-09-31', '2026-02-29', '2100-02-29']) {
    assert.throws(() => appendLog('', { ...entry, date }), /YYYY-MM-DD/, date);
  }
  for (const date of ['2028-02-29', '2000-02-29', '2026-12-31']) assert.doesNotThrow(() => appendLog('', { ...entry, date }), date);
  assert.throws(() => appendLog('', { ...entry, lines: ['## 2026-09-14 fake'] }), /## /);
});

test('parseLog and lastLog return entries with their lines', () => {
  const log = '# LOG\n\nintro\n\n## 2026-09-12 plan\nold\n\n## 2026-09-13 L1 scaffold\r\na\r\n\r\nb\r\n';
  assert.deepEqual(parseLog(log), [
    { date: '2026-09-12', layer: 'plan', lines: ['old'] },
    { date: '2026-09-13', layer: 'L1 scaffold', lines: ['a', 'b'] },
  ]);
  assert.deepEqual(lastLog(log), { date: '2026-09-13', layer: 'L1 scaffold', lines: ['a', 'b'] });
  assert.deepEqual(parseLog('# LOG\n'), []);
  assert.equal(lastLog('# LOG\n'), undefined);
});

test('isMonth, requireMonth, logMonth, and logMonths read months as YYYY-MM with a month from 01 to 12', () => {
  for (const value of ['2026-01', '2026-09', '2026-12']) assert.ok(isMonth(value), value);
  for (const value of ['2026-9', '2026-09-01', ' 2026-09', '2026-13', '2026-00', '../x', '']) assert.ok(!isMonth(value), value);
  assert.equal(requireMonth('2026-09'), '2026-09');
  assert.throws(() => requireMonth('2026-13'), /^Error: 月は YYYY-MM: 2026-13$/);
  assert.equal(logMonth({ date: '2026-08-31', layer: 'L1', lines: [] }), '2026-08');
  assert.deepEqual(logMonths(parseLog('# LOG\n\n## 2026-09-01 b\n## 2026-07-02 a\n## 2026-09-03 c\n')), ['2026-07', '2026-09']);
  assert.deepEqual(logMonths([]), []);
});

const ROTATING = [
  '# LOG',
  '',
  'intro',
  '',
  '## 2026-07-30 L1',
  '  - nested',
  '',
  'a',
  '',
  '## 2026-09-01 L2',
  'b',
  '',
  '##  2026-08-02   L3  ',
  'c',
  '',
  '',
  '## 2026-13-01 typo',
  'x',
  '## 2026-08-03 L4',
  'd',
  '',
].join('\n');

test('rotateLog moves entries of months before the given one wherever they are, as LOG.md has them, and keeps the rest', () => {
  const { kept, moved } = rotateLog(ROTATING, '2026-09');
  assert.equal(kept, '# LOG\n\nintro\n\n## 2026-09-01 L2\nb\n\n## 2026-13-01 typo\nx\n## 2026-08-03 L4\nd\n');
  assert.deepEqual(moved, [
    { entry: { date: '2026-07-30', layer: 'L1', lines: ['- nested', 'a'] }, lines: ['## 2026-07-30 L1', '  - nested', '', 'a'] },
    { entry: { date: '2026-08-02', layer: 'L3', lines: ['c'] }, lines: ['##  2026-08-02   L3  ', 'c'] },
  ]);
  assert.deepEqual(parseLog(kept).at(-1), parseLog(ROTATING).at(-1));
});

test('rotateLog keeps CRLF, moves nothing without an older entry or with one entry, and refuses a month not YYYY-MM', () => {
  const crlf = '# LOG\r\n\r\n## 2026-08-01 L1\r\na\r\n\r\n## 2026-09-01 L2\r\nb\r\n';
  assert.deepEqual(rotateLog(crlf, '2026-09'), {
    kept: '# LOG\r\n\r\n## 2026-09-01 L2\r\nb\r\n',
    moved: [{ entry: { date: '2026-08-01', layer: 'L1', lines: ['a'] }, lines: ['## 2026-08-01 L1', 'a'] }],
  });
  const one = '# LOG\n\n## 2026-01-01 L1\na\n';
  assert.deepEqual(rotateLog(one, '2026-09'), { kept: one, moved: [] });
  assert.deepEqual(rotateLog(crlf, '2026-08'), { kept: crlf, moved: [] });
  assert.deepEqual(rotateLog('', '2026-09'), { kept: '', moved: [] });
  for (const month of ['2026-9', '2026-13']) assert.throws(() => rotateLog(crlf, month), new RegExp(`^Error: 月は YYYY-MM: ${month}$`));
});

test('rotateLog keeps the last milestone whatever its month, so brief still finds it, and moves earlier ones', () => {
  const log = '# LOG\n\n## 2026-06-01 節目\nold\n\n## 2026-07-01  節目 \nnew\n\n## 2026-08-01 L1\na\n\n## 2026-09-01 L2\nb\n';
  const { kept, moved } = rotateLog(log, '2026-10');
  assert.equal(kept, '# LOG\n\n## 2026-07-01  節目 \nnew\n\n## 2026-09-01 L2\nb\n');
  assert.deepEqual(moved.map(({ entry }) => entry.date), ['2026-06-01', '2026-08-01']);
  assert.deepEqual(lastMilestone(kept), lastMilestone(log));
  const last = '# LOG\n\n## 2026-07-01 節目\nx\n\n## 2026-08-01 節目\ny\n';
  assert.deepEqual(rotateLog(last, '2026-10').moved.map(({ entry }) => entry.date), ['2026-07-01']);
});

test('archiveLog starts a missing or blank archive with its heading and appends blocks as they are in its line break', () => {
  const blocks = rotateLog(ROTATING, '2026-09').moved;
  assert.equal(archiveLog(undefined, '2026-07', blocks.slice(0, 1)), '# LOG 2026-07\n\n## 2026-07-30 L1\n  - nested\n\na\n');
  assert.equal(archiveLog(' \n', '2026-08', blocks.slice(1), '\r\n'), '# LOG 2026-08\r\n\r\n##  2026-08-02   L3  \r\nc\r\n');
  assert.equal(archiveLog('# LOG 2026-08\r\n\r\n## 2026-08-01 L0\r\nz', '2026-08', blocks.slice(1)), '# LOG 2026-08\r\n\r\n## 2026-08-01 L0\r\nz\r\n\r\n##  2026-08-02   L3  \r\nc\r\n');
  assert.equal(archiveLog('# LOG 2026-08\n', '2026-08', []), '# LOG 2026-08\n');
  assert.throws(() => archiveLog(undefined, '../2026-08', blocks), /^Error: 月は YYYY-MM: \.\.\/2026-08$/);
});

test('appendedEntries reads what archiveLog appended and refuses any other change', () => {
  const blocks = rotateLog(ROTATING, '2026-09').moved;
  const head = '# LOG 2026-08\n\n## 2026-08-01 L0\nz';
  const entry = (text: string) => parseLog(text);
  assert.deepEqual(appendedEntries(head, archiveLog(head, '2026-08', blocks.slice(1))), entry('## 2026-08-02 L3\nc\n'));
  assert.deepEqual(appendedEntries(head, `${head}\n`), []);
  assert.deepEqual(appendedEntries(head, head), []);
  assert.deepEqual(appendedEntries(undefined, '# LOG 2026-08\n\n## 2026-08-01 L0\nz\n'), entry('## 2026-08-01 L0\nz\n'));
  assert.deepEqual(appendedEntries(' \n', '# LOG 2026-08\n'), []);
  assert.deepEqual(appendedEntries(`${head}\r\n`, `${head}\r\n\r\n## 2026-08-02 L3\r\nc\r\n`), entry('## 2026-08-02 L3\nc\n'));
  for (const after of ['# LOG 2026-08\n', `${head}more\n`, `${head}\nmore\n## 2026-08-02 L3\n`, `# Log 2026-08\n\n## 2026-08-01 L0\nz\n`]) {
    assert.equal(appendedEntries(head, after), undefined, after);
  }
});

test('removedEntries reads what rotateLog removed and refuses any other change', () => {
  const { kept } = rotateLog(ROTATING, '2026-09');
  assert.deepEqual(removedEntries(ROTATING, kept), [
    { date: '2026-07-30', layer: 'L1', lines: ['- nested', 'a'] },
    { date: '2026-08-02', layer: 'L3', lines: ['c'] },
  ]);
  assert.deepEqual(removedEntries(ROTATING, ROTATING), []);
  assert.deepEqual(removedEntries(ROTATING.replace(/\n/g, '\r\n'), kept), removedEntries(ROTATING, kept));
  assert.deepEqual(removedEntries('', ''), []);
  const edits = [
    ROTATING.replace('intro', 'Intro'),
    `${ROTATING}## 2026-09-15 L5\ne\n`,
    kept.replace('b\n', 'b\nmore\n'),
    ROTATING.replace('  - nested\n', ''),
    '',
  ];
  for (const after of edits) assert.equal(removedEntries(ROTATING, after), undefined, after);
});

test('nextStatus tells a finished layer and a layer left unclosed before NEXT.md', () => {
  const items = parsePlan('- [x] L1 — a\n- [ ] L2 — b\n- [ ] L3 — c\n');
  assert.deepEqual(nextStatus('L2', items), { state: 'ok' });
  assert.deepEqual(nextStatus('spec', items), { state: 'ok' });
  assert.deepEqual(nextStatus('L1', items), { state: 'done' });
  assert.deepEqual(nextStatus('L3', items), { state: 'skipped', unfinished: { layer: 'L2', condition: 'b', done: false } });
});

test('nextStatus puts plan after every layer, so an unchecked layer before it was never closed', () => {
  const last = parsePlan('- [x] L1 — a\n- [ ] L2 — b\n');
  assert.deepEqual(nextStatus('plan', last), { state: 'skipped', unfinished: { layer: 'L2', condition: 'b', done: false } });
  assert.deepEqual(nextStatus('plan', parsePlan('- [ ] L1 — a\n')), { state: 'skipped', unfinished: { layer: 'L1', condition: 'a', done: false } });
  assert.deepEqual(nextStatus('plan', parsePlan('- [x] L1 — a\n')), { state: 'ok' });
  assert.deepEqual(nextStatus('plan', []), { state: 'ok' });
  assert.deepEqual(nextStatus('spec', last), { state: 'ok' });
  assert.deepEqual(nextStatus('L9', last), { state: 'ok' });
});

test('nextStatus never takes a phase for a PLAN layer of the same name', () => {
  const named = parsePlan('- [x] spec — a\n- [x] plan — b\n- [ ] L3 — c\n');
  assert.deepEqual(nextStatus('spec', named), { state: 'ok' });
  assert.deepEqual(nextStatus('plan', named), { state: 'skipped', unfinished: { layer: 'L3', condition: 'c', done: false } });
});

test('validatePlan reports repeated layer names and layers named like a phase or a milestone, once each', () => {
  assert.deepEqual(validatePlan(PLAN), []);
  assert.deepEqual(validatePlan(''), []);
  assert.deepEqual(validatePlan('- [x] L1 — a\n- [ ] L1 — b\n- [ ] L1\n- [ ] plan — c\n- [x] spec\n- [ ] Plan — d\n- [ ] 節目 — e\n- [x] 節目\n'), [
    'PLAN.md の層「L1」が重複',
    'PLAN.md の層名「plan」がフェーズ名と同じ',
    'PLAN.md の層名「spec」がフェーズ名と同じ',
    'PLAN.md の層名「節目」が LOG の節目と同じ',
  ]);
});

test('validatePlan reports an empty layer name or one with control characters, with its line number', () => {
  const [nextLine, lineSeparator] = [String.fromCharCode(0x85), String.fromCharCode(0x2028)];
  assert.deepEqual(validatePlan(`# PLAN\n\n- [ ] \n- [ ] L1\tx — a\n- [ ] L2${nextLine} — b\n- [ ] L3 — c\n`), [
    'PLAN.md の3行目の層名が空',
    'PLAN.md の4行目の層名に制御文字がある',
    'PLAN.md の5行目の層名に制御文字がある',
  ]);
  assert.deepEqual(validatePlan(`- [x] L1${lineSeparator}x\n`), ['PLAN.md の1行目の層名に制御文字がある']);
  assert.deepEqual(validatePlan('- [ ] L1 — a\r\n- [ ] \r\n'), ['PLAN.md の2行目の層名が空']);
  // Two empty names are two lines to fix, not a repeated layer name.
  assert.deepEqual(validatePlan('- [ ] \n- [ ] \n'), ['PLAN.md の1行目の層名が空', 'PLAN.md の2行目の層名が空']);
});

test('parsePlan, markDone, and validatePlan ignore checklist items inside code fences', () => {
  const text = ['# PLAN', '', '- [ ] L1 real — a', '', '```markdown', '- [ ] 例 — b', '```', '', '   ~~~', '- [x] 節目 — c', '   ~~~', '- [ ] L4 real — d', ''].join('\n');
  assert.deepEqual(parsePlan(text).map((item) => item.layer), ['L1 real', 'L4 real']);
  assert.deepEqual(validatePlan(text), []);
  assert.throws(() => markDone(text, '例'), /PLAN.md に層「例」がない/);
  assert.equal(markDone(text, 'L4 real'), text.replace('- [ ] L4 real', '- [x] L4 real'));
  // A closing fence needs the same character and at least the opening length, so the items stay inside the block.
  assert.deepEqual(parsePlan('- [ ] L1 — a\n````\n- [ ] X — b\n~~~\n```\n- [ ] Y — c\n').map((item) => item.layer), ['L1']);
});

test('newlyDone lists layers checked only in the later PLAN', () => {
  const head = parsePlan('- [x] L1\n- [ ] L2\n- [ ] L3\n');
  const working = parsePlan('- [x] L1\n- [x] L2\n- [ ] L3\n- [x] L4\n');
  assert.deepEqual(newlyDone(head, working).map((item) => item.layer), ['L2', 'L4']);
  assert.deepEqual(newlyDone(working, head), []);
  assert.deepEqual(newlyDone([], head).map((item) => item.layer), ['L1']);
});

test('lastMilestone returns the last 節目 entry wherever it is, or undefined', () => {
  const log = '# LOG\n\n## 2026-09-10 節目\nSPEC を書いた\n\n## 2026-09-12 節目\n12層に分けた\n未決: map\n\n## 2026-09-13 L1\na\n';
  assert.deepEqual(lastMilestone(log), { date: '2026-09-12', layer: '節目', lines: ['12層に分けた', '未決: map'] });
  assert.equal(lastMilestone('# LOG\n\n## 2026-09-13 L1 節目\na\n'), undefined);
  assert.equal(lastMilestone(''), undefined);
});

test('daysBetween counts whole days rounded down, and 0 when the end is not later', () => {
  const from = new Date(2026, 8, 12, 18, 0);
  assert.equal(daysBetween(from, new Date(2026, 8, 15, 17, 59)), 2);
  assert.equal(daysBetween(from, new Date(2026, 8, 15, 18, 0)), 3);
  assert.equal(daysBetween(from, from), 0);
  assert.equal(daysBetween(from, new Date(2026, 8, 1)), 0);
});

test('formatDate pads month and day in local time', () => {
  assert.equal(formatDate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(formatDate(new Date(2026, 11, 31)), '2026-12-31');
});
