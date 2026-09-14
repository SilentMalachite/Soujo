import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { init } from '../src/commands/init.js';
import { packageDir, readTemplate } from '../src/files.js';
import { parsePlan, validateNext } from '../src/state.js';
import { repo, temp } from './helpers.js';

const ALL = ['.soujo/SPEC.md', '.soujo/PLAN.md', '.soujo/LOG.md', '.soujo/NEXT.md', 'CLAUDE.md', 'AGENTS.md'];

test('init creates state files and instruction files at the git top level', (t) => {
  const dir = repo(t);
  mkdirSync(join(dir, 'sub'));
  assert.deepEqual(init(join(dir, 'sub')), ALL.map((path) => `作成: ${path}`));
  for (const path of ALL) {
    assert.equal(readFileSync(join(dir, path), 'utf8'), readTemplate(path.replace('.soujo/', '')), path);
  }
  assert.equal(existsSync(join(dir, 'sub', '.soujo')), false);
});

test('init outside git uses the current directory, never overwrites, and lists skipped files on one line', (t) => {
  const dir = temp(t);
  mkdirSync(join(dir, '.soujo'));
  writeFileSync(join(dir, 'CLAUDE.md'), 'mine\n');
  writeFileSync(join(dir, '.soujo', 'NEXT.md'), 'mine\n');
  assert.deepEqual(init(dir), [
    '作成: .soujo/SPEC.md',
    '作成: .soujo/PLAN.md',
    '作成: .soujo/LOG.md',
    '作成: AGENTS.md',
    '既存のため作らず: .soujo/NEXT.md, CLAUDE.md',
    'git リポジトリではない: layer done / close の前に git init が要る',
  ]);
  assert.equal(readFileSync(join(dir, 'CLAUDE.md'), 'utf8'), 'mine\n');
  assert.equal(readFileSync(join(dir, '.soujo', 'NEXT.md'), 'utf8'), 'mine\n');
  assert.deepEqual(init(dir), [`既存のため作らず: ${ALL.join(', ')}`, 'git リポジトリではない: layer done / close の前に git init が要る']);
});

test('init removes temporary files left by a killed write', (t) => {
  const dir = repo(t);
  mkdirSync(join(dir, '.soujo'));
  writeFileSync(join(dir, '.soujo', '.PLAN.md.99999.tmp'), 'half');
  writeFileSync(join(dir, '.soujo', 'notes.tmp'), 'mine');
  init(dir);
  assert.equal(existsSync(join(dir, '.soujo', '.PLAN.md.99999.tmp')), false);
  assert.equal(readFileSync(join(dir, '.soujo', 'notes.tmp'), 'utf8'), 'mine');
});

test('templates: NEXT.md is valid, PLAN.md has no layers, CLAUDE.md / AGENTS.md match the repository copies', () => {
  assert.deepEqual(validateNext(readTemplate('NEXT.md')), []);
  assert.deepEqual(parsePlan(readTemplate('PLAN.md')), []);
  for (const file of ['CLAUDE.md', 'AGENTS.md']) {
    assert.equal(readTemplate(file), readFileSync(join(packageDir(), file), 'utf8'), file);
  }
});
