import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { logAdd, logRotate } from '../src/commands/log.js';
import { gitLastCommit, gitStatus } from '../src/git.js';
import { parseLog } from '../src/state.js';
import { commitAll, deadPid, project, repo, temp } from './helpers.js';

const NOW = new Date(2026, 8, 13, 10, 0);

test('log add appends a dated entry and reports its line count', (t) => {
  const dir = project(temp(t), { 'LOG.md': '# LOG\n' });
  assert.deepEqual(logAdd(dir, 'L4 init-plan-log', ['一行目', '二行目\n三行目'], NOW), [
    'LOG.md に追記: 2026-09-13 L4 init-plan-log（3行）',
  ]);
  assert.equal(
    readFileSync(join(dir, '.soujo', 'LOG.md'), 'utf8'),
    '# LOG\n\n## 2026-09-13 L4 init-plan-log\n一行目\n二行目\n三行目\n',
  );
});

test('log add creates LOG.md when it is missing', (t) => {
  const dir = project(temp(t));
  logAdd(dir, 'L1', ['a'], NOW);
  assert.equal(readFileSync(join(dir, '.soujo', 'LOG.md'), 'utf8'), '## 2026-09-13 L1\na\n');
});

test('log add removes temporary files a killed write left, one with its own process id included', (t) => {
  const dir = project(temp(t), { 'LOG.md': '# LOG\n' });
  const leftovers = [`.LOG.md.${process.pid}.tmp`, `.NEXT.md.${deadPid()}.tmp`].map((name) => join(dir, '.soujo', name));
  for (const path of leftovers) writeFileSync(path, 'half');
  logAdd(dir, 'L1', ['a'], NOW);
  assert.equal(readFileSync(join(dir, '.soujo', 'LOG.md'), 'utf8'), '# LOG\n\n## 2026-09-13 L1\na\n');
  assert.deepEqual(leftovers.filter((path) => existsSync(path)), []);
});

test('log add does not repeat the last entry while it is uncommitted, so re-running a line whose later command failed is safe', (t) => {
  const milestone = ['PLAN の全層完了: a', '未決: なし'];
  const outside = project(temp(t), { 'LOG.md': '# LOG\n' });
  logAdd(outside, '節目', milestone, NOW);
  assert.deepEqual(logAdd(outside, ' 節目 ', ['PLAN の全層完了: a ', '未決: なし'], NOW), [
    'LOG.md に同じエントリが未コミットであるので追記しない: 2026-09-13 節目',
  ]);
  assert.equal(state(outside, 'LOG.md'), '# LOG\n\n## 2026-09-13 節目\nPLAN の全層完了: a\n未決: なし\n');
  for (const [layer, lines, now] of [['節目', ['PLAN の全層完了: b', '未決: なし'], NOW], ['L1', milestone, NOW], ['節目', milestone, new Date(2026, 8, 14, 10, 0)]] as const) {
    assert.match(logAdd(outside, layer, [...lines], now)[0] ?? '', /^LOG\.md に追記: /);
  }

  const committed = project(repo(t), { 'LOG.md': '# LOG\n' });
  logAdd(committed, '節目', milestone, NOW);
  commitAll(committed);
  assert.match(logAdd(committed, '節目', milestone, NOW)[0] ?? '', /^LOG\.md に追記: /);
  assert.match(logAdd(committed, '節目', milestone, NOW)[0] ?? '', /^LOG\.md に同じエントリが未コミット/);
  assert.equal(parseLog(state(committed, 'LOG.md')).length, 2);

  // A git failure leaves HEAD unknown, as outside a repository: the entry is appended once and not repeated.
  const broken = project(repo(t), { 'LOG.md': '# LOG\n' });
  writeFileSync(join(broken, '.git', 'config'), '[broken\n');
  assert.match(logAdd(broken, '節目', milestone, NOW)[0] ?? '', /^LOG\.md に追記: /);
  assert.match(logAdd(broken, '節目', milestone, NOW)[0] ?? '', /^LOG\.md に同じエントリが未コミット/);
});

