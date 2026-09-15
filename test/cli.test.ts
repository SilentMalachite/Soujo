import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { commitAll, repo, temp } from './helpers.js';

const CLI = fileURLToPath(new URL('../src/cli.js', import.meta.url));

function soujoIn(cwd: string, ...args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
}

function soujo(...args: string[]) {
  return soujoIn(process.cwd(), ...args);
}

function unknown(name: string): string {
  return `soujo: 不明なコマンド「${name}」（soujo --help で一覧）\n`;
}

test('unknown command prints one stderr line naming it and pointing to --help, and exits 1', () => {
  const cases: [string[], string][] = [
    [['foo'], 'foo'],
    [['foo', '--help'], 'foo'],
    [['help'], 'help'],
    [['plan'], 'plan'],
    [['next', 'foo'], 'next foo'],
    [['map', '--bogus'], 'map'],
    [['next', '--', '--help'], 'next'],
    [['plan list'], 'plan list'],
    [['plan list', '--help'], 'plan list'],
    [[''], ''],
  ];
  for (const [args, name] of cases) {
    const result = soujo(...args);
    assert.deepEqual([result.status, result.stdout, result.stderr], [1, '', unknown(name)], args.join(' '));
  }
});

test('missing command prints one stderr line pointing to --help and exits 1', () => {
  const result = soujo();
  assert.equal(result.status, 1);
  assert.equal(result.stderr, 'soujo: コマンドがありません（soujo --help で一覧）\n');
});

// In the order of SPEC §6 and the READMEs.
const USAGES = {
  init: 'soujo init',
  nextShow: 'soujo next show [--hook]',
  nextSet: 'soujo next set --layer <層> --premise <前提> --check <確認> [--caution <注意>] [--effort low|medium|high|xhigh]',
  nextCheck: 'soujo next check [--hook]',
  planList: 'soujo plan list',
  planNext: 'soujo plan next',
  logAdd: 'soujo log add "<層名>" --line <行> [--line <行>]',
  logRotate: 'soujo log rotate [--before YYYY-MM]',
  layerDone: 'soujo layer done "<層名>" [--note <1〜3行>]',
  resume: 'soujo resume',
  close: 'soujo close [--note <1〜3行>]',
  mapPlan: 'soujo map plan',
  mapCode: 'soujo map code [ディレクトリ]',
};

function lines(...usages: string[]): string {
  return `${usages.join('\n')}\n`;
}

test('--help and -h as the first argument print every usage line and exit 0', () => {
  for (const args of [['--help'], ['-h'], ['--help', 'next', 'set'], ['-h', 'foo'], ['--help', '--']]) {
    const result = soujo(...args);
    assert.deepEqual([result.status, result.stdout, result.stderr], [0, lines(...Object.values(USAGES)), ''], args.join(' '));
  }
});

test('<command> --help prints the usage line of that command, the same text as its usage error', () => {
  for (const usage of Object.values(USAGES)) {
    const words = /^soujo ([a-z]+(?: [a-z]+)?)(?= |$)/.exec(usage)?.[1]?.split(' ') ?? [];
    for (const flag of ['--help', '-h']) {
      const result = soujo(...words, flag);
      assert.deepEqual([result.status, result.stdout, result.stderr], [0, lines(usage), ''], `${words.join(' ')} ${flag}`);
    }
  }
  // Every usage error but next check, which ignores unknown arguments so that hooks always exit 0.
  const errors: [string[], string][] = [
    [['init', 'extra'], USAGES.init],
    [['next', 'show', 'x'], USAGES.nextShow],
    [['next', 'set', '--layer', 'L1'], USAGES.nextSet],
    [['plan', 'list', 'x'], USAGES.planList],
    [['plan', 'next', 'x'], USAGES.planNext],
    [['log', 'add', 'L1', 'scaffold', '--line', 'a'], USAGES.logAdd],
    [['log', 'rotate', '2026-08'], USAGES.logRotate],
    [['layer', 'done'], USAGES.layerDone],
    [['resume', 'now'], USAGES.resume],
    [['close', 'note'], USAGES.close],
    [['map', 'plan', 'x'], USAGES.mapPlan],
    [['map', 'code', 'a', 'b'], USAGES.mapCode],
  ];
  for (const [args, usage] of errors) {
    const result = soujo(...args);
    assert.deepEqual([result.status, result.stderr], [1, `soujo: 使い方: ${usage}\n`], args.join(' '));
  }
});

