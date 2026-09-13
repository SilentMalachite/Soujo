import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendLog,
  formatDate,
  formatNext,
  lastLog,
  markDone,
  nextLayer,
  parseNext,
  parsePlan,
  validateNext,
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

test('appendLog keeps the existing text as an exact prefix', () => {
  const entry = { date: '2026-09-13', layer: 'L1', lines: ['a'] };
  const block = '## 2026-09-13 L1\na\n';
  const cases: [string, string][] = [
    ['x  ', 'x  \n\n'],
    ['x\n', 'x\n\n'],
    ['x\n\n\n', 'x\n\n\n'],
    ['x\r\n', 'x\r\n\n'],
    ['x\r\n\r\n', 'x\r\n\r\n'],
  ];
  for (const [text, prefix] of cases) assert.equal(appendLog(text, entry), `${prefix}${block}`, JSON.stringify(text));
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
  assert.throws(() => appendLog('', { ...entry, date: '2026/09/13' }), /YYYY-MM-DD/);
  assert.throws(() => appendLog('', { ...entry, lines: ['## 2026-09-14 fake'] }), /## /);
});

test('lastLog returns the last entry with its lines, or undefined', () => {
  const log = '# LOG\n\n## 2026-09-12 plan\nold\n\n## 2026-09-13 L1 scaffold\na\n\nb\n';
  assert.deepEqual(lastLog(log), { date: '2026-09-13', layer: 'L1 scaffold', lines: ['a', 'b'] });
  assert.equal(lastLog('# LOG\n'), undefined);
});

test('formatDate pads month and day in local time', () => {
  assert.equal(formatDate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(formatDate(new Date(2026, 11, 31)), '2026-12-31');
});