test('log add writes nothing when the lines are missing or too many', (t) => {
  const dir = project(temp(t), { 'LOG.md': '# LOG\n' });
  assert.throws(() => logAdd(dir, 'L1', [], NOW), /--line を1つ以上指定する/);
  assert.throws(() => logAdd(dir, 'L1', [' ', ''], NOW), /--line を1つ以上指定する/);
  assert.throws(() => logAdd(dir, 'L1', ['a', 'b', 'c', 'd'], NOW), /3行まで（4行）/);
  assert.equal(readFileSync(join(dir, '.soujo', 'LOG.md'), 'utf8'), '# LOG\n');
});

const SEPTEMBER = new Date(2026, 8, 15, 10, 0);
const ROTATING = [
  '# LOG',
  '',
  '## 2026-07-30 L1',
  'a',
  '',
  '## 2026-08-01 L2',
  'b1',
  '  - nested',
  '',
  'b2',
  '',
  '## 2026-09-01 L3',
  'c',
  '',
  '## 2026-08-20 L4',
  'd',
  '',
  '## 2026-09-10 L5',
  'e',
  '',
].join('\n');
const ROTATED = '# LOG\n\n## 2026-09-01 L3\nc\n\n## 2026-09-10 L5\ne\n';
const JULY = '# LOG 2026-07\n\n## 2026-07-30 L1\na\n';
const AUGUST_ENTRIES = '## 2026-08-01 L2\nb1\n  - nested\n\nb2\n\n## 2026-08-20 L4\nd\n';
const AUGUST = `# LOG 2026-08\n\n${AUGUST_ENTRIES}`;
const MOVED = 'LOG.md から3件を2書庫へ移動（2026-07〜2026-08）';
const SUBJECT = 'log: rotate 2026-07..2026-08';
const DIRTY = /^Error: 未コミットの変更がある（soujo layer done か soujo close で締めてから）$/;

function state(dir: string, file: string): string {
  return readFileSync(join(dir, '.soujo', file), 'utf8');
}

/** A committed Soujo project with the given state files. */
function logProject(t: TestContext, files: Parameters<typeof project>[1] = { 'LOG.md': ROTATING }): string {
  const dir = project(repo(t), files);
  commitAll(dir, 'layer: L5');
  return dir;
}

/** Makes commits fail until the returned function is called. */
function failCommits(dir: string): () => void {
  const hook = join(dir, '.git', 'hooks', 'pre-commit');
  writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  return () => rmSync(hook);
}

function commitLine(dir: string, subject: string = SUBJECT): string {
  return `コミット: ${gitLastCommit(dir)?.hash} ${subject}`;
}

test('log rotate moves entries of past months as LOG.md has them into one archive per month, keeps the rest, and commits', (t) => {
  const dir = logProject(t);
  const lines = logRotate(dir, undefined, SEPTEMBER);
  assert.deepEqual(lines, [MOVED, commitLine(dir)]);
  assert.equal(gitLastCommit(dir)?.subject, SUBJECT);
  assert.deepEqual([state(dir, 'LOG.md'), state(dir, 'LOG-2026-07.md'), state(dir, 'LOG-2026-08.md')], [ROTATED, JULY, AUGUST]);
  assert.deepEqual(gitStatus(dir), []);
  const hash = gitLastCommit(dir)?.hash;
  assert.deepEqual(logRotate(dir, undefined, SEPTEMBER), ['移動なし']);
  assert.equal(gitLastCommit(dir)?.hash, hash);
});

