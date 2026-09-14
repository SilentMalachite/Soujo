import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { logAdd } from '../src/commands/log.js';
import { project, temp } from './helpers.js';

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
