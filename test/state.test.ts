import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendLog,
  appendedEntries,
  archiveLog,
  checkMismatch,
  contentLines,
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
  missingConditions,
  newlyDone,
  nextLayer,
  nextStatus,
  parseLog,
  parseNext,
  parsePlan,
  planLayers,
  printable,
  removedEntries,
  requireMonth,
  rotateLog,
  specUnwritten,
  validateNext,
  validatePlan,
  validateSpec,
  type Next,
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
  // By code point: NBSP and the soft hyphen, the two printable characters just above U+009F, are invisible in a source file.
  const latin1 = `a${String.fromCharCode(0xa0)}b${String.fromCharCode(0xad)}c${String.fromCharCode(0xff)}d`;
  assert.equal(printable(latin1), latin1);
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

test('planLayers gives each item its line number and skips items inside code fences', () => {
  assert.deepEqual(planLayers(PLAN), [
    { item: { layer: 'L1 scaffold', condition: 'build が通る', done: true }, line: 3 },
    { item: { layer: 'L2 state', condition: '9関数 — テストあり', done: false }, line: 4 },
    { item: { layer: 'L3 io', condition: '', done: false }, line: 5 },
  ]);
  // Fence lines and the lines inside them are not items, but they still count toward the line numbers after them.
  const text = ['- [ ] L1 — a', '```markdown', '- [ ] X — b', '```', '', '- [x] L2 — c', ''].join('\r\n');
  assert.deepEqual(planLayers(text), [
    { item: { layer: 'L1', condition: 'a', done: false }, line: 1 },
    { item: { layer: 'L2', condition: 'c', done: true }, line: 6 },
  ]);
  assert.deepEqual(planLayers('- [ ] L1 — a\n~~~\n- [ ] X — b\n'), [{ item: { layer: 'L1', condition: 'a', done: false }, line: 1 }]);
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
  const spec = [
    `##${spaces}原則${spaces}`,
    `- P${'1'.repeat(200_000)}x 名前 — 文`,
    `-${spaces}P1${spaces}名前${spaces}—${spaces}文`,
    '<!-- a -->'.repeat(50_000),
    `<!--${spaces}`,
    `${spaces}- A1`,
  ];
  validateSpec(spec.join('\n'));
  specUnwritten(`${'<!--'.repeat(100_000)}\n${spaces}#`);
  specUnwritten(`${'<!-- a -->'.repeat(50_000)}${spaces}\n${spaces}<!--${spaces}-->${spaces}\n#${spaces}x`);
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
  assert.deepEqual(appendedEntries(head, archiveLog(head, '2026-08', blocks.slice(1)), '2026-08'), entry('## 2026-08-02 L3\nc\n'));
  assert.deepEqual(appendedEntries(head, `${head}\n`, '2026-08'), []);
  assert.deepEqual(appendedEntries(head, head, '2026-08'), []);
  assert.deepEqual(appendedEntries(undefined, '# LOG 2026-08\n\n## 2026-08-01 L0\nz\n', '2026-08'), entry('## 2026-08-01 L0\nz\n'));
  assert.deepEqual(appendedEntries(' \n', '# LOG 2026-08\n', '2026-08'), []);
  assert.deepEqual(appendedEntries(`${head}\r\n`, `${head}\r\n\r\n## 2026-08-02 L3\r\nc\r\n`, '2026-08'), entry('## 2026-08-02 L3\nc\n'));
  for (const after of ['# LOG 2026-08\n', `${head}more\n`, `${head}\nmore\n## 2026-08-02 L3\n`, `# Log 2026-08\n\n## 2026-08-01 L0\nz\n`]) {
    assert.equal(appendedEntries(head, after, '2026-08'), undefined, after);
  }
});

