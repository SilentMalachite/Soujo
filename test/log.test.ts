import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { logAdd, logRotate } from '../src/commands/log.js';
import { gitLastCommit, gitStatus } from '../src/git.js';
import { commitAll, project, repo, temp } from './helpers.js';

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
  const leftovers = [`.LOG.md.${process.pid}.tmp`, '.NEXT.md.99999.tmp'].map((name) => join(dir, '.soujo', name));
  for (const path of leftovers) writeFileSync(path, 'half');
  logAdd(dir, 'L1', ['a'], NOW);
  assert.equal(readFileSync(join(dir, '.soujo', 'LOG.md'), 'utf8'), '# LOG\n\n## 2026-09-13 L1\na\n');
  assert.deepEqual(leftovers.filter((path) => existsSync(path)), []);
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
const AUGUST = '# LOG 2026-08\n\n## 2026-08-01 L2\nb1\nb2\n\n## 2026-08-20 L4\nd\n';

function state(dir: string, file: string): string {
  return readFileSync(join(dir, '.soujo', file), 'utf8');
}

/** A committed Soujo project whose LOG.md is log. */
function logProject(t: TestContext, log: string = ROTATING): string {
  const dir = project(repo(t), { 'LOG.md': log });
  commitAll(dir, 'layer: L5');
  return dir;
}

test('log rotate moves entries of past months into one archive per month, keeps the rest, and commits', (t) => {
  const dir = logProject(t);
  const lines = logRotate(dir, undefined, SEPTEMBER);
  const commit = gitLastCommit(dir);
  assert.deepEqual(lines, [
    'LOG-2026-07.md に移動: 1件',
    'LOG-2026-08.md に移動: 2件',
    `コミット: ${commit?.hash} log: rotate 2026-07 2026-08`,
  ]);
  assert.equal(commit?.subject, 'log: rotate 2026-07 2026-08');
  assert.deepEqual([state(dir, 'LOG.md'), state(dir, 'LOG-2026-07.md'), state(dir, 'LOG-2026-08.md')], [ROTATED, JULY, AUGUST]);
  assert.deepEqual(gitStatus(dir), []);
  assert.deepEqual(logRotate(dir, undefined, SEPTEMBER), ['移動なし']);
  assert.equal(gitLastCommit(dir)?.hash, commit?.hash);
});

test('log rotate --before moves up to that month, always keeps the last entry, and appends to an existing archive', (t) => {
  const dir = project(repo(t), { 'LOG.md': ROTATING, 'LOG-2026-08.md': '# LOG 2026-08\n\n## 2026-08-01 L0\nz\n' });
  commitAll(dir);
  assert.deepEqual(logRotate(dir, '2026-08', SEPTEMBER).slice(0, 1), ['LOG-2026-07.md に移動: 1件']);
  assert.deepEqual(logRotate(dir, '2026-10', SEPTEMBER).slice(0, 2), ['LOG-2026-08.md に移動: 2件', 'LOG-2026-09.md に移動: 1件']);
  assert.equal(state(dir, 'LOG.md'), '# LOG\n\n## 2026-09-10 L5\ne\n');
  assert.equal(state(dir, 'LOG-2026-08.md'), `# LOG 2026-08\n\n## 2026-08-01 L0\nz\n\n${AUGUST.slice('# LOG 2026-08\n\n'.length)}`);
  assert.equal(state(dir, 'LOG-2026-09.md'), '# LOG 2026-09\n\n## 2026-09-01 L3\nc\n');
  assert.equal(gitLastCommit(dir)?.subject, 'log: rotate 2026-08 2026-09');

  const single = logProject(t, '# LOG\n\n## 2026-01-01 L1\na\n');
  assert.deepEqual(logRotate(single, undefined, SEPTEMBER), ['移動なし']);
  assert.deepEqual(readdirSync(join(single, '.soujo')), ['LOG.md']);
});