test('the first word of two-word commands with --help lists the commands starting with it', () => {
  const cases: [string[], string[]][] = [
    [['next', '--help'], [USAGES.nextShow, USAGES.nextSet, USAGES.nextCheck]],
    [['next', 'foo', '-h'], [USAGES.nextShow, USAGES.nextSet, USAGES.nextCheck]],
    [['next', '', '--help'], [USAGES.nextShow, USAGES.nextSet, USAGES.nextCheck]],
    [['plan', '-h'], [USAGES.planList, USAGES.planNext]],
    [['log', '--help'], [USAGES.logAdd, USAGES.logRotate]],
    [['layer', '--help'], [USAGES.layerDone]],
    [['map', '--help'], [USAGES.mapPlan, USAGES.mapCode]],
  ];
  for (const [args, usages] of cases) {
    const result = soujo(...args);
    assert.deepEqual([result.status, result.stdout, result.stderr], [0, lines(...usages), ''], args.join(' '));
  }
});

test('--help wins over other arguments and --hook, but not after -- or as an attached value', (t) => {
  const outside = temp(t);
  const cases: [string[], string][] = [
    [['plan', 'list', '--all', '--help'], USAGES.planList],
    [['init', 'extra', '-h'], USAGES.init],
    [['next', 'check', '--hook', '--help'], USAGES.nextCheck],
    [['next', 'show', '--hook', '-h'], USAGES.nextShow],
    [['layer', 'done', 'L1', '--note', '--help'], USAGES.layerDone],
  ];
  for (const [args, usage] of cases) {
    const result = soujoIn(outside, ...args);
    assert.deepEqual([result.status, result.stdout, result.stderr], [0, lines(usage), ''], args.join(' '));
  }
  const notHelp: [string[], number, string][] = [
    [['map', 'code', '--', '--help'], 1, 'soujo: ディレクトリがない: --help\n'],
    [['map', 'code', '--', '-h'], 1, 'soujo: ディレクトリがない: -h\n'],
    [['close', '--note=--help'], 1, 'soujo: .soujo/ が見つからない（soujo init で作る）\n'],
    [['log', 'add', 'L1', '--line=--help'], 1, 'soujo: .soujo/ が見つからない（soujo init で作る）\n'],
    [['next', 'check', '--help=x'], 0, ''],
  ];
  for (const [args, status, stderr] of notHelp) {
    const result = soujoIn(outside, ...args);
    assert.deepEqual([result.status, result.stdout, result.stderr], [status, '', stderr], args.join(' '));
  }
});

test('--help on write commands writes nothing', (t) => {
  const dir = repo(t);
  const fresh = soujoIn(dir, 'init', '--help');
  assert.deepEqual([fresh.status, fresh.stdout, fresh.stderr], [0, lines(USAGES.init), '']);
  assert.deepEqual(readdirSync(dir), ['.git']);

  soujoIn(dir, 'init');
  writeFileSync(join(dir, '.soujo', 'PLAN.md'), '- [ ] L1 scaffold — build\n');
  commitAll(dir);
  const snapshot = () => [
    ...['SPEC.md', 'PLAN.md', 'LOG.md', 'NEXT.md'].map((file) => readFileSync(join(dir, '.soujo', file), 'utf8')),
    execFileSync('git', ['log', '--oneline'], { cwd: dir, encoding: 'utf8' }),
    execFileSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' }),
  ];
  const before = snapshot();
  const cases: [string[], string][] = [
    [['init', '--help'], USAGES.init],
    [['next', 'set', '--layer', 'L1 scaffold', '--premise', 'p', '--check', 'c', '--help'], USAGES.nextSet],
    [['log', 'add', 'L1 scaffold', '--line', 'a', '-h'], USAGES.logAdd],
    [['log', 'rotate', '--before', '2026-09', '--help'], USAGES.logRotate],
    [['layer', 'done', 'L1 scaffold', '--note', 'a', '--help'], USAGES.layerDone],
    [['close', '--note', 'a', '-h'], USAGES.close],
  ];
  for (const [args, usage] of cases) {
    const result = soujoIn(dir, ...args);
    assert.deepEqual([result.status, result.stdout, result.stderr], [0, lines(usage), ''], args.join(' '));
    assert.deepEqual(snapshot(), before, args.join(' '));
  }
});

test('newlines in arguments do not break the one-line error', () => {
  const result = soujo('a\nb');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^soujo: [^\n]*\n$/);
});

test('Object.prototype names are unknown commands, also with --help', () => {
  for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    for (const args of [[name], [name, '--help'], [name, '-h']]) {
      const result = soujo(...args);
      assert.deepEqual([result.status, result.stdout, result.stderr], [1, '', unknown(name)], args.join(' '));
    }
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
  // Six created files and the git init hint, since temp() is not a repository.
  assert.equal(created.stdout.split('\n').filter(Boolean).length, 7);

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
  const phase = soujoIn(dir, 'next', 'set', '--layer', 'plan', '--premise', 'p', '--check', 'c', '--effort', 'low');
  assert.deepEqual([phase.status, phase.stdout, phase.stderr], [
    1,
    '',
    'soujo: NEXT.md を書かない: 層「plan」の effort は high 固定（--effort を外して再実行）\n',
  ]);
  assert.equal(soujoIn(dir, 'next', 'show').stdout, '次: L1\n前提: p\n確認: c\n注意: なし\neffort: low\n');
  const fixed = soujoIn(dir, 'next', 'set', '--layer', 'plan', '--premise', 'p', '--check', 'c');
  assert.deepEqual([fixed.status, fixed.stdout], [0, 'NEXT.md を更新: 次: plan\n']);
  assert.equal(soujoIn(dir, 'next', 'show').stdout, '次: plan\n前提: p\n確認: c\n注意: なし\neffort: high\n');

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
  assert.match(done.stdout, /^層「L1 scaffold」を完了: [0-9a-f]+ layer: L1 scaffold（追加: .+ ほか\d+件）\n$/);
  const again = soujoIn(dir, 'layer', 'done', 'L1 scaffold');
  assert.equal(again.status, 1);
  assert.match(again.stderr, /^soujo: 層「L1 scaffold」はコミット済み（[0-9a-f]+）\n$/);
});