test('log rotate --before moves up to that month, keeps the last entry and dates naming no month, and appends to an archive', (t) => {
  const dir = logProject(t, { 'LOG.md': ROTATING, 'LOG-2026-08.md': '# LOG 2026-08\n\n## 2026-08-01 L0\nz\n' });
  assert.deepEqual(logRotate(dir, '2026-08', SEPTEMBER), ['LOG.md から1件を1書庫へ移動（2026-07）', commitLine(dir, 'log: rotate 2026-07')]);
  assert.deepEqual(logRotate(dir, '2026-10', SEPTEMBER), [
    'LOG.md から3件を2書庫へ移動（2026-08〜2026-09）',
    commitLine(dir, 'log: rotate 2026-08..2026-09'),
  ]);
  assert.equal(state(dir, 'LOG.md'), '# LOG\n\n## 2026-09-10 L5\ne\n');
  assert.equal(state(dir, 'LOG-2026-08.md'), `# LOG 2026-08\n\n## 2026-08-01 L0\nz\n\n${AUGUST_ENTRIES}`);
  assert.equal(state(dir, 'LOG-2026-09.md'), '# LOG 2026-09\n\n## 2026-09-01 L3\nc\n');

  const odd = logProject(t, { 'LOG.md': '# LOG\n\n## 2026-13-01 typo\nx\n\n## 2026-00-02 typo\ny\n\n## 2026-01-01 L1\na\n' });
  assert.deepEqual(logRotate(odd, undefined, SEPTEMBER), ['移動なし']);
  assert.deepEqual(readdirSync(join(odd, '.soujo')), ['LOG.md']);
});

test('log rotate keeps the last 節目 entry in LOG.md, so brief still shows it, and refuses a stopped rotate that moved it', (t) => {
  const log = ROTATING.replace('## 2026-08-01 L2', '## 2026-07-31 節目\nSPEC.md を書いた\n\n## 2026-08-01 L2');
  const dir = logProject(t, { 'LOG.md': log });
  assert.deepEqual(logRotate(dir, undefined, SEPTEMBER), [MOVED, commitLine(dir)]);
  assert.equal(state(dir, 'LOG.md'), '# LOG\n\n## 2026-07-31 節目\nSPEC.md を書いた\n\n## 2026-09-01 L3\nc\n\n## 2026-09-10 L5\ne\n');
  assert.deepEqual([state(dir, 'LOG-2026-07.md'), state(dir, 'LOG-2026-08.md')], [JULY, AUGUST]);

  const moved = logProject(t, { 'LOG.md': log });
  writeFileSync(join(moved, '.soujo', 'LOG.md'), log.replace('## 2026-07-31 節目\nSPEC.md を書いた\n\n', ''));
  writeFileSync(join(moved, '.soujo', 'LOG-2026-07.md'), '# LOG 2026-07\n\n## 2026-07-31 節目\nSPEC.md を書いた\n');
  assert.throws(() => logRotate(moved, undefined, SEPTEMBER), DIRTY);
});

test('log rotate refuses a month not YYYY-MM and no repository, writing nothing', (t) => {
  const dir = logProject(t);
  for (const before of ['2026-9', '202609', ' 2026-09', '2026-13', '2026-00']) {
    assert.throws(() => logRotate(dir, before, SEPTEMBER), new RegExp(`^Error: --before は YYYY-MM: ${before}$`));
  }
  assert.deepEqual([state(dir, 'LOG.md'), readdirSync(join(dir, '.soujo'))], [ROTATING, ['LOG.md']]);

  const outside = project(temp(t), { 'LOG.md': ROTATING });
  assert.throws(() => logRotate(outside, undefined, SEPTEMBER), /^Error: git リポジトリではないのでコミットできない$/);
  assert.deepEqual(readdirSync(join(outside, '.soujo')), ['LOG.md']);
});

