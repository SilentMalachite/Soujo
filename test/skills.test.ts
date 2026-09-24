import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { init } from '../src/commands/init.js';
import { nextCheck, nextSet } from '../src/commands/next.js';
import { resume } from '../src/commands/resume.js';
import { packageDir, readTemplate } from '../src/files.js';
import { validateSpec } from '../src/state.js';
import { assertKnownCommand, commands, commitAll, project, repo, temp } from './helpers.js';

const SKILLS = ['close', 'converge', 'go', 'map', 'plan', 'resume', 'review', 'spec'];
// The steps outside PLAN's layers, as the CLI names them (SPEC §6).
const PHASES = ['spec', 'plan', 'converge'];
const SECTIONS = ['読むもの', 'やること', 'soujo に頼むこと', '出力の形'];
// SPEC §7: no "always read", "run the tests", or "double-check" instructions. "テスト" is refused wherever it appears: the
// rule is about the tests being mentioned at all, and "テストが落ちたまま締めない" read as a completion condition slipped
// past a list of verbs.
const FORBIDDEN = ['必ず', 'テスト', '再確認', '検証し'];

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

test('skills/ has exactly the eight skills and agents/ only reviewer.md', () => {
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

// SPEC §14: under a Bash allowlist a chained first command (`command -v soujo && soujo init; ls`) was denied, so every skill
// and the reviewer say the same sentence where they say whose soujo and git they run.
const ONE_COMMAND = 'コマンドはツール呼び出し1回に1つだけ実行し、`&&`・`;` でつながない（許可リストに拒まれることがある）。';

test('every skill and the reviewer run one command per tool call, and no soujo command in the skills is chained', () => {
  for (const name of SKILLS) {
    const found = sections(body(name));
    const first = found.get('読むもの')?.[0] ?? '';
    assert.ok(first.endsWith(`${ONE_COMMAND}${stopWhen(found.get('soujo に頼むこと') ?? [])}`), `${name} の読むもの1行目で、止める条件の前に1回1コマンド`);
    assert.equal(body(name).split(ONE_COMMAND).length, 2, `${name} に1回1コマンドは1回`);
    for (const argv of commands(body(name))) {
      assert.ok(!argv.some((token) => ['&&', '||', ';'].includes(token) || token.endsWith(';')), `${name}: soujo ${argv.join(' ')}`);
    }
  }
  const lines = split(join(packageDir(), 'agents', 'reviewer.md')).body.split('\n').filter((line) => line.includes(ONE_COMMAND));
  assert.equal(lines.length, 1, 'reviewer に1回1コマンドは1行');
  assert.ok((lines[0] ?? '').startsWith('- `soujo`（PATH 上のコマンド）・git・`.soujo/` は作業中のプロジェクトのもの。'), 'reviewer は作業中のプロジェクトの行に');
  assert.ok((lines[0] ?? '').endsWith(ONE_COMMAND), 'reviewer はその行の終わりに');
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

function isNextSet(argv: string[]): boolean {
  return argv[0] === 'next' && argv[1] === 'set';
}

function isMilestone(argv: string[]): boolean {
  return argv[0] === 'log' && argv[1] === 'add' && argv[2] === '節目';
}

// Whether argv is next set to a phase (trimmed, as the CLI compares), and whether it passes --effort.
function phaseSet(argv: string[]): { phase: boolean; effort: boolean } {
  const phase = isNextSet(argv) && PHASES.includes(option(argv, '--layer')?.trim() ?? '');
  return { phase, effort: argv.some((token) => token === '--effort' || token.startsWith('--effort=')) };
}

function body(name: string): string {
  return split(join(packageDir(), 'skills', name, 'SKILL.md')).body;
}

// SPEC §6: next set fixes the effort of the phases, so a skill passing one would be refused.
test('next set for a phase in the skills passes no --effort; spec, go, and converge each have one', () => {
  const cases: [string[], { phase: boolean; effort: boolean }][] = [
    [['next', 'set', '--layer=plan', '--effort', 'low'], { phase: true, effort: true }],
    [['next', 'set', '--layer', ' spec ', '--effort=low'], { phase: true, effort: true }],
    [['next', 'set', '--layer', 'converge'], { phase: true, effort: false }],
    [['next', 'set', '--layer', 'Converge'], { phase: false, effort: false }],
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
  assert.deepEqual([...withPhase].sort(), ['converge', 'go', 'spec']);
});

// The phase each skill points NEXT.md to when it ends (SPEC §7): spec and converge to plan, go (after the last layer) to converge.
const PHASE_AFTER: Record<string, string> = { spec: 'plan', go: 'converge', converge: 'plan' };

// SPEC §7: spec, plan, go, and converge leave a 節目 entry at their phase boundary, which soujo brief shows.
test('spec, plan, go, and converge write a two-line 節目 entry before any next set, and point NEXT.md to their phase', () => {
  for (const name of ['spec', 'plan', 'go', 'converge']) {
    const argvs = commands(body(name));
    const milestones = argvs.flatMap((argv, index) => (isMilestone(argv) ? [index] : []));
    assert.ok(milestones.length > 0, `${name}: soujo log add '節目'`);
    for (const index of milestones) assert.equal(argvs[index]?.filter((token) => token === '--line').length, 2, `${name}: 節目は2行`);
    const first = milestones[0] ?? -1;
    argvs.forEach((argv, index) => assert.ok(!isNextSet(argv) || index > first, `${name}: next set より前に節目`));
    const phases = argvs.filter((argv) => phaseSet(argv).phase).map((argv) => option(argv, '--layer')?.trim());
    assert.deepEqual(phases, name === 'plan' ? [] : [PHASE_AFTER[name]], `${name}: next set するフェーズ`);
  }
  // converge ends one of two ways, a layer added or converged, and each leaves its own 節目 before its own next set.
  const ways = commands(body('converge')).flatMap((argv) => (isMilestone(argv) ? ['節目'] : isNextSet(argv) ? ['next set'] : []));
  assert.deepEqual(ways, ['節目', 'next set', '節目', 'next set']);
});

// SPEC §14: a layer named like a phase or 節目 is refused, so the skills that add layers say so.
test('plan and converge name every phase and 節目 as layer names the CLI refuses', () => {
  for (const name of ['plan', 'converge']) {
    const naming = sections(body(name)).get('やること')?.find((line) => line.includes('層名は')) ?? '';
    for (const word of [...PHASES.map((phase) => `\`${phase}\``), '`節目`', 'CLI が拒否する']) {
      assert.ok(naming.includes(word), `${name} の層名の行に ${word}`);
    }
  }
});

// SPEC §7: the last layer closes as 節目 → next set converge → layer done, and go goes on with converge.
test('go closes the last layer with 節目, next set converge, and layer done, then switches to converge', () => {
  const found = sections(body('go'));
  const tasks = found.get('やること') ?? [];
  assert.ok((tasks[0] ?? '').includes('`次:` が `spec` / `plan` / `converge` ならそのスキルに切り替える。'), 'go は次のフェーズへ切り替える');
  assert.equal(tasks.filter((line) => line.includes('最後の層なら 節目 → NEXT.md（`次: converge`）→ layer done で、締めたら converge スキルに切り替える。')).length, 1);
  const argvs = commands(found.get('soujo に頼むこと')?.join('\n') ?? '');
  const milestone = argvs.findIndex(isMilestone);
  const converge = argvs.findIndex((argv) => phaseSet(argv).phase);
  const done = argvs.findIndex((argv) => argv[0] === 'layer' && argv[1] === 'done');
  assert.ok(milestone !== -1 && milestone < converge && converge < done, `go: 節目 → next set converge → layer done（${[milestone, converge, done]}）`);
});

// SPEC §7: the one question go asks is where a completion condition cannot hold without breaking a principle.
test('go asks one question only when the completion condition cannot hold without breaking a principle', () => {
  const line = sections(body('go')).get('やること')?.find((task) => task.includes('原則')) ?? '';
  for (const phrase of [
    '確認を挟まず、完了条件が満たされるまで続ける',
    'SPEC の原則は完了条件と既存のコードより優先する',
    '原則に反さずには完了条件を満たせないときだけ',
    'どの原則とどう食い違うかを番号付きの候補で1問聞く',
  ]) {
    assert.ok(line.includes(phrase), `go: ${phrase}`);
  }
});

// A placeholder form of the skills with every <...> filled in, the key numbered n.
function fill(form: string, n: number): string {
  return form.replace('<n>', String(n)).replace(/<[^>]+>/g, 'x');
}

// SPEC §5, §7, §14: spec settles the principles in one question and writes them, and the criteria, in the form next check reads.
test('spec settles the principles in one question and writes keyed principles and criteria that next check accepts', () => {
  const found = sections(body('spec'));
  const text = (section: string) => found.get(section)?.join('\n') ?? '';
  const template = readTemplate('SPEC.md');
  const headings = [...template.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
  const expected: [string, string[]][] = [
    ['読むもの', ['埋まっている節は聞き直さない（見出しのない節は足す）', '原則の候補を出すときはそれとリポジトリが文書で述べる慣習']],
    [
      'やること',
      [
        '原則は1問で決め、候補はそれまでの答え・設定ファイル・述べられた慣習から出す',
        // SPEC §14: the skill tended to write SPEC.md only at the end, so each answer is written before the next question.
        `答えを得るたびに、次の問いを出す前に該当節（${headings.join('・')}）へ書く`,
        '（中断しても答えが SPEC.md に残る。まとめて最後に書かない）',
        '7行まで',
        'キーは再利用も振り直しもせず',
        '既存の SPEC のキーのない原則・基準は、意味を変えずにこの形へ直す（原則には名前と `—` も補う）',
        `${headings.length}節が埋まるか7問に達したら終える`,
        '埋まらない節は「未定」と書く。ただし原則が決まらなければ、原則の節は「未定」と書かず空のままにする',
      ],
    ],
    ['soujo に頼むこと', ['（原則を変えたら 原則: <変えたキーと何を>）', "--line '未決: <「未定」の節と、決まらず空のままの原則。なければ なし>'"]],
    ['出力の形', ['原則はキーと名前']],
  ];
  assert.equal(headings[0], '原則', 'テンプレートの最初の節は原則');
  for (const [section, phrases] of expected) {
    for (const phrase of phrases) assert.ok(text(section).includes(phrase), `spec の${section}: ${phrase}`);
  }
  // The forms are those the template shows, and a SPEC written in them passes next check up to the limit of 7 principles.
  const principle = /`(- P<n> <名前> — <判定できる1文>)`/.exec(text('やること'))?.[1] ?? '';
  const criterion = /`(- A<n> <判定できる1文>)`/.exec(text('やること'))?.[1] ?? '';
  assert.ok(principle !== '' && template.includes(principle.replace('<n>', '1')), 'spec の原則の形はテンプレートのもの');
  assert.ok(criterion !== '' && template.includes(criterion.replace('<n>', '1')), 'spec の受け入れ基準の形はテンプレートのもの');
  const written = (count: number) =>
    `## 原則\n${Array.from({ length: count }, (_, index) => fill(principle, index + 1)).join('\n')}\n\n## 受け入れ基準\n${fill(criterion, 1)}\n未定\n`;
  assert.deepEqual(validateSpec(written(7)), []);
  assert.equal(validateSpec(written(8)).length, 1);
  // 未定 is text beside the criteria, but a line that is not a principle under 原則, which is why that section stays empty.
  assert.deepEqual(validateSpec('## 原則\n\n## 受け入れ基準\n未定\n'), []);
  assert.deepEqual(validateSpec('## 原則\n未定\n'), ['SPEC.md の2行目が原則の形（- P<n> <名前> — <1文>）でない']);
  // A principle of an older SPEC needs a name and "—" besides its key, which is why the skill supplies them.
  assert.deepEqual(validateSpec('## 原則\n- P1 実行時依存を増やさない。\n'), ['SPEC.md の2行目が原則の形（- P<n> <名前> — <1文>）でない']);
  assert.deepEqual(validateSpec('## 原則\n- P1 依存ゼロ — 実行時依存を増やさない。\n'), []);
});

// SPEC §7: what converge reads, how it classifies, what it writes, and what it shows.
test('converge reads keyed lines and the layers\' code, classifies every gap, appends keyed layers only, and shows a table', () => {
  const found = sections(body('converge'));
  const text = (section: string) => found.get(section)?.join('\n') ?? '';
  const expected: [string, string[]][] = [
    [
      '読むもの',
      ['`A<n>`・`P<n>` の行（キーがなければ受け入れ基準と原則を持つ節）', '`layer:`・`wip:` コミットが変えたファイル', '基準の語（識別子にした語も）で検索して見つかる箇所', 'それより先は読まない'],
    ],
    [
      'やること',
      [
        '`met`・`missing`・`partial`・`contradicts`',
        '`path:line` で示す（コードが見つからなければ `missing`）',
        // SPEC §14: a principle marked met because the tests suppress a write was contradicted by the next run's real start-up.
        '判定は利用者が実際に動かす経路（コマンド・起動のしかた）で行い、その経路にない環境変数や設定で抑えた振る舞いを `met` の根拠にしない',
        'SPEC も PLAN も求めていないコードは `unrequested`',
        'SPEC とコードは変えない',
        'キーのない SPEC では SPEC での呼び名（節と番号）をキーの代わりにし、節目の未決に「SPEC にキーがない」と書く',
        '差（`missing`・`partial`・`contradicts`）のうち、未完了の層の完了条件では解消しないもの（キーの一致は手がかり）だけ',
        '既存の行は完了・未完了とも書き換えずに PLAN の末尾へ1差1層で足す',
        '`- [ ] <層名> — <完了条件>（<キー> <種類>）`',
        '原則の違反を先に',
        '未完了の層は最大12',
        '`unrequested` と上限を超えた差は層にせず、節目の未決の行に書く',
      ],
    ],
    [
      'soujo に頼むこと',
      [
        '`PLAN.md の`・`PLAN.md を` で始まる警告があれば何も足さず、その警告を伝えて止める',
        '節目の `--line` は下に示した2つだけで、キーは行を足さずに1行目の括弧の中へ書く',
        '差か未完了の層が残れば：',
        'NEXT.md がない・無効か、`次:` が PLAN の最初の未完了層でないか、警告が `確認:` を指したら',
        '差も未完了の層もなければ（`unrequested` だけでも）：',
      ],
    ],
    ['出力の形', ['差の表 `キー / 種類 / 根拠 / 残り`', '`soujo map plan` の図をそのまま', '`収束: <照らしたキー>` の1行', 'PLAN.md の問題で止めたら、その警告の1行だけ']],
  ];
  for (const [section, phrases] of expected) {
    for (const phrase of phrases) assert.ok(text(section).includes(phrase), `converge の${section}: ${phrase}`);
  }
  // next check comes first; then one of two ways, each drawing its own conclusion from the CLI. soujo brief is only named, as
  // where the 節目 entry shows.
  const asks = (index: number) =>
    commands(found.get('soujo に頼むこと')?.[index] ?? '')
      .map((argv) => argv.slice(0, 2).join(' '))
      .filter((command) => command !== 'brief');
  assert.deepEqual([asks(0), asks(1), asks(2)], [['next check'], ['log add', 'next check', 'next set', 'map plan'], ['log add', 'next set']]);
  // SPEC §14: Codex put met keys on extra --line's and log add refused the entry, so both endings keep the keys in the first
  // line's parentheses and none in the second.
  for (const argv of commands(text('soujo に頼むこと')).filter(isMilestone)) {
    const [first, second] = argv.flatMap((token, index) => (argv[index - 1] === '--line' ? [token] : []));
    assert.match(first ?? '', /（<[^>]*キー>）/, `converge の節目の1行目の括弧にキー: ${first}`);
    assert.doesNotMatch(second ?? '', /キー/, `converge の節目の2行目にキーがない: ${second}`);
  }
  const plan = sections(body('plan'));
  assert.ok((plan.get('読むもの') ?? []).some((line) => line.includes('既存の行は完了・未完了とも書き換えず、足すのは末尾だけ')), 'plan も追記だけ');
  assert.ok(
    (plan.get('soujo に頼むこと') ?? []).some((line) => line.includes('未完了の層があって、NEXT.md がない・無効か、`次:` がその最初の層でないか、警告が `確認:` を指したら')),
    'plan の next set の条件',
  );
});

// SPEC §14: Claude Code's converge listed the CLAUDE.md that soujo init added as unrequested, so the skill names what init places.
test('converge counts none of the files soujo init places as unrequested', (t) => {
  const outside = init(repo(t))
    .map((line) => line.replace('作成: ', ''))
    .filter((path) => !path.startsWith('.soujo/'));
  assert.deepEqual(outside, ['CLAUDE.md', 'AGENTS.md']);
  const task = sections(body('converge')).get('やること')?.join('\n') ?? '';
  const phrase = `\`soujo init\` が置いたファイル（${outside.join(' / ')}）と \`.soujo/\` は \`unrequested\` に数えない`;
  assert.ok(task.includes(phrase), `converge のやること: ${phrase}`);
});

// SPEC §6, §7: what the CLI answers at each way converge ends, which the skill's conditions rely on.
test('the CLI answers converge\'s endings as the skill expects', (t) => {
  const done = '- [x] L1 a — a\n';
  const next = (layer: string) => `次: ${layer}\n前提: p\n確認: c\n注意: なし\neffort: high\n`;
  // A keyed layer added after every layer: next check names 次:, and next set with the layer's condition quiets it.
  const added = project(temp(t), { 'PLAN.md': `${done}- [ ] L2 fix — b を満たす（A1 partial）\n`, 'NEXT.md': next('converge') });
  assert.deepEqual(nextCheck(added, false), ['soujo 警告: NEXT.md の次「converge」より前の「L2 fix」が PLAN で未完了']);
  nextSet(added, { layer: 'L2 fix', premise: 'converge で差を確認', check: 'b を満たす（A1 partial）', effort: 'medium' });
  assert.deepEqual(nextCheck(added, false), []);
  // Without NEXT.md the warning names only the file, so the skill decides from NEXT.md rather than from 次: in a warning.
  const missing = project(temp(t), { 'PLAN.md': `${done}- [ ] L2 fix — b（A1 missing）\n` });
  assert.deepEqual(nextCheck(missing, false), ['soujo 警告: NEXT.md がない']);
  // Converged: next set plan leaves nothing to warn about, and resume goes on with go, which switches to plan.
  const converged = project(temp(t), { 'PLAN.md': done, 'NEXT.md': next('converge') });
  nextSet(converged, { layer: 'plan', premise: 'converge で収束', check: 'SPEC に未実装が残っていない' });
  assert.deepEqual(nextCheck(converged, false), []);
  assert.deepEqual([resume(converged)[0], resume(converged)[3]], ['次: plan（effort: high）確認: SPEC に未実装が残っていない', '再開: /soujo:go（Codex は $go）']);
  // An unfinished layer left makes plan too early, which is why converge does not end converged then.
  const early = project(temp(t), { 'PLAN.md': `${done}- [ ] L2 b — b\n`, 'NEXT.md': next('plan') });
  assert.deepEqual(nextCheck(early, false), ['soujo 警告: NEXT.md の次「plan」より前の「L2 b」が PLAN で未完了']);
  // A PLAN problem is a warning starting with "PLAN.md の", the one converge stops on, and next set refuses meanwhile.
  const broken = project(temp(t), { 'PLAN.md': `${done}- [ ] L2 b — b\n- [ ] L2 b — c\n`, 'NEXT.md': next('converge') });
  assert.ok((nextCheck(broken, false)[0] ?? '').split(' / ').some((problem) => problem.replace('soujo 警告: ', '').startsWith('PLAN.md の')));
  assert.throws(() => nextSet(broken, { layer: 'L2 b', premise: 'p', check: 'b' }), /PLAN\.md を直してから/);
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

// SPEC §7: review shows the reviewer's table unedited, so both read the principles and put their violations first.
test('review and the reviewer read the principles and put their violations first, keyed', () => {
  const READS = '`.soujo/SPEC.md` の原則（`P<n>` の行。キーがなければ原則の節）';
  const OUTRANK = '原則はほかの SPEC の節・完了条件・既存のコードより優先する';
  // One row per violation, keyed; a SPEC without keys has its section and number stand in, as in converge.
  const FIRST = '原則の違反は1件1行で表の先頭から並べ、「何が」をそのキー（`P<n>`。キーのない SPEC では節と番号）で始める。';
  const review = sections(body('review'));
  assert.ok((review.get('読むもの') ?? []).some((line) => line.includes(READS)), 'review は原則を読む');
  // SPEC §14: Claude Code shortened paths, reworded cells, dropped phrases, and added a leading sentence, so each is named.
  const UNEDITED = '返った表を加工せずに出す（パスを縮めない・セルを言い換えない・語句を落とさない・前置きの文を足さない）。';
  assert.ok((review.get('やること')?.[0] ?? '').includes(UNEDITED), 'review は reviewer の表を加工しない');
  assert.ok((review.get('やること') ?? []).some((line) => line.includes('原則の違反は先に並べる') && line.includes(OUTRANK)), 'review は原則の違反を先に');
  assert.ok((review.get('出力の形')?.[0] ?? '').includes(FIRST), 'review の表の並び');

  const lines = split(join(packageDir(), 'agents', 'reviewer.md')).body.split('\n');
  const line = (start: string) => lines.find((text) => text.startsWith(start)) ?? '';
  assert.ok(line('- 読むもの：').includes(READS), 'reviewer は原則を読む');
  assert.ok(line('- 観点：まず SPEC の原則への違反').includes(OUTRANK), 'reviewer は原則の違反を最初に見る');
  assert.ok(line('- 出力は').includes(FIRST), 'reviewer の表の並び');
});
