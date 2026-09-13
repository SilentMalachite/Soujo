import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repo, temp } from './helpers.js';

const CLI = fileURLToPath(new URL('../src/cli.js', import.meta.url));

function soujoIn(cwd: string, ...args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
}

function soujo(...args: string[]) {
  return soujoIn(process.cwd(), ...args);
}

test('unknown command prints one stderr line and exits 1', () => {
  const result = soujo('foo');
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'soujo: 不明なコマンド: foo\n');
});

test('missing command prints one stderr line and exits 1', () => {
  const result = soujo();
  assert.equal(result.status, 1);
  assert.equal(result.stderr, 'soujo: コマンドがありません\n');
});

test('newlines in arguments do not break the one-line error', () => {
  const result = soujo('a\nb');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^soujo: [^\n]*\n$/);
});

test('Object.prototype names are unknown commands', () => {
  for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    const result = soujo(name);
    assert.deepEqual([result.status, result.stderr], [1, `soujo: 不明なコマンド: ${name}\n`], name);
  }
});

test('an error message with a long whitespace run is flattened quickly', () => {
  const started = performance.now();
  const result = soujo(`a${' '.repeat(100_000)}b`);
  assert.equal(result.status, 1);
  assert.ok(performance.now() - started < 2000, `took ${Math.round(performance.now() - started)}ms`);
});

test('init, log add, and plan next work through the CLI', (t) => {
  const dir = temp(t);
  const created = soujoIn(dir, 'init');
  assert.equal(created.status, 0);
  assert.equal(created.stdout.split('\n').filter(Boolean).length, 6);

  const logged = soujoIn(dir, 'log', 'add', 'L1 scaffold', '--line', 'a', '--line', 'b');
  assert.equal(logged.status, 0);
  assert.match(logged.stdout, /^LOG\.md に追記: \d{4}-\d{2}-\d{2} L1 scaffold（2行）\n$/);

  assert.deepEqual([soujoIn(dir, 'plan', 'next').stdout, soujoIn(dir, 'plan', 'list').stdout], [
    'PLAN.md に層がない\n',
    'PLAN.md に層がない\n',
  ]);
});

test('next set, show, and check work through the CLI; check exits 0 even with bad arguments', (t) => {
  const dir = temp(t);
  soujoIn(dir, 'init');
  const set = soujoIn(dir, 'next', 'set', '--layer', 'L1', '--premise', 'p', '--check', 'c', '--effort', 'low');
  assert.deepEqual([set.status, set.stdout], [0, 'NEXT.md を更新: 次: L1\n']);
  assert.equal(soujoIn(dir, 'next', 'show').stdout, '次: L1\n前提: p\n確認: c\n注意: なし\neffort: low\n');
  assert.deepEqual([soujoIn(dir, 'next', 'check').status, soujoIn(dir, 'next', 'check').stdout], [0, '']);

  const outside = temp(t);
  for (const args of [['next', 'check', '--hook'], ['next', 'check', '--bogus', 'x'], ['next', 'show', '--hook']]) {
    const result = soujoIn(outside, ...args);
    assert.deepEqual([result.status, result.stdout, result.stderr], [0, '', ''], args.join(' '));
  }
});

test('layer done works through the CLI and refuses a second run', (t) => {
  const dir = repo(t);
  soujoIn(dir, 'init');
  writeFileSync(join(dir, '.soujo', 'PLAN.md'), '- [ ] L1 scaffold — build\n');
  const done = soujoIn(dir, 'layer', 'done', 'L1 scaffold', '--note', 'a');
  assert.equal(done.status, 0, done.stderr);
  assert.match(done.stdout, /^層「L1 scaffold」を完了: [0-9a-f]+ layer: L1 scaffold\n$/);
  const again = soujoIn(dir, 'layer', 'done', 'L1 scaffold');
  assert.equal(again.status, 1);
  assert.match(again.stderr, /^soujo: 層「L1 scaffold」はコミット済み（[0-9a-f]+）\n$/);
});

test('argument errors are one Japanese line with exit 1', () => {
  const cases: [string[], string][] = [
    [['init', 'extra'], 'soujo: 使い方: soujo init\n'],
    [['plan', 'list', '--all'], 'soujo: 不明なオプション: --all\n'],
    [['log', 'add', 'L1', '--line'], 'soujo: オプションの値が不正: --line <value>\n'],
    [['log', 'add', 'L1', 'scaffold', '--line', 'a'], 'soujo: 使い方: soujo log add "<層名>" --line <行> [--line <行>]\n'],
    [['plan'], 'soujo: 不明なコマンド: plan\n'],
    [
      ['next', 'set', '--layer', 'L1'],
      'soujo: 使い方: soujo next set --layer <層> --premise <前提> --check <確認> [--caution <注意>] [--effort low|medium|high|xhigh]\n',
    ],
  ];
  for (const [args, stderr] of cases) {
    const result = soujo(...args);
    assert.deepEqual([result.status, result.stderr], [1, stderr], args.join(' '));
  }
});