test('log rotate refuses uncommitted changes a rotate does not make, writing and deleting nothing', (t) => {
  const june = '# LOG 2026-06\n\n## 2026-06-01 L0\nz\n';
  const changes: [string, (dir: string) => void][] = [
    ['a source file', (dir) => writeFileSync(join(dir, 'src.ts'), '')],
    ['an entry added to LOG.md', (dir) => writeFileSync(join(dir, '.soujo', 'LOG.md'), `${ROTATING}\n## 2026-09-15 L6\nf\n`)],
    ['an entry removed from LOG.md into no archive', (dir) => writeFileSync(join(dir, '.soujo', 'LOG.md'), ROTATING.replace('## 2026-07-30 L1\na\n\n', ''))],
    ['LOG.md edited outside its entries', (dir) => writeFileSync(join(dir, '.soujo', 'LOG.md'), ROTATING.replace('# LOG', '# Log'))],
    ['an archive deleted', (dir) => rmSync(join(dir, '.soujo', 'LOG-2026-06.md'))],
    ['a committed entry removed from an archive', (dir) => writeFileSync(join(dir, '.soujo', 'LOG-2026-06.md'), '# LOG 2026-06\n')],
    ['a line added to the last entry of an archive', (dir) => writeFileSync(join(dir, '.soujo', 'LOG-2026-06.md'), `${june}more\n`)],
    ['an archive named for no month', (dir) => writeFileSync(join(dir, '.soujo', 'LOG-2026-13.md'), '')],
    ['a new archive without entries', (dir) => writeFileSync(join(dir, '.soujo', 'LOG-2026-05.md'), '# LOG 2026-05\n')],
    ['a new archive under another preamble', (dir) => writeFileSync(join(dir, '.soujo', 'LOG-2026-07.md'), 'note\n\n## 2026-07-30 L1\na\n')],
    ["a new archive under another month's heading", (dir) => writeFileSync(join(dir, '.soujo', 'LOG-2026-07.md'), '# LOG 2026-06\n\n## 2026-07-30 L1\na\n')],
    ['only a blank line added to an archive', (dir) => writeFileSync(join(dir, '.soujo', 'LOG-2026-06.md'), `${june}\n`)],
    ['an entry LOG.md never had added to an archive', (dir) => writeFileSync(join(dir, '.soujo', 'LOG-2026-06.md'), `${june}\n## 2026-06-02 hand\nh\n`)],
    [
      'an entry of another month appended to an archive',
      (dir) => writeFileSync(join(dir, '.soujo', 'LOG-2026-06.md'), `${june}\n## 2026-07-30 L1\na\n`),
    ],
    [
      'the last entry moved by hand into its archive',
      (dir) => {
        writeFileSync(join(dir, '.soujo', 'LOG.md'), ROTATING.replace('\n## 2026-09-10 L5\ne\n', ''));
        writeFileSync(join(dir, '.soujo', 'LOG-2026-09.md'), '# LOG 2026-09\n\n## 2026-09-10 L5\ne\n');
      },
    ],
    [
      'an entry removed from LOG.md into the archive of another month',
      (dir) => {
        writeFileSync(join(dir, '.soujo', 'LOG.md'), ROTATING.replace('## 2026-07-30 L1\na\n\n', ''));
        writeFileSync(join(dir, '.soujo', 'LOG-2026-06.md'), `${june}\n## 2026-07-30 L1\na\n`);
      },
    ],
  ];
  for (const [label, change] of changes) {
    const dir = logProject(t, { 'LOG.md': ROTATING, 'LOG-2026-06.md': june });
    change(dir);
    const leftover = join(dir, '.soujo', `.LOG.md.${deadPid()}.tmp`);
    writeFileSync(leftover, 'half');
    const before = gitStatus(dir);
    assert.throws(() => logRotate(dir, undefined, SEPTEMBER), DIRTY, label);
    assert.deepEqual(gitStatus(dir), before, label);
    assert.ok(existsSync(leftover), label);
    assert.equal(gitLastCommit(dir)?.subject, 'layer: L5', label);
  }
});

test('log rotate refuses an archive leaving the project or ignored by git before writing anything', { skip: process.platform === 'win32' }, (t) => {
  const dir = logProject(t);
  writeFileSync(join(dir, '.gitignore'), '.soujo/LOG-2026-08.md\n');
  commitAll(dir);
  // An ignored archive already holding the entries must not make the move look done.
  writeFileSync(join(dir, '.soujo', 'LOG-2026-08.md'), AUGUST);
  assert.throws(() => logRotate(dir, undefined, SEPTEMBER), /^Error: \.soujo\/LOG-2026-08\.md が git に無視されていて/);
  assert.deepEqual([state(dir, 'LOG.md'), state(dir, 'LOG-2026-08.md'), existsSync(join(dir, '.soujo', 'LOG-2026-07.md'))], [ROTATING, AUGUST, false]);

  const linked = logProject(t);
  const elsewhere = join(temp(t), 'archive.md');
  writeFileSync(elsewhere, 'keep\n');
  symlinkSync(elsewhere, join(linked, '.soujo', 'LOG-2026-08.md'));
  commitAll(linked);
  assert.throws(() => logRotate(linked, undefined, SEPTEMBER), /^Error: LOG-2026-08\.md を読まない: 実体（symlink の先）がプロジェクトの外$/);
  assert.deepEqual([state(linked, 'LOG.md'), readFileSync(elsewhere, 'utf8')], [ROTATING, 'keep\n']);
});