test('log rotate refuses uncommitted changes other than a stopped rotate, a month not YYYY-MM, and no repository, writing nothing', (t) => {
  const dirty = '未コミットの変更がある（soujo layer done か soujo close で締めてから）';
  const dir = logProject(t);
  const unchanged = () => {
    assert.equal(state(dir, 'LOG.md'), ROTATING);
    assert.ok(!existsSync(join(dir, '.soujo', 'LOG-2026-07.md')));
  };

  writeFileSync(join(dir, 'src.ts'), '');
  assert.throws(() => logRotate(dir, undefined, SEPTEMBER), new RegExp(`^Error: ${dirty}$`));
  unchanged();
  rmSync(join(dir, 'src.ts'));

  const added = `${ROTATING}\n## 2026-09-15 L6\nf\n`;
  const lost = ROTATING.replace('## 2026-07-30 L1\na\n\n', '');
  for (const log of [added, lost]) {
    writeFileSync(join(dir, '.soujo', 'LOG.md'), log);
    assert.throws(() => logRotate(dir, undefined, SEPTEMBER), new RegExp(`^Error: ${dirty}$`));
    assert.equal(state(dir, 'LOG.md'), log);
  }
  writeFileSync(join(dir, '.soujo', 'LOG.md'), ROTATING);

  for (const before of ['2026-9', '202609', ' 2026-09']) {
    assert.throws(() => logRotate(dir, before, SEPTEMBER), new RegExp(`^Error: --before は YYYY-MM: ${before}$`));
  }
  unchanged();

  const outside = project(temp(t), { 'LOG.md': ROTATING });
  assert.throws(() => logRotate(outside, undefined, SEPTEMBER), /^Error: git リポジトリではないのでコミットできない$/);
  assert.deepEqual(readdirSync(join(outside, '.soujo')), ['LOG.md']);
});

test('log rotate refuses an archive leaving the project or ignored by git before writing anything', { skip: process.platform === 'win32' }, (t) => {
  const dir = logProject(t);
  writeFileSync(join(dir, '.gitignore'), '.soujo/LOG-2026-08.md\n');
  commitAll(dir);
  assert.throws(() => logRotate(dir, undefined, SEPTEMBER), /^Error: \.soujo\/LOG-2026-08\.md が git に無視されていて/);
  assert.deepEqual([state(dir, 'LOG.md'), readdirSync(join(dir, '.soujo'))], [ROTATING, ['LOG.md']]);

  const linked = logProject(t);
  const elsewhere = join(temp(t), 'archive.md');
  writeFileSync(elsewhere, 'keep\n');
  symlinkSync(elsewhere, join(linked, '.soujo', 'LOG-2026-08.md'));
  commitAll(linked);
  assert.throws(() => logRotate(linked, undefined, SEPTEMBER), /^Error: LOG-2026-08\.md を読まない: 実体（symlink の先）がプロジェクトの外$/);
  assert.deepEqual([state(linked, 'LOG.md'), readFileSync(elsewhere, 'utf8')], [ROTATING, 'keep\n']);
});

test('log rotate re-run after a failed commit commits the same rotation without moving entries twice', { skip: process.platform === 'win32' }, (t) => {
  const dir = logProject(t);
  const hook = join(dir, '.git', 'hooks', 'pre-commit');
  writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  assert.throws(
    () => logRotate(dir, undefined, SEPTEMBER),
    /^Error: git commit に失敗: [^\n]*（書いた分は再実行で二重に移さない。原因を直して同じコマンドを再実行する）$/,
  );
  assert.deepEqual([state(dir, 'LOG.md'), state(dir, 'LOG-2026-08.md')], [ROTATED, AUGUST]);
  writeFileSync(join(dir, '.soujo', '.LOG-2026-08.md.99999.tmp'), 'half');

  rmSync(hook);
  const commit = () => gitLastCommit(dir);
  assert.deepEqual(logRotate(dir, undefined, SEPTEMBER), [`コミット: ${commit()?.hash} log: rotate 2026-07 2026-08`]);
  assert.deepEqual([state(dir, 'LOG.md'), state(dir, 'LOG-2026-07.md'), state(dir, 'LOG-2026-08.md')], [ROTATED, JULY, AUGUST]);
  assert.deepEqual(gitStatus(dir), []);
});

test('log rotate re-run after archives were written but LOG.md was not moves the rest without repeating entries', (t) => {
  const dir = logProject(t);
  writeFileSync(join(dir, '.soujo', 'LOG-2026-08.md'), AUGUST);
  assert.deepEqual(logRotate(dir, undefined, SEPTEMBER), [
    'LOG-2026-07.md に移動: 1件',
    `コミット: ${gitLastCommit(dir)?.hash} log: rotate 2026-07 2026-08`,
  ]);
  assert.deepEqual([state(dir, 'LOG.md'), state(dir, 'LOG-2026-07.md'), state(dir, 'LOG-2026-08.md')], [ROTATED, JULY, AUGUST]);
});
