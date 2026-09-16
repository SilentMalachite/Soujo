import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resume } from '../src/commands/resume.js';
import { packageDir, readTemplate } from '../src/files.js';
import { assertKnownCommand, commands, commitAll, project, repo, temp } from './helpers.js';

const SKILLS = ['close', 'go', 'map', 'plan', 'resume', 'review', 'spec'];
const SECTIONS = ['読むもの', 'やること', 'soujo に頼むこと', '出力の形'];
// SPEC §7: no "always read", "run the tests", or "double-check" instructions.
const FORBIDDEN = ['必ず', 'テストし', 'テストを実行', '再確認', '検証し'];

// Directory entries that hosts load: validate_plugin.py also skips dot-entries and plain files.
function entries(dir: string, directories: boolean): string[] {
  return readdirSync(join(packageDir(), dir), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() === directories && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();
}

// Frontmatter as key → value with one pair of surrounding quotes removed, and the body after it.
// Only one-line "key: value" pairs are accepted: folded YAML is valid for both hosts, but these files do not need it.
function split(path: string): { keys: Map<string, string>; body: string } {
  const text = readFileSync(path, 'utf8');
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  assert.ok(match, `${path} は frontmatter で始まる`);
  const keys = new Map<string, string>();
  for (const line of (match[1] ?? '').split('\n')) {
    const pair = /^([\w-]+): (.+)$/.exec(line);
    assert.ok(pair, `${path} の frontmatter の行が不正: ${line}`);
    const value = pair[2] ?? '';
    keys.set(pair[1] ?? '', /^(["']).*\1$/.test(value) ? value.slice(1, -1) : value);
  }
  return { keys, body: text.slice(match[0].length) };
}

// One sentence: a single "。", at the end.
function assertOneSentence(description: string | undefined, label: string): void {
  assert.match(description ?? '', /^[^。\n]+。$/, `${label} の description は1文`);
}

// Sections in order of appearance. The limit is on lines, as SPEC §7 states it; line length is left to review.
function sections(body: string): Map<string, string[]> {
  const found = new Map<string, string[]>();
  let current: string[] | undefined;
  for (const line of body.split('\n')) {
    const heading = /^## (.+)$/.exec(line);
    if (heading) {
      const name = heading[1] ?? '';
      assert.ok(!found.has(name), `見出し「${name}」が重複`);
      current = [];
      found.set(name, current);
    } else if (line.trim() !== '') {
      assert.ok(current, `節の外に行がある: ${line}`);
      current.push(line);
    }
  }
  return found;
}

test('skills/ has exactly the seven skills and agents/ only reviewer.md', () => {
  assert.deepEqual(entries('skills', true), SKILLS);
  assert.deepEqual(entries('agents', false), ['reviewer.md']);
});

for (const name of SKILLS) {
  test(`skills/${name}/SKILL.md: name/description only, four sections of at most 3 lines`, () => {
    const { keys, body } = split(join(packageDir(), 'skills', name, 'SKILL.md'));
    assert.deepEqual([...keys.keys()], ['name', 'description']);
    assert.equal(keys.get('name'), name);
    assertOneSentence(keys.get('description'), name);

    const found = sections(body);
    assert.deepEqual([...found.keys()], SECTIONS);
    for (const [section, lines] of found) {
      assert.ok(lines.length >= 1 && lines.length <= 3, `${name} の「${section}」は1〜3行（${lines.length}行）`);
    }
    const first = found.get('読むもの')?.[0] ?? '';
    for (const word of ['`soujo`', 'git', '`.soujo/`', '作業中のプロジェクト', '置き場所']) {
      assert.ok(first.includes(word), `${name} の読むもの1行目に ${word}`);
    }
    for (const word of FORBIDDEN) assert.ok(!body.includes(word), `${name} に「${word}」`);
  });
}

// SPEC §7: a missing soujo stops a skill only where the skill runs soujo.
const STOP = '`soujo` が見つからなければ止めて1行で伝える。';
const NO_STOP = '`soujo`（PATH 上のコマンド）は呼ばないので、見つからなくても止めない。';

// The sentence a skill ends its first line with, from its soujo commands: a line "- `<argument>`：…" holds those of one argument.
function stopWhen(asks: readonly string[]): string {
  const lines = asks.map((line) => ({ argument: /^- `(\w+)`：/.exec(line)?.[1], runs: commands(line).length > 0 }));
  const running = lines.filter((line) => line.runs);
  if (running.length === 0) return NO_STOP;
  if (!lines.some((line) => line.argument !== undefined && !line.runs)) return STOP;
  const names = running.map((line) => {
    assert.ok(line.argument, `引数ごとの行でない soujo の行: ${asks.join(' / ')}`);
    return `\`${line.argument}\``;
  });
  return `\`soujo\` が見つからなければ、${names.join('・')} のときだけ止めて1行で伝える。`;
}

test('each skill stops for a missing soujo exactly where it runs soujo', () => {
  assert.equal(stopWhen(['- なし（`soujo` は呼ばない）。']), NO_STOP);
  assert.equal(stopWhen(['- `soujo resume`', '- 最後に `soujo brief`']), STOP);
  assert.equal(stopWhen(['- `a`：`soujo map plan`', '- `b`：なし']), '`soujo` が見つからなければ、`a` のときだけ止めて1行で伝える。');
  const expected: Record<string, string> = {};
  for (const name of SKILLS) {
    const found = sections(split(join(packageDir(), 'skills', name, 'SKILL.md')).body);
    const sentence = stopWhen(found.get('soujo に頼むこと') ?? []);
    expected[name] = sentence;
    const first = found.get('読むもの')?.[0] ?? '';
    assert.ok(first.endsWith(sentence), `${name} の読むもの1行目の終わりは「${sentence}」`);
    assert.equal(first.split('見つから').length, 2, `${name} の止める条件は1つ`);
  }
  assert.equal(expected.review, NO_STOP);
  assert.equal(expected.map, '`soujo` が見つからなければ、`plan`・`code` のときだけ止めて1行で伝える。');
});

// SPEC §7: without a range, review and map take the diff of the latest layer from before it began.
const LATEST_LAYER =
  '引数の範囲。なければ直近の層の diff（未追跡のファイルも含む）：最新の `layer: <層>` コミットの層の、最も古い `wip: <層>` か `layer: <層>` コミットの親から作業ツリーまで。' +
  '`layer:` コミットがなければ最も古い `wip:` コミットの親から、それもなければ HEAD から。親や HEAD がなければ最初から。' +
  'コミットは作業中のプロジェクトを変えたものだけ数える。';

test('review and map read the same default diff, which says where it starts without a layer: commit', () => {
  for (const name of ['review', 'map']) {
    const reads = sections(split(join(packageDir(), 'skills', name, 'SKILL.md')).body).get('読むもの') ?? [];
    assert.equal(reads.filter((line) => line.includes(LATEST_LAYER)).length, 1, `${name} の読むものに既定の diff`);
  }
});

// SPEC §4: the boundary between src/ and the skills, worded the same wherever this repository states it.
const BOUNDARY_JA = '機械的に決まる判断・整形・検証は `src/`、対話・モデルが描く図・レビュー（対象の diff の決め方を含む）は SKILL.md に書く。';
const BOUNDARY_EN =
  'Judgment, formatting, and checks that are mechanically determined live in `src/`; dialogue, diagrams the model draws, and review (choosing the diff included) are written in SKILL.md.';
const BOUNDARY_OLD = ['ロジックは全部', 'ロジックは `src/`', 'ロジックは TypeScript CLI', 'にロジックを書かない', '呼び方だけ', 'All logic lives', 'Logic lives in'];

test('the boundary between src/ and the skills reads the same in SPEC, CLAUDE.md, AGENTS.md, and CONTRIBUTING', () => {
  const pages: [string, string][] = [
    ['SPEC.md', BOUNDARY_EN],
    ['SPEC.ja.md', BOUNDARY_JA],
    ['CLAUDE.md', BOUNDARY_JA],
    ['AGENTS.md', BOUNDARY_JA],
    ['CONTRIBUTING.md', BOUNDARY_EN],
    ['CONTRIBUTING.ja.md', BOUNDARY_JA],
  ];
  for (const [page, rule] of pages) {
    const text = readFileSync(join(packageDir(), page), 'utf8');
    assert.equal(text.split(rule).length, 2, `${page} に境界の規約が1回`);
    for (const old of BOUNDARY_OLD) assert.ok(!text.includes(old), `${page} に旧文言「${old}」`);
  }
});

test('every soujo command in the skills is a known command with known options', (t) => {
  const cwd = temp(t);
  for (const name of SKILLS) {
    for (const argv of commands(split(join(packageDir(), 'skills', name, 'SKILL.md')).body)) {
      assertKnownCommand(argv, cwd, name);
    }
  }
});

// The value of an option given as "--name value" or "--name=value", as the CLI accepts both.
function option(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index !== -1) return argv[index + 1];
  return argv.find((token) => token.startsWith(`${name}=`))?.slice(name.length + 1);
}

// Whether argv is next set to spec or plan (trimmed, as the CLI compares), and whether it passes --effort.
function phaseSet(argv: string[]): { phase: boolean; effort: boolean } {
  const layer = option(argv, '--layer')?.trim();
  const phase = argv[0] === 'next' && argv[1] === 'set' && (layer === 'spec' || layer === 'plan');
  return { phase, effort: argv.some((token) => token === '--effort' || token.startsWith('--effort=')) };
}

// SPEC §6: next set fixes the effort of spec and plan, so a skill passing one would be refused.
test('next set for spec or plan in the skills passes no --effort; spec and go each have one to plan', () => {
  const cases: [string[], { phase: boolean; effort: boolean }][] = [
    [['next', 'set', '--layer=plan', '--effort', 'low'], { phase: true, effort: true }],
    [['next', 'set', '--layer', ' spec ', '--effort=low'], { phase: true, effort: true }],
    [['next', 'set', '--layer', 'L1', '--effort', 'low'], { phase: false, effort: true }],
  ];
  for (const [argv, expected] of cases) assert.deepEqual(phaseSet(argv), expected, argv.join(' '));

  const withPhase = new Set<string>();
  for (const name of SKILLS) {
    for (const argv of commands(split(join(packageDir(), 'skills', name, 'SKILL.md')).body)) {
      const { phase, effort } = phaseSet(argv);
      if (!phase) continue;
      withPhase.add(name);
      assert.ok(!effort, `${name}: soujo ${argv.join(' ')}`);
    }
  }
  assert.deepEqual([...withPhase].sort(), ['go', 'spec']);
});

// SPEC §7: spec, plan, and go leave a 節目 entry at their phase boundary, which soujo brief shows.
test('spec, plan, and go write a 節目 entry, spec and go before next set to plan, and plan forbids 節目 as a layer name', () => {
  const body = (name: string) => split(join(packageDir(), 'skills', name, 'SKILL.md')).body;
  for (const name of ['spec', 'plan', 'go']) {
    const argvs = commands(body(name));
    const milestone = argvs.findIndex((argv) => argv[0] === 'log' && argv[1] === 'add' && argv[2] === '節目');
    assert.ok(milestone !== -1, `${name}: soujo log add '節目'`);
    assert.equal(argvs[milestone]?.filter((token) => token === '--line').length, 2, `${name}: 節目は2行`);
    if (name === 'plan') continue;
    const toPlan = argvs.findIndex((argv) => phaseSet(argv).phase && option(argv, '--layer')?.trim() === 'plan');
    assert.ok(toPlan > milestone, `${name}: log add '節目' が next set --layer 'plan' より前`);
  }
  const naming = sections(body('plan')).get('やること')?.find((line) => line.startsWith('- 層名は')) ?? '';
  for (const word of ['`spec`', '`plan`', '`節目`', 'CLI が拒否する']) assert.ok(naming.includes(word), `plan の層名の行に ${word}`);
});

// The end of 再開: after 3 days away as the skills and CLAUDE.md / AGENTS.md quote it: the number of days varies, so it is left out.
const POINTER = '日ぶり: 先に soujo brief';

// SPEC §6: the quoted end is what soujo resume prints, so a model matching the text finds it.
test('soujo resume ends 再開: with the pointer that the skills and the templates quote', (t) => {
  const dir = project(repo(t), { 'NEXT.md': '次: L1 a\n前提: なし\n確認: a\n注意: なし\neffort: low\n', 'PLAN.md': '- [ ] L1 a — a\n' });
  commitAll(dir, 'layer: L0', new Date(2026, 8, 1));
  const line = resume(dir, new Date(2026, 8, 20))[3] ?? '';
  assert.ok(line.startsWith('再開:') && line.endsWith(POINTER), line);
  const quoting: [string, string][] = [
    ['resume', split(join(packageDir(), 'skills', 'resume', 'SKILL.md')).body],
    ['go', split(join(packageDir(), 'skills', 'go', 'SKILL.md')).body],
    ['CLAUDE.md', readTemplate('CLAUDE.md')],
    ['AGENTS.md', readTemplate('AGENTS.md')],
  ];
  for (const [label, text] of quoting) {
    assert.ok(text.includes(`\`${POINTER}\``), `${label} は ${POINTER} を引く`);
    assert.ok(!text.includes('N日ぶり'), `${label} に字面の N日ぶり がない`);
  }
});

// SPEC §7: the resume skill follows the pointer; brief is read only when it ran.
test('resume runs soujo brief after the four lines only when 再開: ends with the pointer, and says what a failure returns', () => {
  const found = sections(split(join(packageDir(), 'skills', 'resume', 'SKILL.md')).body);
  const text = (section: string) => found.get(section)?.join('\n') ?? '';
  assert.deepEqual(commands(text('soujo に頼むこと')), [['resume'], ['brief']], 'soujo resume の後に soujo brief');
  const only = `\`再開:\` で始まる行が \`${POINTER}\` で終わるときだけ`;
  assert.ok(text('soujo に頼むこと').includes(`${only}、その後に \`soujo brief\``), '頼むこと: 条件つきで resume の後');
  assert.ok(text('やること').includes(`4行を受け取った後、${only} \`soujo brief\` を実行する。終わらなければ実行しない。`), 'やること: 4行の後・条件・否定');
  assert.ok(text('読むもの').includes('根拠は `soujo resume` の出力だけ（`soujo brief` を実行したときはその出力も）'), '読むもの: brief は実行したときだけ');
  for (const phrase of [
    '`soujo resume` の4行そのまま。`soujo brief` を実行したら、その後にその5行そのまま。',
    '`soujo resume` が失敗したらエラーの1行だけ（`soujo brief` は実行しない）。',
    '`soujo brief` だけ失敗したら、4行の後にそのエラーの1行。',
  ]) {
    assert.ok(text('出力の形').includes(phrase), `出力の形: ${phrase}`);
  }
});

// SPEC §14: go keeps reading only the four lines; brief is the resume skill's.
test('go runs no soujo brief, reads the four lines of soujo resume, and does not follow the pointer', () => {
  const found = sections(split(join(packageDir(), 'skills', 'go', 'SKILL.md')).body);
  assert.ok(!commands([...found.values()].flat().join('\n')).some((argv) => argv[0] === 'brief'), 'go に soujo brief がない');
  assert.match(found.get('読むもの')?.[1] ?? '', /^- `soujo resume` の4行 → /);
  assert.ok((found.get('やること')?.[0] ?? '').includes(`\`再開:\` の行末の \`${POINTER}\` には従わない`), 'go は brief の案内に従わない');
});

test('agents/reviewer.md is the subagent the review skill names', () => {
  const { keys, body } = split(join(packageDir(), 'agents', 'reviewer.md'));
  assert.deepEqual([...keys.keys()], ['name', 'description', 'tools']);
  assert.equal(keys.get('name'), 'reviewer');
  assertOneSentence(keys.get('description'), 'reviewer');
  assert.equal(keys.get('tools'), 'Read, Grep, Glob, Bash');
  assert.ok(body.includes('`# / 場所 / 何が / なぜ / 直し方`'));
  const review = readFileSync(join(packageDir(), 'skills', 'review', 'SKILL.md'), 'utf8');
  assert.ok(review.includes('`soujo:reviewer`'), 'review スキルが soujo:reviewer を名指しする');
});

// The working tree moves on after the range is handed over, so a diff copied out then can be older than what is reviewed.
test('the review skill hands the reviewer a range, and the reviewer takes the diff itself when it starts', () => {
  const task = sections(split(join(packageDir(), 'skills', 'review', 'SKILL.md')).body).get('やること')?.join('\n') ?? '';
  assert.ok(task.includes('範囲だけを渡し（diff の写しは渡さない'), 'review は範囲だけを渡す');
  const { body } = split(join(packageDir(), 'agents', 'reviewer.md'));
  const reads = body.split('\n').find((line) => line.startsWith('- 読むもの：')) ?? '';
  assert.ok(reads.includes('始めるときに自分で `git diff` で取る'), 'reviewer は diff を自分で取る');
  assert.ok(reads.includes('写しを渡されても使わない'), 'reviewer は渡された写しを使わない');
});