test('log rotate refuses an archive that is LOG.md, or that becomes another archive once written, before writing anything', { skip: process.platform === 'win32' }, (t) => {
  const dir = logProject(t);
  symlinkSync('LOG.md', join(dir, '.soujo', 'LOG-2026-08.md'));
  commitAll(dir);
  assert.throws(() => logRotate(dir, undefined, SEPTEMBER), /^Error: \.soujo\/LOG\.md の実体が LOG-2026-08\.md（symlink）の先と同じなので記録をコミットできない$/);
  assert.equal(state(dir, 'LOG.md'), ROTATING);

  const chained = logProject(t);
  symlinkSync('missing.md', join(chained, '.soujo', 'LOG-2026-07.md'));
  symlinkSync('LOG-2026-07.md', join(chained, '.soujo', 'LOG-2026-08.md'));
  commitAll(chained);
  assert.throws(
    () => logRotate(chained, undefined, SEPTEMBER),
    /^Error: \.soujo\/LOG-2026-07\.md の場所が LOG-2026-08\.md（壊れた symlink）の先と同じなので記録をコミットできない$/,
  );
  assert.equal(state(chained, 'LOG.md'), ROTATING);
  assert.ok(lstatSync(join(chained, '.soujo', 'LOG-2026-07.md')).isSymbolicLink());

  // The archive the rotation is about to create, which another archive's dangling symlink leads to.
  const created = logProject(t);
  symlinkSync('LOG-2026-07.md', join(created, '.soujo', 'LOG-2026-08.md'));
  commitAll(created);
  assert.throws(
    () => logRotate(created, undefined, SEPTEMBER),
    /^Error: \.soujo\/LOG-2026-07\.md の場所が LOG-2026-08\.md（壊れた symlink）の先と同じなので記録をコミットできない$/,
  );
  assert.deepEqual([state(created, 'LOG.md'), existsSync(join(created, '.soujo', 'LOG-2026-07.md'))], [ROTATING, false]);
});

test('log rotate re-run after a failed commit commits the same rotation without moving entries twice', { skip: process.platform === 'win32' }, (t) => {
  const dir = logProject(t, { 'LOG.md': ROTATING, 'LOG-2026-08.md': '# LOG 2026-08\n\n## 2026-08-01 L0\nz\n' });
  const august = `# LOG 2026-08\n\n## 2026-08-01 L0\nz\n\n${AUGUST_ENTRIES}`;
  const restore = failCommits(dir);
  assert.throws(
    () => logRotate(dir, undefined, SEPTEMBER),
    /^Error: git commit に失敗: [^\n]*（書いた分は再実行で二重に移さない。原因を直して同じコマンドを再実行する）$/,
  );
  assert.deepEqual([state(dir, 'LOG.md'), state(dir, 'LOG-2026-07.md'), state(dir, 'LOG-2026-08.md')], [ROTATED, JULY, august]);
  const leftover = join(dir, '.soujo', `.LOG-2026-08.md.${deadPid()}.tmp`);
  writeFileSync(leftover, 'half');

  restore();
  assert.deepEqual(logRotate(dir, undefined, SEPTEMBER), [MOVED, commitLine(dir)]);
  assert.deepEqual([state(dir, 'LOG.md'), state(dir, 'LOG-2026-07.md'), state(dir, 'LOG-2026-08.md')], [ROTATED, JULY, august]);
  assert.ok(!existsSync(leftover));
  assert.deepEqual(gitStatus(dir), []);
});

