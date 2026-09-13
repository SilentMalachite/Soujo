import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { mapCode, mapPlan } from '../src/commands/map.js';
import {
  LANGUAGES,
  MAP_LIMITS,
  directoryTree,
  importGraph,
  languageOf,
  mainLanguage,
  planDiagram,
  scanNotes,
  skipEntry,
  type ImportRules,
  type ScannedFile,
} from '../src/map.js';
import { parsePlan } from '../src/state.js';
import { project, temp } from './helpers.js';

const PLAN = '# PLAN\n\n- [x] L1 scaffold — build が通る\n- [ ] L2 state — テストが通る\n- [ ] L3 io\n';
const RULES = LANGUAGES[0]?.graph as ImportRules;
const NOTE = '  %% 相対 import のみ（パッケージ・パス別名は線にしない）';
// Running as root ignores file permissions, so unreadable entries cannot be made.
const asRoot = process.getuid?.() === 0;

function write(root: string, files: Record<string, string>): string {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

function imports(text: string): string[] {
  return RULES.imports(text);
}

// Edges of importGraph as "from --> to" paths, for files given as path → text.
function edges(files: Record<string, string>): string[] {
  const scanned = Object.entries(files).map(([path, text]) => ({ path, imports: imports(text) }));
  const lines = importGraph(RULES, scanned);
  const paths = new Map(lines.flatMap((line) => [...line.matchAll(/^ {2}(\S+)\["(.*)"\]$/g)].map((match) => [match[1], match[2]] as const)));
  return lines.flatMap((line) => {
    const match = /^ {2}(\S+) --> (\S+)$/.exec(line);
    return match ? [`${paths.get(match[1] ?? '')} --> ${paths.get(match[2] ?? '')}`] : [];
  });
}

test('planDiagram draws two lines per layer with the next layer marked and conditions on an ASCII rail', () => {
  assert.deepEqual(planDiagram(parsePlan(PLAN)), [
    '[x] L1 scaffold',
    ' |  build が通る',
    '[ ] L2 state ←次',
    ' |  テストが通る',
    '[ ] L3 io',
    '    未記入',
  ]);
  assert.deepEqual(planDiagram(parsePlan('- [x] L1 — a\n- [X] L2 — b\n')), ['[x] L1', ' |  a', '[x] L2', '    b', '全層完了']);
  assert.deepEqual(planDiagram([]), []);
});

test('skipEntry skips dependency and build output directories and dot-entries only', () => {
  for (const name of ['node_modules', 'dist', 'build', 'target', 'vendor', 'deps', '_build', '__pycache__', 'venv', 'coverage', '.git', '.env']) {
    assert.equal(skipEntry(name), true, name);
  }
  for (const name of ['src', 'distribution', 'a.ts', 'lib']) assert.equal(skipEntry(name), false, name);
});

test('languageOf picks the LANGUAGES row by extension ignoring case, one row per language and extension', () => {
  assert.equal(languageOf('src/a.ts')?.name, 'TypeScript/JavaScript');
  assert.equal(languageOf('src/A.TS')?.name, 'TypeScript/JavaScript');
  assert.equal(languageOf('lib/b.mjs')?.name, 'TypeScript/JavaScript');
  assert.equal(languageOf('app/main.py')?.name, 'Python');
  assert.equal(languageOf('Makefile'), undefined);
  assert.equal(languageOf('README.md'), undefined);
  const extensions = LANGUAGES.flatMap((language) => language.extensions);
  assert.equal(new Set(extensions).size, extensions.length, 'an extension belongs to one language');
  assert.ok(extensions.every((extension) => extension === extension.toLowerCase()));
  assert.equal(new Set(LANGUAGES.map((language) => language.name)).size, LANGUAGES.length);
});

test('mainLanguage picks the language with the most files, earlier rows winning ties', () => {
  assert.deepEqual(mainLanguage(['mix.exs', 'lib/a.ex', 'lib/b.ex', 'assets/app.js', 'README.md']), {
    language: LANGUAGES.find((language) => language.name === 'Elixir'),
    paths: ['mix.exs', 'lib/a.ex', 'lib/b.ex'],
  });
  assert.equal(mainLanguage(['a.ts', 'b.py'])?.language.name, 'TypeScript/JavaScript');
  assert.equal(mainLanguage(['README.md']), undefined);
});

test('scanNotes reports a cut scan and unreadable entries', () => {
  assert.deepEqual(scanNotes({ unreadable: 0, truncated: false }), []);
  assert.deepEqual(scanNotes({ unreadable: 2, truncated: true }), [
    `走査を ${MAP_LIMITS.entries}件で打ち切った（ディレクトリを指定して絞る）`,
    '読めずに飛ばした: 2件',
  ]);
});

test('TS/JS imports are found in every form of code', () => {
  const text = [
    "import { parseArgs } from 'node:util';",
    "import { a } from './a.js';",
    'import {\n  b,\n  c,\n} from "./b";',
    "import type { T } from './types.js';",
    "import './side.js';",
    "export * from './lib';",
    "const lazy = await import('./lazy.mjs');",
    "const old = require ( './old.cjs' );",
    "const chunk = import(/* webpackChunkName: \"x\" */ './chunk.js');",
    'const tpl = import(`./tpl.js`);',
    'const quoted = import("./it\'s.js");',
    "import x = require('./legacy');",
  ].join('\n');
  assert.deepEqual(imports(text), [
    'node:util',
    './a.js',
    './b',
    './types.js',
    './side.js',
    './lib',
    './lazy.mjs',
    './old.cjs',
    './chunk.js',
    './tpl.js',
    "./it's.js",
    './legacy',
  ]);
});

test('TS/JS imports ignore comments, strings, templates with substitutions, regexes, and member calls', () => {
  const text = [
    "// usage: import { b } from './b.js'",
    "/* require('./d') */",
    '/**',
    " * import { e } from './e.js'",
    ' */',
    "const message = \"loaded from './c.js'\";",
    "const sql = `select * from './f.js'`;",
    'const dynamic = import(`./g${name}.js`);',
    "const nested = `${`import('./h.js')`}`;",
    "const pattern = /from './i.js'/;",
    "const ratio = a / b; const c = d / e; import('./j.js');",
    "loader.import('./k.js'); cache.require('./l.js');",
    "const unclosed = 'from \n import './m.js';",
  ].join('\n');
  assert.deepEqual(imports(text), ['./j.js', './m.js']);
});

test('TS/JS imports tell a division and a JSX closing tag from a regex, and a regex after a condition from a division', () => {
  const text = [
    "const view = <div>hello</div>; import('./after-jsx.js');",
    "const self = <br />; import('./after-self-closing.js');",
    "const x = a++ / b; import('./after-increment.js');",
    "const y = c-- / d; import('./after-decrement.js');",
    "const z = (a) / 2; import('./after-paren.js');",
    "if (ok) /import('.\\/fake-if.js')/.test(s);",
    "while (more) /require('.\\/fake-while.js')/g.exec(s);",
    "} else if (a) /from '.\\/fake-else-if.js'/.test(s);",
    "obj.if(a) / 2; import('./after-member.js');",
  ].join('\n');
  assert.deepEqual(imports(text), ['./after-jsx.js', './after-self-closing.js', './after-increment.js', './after-decrement.js', './after-paren.js', './after-member.js']);
});

test('TS/JS imports decode escapes and skip specifiers without a whole fixed value', () => {
  const b = '\\';
  const text = [
    `import('./${b}u0061.js');`,
    `import('./${b}x62.js');`,
    `import('./${b}u{63}.js');`,
    `import('./d${b}\n.js');`,
    `import(\`./${b}u0065.js\`);`,
    `import "./quote${b}".js";`,
    `import('./${b}u00zz.js');`,
    `import('./${b}1.js');`,
    `import('./${b}u{110000}.js');`,
    "import('./prefix' + name);",
    "require('./prefix' + name);",
    "import('./with-options.js', { with: { type: 'json' } });",
  ].join('\n');
  assert.deepEqual(imports(text), ['./a.js', './b.js', './c.js', './d.js', './e.js', './quote".js', './with-options.js']);
});

test('TS/JS resolution swaps extensions the TypeScript way, finds index files, and ignores case', () => {
  assert.deepEqual(
    edges({
      'src/cli.ts': "import './a.js'; import './b.mjs'; import './c.js'; import './types'; import './lib'; import './State.js';",
      'src/a.ts': '',
      'src/a.js': '',
      'src/b.ts': '',
      'src/b.mts': '',
      'src/c.cts': '',
      'src/types.d.ts': '',
      'src/lib/index.ts': '',
      'src/state.ts': '',
    }),
    ['src/cli.ts --> src/a.ts', 'src/cli.ts --> src/b.mts', 'src/cli.ts --> src/lib/index.ts', 'src/cli.ts --> src/state.ts', 'src/cli.ts --> src/types.d.ts'],
  );
});

test('TS/JS resolution sends "." and ".." to index files only and drops self-imports and outside paths', () => {
  assert.deepEqual(
    edges({
      'src/lib/index.ts': "export * from '.';",
      'src/lib/a.ts': "import '..'; import './'; import '../../../outside.js';",
      'src/lib.ts': '',
      'src.ts': '',
      'a.ts': "import './a.js'; import '@/alias'; import 'pkg';",
      'a.tsx': '',
      'src/index.ts': '',
    }),
    ['src/lib/a.ts --> src/index.ts', 'src/lib/a.ts --> src/lib/index.ts'],
  );
});

test('importGraph uses path-based ids, escapes labels, and counts the first of duplicate paths', () => {
  const graph = importGraph(RULES, [
    { path: 'a-b.ts', imports: ['./a_b.js'] },
    { path: 'a_b.ts', imports: [] },
    { path: 'a-b.ts', imports: [] },
    { path: 'q"#&<>\n.ts', imports: [] },
  ]);
  assert.deepEqual(graph, [
    'graph LR',
    NOTE,
    '  m_a_b_ts["a-b.ts"]',
    '  m_a_b_ts_2["a_b.ts"]',
    '  m_q_______ts["q#34;#35;#38;#60;#62; .ts"]',
    '  m_a_b_ts --> m_a_b_ts_2',
  ]);
});

test('importGraph keeps the most connected files and the first edges within the limits, with a note', () => {
  const files: ScannedFile[] = [
    { path: 'hub.ts', imports: ['./a.js', './b.js', './c.js'] },
    { path: 'a.ts', imports: ['./b.js'] },
    { path: 'b.ts', imports: [] },
    { path: 'c.ts', imports: [] },
    { path: 'lonely.ts', imports: [] },
  ];
  const limits = { ...MAP_LIMITS, nodes: 3, edges: 2 };
  assert.deepEqual(importGraph(RULES, files, ['読めずに飛ばした: 1件'], limits), [
    'graph LR',
    NOTE,
    '  %% 読めずに飛ばした: 1件',
    '  %% 省略: ファイル 2件・import 2件（ディレクトリを指定して絞る）',
    '  m_a_ts["a.ts"]',
    '  m_b_ts["b.ts"]',
    '  m_hub_ts["hub.ts"]',
    '  m_a_ts --> m_b_ts',
    '  m_hub_ts --> m_a_ts',
  ]);
});

test('importGraph scans long and repetitive input in linear time', () => {
  const started = performance.now();
  const inputs = [
    `import${' '.repeat(100_000)}x`,
    `from ${"'".padEnd(100_000, 'a')}`,
    `require(${' '.repeat(100_000)}`,
    "import from './a.js' ".repeat(20_000),
    'from '.repeat(50_000),
    '`${'.repeat(30_000),
    '/['.repeat(50_000),
    "/* '".repeat(30_000),
  ];
  for (const text of inputs) importGraph(RULES, [{ path: 'a.ts', imports: imports(text) }]);
  assert.ok(performance.now() - started < 2000, `took ${Math.round(performance.now() - started)}ms`);
});

test('directoryTree draws an ASCII tree with folders first, empty folders, and a cut with notes', () => {
  const paths = ['setup.py', 'app/', 'app/main.py', 'app/util/', 'app/util/io.py', 'app/__init__.py', 'README.md', 'empty/'];
  assert.deepEqual(directoryTree('app', paths), [
    'app/',
    '|-- app/',
    '|   |-- util/',
    '|   |   `-- io.py',
    '|   |-- __init__.py',
    '|   `-- main.py',
    '|-- empty/',
    '|-- README.md',
    '`-- setup.py',
  ]);
  assert.deepEqual(directoryTree('app', paths, ['読めずに飛ばした: 1件'], { ...MAP_LIMITS, treeLines: 2 }), [
    'app/',
    '|-- app/',
    '|   |-- util/',
    '注: 読めずに飛ばした: 1件',
    '注: 省略: 6件（ディレクトリを指定して絞る）',
  ]);
  assert.deepEqual(directoryTree('empty', []), ['empty/']);
});

test('map plan draws PLAN.md from a subdirectory and reports an empty plan in one line', (t) => {
  const dir = project(temp(t), { 'PLAN.md': PLAN });
  mkdirSync(join(dir, 'src'));
  assert.deepEqual(mapPlan(join(dir, 'src')), planDiagram(parsePlan(PLAN)));
  assert.deepEqual(mapPlan(project(temp(t), { 'PLAN.md': '# PLAN\n' })), ['PLAN.md に層がない']);
  assert.throws(() => mapPlan(project(temp(t))), /PLAN\.md がない/);
  assert.throws(() => mapPlan(temp(t)), /\.soujo\/ が見つからない/);
});

test('map code scans the project root by default, skipping output directories, dot-entries, and symlinks', (t) => {
  const dir = write(project(temp(t)), {
    'src/cli.ts': "import { a } from './a.js';\nimport { d } from '../dist/d.js';\nimport { l } from './linked.js';\n",
    'src/a.ts': "import 'pkg';\n",
    'src/real.ts': '',
    'node_modules/pkg/index.js': '',
    'dist/d.js': '',
    'build/b.js': '',
    '.hidden/h.ts': '',
    'src/.cache.ts': '',
    'notes.md': '',
  });
  symlinkSync(join(dir, 'src'), join(dir, 'linked-dir'));
  symlinkSync(join(dir, 'src', 'real.ts'), join(dir, 'src', 'linked.ts'));
  const expected = ['graph LR', NOTE, '  m_src_a_ts["src/a.ts"]', '  m_src_cli_ts["src/cli.ts"]', '  m_src_real_ts["src/real.ts"]', '  m_src_cli_ts --> m_src_a_ts'];
  assert.deepEqual(mapCode(join(dir, 'src')), expected);
  assert.deepEqual(mapCode(join(dir, 'src'), '..'), expected);
  assert.deepEqual(mapCode(dir, 'src').slice(2, 4), ['  m_a_ts["a.ts"]', '  m_cli_ts["cli.ts"]']);
  const outside = write(temp(t), { 'sub/a.ts': '', 'b.ts': '' });
  assert.deepEqual(mapCode(join(outside, 'sub')), ['graph LR', NOTE, '  m_a_ts["a.ts"]']);
});

test('map code draws a directory tree when the main language has no import rules', (t) => {
  const dir = write(temp(t), {
    'mix.exs': '',
    'lib/app.ex': '',
    'lib/app/web.ex': '',
    'assets/js/app.js': "import './socket.js';",
    'assets/js/socket.js': '',
    'deps/phoenix/priv/phoenix.js': '',
    '_build/dev/x.beam': '',
    '.venv/x.py': '',
  });
  mkdirSync(join(dir, 'priv'));
  assert.deepEqual(mapCode(dir), [
    `${basename(dir)}/`,
    '|-- assets/',
    '|   `-- js/',
    '|       |-- app.js',
    '|       `-- socket.js',
    '|-- lib/',
    '|   |-- app/',
    '|   |   `-- web.ex',
    '|   `-- app.ex',
    '|-- priv/',
    '`-- mix.exs',
  ]);
  assert.deepEqual(mapCode(dir, 'assets').slice(2), ['  m_js_app_js["js/app.js"]', '  m_js_socket_js["js/socket.js"]', '  m_js_app_js --> m_js_socket_js']);
});

test('map code cuts a large scan with a note', (t) => {
  const dir = write(temp(t), { 'a.py': '', 'b.py': '', 'sub/c.py': '' });
  assert.deepEqual(mapCode(dir, '.', { ...MAP_LIMITS, entries: 2 }), [
    `${basename(dir)}/`,
    '|-- a.py',
    '`-- b.py',
    '注: 走査を 2件で打ち切った（ディレクトリを指定して絞る）',
  ]);
});

test('map code skips unreadable directories and files with a note', { skip: asRoot }, (t) => {
  const dir = write(temp(t), { 'a.ts': "import './b.js';", 'b.ts': '', 'secret/c.ts': '' });
  chmodSync(join(dir, 'secret'), 0o000);
  chmodSync(join(dir, 'b.ts'), 0o000);
  try {
    assert.deepEqual(mapCode(dir), ['graph LR', NOTE, '  %% 読めずに飛ばした: 2件', '  m_a_ts["a.ts"]']);
    chmodSync(dir, 0o000);
    assert.throws(() => mapCode(dir, '.'), /^Error: ディレクトリを読めない: \.（EACCES）$/);
  } finally {
    // Restored here rather than in t.after, so the temporary directory can be removed.
    chmodSync(dir, 0o755);
    chmodSync(join(dir, 'secret'), 0o755);
    chmodSync(join(dir, 'b.ts'), 0o644);
  }
});

test('map code refuses a missing directory or a file with distinct messages', (t) => {
  const dir = write(temp(t), { 'a.ts': '' });
  assert.throws(() => mapCode(dir, 'nope'), /^Error: ディレクトリがない: nope$/);
  assert.throws(() => mapCode(dir, 'a.ts/x'), /^Error: ディレクトリがない: a\.ts\/x$/);
  assert.throws(() => mapCode(dir, 'a.ts'), /^Error: ディレクトリではない: a\.ts$/);
});
