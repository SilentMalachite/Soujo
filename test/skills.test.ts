import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { packageDir } from '../src/files.js';

const SKILLS = ['close', 'go', 'map', 'plan', 'resume', 'review', 'spec'];
const SECTIONS = ['読むもの', 'やること', 'soujo に頼むこと', '出力の形'];

// Frontmatter as key → raw value, and the body after it. Only "key: value" lines are accepted.
function split(path: string): { keys: Map<string, string>; body: string[] } {
  const text = readFileSync(path, 'utf8');
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  assert.ok(match, `${path} は frontmatter で始まる`);
  const keys = new Map<string, string>();
  for (const line of (match[1] ?? '').split('\n')) {
    const pair = /^([\w-]+): (.+)$/.exec(line);
    assert.ok(pair, `${path} の frontmatter の行が不正: ${line}`);
    keys.set(pair[1] ?? '', pair[2] ?? '');
  }
  return { keys, body: text.slice(match[0].length).split('\n') };
}

function sections(body: string[]): Map<string, string[]> {
  const found = new Map<string, string[]>();
  let current: string[] | undefined;
  for (const line of body) {
    const heading = /^## (.+)$/.exec(line);
    if (heading) {
      current = [];
      found.set(heading[1] ?? '', current);
    } else if (line.trim() !== '') {
      assert.ok(current, `節の外に行がある: ${line}`);
      current.push(line);
    }
  }
  return found;
}

test('skills/ has exactly the seven skills', () => {
  const dirs = readdirSync(join(packageDir(), 'skills'), { withFileTypes: true });
  assert.deepEqual(dirs.map((entry) => entry.name).sort(), SKILLS);
});

for (const name of SKILLS) {
  test(`skills/${name}/SKILL.md: name/description only, four sections of at most 3 lines`, () => {
    const { keys, body } = split(join(packageDir(), 'skills', name, 'SKILL.md'));
    assert.deepEqual([...keys.keys()], ['name', 'description']);
    assert.equal(keys.get('name'), name);
    assert.match(keys.get('description') ?? '', /^"[^"]+。"$/);

    const found = sections(body);
    assert.deepEqual([...found.keys()], SECTIONS);
    for (const [section, lines] of found) {
      assert.ok(lines.length >= 1 && lines.length <= 3, `${name} の「${section}」は1〜3行（${lines.length}行）`);
    }
    const first = found.get('読むもの')?.[0] ?? '';
    for (const word of ['.soujo/', 'soujo', 'git', '作業中のプロジェクト']) assert.ok(first.includes(word), `${name} の読むもの1行目に ${word}`);
  });
}

test('agents/reviewer.md is a subagent named reviewer', () => {
  const { keys, body } = split(join(packageDir(), 'agents', 'reviewer.md'));
  assert.equal(keys.get('name'), 'reviewer');
  assert.match(keys.get('description') ?? '', /^"[^"]+。"$/);
  assert.ok(body.some((line) => line.includes('# / 場所 / 何が / なぜ / 直し方')));
});