test('log rotate re-run finishes a rotate stopped after writing archives, or after the archives were committed by hand', { skip: process.platform === 'win32' }, (t) => {
  const written = logProject(t);
  writeFileSync(join(written, '.soujo', 'LOG-2026-08.md'), AUGUST);
  assert.deepEqual(logRotate(written, undefined, SEPTEMBER), [MOVED, commitLine(written)]);
  assert.deepEqual([state(written, 'LOG.md'), state(written, 'LOG-2026-07.md'), state(written, 'LOG-2026-08.md')], [ROTATED, JULY, AUGUST]);

  const byHand = logProject(t);
  const restore = failCommits(byHand);
  assert.throws(() => logRotate(byHand, undefined, SEPTEMBER), /git commit に失敗/);
  restore();
  execFileSync('git', ['commit', '-q', '-m', 'archives', '--', '.soujo/LOG-2026-07.md', '.soujo/LOG-2026-08.md'], { cwd: byHand });
  assert.deepEqual(gitStatus(byHand), ['M  .soujo/LOG.md']);
  assert.deepEqual(logRotate(byHand, undefined, SEPTEMBER), [MOVED, commitLine(byHand)]);
  assert.deepEqual([state(byHand, 'LOG.md'), gitStatus(byHand)], [ROTATED, []]);
});

test('log rotate refuses a stopped rotate that this --before would not finish, writing nothing', (t) => {
  const otherBefore = /^Error: 前回の rotate が動かしたエントリがこの --before では移らない（前回と同じ --before で再実行する）$/;
  const appended = logProject(t);
  writeFileSync(join(appended, '.soujo', 'LOG-2026-08.md'), AUGUST);
  assert.throws(() => logRotate(appended, '2026-08', SEPTEMBER), otherBefore);
  assert.deepEqual([state(appended, 'LOG.md'), existsSync(join(appended, '.soujo', 'LOG-2026-07.md'))], [ROTATING, false]);

  // An entry of the current month moved into its archive is what rotate --before 2026-10 does, so only that --before finishes it.
  const current = logProject(t);
  writeFileSync(join(current, '.soujo', 'LOG.md'), ROTATING.replace('## 2026-09-01 L3\nc\n\n', ''));
  writeFileSync(join(current, '.soujo', 'LOG-2026-09.md'), '# LOG 2026-09\n\n## 2026-09-01 L3\nc\n');
  assert.throws(() => logRotate(current, undefined, SEPTEMBER), otherBefore);
  assert.equal(gitLastCommit(current)?.subject, 'layer: L5');
  assert.deepEqual(logRotate(current, '2026-10', SEPTEMBER), [
    'LOG.md から4件を3書庫へ移動（2026-07〜2026-09）',
    commitLine(current, 'log: rotate 2026-07..2026-09'),
  ]);
  assert.equal(state(current, 'LOG-2026-09.md'), '# LOG 2026-09\n\n## 2026-09-01 L3\nc\n');
});

test('log rotate does not append again what archives committed by hand before LOG.md already hold', (t) => {
  const dir = logProject(t);
  writeFileSync(join(dir, '.soujo', 'LOG-2026-07.md'), JULY);
  writeFileSync(join(dir, '.soujo', 'LOG-2026-08.md'), AUGUST);
  commitAll(dir, 'archives');
  assert.deepEqual(logRotate(dir, undefined, SEPTEMBER), [MOVED, commitLine(dir)]);
  assert.deepEqual([state(dir, 'LOG.md'), state(dir, 'LOG-2026-07.md'), state(dir, 'LOG-2026-08.md')], [ROTATED, JULY, AUGUST]);
});

test('log rotate with nothing to move still removes leftover temporary files', (t) => {
  const dir = logProject(t, { 'LOG.md': '# LOG\n\n## 2026-01-01 L1\na\n' });
  const leftover = join(dir, '.soujo', `.LOG-2026-08.md.${deadPid()}.tmp`);
  writeFileSync(leftover, 'half');
  assert.deepEqual(logRotate(dir, undefined, SEPTEMBER), ['移動なし']);
  assert.deepEqual([existsSync(leftover), gitStatus(dir)], [false, []]);
});