test('appendedEntries takes a new archive only under the heading archiveLog writes for that month', () => {
  const entries = '## 2026-08-01 L0\nz\n';
  const parsed = parseLog(entries);
  assert.deepEqual(appendedEntries(undefined, `# LOG 2026-08\n\n${entries}`, '2026-08'), parsed);
  assert.deepEqual(appendedEntries(' \n', `# LOG 2026-08\r\n\r\n${entries}`, '2026-08'), parsed);
  // Anything else before the entries is text no rotate wrote, so the file is not one a stopped rotate left. An indented
  // heading is one of them: archiveLog writes the heading at the start of the line.
  const other = ['', '# LOG 2026-07', '# LOG 2026-08 x', '# log 2026-08', ' # LOG 2026-08', 'note\n# LOG 2026-08', entries.trimEnd()];
  for (const preamble of other) assert.equal(appendedEntries(undefined, `${preamble}\n\n${entries}`, '2026-08'), undefined, preamble);
  // The heading alone is what archiveLog writes before the first block, so it reads back as no entry rather than as a change.
  assert.deepEqual(appendedEntries(undefined, '# LOG 2026-08\n', '2026-08'), []);
  assert.throws(() => appendedEntries(undefined, '# LOG 2026-8\n', '2026-8'), /^Error: 月は YYYY-MM: 2026-8$/);
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

test('nextStatus puts plan and converge after every layer, so an unchecked layer before them was never closed', () => {
  const last = parsePlan('- [x] L1 — a\n- [ ] L2 — b\n');
  for (const phase of ['plan', 'converge']) {
    assert.deepEqual(nextStatus(phase, last), { state: 'skipped', unfinished: { layer: 'L2', condition: 'b', done: false } }, phase);
    assert.deepEqual(
      nextStatus(phase, parsePlan('- [ ] L1 — a\n')),
      { state: 'skipped', unfinished: { layer: 'L1', condition: 'a', done: false } },
      phase,
    );
    assert.deepEqual(nextStatus(phase, parsePlan('- [x] L1 — a\n')), { state: 'ok' }, phase);
    assert.deepEqual(nextStatus(phase, []), { state: 'ok' }, phase);
  }
  assert.deepEqual(nextStatus('Converge', last), { state: 'ok' });
  assert.deepEqual(nextStatus('spec', last), { state: 'ok' });
  assert.deepEqual(nextStatus('L9', last), { state: 'ok' });
});

test('nextStatus never takes a phase for a PLAN layer of the same name', () => {
  const named = parsePlan('- [x] spec — a\n- [x] plan — b\n- [x] converge — c\n- [ ] L4 — d\n');
  const unfinished = { state: 'skipped', unfinished: { layer: 'L4', condition: 'd', done: false } };
  assert.deepEqual(nextStatus('spec', named), { state: 'ok' });
  assert.deepEqual(nextStatus('plan', named), unfinished);
  assert.deepEqual(nextStatus('converge', named), unfinished);
});

test('validatePlan reports repeated layer names and layers named like a phase or a milestone, once each', () => {
  assert.deepEqual(validatePlan(PLAN), []);
  assert.deepEqual(validatePlan(''), []);
  const plan = '- [x] L1 — a\n- [ ] L1 — b\n- [ ] L1\n- [ ] plan — c\n- [x] spec\n- [ ] Plan — d\n- [ ] converge — f\n- [ ] 節目 — e\n- [x] 節目\n';
  assert.deepEqual(validatePlan(plan), [
    'PLAN.md の層「L1」が重複',
    'PLAN.md の層名「plan」がフェーズ名と同じ',
    'PLAN.md の層名「spec」がフェーズ名と同じ',
    'PLAN.md の層名「converge」がフェーズ名と同じ',
    'PLAN.md の層名「節目」が LOG の節目と同じ',
  ]);
});

const SPEC = [
  '# SPEC',
  '',
  '## 原則',
  '<!-- 7行まで -->',
  '- P1 テスト先行 — 実装より先にテストを書く',
  '',
  '- P2 依存ゼロ — node:* だけを使う',
  '<!-- a --> <!-- b -->',
  '```',
  '- 例: フェンスの中は行に数えない',
  '```',
  '## 目的',
  '自由な文。',
  '## 受け入れ基準',
  '前置きの文。',
  '- A1 `soujo resume` が4行を出す',
  '  - 字下げした項目はキーを持たなくてよい',
  '  続きの行',
  '1. A2 番号付きの項目',
  '### 小見出し',
  '- A3 小見出しの後も同じ節',
  '# 別の文書',
  '- 見出しの外',
  '',
].join('\n');

test('validateSpec accepts keyed principles and criteria, and a SPEC without their headings', () => {
  assert.deepEqual(validateSpec(SPEC), []);
  assert.deepEqual(validateSpec(SPEC.replace(/\n/g, '\r\n')), []);
  assert.deepEqual(validateSpec(''), []);
  // Headings of another name or level, in a code fence, or in English are not the keyed sections.
  const unchecked = ['## Principles', '- x', '### 原則', '- x', '# 原則', '- x', '```', '## 原則', '- x', '```', '## 原則について', '- x'];
  assert.deepEqual(validateSpec(unchecked.join('\n')), []);
  const principles = Array.from({ length: 7 }, (_, index) => `- P${index + 1} 名前 — 文`);
  assert.deepEqual(validateSpec(['##  原則  ', ...principles, '<!-- a -->', ''].join('\n')), []);
});

test('validateSpec names each principle out of form by its line', () => {
  const lines = [
    '## 原則',
    '- P1 名前 — 文',
    '- P2 名前のみ',
    '- P3 — 名前がない',
    '- P4 文がない —',
    '- A5 別の節のキー — 文',
    '- P0 ゼロ — 文',
    '- P06 先頭の0 — 文',
    '- 名前 — キーがない',
    '  - P8 字下げ — 文',
    '-P9 空白がない — 文',
    '自由な文',
    '### 小見出し',
    '<!-- 2行の',
    'コメント -->',
    '1. P11 番号 — 文',
    '* P12 別の記号 — 文',
    '- P13 別の区切り -- 文',
    '- P14 名前 - 文',
    '<!-- a --> 本文 <!-- b -->',
    '<!-- a --> <!-- 閉じない',
    '- P10 区切りの後の — は文の一部 — 文',
  ];
  const outOfForm = (line: number) => `SPEC.md の${line}行目が原則の形（- P<n> <名前> — <1文>）でない`;
  assert.deepEqual(validateSpec(lines.join('\n')), [
    'SPEC.md の原則が7行を超えている（21行）',
    ...Array.from({ length: 19 }, (_, index) => outOfForm(index + 3)),
  ]);
  // Text beside a comment is a line, so that it neither hides a principle out of form nor escapes the count.
  const seven = Array.from({ length: 7 }, (_, index) => `- P${index + 1} 名前 — 文`);
  assert.deepEqual(validateSpec(['## 原則', ...seven, '<!-- a --> 本文'].join('\n')), [
    'SPEC.md の原則が7行を超えている（8行）',
    outOfForm(9),
  ]);
});

test('validateSpec names unkeyed criteria and repeated keys by their line', () => {
  const lines = [
    '## 受け入れ基準',
    '- A1 基準',
    '- キーがない',
    '+ P1 原則のキー',
    '2) A1 重複',
    '-',
    '- A1',
    '  - A1 字下げした項目は数えない',
    '## 原則',
    '- P1 名前 — 文',
    '- P1 名前 — 重複',
    '- P1 形が違っても重複',
    '  - P1 字下げしても重複',
    '* P2 記号が違う',
    '## 受け入れ基準',
    '- A2 同じ名前の節は続き',
    '- A2 重複',
  ];
  const outOfForm = (line: number) => `SPEC.md の${line}行目が原則の形（- P<n> <名前> — <1文>）でない`;
  assert.deepEqual(validateSpec(lines.join('\n')), [
    'SPEC.md の3行目の受け入れ基準にキー（A<n>）がない',
    'SPEC.md の4行目の受け入れ基準にキー（A<n>）がない',
    'SPEC.md の5行目のキー「A1」が重複',
    'SPEC.md の6行目の受け入れ基準にキー（A<n>）がない',
    'SPEC.md の7行目のキー「A1」が重複',
    'SPEC.md の11行目のキー「P1」が重複',
    outOfForm(12),
    'SPEC.md の12行目のキー「P1」が重複',
    outOfForm(13),
    'SPEC.md の13行目のキー「P1」が重複',
    outOfForm(14),
    'SPEC.md の17行目のキー「A2」が重複',
  ]);
});

test('specUnwritten takes a SPEC of nothing but headings, blank lines, and HTML comments for unwritten', () => {
  const unwritten = [
    '',
    '\n\n',
    // The template before principles and keys.
    '# SPEC\n\n## 目的\n\n## やらないこと\n\n## 受け入れ基準\n\n## 技術判断\n',
    '# SPEC\r\n\r\n## 原則\r\n<!-- - P1 <名前> — <1文> -->\r\n',
    '# SPEC\n<!-- 複数行の\n\n本文 --> <!-- b -->\n   ### 字下げ3つの見出し\n#\n## 原則 <!-- a -->\n',
    '   <!-- 字下げ3つ --><!-- c\n    続き -->   <!-- d -->\n',
    '﻿# SPEC\n\n## 原則\n',
    '# SPEC\r\r## 目的\r',
    // A heading is a heading whatever it holds: no comment runs on from it, so the next line is read on its own.
    '# SPEC <!-- 閉じない\n## 目的\n',
  ];
  for (const text of unwritten) assert.equal(specUnwritten(text), true, JSON.stringify(text));
  const written = [
    '# SPEC\n目的\n',
    '## 目的\n- 書いた\n',
    '# SPEC\n<!-- 閉じない\n## 目的\n',
    '# SPEC\n<!-- a --> 本文\n',
    '<!-- a\n--> 本文\n',
    '# SPEC<!--\n-->本文\n',
    '# SPEC\n`<!--` の書き方\n-->\n',
    '#タイトル\n',
    '    # 字下げ4つはコード\n',
    '    <!-- 字下げ4つはコード -->\n',
    '\t<!-- タブもコード -->\n',
    '```\n# コメント\n```\n',
    '## 目的\n---\n',
    // A setext heading, which no template writes.
    'SPEC\n====\n',
    '# SPEC\r本文\r',
    '﻿本文\n',
  ];
  for (const text of written) assert.equal(specUnwritten(text), false, JSON.stringify(text));
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

test('validatePlan reports a code fence left open, which hides every layer after it', () => {
  const text = ['- [ ] L1 — a', '```markdown', '- [ ] X — b', '- [ ] Y — c', ''].join('\n');
  assert.deepEqual(parsePlan(text).map((item) => item.layer), ['L1']);
  assert.deepEqual(validatePlan(text), ['PLAN.md の2行目のコードフェンスが閉じていない（以降の層が読まれない）']);
  // A closing fence that is shorter or of the other character leaves the first one open.
  assert.deepEqual(validatePlan('- [ ] L1 — a\n````\n- [ ] X — b\n~~~\n```\n'), [
    'PLAN.md の2行目のコードフェンスが閉じていない（以降の層が読まれない）',
  ]);
  // The problem comes first: without it, the missing layers have no explanation.
  assert.deepEqual(validatePlan('- [ ] \n~~~\n'), [
    'PLAN.md の2行目のコードフェンスが閉じていない（以降の層が読まれない）',
    'PLAN.md の1行目の層名が空',
  ]);
  assert.deepEqual(validatePlan('```\n- [ ] X — b\n```\n- [ ] L1 — a\n'), []);
});

test('a code fence line ending in a line separator is still read as a fence', () => {
  const lineSeparator = String.fromCharCode(0x2028);
  const text = `- [ ] L1 — a\n\`\`\`ts${lineSeparator}\n- [ ] X — b\n`;
  assert.deepEqual(parsePlan(text).map((item) => item.layer), ['L1']);
  assert.deepEqual(validatePlan(text), ['PLAN.md の2行目のコードフェンスが閉じていない（以降の層が読まれない）']);
});

test('what opens and closes a fence: indent, info string, line break, and the backtick rule', () => {
  // Four spaces is an indented code block, not a fence, so neither line is one and the item between them stays a layer.
  assert.deepEqual(parsePlan('    ```\n- [ ] L1 — a\n    ```\n').map((item) => item.layer), ['L1']);
  // A fence opened at three spaces is not closed by one indented four, so the layer after it stays hidden.
  assert.deepEqual(validatePlan('   ~~~\n- [ ] X — b\n    ~~~\n- [ ] L1 — a\n'), [
    'PLAN.md の1行目のコードフェンスが閉じていない（以降の層が読まれない）',
  ]);
  // Only an opening fence takes an info string; the same line does not close one.
  assert.deepEqual(validatePlan('~~~\n- [ ] X — b\n~~~ x\n- [ ] L1 — a\n'), [
    'PLAN.md の1行目のコードフェンスが閉じていない（以降の層が読まれない）',
  ]);
  // CRLF: the carriage return is not what follows a closing fence.
  assert.deepEqual(parsePlan('```\r\n- [ ] X — b\r\n```\r\n- [ ] L1 — a\r\n').map((item) => item.layer), ['L1']);
  // A backtick fence's info string cannot hold a backtick (CommonMark), so an inline-code line does not open one.
  assert.deepEqual(parsePlan('``` `code` ```\n- [ ] L1 — a\n').map((item) => item.layer), ['L1']);
  assert.deepEqual(parsePlan('~~~ `code` ~~~\n- [ ] L1 — a\n').map((item) => item.layer), []);
  // A closing fence may still have spaces or tabs after its marker.
  assert.deepEqual(parsePlan('```\n- [ ] X — b\n``` \t \n- [ ] L1 — a\n').map((item) => item.layer), ['L1']);
});

test('a long line that is not a backtick fence is refused without rescanning it', () => {
  // The info string and a `[ \t]*` before it would share the spaces, taking seconds over a line this long.
  const line = `\`\`\`${' '.repeat(40_000)}\``;
  const start = process.hrtime.bigint();
  assert.deepEqual(parsePlan(`${line}\n- [ ] L1 — a\n`).map((item) => item.layer), ['L1']);
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  assert.ok(ms < 1000, `${ms}ms`);
});

test('an item indented like a code block, or inside an HTML comment, is still a layer', () => {
  // A fence is the only container of examples PLAN.md has (SPEC §決定): neither form hides an item from the commands.
  const indented = '- [ ] L1 — a\n\n        - [ ] 例 — b\n';
  assert.deepEqual(parsePlan(indented).map((item) => item.layer), ['L1', '例']);
  assert.deepEqual(validatePlan(`${indented}- [ ] 例 — c\n`), ['PLAN.md の層「例」が重複']);
  assert.equal(markDone(indented, '例'), indented.replace('- [ ] 例', '- [x] 例'));

  const commented = '- [ ] L1 — a\n<!--\n- [ ] 例 — b\n-->\n';
  assert.deepEqual(parsePlan(commented).map((item) => item.layer), ['L1', '例']);
  assert.equal(markDone(commented, '例'), commented.replace('- [ ] 例', '- [x] 例'));
});

test('markDone checks the layer outside a fence, not a line of the same name inside one', () => {
  const text = ['```', '- [ ] L1 — example', '```', '- [ ] L1 — a', ''].join('\n');
  assert.equal(markDone(text, 'L1'), text.replace('- [ ] L1 — a', '- [x] L1 — a'));
});

test('validatePlan reports a layer name repeated through control characters, without a second run', () => {
  const tab = '\t';
  assert.deepEqual(validatePlan(`- [ ] L1${tab}x — a\n- [ ] L1${tab}x — b\n`), [
    'PLAN.md の1行目の層名に制御文字がある',
    'PLAN.md の2行目の層名に制御文字がある',
    'PLAN.md の層「L1 x」が重複',
  ]);
  assert.deepEqual(validatePlan(`- [ ] L1 x — a\n- [ ] L1${tab}x — b\n`), [
    'PLAN.md の2行目の層名に制御文字がある',
    'PLAN.md の層「L1 x」が重複',
  ]);
  // Names that print as nothing are each their own line to fix, like empty ones, not a repeat of 「」.
  const [nul, soh] = [String.fromCharCode(0), String.fromCharCode(1)];
  assert.deepEqual(validatePlan(`- [ ] ${nul}\n- [ ] ${soh}\n`), [
    'PLAN.md の1行目の層名に制御文字がある',
    'PLAN.md の2行目の層名に制御文字がある',
  ]);
});

test('missingConditions names the line of every layer left without a completion condition', () => {
  assert.deepEqual(missingConditions('- [x] L1 — a\n- [ ] L2 state\n- [ ] L3 io —\n'), [
    'PLAN.md の2行目の層「L2 state」に完了条件がない',
    'PLAN.md の3行目の層「L3 io」に完了条件がない',
  ]);
  // Names validatePlan already reports by line are left to it: neither could be quoted back here.
  assert.deepEqual(missingConditions(`- [ ] \n- [ ] L2\tstate\n`), []);
  assert.deepEqual(missingConditions('```\n- [ ] X\n```\n'), []);
});

test('checkMismatch names a 確認 that is not the completion condition PLAN gives the layer', () => {
  const next = parseNext(NEXT) as Next;
  const items = parsePlan('- [x] L1 scaffold — build\n- [ ] L2 state — test が通る\n');
  assert.equal(checkMismatch(next, items), 'NEXT.md の確認が PLAN の層「L2 state」の完了条件と違う（PLAN に合わせて soujo next set）');
  // Whitespace runs compare equal, control characters among them, so a condition re-spaced by hand is not a difference.
  assert.equal(checkMismatch(next, parsePlan('- [ ] L2 state —  npm\ttest  が通る \n')), undefined);
  assert.equal(checkMismatch(next, parsePlan('- [ ] L2 state — npm test が通る\r\n')), undefined);
  assert.equal(checkMismatch({ ...next, check: next.check.replace('npm test', 'npm\ttest') }, parsePlan('- [ ] L2 state — npm test が通る\n')), undefined);
  // Nothing to compare against: either phase, a layer PLAN does not have, and a layer left without a condition.
  for (const layer of ['spec', 'plan', 'converge', 'L9']) assert.equal(checkMismatch({ ...next, layer }, items), undefined, layer);
  assert.equal(checkMismatch(next, parsePlan('- [ ] L2 state\n')), undefined);
  assert.equal(checkMismatch(next, []), undefined);
  // A repeated layer name matches two conditions, so neither is the layer's: validatePlan names the repeat instead.
  assert.equal(checkMismatch(next, parsePlan('- [ ] L2 state — test が通る\n- [ ] L2 state — 別\n')), undefined);
});

test('contentLines drops only the final line break, so trailing blank lines count as lines', () => {
  assert.deepEqual(contentLines('a\nb\n'), ['a', 'b']);
  assert.deepEqual(contentLines('a\r\nb\r\n'), ['a', 'b']);
  assert.deepEqual(contentLines('a\n\n\n'), ['a', '', '']);
  for (const text of ['', '\n', ' \n \n']) assert.deepEqual(contentLines(text), [], JSON.stringify(text));
});

test('parseLog reads a heading whose layer name carries a line separator', () => {
  const lineSeparator = String.fromCharCode(0x2028);
  const log = `# LOG\n\n## 2026-09-13 L1\na\n\n## 2026-09-14 L2${lineSeparator}x\nb\n`;
  assert.deepEqual(parseLog(log).map((entry) => [entry.layer, entry.lines]), [
    ['L1', ['a']],
    [`L2${lineSeparator}x`, ['b']],
  ]);
});

test('a heading with a line separator in its layer name bounds an entry everywhere the boundary is used', () => {
  for (const odd of [0x2028, 0x2029].map((code) => `L2${String.fromCharCode(code)}x`)) {
    const log = `# LOG\n\n## 2026-07-01 ${odd}\nold\n\n## 2026-09-13 L3\nnew\n`;
    // rotateLog moves the old entry whole, leaving the last one, rather than taking "old" for part of the preamble.
    const { kept, moved } = rotateLog(log, '2026-09');
    assert.deepEqual(moved.map(({ entry, lines }) => [entry.layer, lines]), [[odd, [`## 2026-07-01 ${odd}`, 'old']]], odd);
    assert.equal(kept, '# LOG\n\n## 2026-09-13 L3\nnew\n');
    // The archive it writes reads back as that one entry, appended and removed as a whole.
    const archive = archiveLog(undefined, '2026-07', moved);
    assert.deepEqual(appendedEntries(undefined, archive, '2026-07')?.map((entry) => entry.layer), [odd], odd);
    assert.deepEqual(removedEntries(log, kept)?.map((entry) => entry.layer), [odd], odd);
    // And appendLog still refuses a body line of that shape, so no entry can be written that splits another.
    assert.throws(() => appendLog('', { date: '2026-09-13', layer: 'L1', lines: [`## 2026-09-14 ${odd}`] }), /見出しの形/);
  }
  // A CR before the layer name is part of the whitespace after the date, as it was.
  assert.deepEqual(parseLog('## 2026-09-13 \rL1\nx\n').map((entry) => entry.layer), ['L1']);
});

test('parsePlan reads a layer whose separator has no completion condition after it', () => {
  for (const separator of ['—', '–', '--', '-']) {
    assert.deepEqual(parsePlan(`- [ ] L2 state ${separator}\n`), [{ layer: 'L2 state', condition: '', done: false }], separator);
  }
  assert.deepEqual(parsePlan('- [x] L1 —\r\n'), [{ layer: 'L1', condition: '', done: true }]);
  assert.equal(markDone('- [ ] L2 state —\n', 'L2 state'), '- [x] L2 state —\n');
  // A separator with no layer name before it is part of the name, as it was.
  assert.deepEqual(parsePlan('- [ ] —\n- [ ] - x\n').map((item) => item.layer), ['—', '- x']);
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

test('daysBetween counts local calendar days, and 0 when the end is not on a later date', () => {
  const from = new Date(2026, 8, 12, 18, 0);
  assert.equal(daysBetween(from, new Date(2026, 8, 15, 0, 0)), 3);
  assert.equal(daysBetween(from, new Date(2026, 8, 15, 23, 59)), 3);
  assert.equal(daysBetween(new Date(2026, 8, 12, 23, 0), new Date(2026, 8, 14, 1, 0)), 2);
  assert.equal(daysBetween(from, new Date(2026, 8, 12, 23, 59)), 0);
  assert.equal(daysBetween(from, from), 0);
  assert.equal(daysBetween(from, new Date(2026, 8, 1)), 0);
  // A daylight saving change in between, where the zone has one, is no fraction of a day.
  assert.equal(daysBetween(new Date(2026, 2, 1, 12), new Date(2026, 3, 1, 12)), 31);
  assert.equal(daysBetween(new Date(2026, 9, 1, 0, 30), new Date(2026, 10, 30, 23, 30)), 60);
});

test('validateNext and formatNext refuse a control character inside a value', () => {
  for (const char of ['\t', '\u0085', '\u0000', '\u007f']) {
    const text = NEXT.replace('L2 state', `L2${char}state`);
    assert.deepEqual(validateNext(text), ['「次」に制御文字がある'], JSON.stringify(char));
    assert.equal(parseNext(text), undefined);
    assert.throws(() => formatNext({ layer: `L2${char}state`, premise: 'p', check: 'c' }), /^Error: 「次」に制御文字がある$/);
  }
  assert.deepEqual(validateNext(NEXT.replace('L1 完了', 'L1\t完了').replace('なし', 'な\u009fし')), ['「前提」に制御文字がある', '「注意」に制御文字がある']);
  assert.throws(() => formatNext({ layer: 'L2', premise: 'p', check: 'c', caution: 'a\tb' }), /^Error: 「注意」に制御文字がある$/);
  // effort names its own problem, once.
  assert.deepEqual(validateNext(NEXT.replace('effort: medium', 'effort: med\tium')), ['effort は low|medium|high|xhigh のどれか: med\tium']);
  // At either end a tab is trimmed away, as spaces are.
  assert.deepEqual(validateNext(NEXT.replace('確認: ', '確認:\t')), []);
  assert.equal(formatNext({ layer: '\tL2\t', premise: 'p', check: 'c' }).split('\n')[0], '次: L2');
});

test('formatDate pads month and day in local time', () => {
  assert.equal(formatDate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(formatDate(new Date(2026, 11, 31)), '2026-12-31');
});
