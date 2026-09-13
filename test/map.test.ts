import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { mapCode, mapPlan } from '../src/commands/map.js';
import { LANGUAGES, directoryTree, importGraph, languageOf, planDiagram, skipEntry } from '../src/map.js';
import { parsePlan } from '../src/state.js';
import { project, temp } from './helpers.js';

const PLAN = '# PLAN\n\n- [x] L1 scaffold — build が通る\n- [ ] L2 state — テストが通る\n- [ ] L3 io\n';

function write(root: string, files: Record<string, string>): string {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

test('planDiagram draws two lines per layer with the next layer marked and conditions on the rail', () => {
  assert.deepEqual(planDiagram(parsePlan(PLAN)), [
    '[x] L1 scaffold',
    ' │  build が通る',
    '[ ] L2 state ←次',
    ' │  テストが通る',
    '[ ] L3 io',
    '    未記入',
  ]);
  assert.deepEqual(planDiagram(parsePlan('- [x] L1 — a\n- [X] L2 — b\n')), ['[x] L1', ' │  a', '[x] L2', '    b']);
});

test('skipEntry skips node_modules, dist, and dot-entries only', () => {
  assert.deepEqual(['node_modules', 'dist', '.git', '.env', 'src', 'distribution', 'a.ts'].map(skipEntry), [
    true,
    true,
    true,
    true,
    false,
    false,
    false,
  ]);
});

test('languageOf picks the LANGUAGES row by extension, one row per language', () => {
  assert.equal(languageOf('src/a.ts')?.name, 'TypeScript/JavaScript');
  assert.equal(languageOf('lib/b.mjs')?.name, 'TypeScript/JavaScript');
  assert.equal(languageOf('app/main.py'), undefined);
  assert.equal(languageOf('Makefile'), undefined);
  const extensions = LANGUAGES.flatMap((language) => language.extensions);
  assert.equal(new Set(extensions).size, extensions.length, 'an extension belongs to one language');
  assert.equal(new Set(LANGUAGES.map((language) => language.name)).size, LANGUAGES.length);
});

test('importGraph resolves relative TS/JS imports in every form and leaves packages out', () => {
  const graph = importGraph([
    {
      path: 'src/cli.ts',
      text: [
        "import { parseArgs } from 'node:util';",
        "import { a } from './commands/a.js';",
        'import {\n  b,\n  c,\n} from "./commands/b";',
        "import type { T } from './types.js';",
        "import './side.js';",
        "export * from './lib';",
        "const lazy = await import('./lazy.mjs');",
        "const old = require ( './old.cjs' );",
        "import { again } from './commands/a.js';",
        "import self from './cli.js';",
        "import outside from '../../outside.js';",
      ].join('\n'),
    },
    { path: 'src/commands/a.ts', text: "import { T } from '../types.js';\n" },
    { path: 'src/commands/b.tsx', text: '' },
    { path: 'src/types.ts', text: '' },
    { path: 'src/side.js', text: '' },
    { path: 'src/lib/index.ts', text: "export { x } from '.';\n" },
    { path: 'src/lazy.mts', text: '' },
    { path: 'src/old.cjs', text: '' },
    { path: 'README.md', text: "import x from './src/cli.js'" },
  ]);
  assert.deepEqual(graph, [
    'graph LR',
    '  n0["src/cli.ts"]',
    '  n1["src/commands/a.ts"]',
    '  n2["src/commands/b.tsx"]',
    '  n3["src/lazy.mts"]',
    '  n4["src/lib/index.ts"]',
    '  n5["src/old.cjs"]',
    '  n6["src/side.js"]',
    '  n7["src/types.ts"]',
    '  n0 --> n1',
    '  n0 --> n2',
    '  n0 --> n3',
    '  n0 --> n4',
    '  n0 --> n5',
    '  n0 --> n6',
    '  n0 --> n7',
    '  n1 --> n7',
  ]);
});

test('importGraph prefers the file as written and escapes labels', () => {
  const graph = importGraph([
    { path: 'a.ts', text: "import './b.js';" },
    { path: 'b.js', text: '' },
    { path: 'b.ts', text: '' },
    { path: 'q"#<>.ts', text: '' },
  ]);
  assert.deepEqual(graph, ['graph LR', '  n0["a.ts"]', '  n1["b.js"]', '  n2["b.ts"]', '  n3["q#34;#35;#60;#62;.ts"]', '  n0 --> n1']);
});

test('importGraph scans a long whitespace run after a keyword quickly', () => {
  const started = performance.now();
  const text = `import${' '.repeat(100_000)}x\nfrom ${"'".padEnd(100_000, 'a')}\nrequire(${' '.repeat(100_000)}`;
  importGraph([{ path: 'a.ts', text }]);
  assert.ok(performance.now() - started < 2000, `took ${Math.round(performance.now() - started)}ms`);
});

test('directoryTree lists folders first, then files, with tree rails', () => {
  assert.deepEqual(directoryTree('app', ['setup.py', 'app/main.py', 'app/util/io.py', 'app/__init__.py', 'README.md']), [
    'app/',
    '├── app/',
    '│   ├── util/',
    '│   │   └── io.py',
    '│   ├── __init__.py',
    '│   └── main.py',
    '├── README.md',
    '└── setup.py',
  ]);
  assert.deepEqual(directoryTree('empty', []), ['empty/']);
});

test('map plan draws PLAN.md from a subdirectory and reports an empty plan in one line', (t) => {
  const dir = project(temp(t), { 'PLAN.md': PLAN });
  mkdirSync(join(dir, 'src'));
  assert.equal(mapPlan(join(dir, 'src')).length, 6);
  assert.deepEqual(mapPlan(project(temp(t), { 'PLAN.md': '# PLAN\n' })), ['PLAN.md に層がない']);
  assert.throws(() => mapPlan(project(temp(t))), /PLAN\.md がない/);
  assert.throws(() => mapPlan(temp(t)), /\.soujo\/ が見つからない/);
});

test('map code scans the directory for imports, skipping node_modules, dist, dot-entries, and symlinks', (t) => {
  const dir = write(temp(t), {
    'src/cli.ts': "import { a } from './a.js';\nimport { d } from '../dist/d.js';\n",
    'src/a.ts': "import 'pkg';\n",
    'node_modules/pkg/index.js': '',
    'dist/d.js': '',
    '.hidden/h.ts': '',
    'src/.cache.ts': '',
    'notes.md': '',
  });
  symlinkSync(join(dir, 'src'), join(dir, 'linked'));
  const expected = ['graph LR', '  n0["src/a.ts"]', '  n1["src/cli.ts"]', '  n1 --> n0'];
  assert.deepEqual(mapCode(dir), expected);
  assert.deepEqual(mapCode(join(dir, 'src'), '..'), expected);
  assert.deepEqual(mapCode(dir, 'src'), ['graph LR', '  n0["a.ts"]', '  n1["cli.ts"]', '  n1 --> n0']);
});

test('map code falls back to a directory tree without supported files', (t) => {
  const dir = write(temp(t), { 'app/main.py': 'import os\n', 'setup.py': '', '.venv/x.py': '', 'dist/app.whl': '' });
  assert.deepEqual(mapCode(dir), [`${basename(dir)}/`, '├── app/', '│   └── main.py', '└── setup.py']);
});

test('map code refuses a missing directory or a file', (t) => {
  const dir = write(temp(t), { 'a.ts': '' });
  assert.throws(() => mapCode(dir, 'nope'), /^Error: ディレクトリがない: nope$/);
  assert.throws(() => mapCode(dir, 'a.ts'), /^Error: ディレクトリがない: a\.ts$/);
});