test('log rotate in a project inside a larger repository ignores changes outside it and commits only the project', (t) => {
  const top = repo(t);
  const app = join(top, 'app');
  mkdirSync(app);
  project(app, { 'LOG.md': ROTATING });
  commitAll(top, 'base');
  writeFileSync(join(top, 'outside.txt'), '');
  assert.deepEqual(logRotate(app, undefined, SEPTEMBER), [MOVED, commitLine(app)]);
  assert.deepEqual(gitStatus(top), ['?? outside.txt']);
  assert.equal(state(app, 'LOG-2026-08.md'), AUGUST);
});

test('log rotate keeps CRLF in LOG.md and writes new archives with it, and a re-run reads back the CRLF archives it wrote', (t) => {
  const crlf = (text: string) => text.replace(/\n/g, '\r\n');
  const dir = logProject(t, { 'LOG.md': crlf(ROTATING) });
  // The commit fails after the archives are written, so the re-run has to take the CRLF headings for its own work.
  const restore = failCommits(dir);
  assert.throws(() => logRotate(dir, undefined, SEPTEMBER), /git commit に失敗/);
  restore();
  assert.deepEqual(logRotate(dir, undefined, SEPTEMBER), [MOVED, commitLine(dir)]);
  assert.deepEqual([state(dir, 'LOG.md'), state(dir, 'LOG-2026-07.md'), state(dir, 'LOG-2026-08.md')], [crlf(ROTATED), crlf(JULY), crlf(AUGUST)]);
});

test('log rotate moves entries repeated word for word once each, but not past a copy the archive already has', (t) => {
  const twice = '# LOG\n\n## 2026-07-30 L1\na\n\n## 2026-07-30 L1\na\n\n## 2026-09-10 L5\ne\n';
  const both = logProject(t, { 'LOG.md': twice });
  assert.deepEqual(logRotate(both, undefined, SEPTEMBER), ['LOG.md から2件を1書庫へ移動（2026-07）', commitLine(both, 'log: rotate 2026-07')]);
  assert.deepEqual([state(both, 'LOG.md'), state(both, 'LOG-2026-07.md')], ['# LOG\n\n## 2026-09-10 L5\ne\n', `${JULY}\n## 2026-07-30 L1\na\n`]);

  // Entries are told apart by content alone, so a copy the archive of its month already has is removed without being
  // appended again: LOG.md loses both and the archive keeps one (SPEC §14, the decision on log rotate).
  const dropped = logProject(t, { 'LOG.md': twice, 'LOG-2026-07.md': JULY });
  assert.deepEqual(logRotate(dropped, undefined, SEPTEMBER), ['LOG.md から2件を1書庫へ移動（2026-07）', commitLine(dropped, 'log: rotate 2026-07')]);
  assert.deepEqual([state(dropped, 'LOG.md'), state(dropped, 'LOG-2026-07.md')], ['# LOG\n\n## 2026-09-10 L5\ne\n', `${JULY}\n## 2026-07-30 L1\na\n`]);
  assert.equal(parseLog(state(dropped, 'LOG-2026-07.md')).length, 2);
});

test('log rotate re-run works when LOG.md is a symlink to a file inside the project', { skip: process.platform === 'win32' }, (t) => {
  const dir = project(repo(t));
  mkdirSync(join(dir, 'records'));
  writeFileSync(join(dir, 'records', 'LOG.md'), ROTATING);
  symlinkSync('../records/LOG.md', join(dir, '.soujo', 'LOG.md'));
  commitAll(dir);
  const restore = failCommits(dir);
  assert.throws(() => logRotate(dir, undefined, SEPTEMBER), /git commit に失敗/);
  restore();
  assert.deepEqual(logRotate(dir, undefined, SEPTEMBER), [MOVED, commitLine(dir)]);
  assert.deepEqual([readFileSync(join(dir, 'records', 'LOG.md'), 'utf8'), gitStatus(dir)], [ROTATED, []]);
});
