import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { packageDir } from '../src/files.js';
import { assertKnownCommand, commands, temp } from './helpers.js';

// User documentation is English with a Japanese translation next to it (SPEC §4).
const DOCS = ['README', 'CHANGELOG'];

function read(name: string): string {
  return readFileSync(join(packageDir(), name), 'utf8');
}

// Commands with placeholders collapsed, so that the English and Japanese pages can be compared.
function shapes(text: string): string[] {
  return commands(text).map((argv) => argv.map((token) => (/^<.*>$/.test(token) ? '<>' : token)).join(' '));
}

for (const doc of DOCS) {
  test(`${doc}.md and ${doc}.ja.md link to each other and list the same soujo commands`, () => {
    const en = read(`${doc}.md`);
    const ja = read(`${doc}.ja.md`);
    assert.equal(en.split('\n')[2], `**English** | [日本語](${doc}.ja.md)`);
    assert.equal(ja.split('\n')[2], `[English](${doc}.md) | **日本語**`);
    assert.deepEqual(shapes(ja), shapes(en));
  });
}

test('relative links in the docs point to existing files', () => {
  for (const name of DOCS.flatMap((doc) => [`${doc}.md`, `${doc}.ja.md`])) {
    for (const [, target] of read(name).matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
      if (target === undefined || /^https?:/.test(target)) continue;
      assert.ok(existsSync(join(packageDir(), dirname(name), target)), `${name}: ${target}`);
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

test('the latest dated version in both changelogs is the package.json version', () => {
  const { version } = JSON.parse(read('package.json')) as { version: string };
  for (const name of ['CHANGELOG.md', 'CHANGELOG.ja.md']) {
    assert.equal(/^## (\S+) — \d{4}-\d{2}-\d{2}$/m.exec(read(name))?.[1], version, `${name} の先頭の版`);
  }
});