test('resume prints exactly four lines through the CLI, with control characters flattened', (t) => {
  const dir = repo(t);
  soujoIn(dir, 'init');
  writeFileSync(join(dir, '.soujo', 'LOG.md'), `# LOG\n\n## 2026-09-13 spec\na\rb${String.fromCharCode(0x2028)}c\n`);
  const resumed = soujoIn(dir, 'resume');
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.match(
    resumed.stdout,
    /^次: spec（effort: high）確認: [^\n]+\n前回: 2026-09-13 spec — a b c\nコミット: まだない（未コミット \d+件）\n再開: \/soujo:go（Codex は \$go）\n$/,
  );
});

test('close exits 1 on an invalid NEXT.md without writing, then commits through the CLI', (t) => {
  const dir = repo(t);
  soujoIn(dir, 'init');
  const nextPath = join(dir, '.soujo', 'NEXT.md');
  const logBefore = readFileSync(join(dir, '.soujo', 'LOG.md'), 'utf8');
  const valid = readFileSync(nextPath, 'utf8');
  writeFileSync(nextPath, `${valid}補足: x\n`);
  const refused = soujoIn(dir, 'close', '--note', 'a');
  assert.deepEqual([refused.status, refused.stdout], [1, '']);
  assert.match(refused.stderr, /^soujo: NEXT\.md が無効: 5行を超えている（6行）、6行目を読めない: 補足: x（soujo next set で書き直してから再実行）\n$/);
  assert.equal(readFileSync(join(dir, '.soujo', 'LOG.md'), 'utf8'), logBefore);
  assert.equal(soujoIn(dir, 'resume').stdout.split('\n')[2], 'コミット: まだない（未コミット 3件）');

  writeFileSync(nextPath, valid);
  const closed = soujoIn(dir, 'close', '--note=- 途中');
  assert.equal(closed.status, 0, closed.stderr);
  assert.match(closed.stdout, /^中断を LOG に記録・コミット: [0-9a-f]+ wip: spec\n再開: \/soujo:resume（Codex は \$resume）\n$/);
  assert.match(readFileSync(join(dir, '.soujo', 'LOG.md'), 'utf8'), /\n中断: - 途中\n$/);
});

test('map plan and map code print their diagrams through the CLI', (t) => {
  const dir = temp(t);
  soujoIn(dir, 'init');
  writeFileSync(join(dir, '.soujo', 'PLAN.md'), '- [x] L1 scaffold — build\n- [ ] L2 map — 図\n');
  const plan = soujoIn(dir, 'map', 'plan');
  assert.deepEqual([plan.status, plan.stdout], [0, '[x] L1 scaffold\n |  build\n[ ] L2 map ←次\n    図\n']);

  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'a.ts'), "import './b.js';\n");
  writeFileSync(join(dir, 'src', 'b.ts'), '');
  const code = soujoIn(join(dir, 'src'), 'map', 'code');
  assert.equal(code.status, 0, code.stderr);
  assert.equal(
    code.stdout,
    'graph LR\n  %% 相対 import のみ（パッケージ・パス別名は線にしない）\n  m_src_a_ts["src/a.ts"]\n  m_src_b_ts["src/b.ts"]\n  m_src_a_ts --> m_src_b_ts\n',
  );
  const missing = soujoIn(dir, 'map', 'code', 'nope');
  assert.deepEqual([missing.status, missing.stderr], [1, 'soujo: ディレクトリがない: nope\n']);
});

test('argument errors are one Japanese line with exit 1', () => {
  const cases: [string[], string][] = [
    [['plan', 'list', '--all'], 'soujo: 不明なオプション: --all\n'],
    [['log', 'add', 'L1', '--line'], 'soujo: オプションの値が不正: --line <value>\n'],
    [['close', '--note', '- 途中'], 'soujo: オプションの値が「-」で始まる: --note=<値> の形で書く\n'],
  ];
  for (const [args, stderr] of cases) {
    const result = soujo(...args);
    assert.deepEqual([result.status, result.stderr], [1, stderr], args.join(' '));
  }
});
