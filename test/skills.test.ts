import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { packageDir } from '../src/files.js';
import { assertKnownCommand, commands, temp } from './helpers.js';

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
