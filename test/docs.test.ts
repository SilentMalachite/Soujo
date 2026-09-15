import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { packageDir } from '../src/files.js';
import { assertKnownCommand, commands, temp } from './helpers.js';

// User documentation is English with a Japanese translation next to it (SPEC §4).
const DOCS = ['README', 'CHANGELOG', 'CONTRIBUTING', 'SECURITY', 'CODE_OF_CONDUCT'];
const PAGES = DOCS.flatMap((doc) => [`${doc}.md`, `${doc}.ja.md`]);

function read(name: string): string {
  return readFileSync(join(packageDir(), name), 'utf8');
}

// The shape of a page: headings, list items, table rows, and code fences in order, so a translation keeps every block.
function structure(text: string): string[] {
  return text
    .split('\n')
    .map((line) => /^(#+ |\s*- |\d+\. |\||\s*```)/.exec(line)?.[1]?.trim() ?? '')
    .filter((kind) => kind !== '');
}

// Commands with placeholders collapsed, so that the English and Japanese pages can be compared.
function shapes(text: string): string[] {
  return commands(text).map((argv) => argv.map((token) => (/^<.*>$/.test(token) ? '<>' : token)).join(' '));
}

// GitHub's heading anchors: lower case, punctuation other than "-" and "_" dropped, spaces as "-".
function anchors(text: string): string[] {
  return [...text.matchAll(/^#+ (.+)$/gm)].map(([, heading]) =>
    (heading ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/ /g, '-'),
  );
}

for (const doc of DOCS) {
  test(`${doc}.md and ${doc}.ja.md link to each other and have the same blocks and soujo commands`, () => {
    const en = read(`${doc}.md`);
    const ja = read(`${doc}.ja.md`);
    assert.equal(en.split('\n')[2], `**English** | [日本語](${doc}.ja.md)`);
    assert.equal(ja.split('\n')[2], `[English](${doc}.md) | **日本語**`);
    assert.deepEqual(structure(ja), structure(en));
    assert.deepEqual(shapes(ja), shapes(en));
  });
}

test('relative links in the docs point to existing files and headings', () => {
  for (const name of PAGES) {
    for (const [, target = '', anchor] of read(name).matchAll(/\]\(([^)#]*)(?:#([^)]*))?\)/g)) {
      if (/^https?:/.test(target)) continue;
      const file = target === '' ? name : target;
      assert.ok(existsSync(join(packageDir(), file)), `${name}: ${target}`);
      if (anchor !== undefined) assert.ok(anchors(read(file)).includes(anchor), `${name}: ${file}#${anchor}`);
    }
  }
});

test('every soujo command in the READMEs is a known command with known options', (t) => {
  const cwd = temp(t);
  for (const name of ['README.md', 'README.ja.md']) {
    for (const argv of commands(read(name))) assertKnownCommand(argv, cwd, name);
  }
});

test('the READMEs name every skill for both hosts', () => {
  const skills = readdirSync(join(packageDir(), 'skills')).filter((entry) => !entry.startsWith('.')).sort();
  for (const name of ['README.md', 'README.ja.md']) {
    const text = read(name);
    for (const skill of skills) {
      assert.ok(text.includes(`\`/soujo:${skill}\``) && text.includes(`\`$${skill}\``), `${name}: ${skill}`);
    }
  }
});

// Changes merged after a release wait under one "## Unreleased" section above the versions; the version stays that of the last
// release until the release commit numbers the section. A version not yet released can also say "unreleased" instead of a date.
test('the latest version in both changelogs is the package.json version, below at most one unreleased section', () => {
  const { version } = JSON.parse(read('package.json')) as { version: string };
  for (const [name, unreleased] of [['CHANGELOG.md', 'Unreleased'], ['CHANGELOG.ja.md', '未リリース']] as const) {
    const headings = [...read(name).matchAll(/^## (.+)$/gm)].map(([, heading]) => heading ?? '');
    const versions = headings.filter((heading) => heading !== unreleased);
    assert.ok(headings.slice(1).every((heading) => heading !== unreleased), `${name}: ## ${unreleased} は先頭に1つだけ`);
    assert.equal(/^(\S+) — (?:unreleased|\d{4}-\d{2}-\d{2})$/.exec(versions[0] ?? '')?.[1], version, `${name} の先頭の版`);
  }
});
