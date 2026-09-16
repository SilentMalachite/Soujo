import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
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
import { foldsCase, pathKey } from '../src/files.js';
import { parsePlan } from '../src/state.js';
import { project, repo, temp } from './helpers.js';

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

// Read as a .tsx file, where JSX is on, unless another path is given.
function imports(text: string, from = 'src/a.tsx'): string[] {
  return RULES.imports(from, text);
}

// Edges of importGraph as "from --> to" paths, for files given as path → text; compared as a case sensitive file system
// does unless told otherwise, the way map code compares them.
function edges(files: Record<string, string>, foldCase = false): string[] {
  const scanned = Object.entries(files).map(([path, text]) => ({ path, imports: imports(text, path) }));
  const lines = importGraph(RULES, scanned, [], MAP_LIMITS, (path) => pathKey(path, foldCase));
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

test('scanNotes reports a cut scan, unreadable entries, and files read only in part', () => {
  assert.deepEqual(scanNotes({ unreadable: 0, truncated: false, partial: 0 }), []);
  assert.deepEqual(scanNotes({ unreadable: 2, truncated: true, partial: 3 }), [
    `走査を ${MAP_LIMITS.entries}件で打ち切った（ディレクトリを指定して絞る）`,
    '読めずに飛ばした: 2件',
    `先頭 ${MAP_LIMITS.fileBytes} バイトだけ読んだ: 3件`,
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

test('TS/JS imports tell a division and a JSX closing tag from a regex, and a regex after a condition or "<" from a division', () => {
  const text = [
    "const view = <div>hello</div>; import('./after-jsx.js');",
    "const less = a < /import('.\\/fake-less.js')/.source.length;",
    "for (const k in o) /import('.\\/fake-for.js')/.test(k);",
    "with (o) /require('.\\/fake-with.js')/.test(s);",
    "for await (const c of s) /import('.\\/fake-for-await.js')/.test(c);",
    "const self = <br />; import('./after-self-closing.js');",
    "const x = a++ / b; import('./after-increment.js');",
    "const y = c-- / d; import('./after-decrement.js');",
    "const z = (a) / 2; import('./after-paren.js');",
    "if (ok) /import('.\\/fake-if.js')/.test(s);",
    "while (more) /require('.\\/fake-while.js')/g.exec(s);",
    "} else if (a) /from '.\\/fake-else-if.js'/.test(s);",
    "obj.if(a) / 2; import('./after-member.js');",
  ].join('\n');
  const found = ['./after-jsx.js', './after-self-closing.js', './after-increment.js', './after-decrement.js', './after-paren.js', './after-member.js'];
  // The same either way: with JSX off the "</" and the "<" are read as punctuation instead of as an element's tags.
  for (const from of ['a.tsx', 'a.ts']) assert.deepEqual(imports(text, from), found, from);
});

test('TS/JS imports skip JSX text and attribute values and read only what its braces hold', () => {
  const text = [
    "const page = <div>import { a } from './fake-text.js'</div>;",
    'const tag = <Icon from=\'./fake-attr.js\' import="./fake-quoted.js" />;',
    "const dashed = <a.b data-x='./fake-dash.js'>require('./fake-child.js')</a.b>;",
    "const wrap = <p title='top\nfrom \"./fake-multiline.js\"'>ok</p>;",
    "const held = <Box>{import('./held.js')}</Box>;",
    'const spread = <Box {...props} on={() => import(\'./handler.js\')} />;',
    "const noted = <Box>{/* import('./fake-comment.js') */}</Box>;",
    'const list = <><li>from "./fake-fragment.js"</li>{import(`./frag.js`)}</>;',
    "const deep = <Outer><Inner alt='./fake-inner.js'>{import('./deep.js')}</Inner>text</Outer>;",
    "const apostrophe = <p>don't take from './fake-quote.js'</p>;",
    "function render() { return <div>from './fake-return.js'</div>; }",
    "export default <p>from './fake-default.js'</p>;",
    "const spaced = <br / >; import('./after-spaced.js');",
    'const commented = <Box /* from \'./fake-tag-comment.js\' */ x={1} />;',
    "const second = <Box x={y} p={/from '.\\/fake-regex.js'/} />;",
    "const nestedBrace = <Box style={{a: 1}} k={import('./in-object.js')} />;",
    "import('./after-element.js');",
  ].join('\n');
  assert.deepEqual(imports(text), ['./held.js', './handler.js', './frag.js', './deep.js', './after-spaced.js', './in-object.js', './after-element.js']);
});

test('TS/JS imports leave an operand where a JSX element ends, so a "/" after it divides', () => {
  assert.deepEqual(imports("const n = <a/> / 2; import('./after-division.js');"), ['./after-division.js']);
  assert.deepEqual(imports("const o = <a>t</a> / 2; import('./after-children.js');"), ['./after-children.js']);
  // The white space between the "/" and the ">" of a self-closing tag: without it the element would not end here.
  assert.deepEqual(imports("const p = <br / > / 2; import('./after-spaced.js');"), ['./after-spaced.js']);
});

test('TS/JS imports keep reading a tag through its type arguments, a comment, and an element written as a value', () => {
  assert.deepEqual(imports("const a = <Box<T>>from './fake-type.js'</Box>; import('./after-type.js');"), ['./after-type.js']);
  assert.deepEqual(imports("const b = <M<K, V[] | N>>from './fake-nested-type.js'</M>; import('./after-nested-type.js');"), ['./after-nested-type.js']);
  assert.deepEqual(imports("const c = <Box /* x */>from './fake-block.js'</Box>; import('./after-block.js');"), ['./after-block.js']);
  assert.deepEqual(imports("const d = <Box // x\n>from './fake-line.js'</Box>; import('./after-line.js');"), ['./after-line.js']);
  assert.deepEqual(imports("const e = <Box icon = <Icon/>>from './fake-value.js'</Box>; import('./after-value.js');"), ['./after-value.js']);
  // A type argument list holding something this reading does not know is no tag, and the text is read again as code.
  assert.deepEqual(imports("const f = <Box<{a: 1}>>from './read-again.js'</Box>;"), ['./read-again.js']);
});

test('TS/JS imports keep two JSX braces apart, so what they hold does not read as one call', () => {
  assert.deepEqual(imports("const a = <p>{require}{'./fake-call.js', 1}</p>; import('./after.js');"), ['./after.js']);
  assert.deepEqual(imports("const b = <p>{from}{'./fake-from.js'}</p>; import('./after-from.js');"), ['./after-from.js']);
});

test('TS/JS imports read "<x>" as a type in .ts, .mts, and .cts and as a JSX element in the other extensions', () => {
  const text = "const s = <string>text from './fake.js'</string>; import('./after.js');";
  for (const from of ['a.ts', 'a.mts', 'a.cts', 'types.d.ts', 'A.TS']) assert.deepEqual(imports(text, from), ['./fake.js', './after.js'], from);
  for (const from of ['a.tsx', 'a.jsx', 'a.js', 'a.mjs', 'a.cjs', 'a.JSX']) assert.deepEqual(imports(text, from), ['./after.js'], from);
  // The extensions that allow JSX are a list of their own: one outside it is read the way ".ts" is, not the way ".tsx" is.
  for (const from of ['a.foo', 'a', 'a.tsx.bak']) assert.deepEqual(imports(text, from), ['./fake.js', './after.js'], from);
});

test('TS/JS imports read again from after a "<" that no tag follows, and from an element nothing closes', () => {
  assert.deepEqual(imports("const f = <T,>(x: T) => import('./generic.js');"), ['./generic.js']);
  assert.deepEqual(imports("const g = <div; import('./after-broken.js');"), ['./after-broken.js']);
  assert.deepEqual(imports("const h = <p title='unclosed>import('./after-unterminated.js');"), []);
  // Nothing closes these by the end of the text, so they were no elements: what follows each is read again as code.
  assert.deepEqual(imports("const i = <div>text; import('./after-unclosed.js');"), ['./after-unclosed.js']);
  assert.deepEqual(imports("const j = <T>(x: T) => import('./after-generic.js');"), ['./after-generic.js']);
  assert.deepEqual(imports("type X = <T>(a: T) => T;\nimport('./after-type.js');"), ['./after-type.js']);
  assert.deepEqual(imports("const k = <Box icon=<Icon>text; import('./after-value.js');"), ['./after-value.js']);
  // What its braces held is read once, not twice.
  assert.deepEqual(imports("const l = <p>{import('./in-open.js'); import('./after-open.js');"), ['./in-open.js', './after-open.js']);
  // Two generic types: the second is text inside the first, so both are read again at once, and a later element still is one.
  const types = "type A = <T>(a: T) => T;\ntype B = <U>(b: U) => U;\nconst v = <p>from './fake-text.js'</p>;\nimport('./after-types.js');";
  assert.deepEqual(imports(types), ['./after-types.js']);
  // One left open inside the braces of another: only that one is read again, and the other then closes. The quote is text in
  // the first reading, where it opens the braces that nothing closes, and a string in the second.
  const inner = "const m = <p>{(x: <T>(a: T) => T, s = '{') => x}from './fake-outer.js'</p>; import('./after-inner.js');";
  assert.deepEqual(imports(inner), ['./after-inner.js']);
  // What the braces left open goes with them: a "{" (a block), a "(" (a condition), and a "function" awaiting its body.
  assert.deepEqual(imports("const a = <p>{ } } / import('.\\/fake-object.js') / 1; import('./after-object.js'); { {"), ['./after-object.js']);
  assert.deepEqual(imports("const b = <p>{ ) / import('./divided.js') / 1; import('./after-condition.js'); if ("), ['./divided.js', './after-condition.js']);
  assert.deepEqual(imports("const c = <p>{ } / import('.\\/fake-body.js') / 1; import('./after-body.js'); {function"), ['./after-body.js']);
  // Inside another element the "<" is text, not punctuation, so what follows it is no more code than the rest.
  assert.deepEqual(imports("const k = <p>a <b, from './fake-nested.js' {import('./nested.js')}</p>;"), ['./nested.js']);
  // What a rejected element's braces held is read once, not twice, since the text they hold is read again as code.
  assert.deepEqual(imports("const l = <T a={import('./once.js')},>(x: T) => x;"), ['./once.js']);
  // One rejected element in the braces of another: both are read again, and neither is read again once per level around it.
  assert.deepEqual(imports("const m = <T a={<U b={import('./inner.js')},>(y: U) => y},>(x: T) => x; import('./after.js');"), ['./inner.js', './after.js']);
  // Where no value can start a "<" compares, so no element is read there; and a digit starts no name, so "<3" opens none.
  assert.deepEqual(imports("const n = a<b>c; import('./after-compare.js');"), ['./after-compare.js']);
  assert.deepEqual(imports("const o = <3>v; import('./after-digit.js');"), ['./after-digit.js']);
});

test('TS/JS imports keep their known misjudgements as documented, and only those', () => {
  // In .ts "<T>" is a type, so a generic function type opens no element there.
  assert.deepEqual(imports("type X = <T>(a: T) => T;\nimport('./after-type.js');", 'src/a.ts'), ['./after-type.js']);
  // A block after a label or a "case" is read as an object literal (see opensBlock): a "/" after its "}" divides, so a quote
  // in the regex that follows opens a string, and the import after it is lost.
  assert.deepEqual(imports("L: {}\n/'/.test(s); import('./lost.js');", 'src/a.ts'), []);
  assert.deepEqual(imports("switch (x) { case 1: {} /'/.test(s); import('./lost-case.js'); }", 'src/a.ts'), []);
  // Harmless without such a quote, and a block where a statement starts is read as one.
  assert.deepEqual(imports("L: {}\n/x/.test(s); import('./harmless.js');", 'src/a.ts'), ['./harmless.js']);
  assert.deepEqual(imports("{}\n/'/.test(s); import('./kept.js');", 'src/a.ts'), ['./kept.js']);
});

test('TS/JS imports keep a template substitution and a JSX brace in the order they were opened', () => {
  assert.deepEqual(imports("const a = `${<b>{import('./in-jsx.js')}</b>}`; import('./after-template.js');"), ['./in-jsx.js', './after-template.js']);
  assert.deepEqual(imports("const b = <p>{`${import('./in-template.js')}`}</p>; import('./after-element.js');"), ['./in-template.js', './after-element.js']);
  // The two alternate at the same brace depth, so only the order they were opened in tells which one a "}" closes.
  assert.deepEqual(imports("const c = `${<p a={`${import('./in.js')}`}>t</p>}`; import('./after.js');"), ['./in.js', './after.js']);
});

test('TS/JS imports read a "/" after a declaration body as a regex and after a value as a division', () => {
  const blocks = [
    "function f() {} /from '.\\/fake-block.js'/.test(s); import('./after-block.js');",
    "if (a) { b(); } /import('.\\/fake-if.js')/.test(s);",
    "class C {} /require('.\\/fake-class.js')/.test(s);",
    "class D<T> {} /import('.\\/fake-generic.js')/.test(s);",
    "function g(): number[] {} /import('.\\/fake-return-type.js')/.test(s);",
    "function h() { const o = { a: 1 }; } /import('.\\/fake-outer.js')/.test(s);",
  ].join('\n');
  assert.deepEqual(imports(blocks), ['./after-block.js']);
  const values = [
    "const ratio = { a: 1 } / 2; import('./after-object.js');",
    "const nested = f({ a: { b: 1 } }) / 2; import('./after-call.js');",
    "const method = { m() { return 1 } } / 2; import('./after-method.js');",
    "const value = function () {} / 2; import('./after-function-expression.js');",
    "const klass = class {} / 2; import('./after-class-expression.js');",
    "export default {} / 2; import('./after-default.js');",
    "const cast = x as {} / 2; import('./after-as.js');",
    "const ok = x satisfies {} / 2; import('./after-satisfies.js');",
  ].join('\n');
  assert.deepEqual(imports(values), [
    './after-object.js',
    './after-call.js',
    './after-method.js',
    './after-function-expression.js',
    './after-class-expression.js',
    './after-default.js',
    './after-as.js',
    './after-satisfies.js',
  ]);
  // A brace with no match of its own: a "}" closes a block the text does not hold, an open "{" leaves a statement started.
  assert.deepEqual(imports("} /import('.\\/fake-loose.js')/.test(s); import('./after-loose.js');"), ['./after-loose.js']);
  assert.deepEqual(imports("function f() { /import('.\\/fake-unclosed.js')/.test(s);"), []);
});

test('TS/JS imports end a template at its last part, so what a substitution held is not the token before "/"', () => {
  assert.deepEqual(imports('const s = `${function () {}}` / 2; import("./after-template.js");'), ['./after-template.js']);
  assert.deepEqual(imports("const s = `${/import('.\\/fake-sub.js')/}`; import('./after-substitution.js');"), ['./after-substitution.js']);
  assert.deepEqual(imports("const r = `${require}`('./fake-tag.js'); import('./after-tag.js');"), ['./after-tag.js']);
  assert.deepEqual(imports('const n = `${1}${{ a: 2 }}` / 2; import("./after-parts.js");'), ['./after-parts.js']);
});

test('TS/JS imports end a line comment, a regex, and an unterminated quote at every line terminator', () => {
  const [lf, cr, ls, ps] = [0x0a, 0x0d, 0x2028, 0x2029].map((code) => String.fromCharCode(code));
  for (const [name, end] of [['cr', cr], ['ls', ls], ['ps', ps]] as const) {
    assert.deepEqual(imports(`// import './hidden.js'${end}import './comment-${name}.js';`), [`./comment-${name}.js`], name);
    assert.deepEqual(imports(`const re = /a${end}import './regex-${name}.js';`), [`./regex-${name}.js`], name);
  }
  // Every line of a file whose lines end with a carriage return, not only the first.
  assert.deepEqual(imports(`// a${cr}import './one.js';${cr}// b${cr}import './two.js';`), ['./one.js', './two.js']);
  assert.deepEqual(imports(`// a${cr}${lf}import './crlf.js';`), ['./crlf.js']);
  // A backslash escapes a character of a regular expression, but not a line terminator, inside a character class either.
  assert.deepEqual(imports(`const re = /a\\${cr}import './escape-cr.js';`), ['./escape-cr.js']);
  assert.deepEqual(imports(`const re = /a\\${ps}import './escape-ps.js';`), ['./escape-ps.js']);
  assert.deepEqual(imports(`const re = /[a${cr}import './class-cr.js';`), ['./class-cr.js']);
  for (const [name, end] of [['lf', lf], ['cr', cr]] as const) {
    assert.deepEqual(imports(`const unclosed = 'from ${end}import './quote-${name}.js';`), [`./quote-${name}.js`], name);
    assert.deepEqual(imports(`const unclosed = "from ${end}import './double-${name}.js';`), [`./double-${name}.js`], name);
  }
  // U+2028 and U+2029 are allowed inside a string literal, so they do not end one.
  assert.deepEqual(imports(`import './sep${ls}.js'; import './sep${ps}.js';`), [`./sep${ls}.js`, `./sep${ps}.js`]);
});

test('TS/JS imports read white space above ASCII as a separator, not as part of a name', () => {
  const [nbsp, ogham, em, ideographic, bom] = [0xa0, 0x1680, 0x2003, 0x3000, 0xfeff].map((code) => String.fromCharCode(code));
  for (const [name, space] of [['nbsp', nbsp], ['ogham', ogham], ['em', em], ['ideographic', ideographic], ['bom', bom]] as const) {
    assert.deepEqual(imports(`import${space}'./${name}.js';`), [`./${name}.js`], name);
    assert.deepEqual(imports(`import a from${space}'./from-${name}.js';`), [`./from-${name}.js`], name);
  }
  assert.deepEqual(imports(`import${ideographic}{ a }${ideographic}from${ideographic}'./named.js';`), ['./named.js']);
  // Letters above ASCII still hold a name together, so a member call is still skipped.
  assert.deepEqual(imports("モジュール.import('./member.js'); import('./real.js');"), ['./real.js']);
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

test('TS/JS resolution swaps only an extension written as TypeScript writes it, so a case is not swapped away', () => {
  // ".TS" is no swap of its own, so the file spelled that way is found and "dep.ts" is not reached from it.
  assert.deepEqual(edges({ 'src/cli.ts': "import './dep.TS';", 'src/dep.TS': '', 'src/dep.ts': '' }), ['src/cli.ts --> src/dep.TS']);
  assert.deepEqual(edges({ 'src/cli.ts': "import './dep.TS';", 'src/dep.ts': '' }), []);
  // Where the file system folds case, the index reaches the file of the other spelling, as that file system would.
  assert.deepEqual(edges({ 'src/cli.ts': "import './dep.TS';", 'src/dep.ts': '' }, true), ['src/cli.ts --> src/dep.ts']);
});

test('TS/JS resolution swaps extensions the TypeScript way and finds index files', () => {
  assert.deepEqual(
    edges({
      'src/cli.ts': "import './a.js'; import './b.mjs'; import './c.js'; import './types'; import './lib';",
      'src/a.ts': '',
      'src/a.js': '',
      'src/b.ts': '',
      'src/b.mts': '',
      'src/c.cts': '',
      'src/types.d.ts': '',
      'src/lib/index.ts': '',
    }),
    ['src/cli.ts --> src/a.ts', 'src/cli.ts --> src/b.mts', 'src/cli.ts --> src/lib/index.ts', 'src/cli.ts --> src/types.d.ts'],
  );
});

test('TS/JS resolution completes a name of another case only where the file system folds case', () => {
  const files = { 'src/cli.ts': "import './State.js'; import './Lib';", 'src/state.ts': '', 'src/lib/index.ts': '' };
  assert.deepEqual(edges(files, true), ['src/cli.ts --> src/lib/index.ts', 'src/cli.ts --> src/state.ts']);
  assert.deepEqual(edges(files), []);
});

test('TS/JS resolution matches a path the file system hands back in the other normal form', () => {
  // "café.ts" as the file system stores it decomposed (e + U+0301) against the composed specifier, and the other way round.
  const decomposed = 'src/café.ts';
  assert.deepEqual(edges({ 'src/cli.ts': "import './café.js';", [decomposed]: '' }), [`src/cli.ts --> ${decomposed}`]);
  assert.deepEqual(edges({ 'src/cli.ts': "import './café.js';", 'src/café.ts': '' }), ['src/cli.ts --> src/café.ts']);
});

test('TS/JS resolution cuts a query and a fragment off a specifier and decodes its percent escapes', () => {
  assert.deepEqual(
    edges({
      'src/cli.ts': [
        "import './b.js?raw'; import './c.js#frag'; import './f.js?a#b';",
        "import './d%2Ee.js'; import './caf%C3%A9.ts'; import './h%2Fi.ts'; import './q%3Fr.ts';",
        "import './g/?x'; import '.?x'; import '..#y';",
        "import './%zz.ts'; import './raw%2Dname.js';",
      ].join('\n'),
      'src/b.ts': '',
      'src/c.ts': '',
      'src/f.ts': '',
      'src/d.e.ts': '',
      'src/café.ts': '',
      'src/h/i.ts': '',
      'src/q?r.ts': '',
      'src/g/index.ts': '',
      'src/index.ts': '',
      'index.ts': '',
      'src/%zz.ts': '',
      // Only the text as written names this one: "%2D" decodes to "-", and no "raw-name" file is scanned.
      'src/raw%2Dname.ts': '',
    }),
    [
      'src/cli.ts --> index.ts',
      'src/cli.ts --> src/%zz.ts',
      'src/cli.ts --> src/b.ts',
      'src/cli.ts --> src/c.ts',
      'src/cli.ts --> src/café.ts',
      'src/cli.ts --> src/d.e.ts',
      'src/cli.ts --> src/f.ts',
      'src/cli.ts --> src/g/index.ts',
      'src/cli.ts --> src/h/i.ts',
      'src/cli.ts --> src/index.ts',
      'src/cli.ts --> src/q?r.ts',
      'src/cli.ts --> src/raw%2Dname.ts',
    ],
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
    // "]" would close the node and a backtick after the quote opens a Markdown string.
    { path: 'a].ts', imports: [] },
    { path: '`b`.ts', imports: [] },
  ]);
  assert.deepEqual(graph, [
    'graph LR',
    NOTE,
    '  m__b__ts["#96;b#96;.ts"]',
    '  m_a_b_ts["a-b.ts"]',
    '  m_a__ts["a#93;.ts"]',
    '  m_a_b_ts_2["a_b.ts"]',
    '  m_q_______ts["q#34;#35;#38;#60;#62; .ts"]',
    '  m_a_b_ts --> m_a_b_ts_2',
  ]);
});

test('importGraph numbers colliding ids in path order, so a file added before them shifts the numbers, and sorts by UTF-16 code unit', () => {
  const nodes = (paths: string[]): string[] => importGraph(RULES, paths.map((path) => ({ path, imports: [] }))).filter((line) => line.endsWith(']'));
  assert.deepEqual(nodes(['a-b.ts', 'a_b.ts']), ['  m_a_b_ts["a-b.ts"]', '  m_a_b_ts_2["a_b.ts"]']);
  // "a.b.ts" sorts between the two, takes "_2", and pushes "a_b.ts" up to "_3".
  assert.deepEqual(nodes(['a-b.ts', 'a_b.ts', 'a.b.ts']), ['  m_a_b_ts["a-b.ts"]', '  m_a_b_ts_2["a.b.ts"]', '  m_a_b_ts_3["a_b.ts"]']);
  // A surrogate pair (U+1F600 as D83D DE00) sorts before U+FFFD by code unit, and after it by code point.
  assert.deepEqual(nodes(['\u{1F600}.ts', '�.ts']), ['  m____ts["\u{1F600}.ts"]', '  m___ts["�.ts"]']);
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
    `// ${'x'.repeat(100_000)}`,
    `// x${String.fromCharCode(0x0d)}`.repeat(30_000),
    'あ'.repeat(100_000),
    // JSX: an element read again as code every time, one nested in the next, and a tag and an attribute value left open.
    '<a,'.repeat(50_000),
    '<a<'.repeat(50_000),
    '<p>{'.repeat(30_000),
    `<a ${'y '.repeat(50_000)},`,
    "<p title='".repeat(30_000),
    // A rejected element in the "{ }" of another: reading it again once per level around it would double the work each time.
    `${'<T a={'.repeat(20_000)}1${'},'.repeat(20_000)}`,
    // Elements nothing closes, read again from each: nested as children, as generic types, and each in the braces of the last.
    '<p>'.repeat(40_000),
    'type X = <T>(a: T) => T;\n'.repeat(5_000),
    '<p>{(function '.repeat(10_000),
    '<a b=<c>'.repeat(20_000),
  ];
  for (const text of inputs) importGraph(RULES, [{ path: 'a.tsx', imports: imports(text) }]);
  // The end of a long input is still read: a scan that swallowed a line or stopped early would drop this one.
  assert.deepEqual(imports(`// x${String.fromCharCode(0x0d)}`.repeat(30_000) + "import './end.js';"), ['./end.js']);
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
  const dir = project(repo(t), { 'PLAN.md': PLAN });
  mkdirSync(join(dir, 'src'));
  assert.deepEqual(mapPlan(join(dir, 'src')), planDiagram(parsePlan(PLAN)));
  assert.deepEqual(mapPlan(project(temp(t), { 'PLAN.md': '# PLAN\n' })), ['PLAN.md に層がない']);
  assert.throws(() => mapPlan(project(temp(t))), /PLAN\.md がない/);
  assert.throws(() => mapPlan(temp(t)), /\.soujo\/ が見つからない/);
});

test('map code scans the project root by default, skipping output directories, dot-entries, and symlinks', (t) => {
  const dir = write(project(repo(t)), {
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
  // A dir outside the project, or outside cwd where there is none, is read as asked and said so first.
  assert.deepEqual(mapCode(dir, join(outside, 'sub')), ['graph LR', NOTE, `  %% プロジェクトの外を読んだ: ${join(outside, 'sub')}`, '  m_a_ts["a.ts"]']);
  assert.deepEqual(mapCode(join(outside, 'sub'), '..').slice(1, 3), [NOTE, '  %% プロジェクトの外を読んだ: ..']);
  const elixir = write(temp(t), { 'mix.exs': '', 'lib/x.ex': '' });
  assert.deepEqual(mapCode(join(dir, 'src'), elixir).slice(-1), [`注: プロジェクトの外を読んだ: ${elixir}`]);
});

test('map code tells a dir outside the project by its real path, as the file system compares names', { skip: process.platform === 'win32' }, (t) => {
  const dir = write(project(repo(t)), { 'src/a.ts': '' });
  const outside = write(temp(t), { 'lib/b.ts': '' });
  // A symlink in the project that leads out: the scan follows it, so what it reads is not the project's.
  symlinkSync(join(outside, 'lib'), join(dir, 'external'));
  assert.deepEqual(mapCode(dir, 'external'), ['graph LR', NOTE, '  %% プロジェクトの外を読んだ: external', '  m_b_ts["b.ts"]']);
  // A path outside that leads into the project is the project's.
  symlinkSync(join(dir, 'src'), join(outside, 'into'));
  assert.deepEqual(mapCode(dir, join(outside, 'into')), ['graph LR', NOTE, '  m_a_ts["a.ts"]']);
  // Another letter case of a directory in the project stays in it where the file system ignores case.
  if (foldsCase(dir)) assert.deepEqual(mapCode(dir, 'SRC'), ['graph LR', NOTE, '  m_a_ts["a.ts"]']);
});

test('map code reads each file by its own extension, so a .tsx text is no edge and a .ts "<x>" is a type', (t) => {
  const dir = write(project(repo(t)), {
    'src/page.tsx': "const v = <p>from './fake.js'</p>;\nimport('./b.js');\n",
    'src/types.ts': "const s = <string>text from './fake.js';\n",
    'src/b.ts': '',
    'src/fake.ts': '',
  });
  assert.deepEqual(mapCode(join(dir, 'src')).filter((line) => line.includes('-->')), ['  m_src_page_tsx --> m_src_b_ts', '  m_src_types_ts --> m_src_fake_ts']);
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

test('map code completes a name of another case only where the file system ignores it', (t) => {
  const dir = write(temp(t), { 'src/a.ts': "import './Dep.js';", 'src/b.ts': "import './dep.js';", 'src/dep.ts': '' });
  // Asked of the file system itself, so the expectation does not come from the check map code makes. Only the branch this
  // host takes runs here; both are covered above by the importGraph tests, which do not touch a file system.
  const folds = existsSync(join(dir, 'SRC', 'DEP.TS'));
  assert.deepEqual(mapCode(dir, 'src').filter((line) => line.includes('-->')), [
    ...(folds ? ['  m_a_ts --> m_dep_ts'] : []),
    '  m_b_ts --> m_dep_ts',
  ]);
});

test('map code reads a file to the byte limit and no further, counting the files it cut', (t) => {
  // "exact.ts" is the limit itself and is read whole; "over.ts" is one byte longer and is cut.
  const dir = write(temp(t), { 'exact.ts': 'x'.repeat(32), 'over.ts': 'x'.repeat(33) });
  const limits = { ...MAP_LIMITS, fileBytes: 32 };
  assert.deepEqual(mapCode(dir, '.', limits), ['graph LR', NOTE, '  %% 先頭 32 バイトだけ読んだ: 1件', '  m_exact_ts["exact.ts"]', '  m_over_ts["over.ts"]']);
  assert.deepEqual(mapCode(dir, '.', { ...limits, fileBytes: 33 }), ['graph LR', NOTE, '  m_exact_ts["exact.ts"]', '  m_over_ts["over.ts"]']);

  const cut = write(temp(t), { 'a.ts': `// ${'x'.repeat(57)}\nimport './b.js';\n`, 'b.ts': '' });
  assert.ok(mapCode(cut, '.').includes('  m_a_ts --> m_b_ts'));
  assert.deepEqual(mapCode(cut, '.', { ...MAP_LIMITS, fileBytes: 40 }), [
    'graph LR',
    NOTE,
    '  %% 先頭 40 バイトだけ読んだ: 1件',
    '  m_a_ts["a.ts"]',
    '  m_b_ts["b.ts"]',
  ]);
});

test('map code ends a cut file at its last complete line, so half an import is no edge', (t) => {
  const dir = write(temp(t), { 'a.ts': "import './b.js';\nimport './dependency.js';\n", 'b.ts': '', 'dep.ts': '', 'dependency.ts': '' });
  // Line 1 is 17 bytes; 30 stops inside "'./dependency.js'", where "'./dep" would read as a whole specifier of its own.
  assert.deepEqual(mapCode(dir, '.', { ...MAP_LIMITS, fileBytes: 30 }).filter((line) => line.includes('-->')), ['  m_a_ts --> m_b_ts']);
  assert.deepEqual(mapCode(dir, '.').filter((line) => line.includes('-->')), ['  m_a_ts --> m_b_ts', '  m_a_ts --> m_dependency_ts']);
  // Nothing at all when the first bytes hold no line break: the one line there is was cut.
  assert.deepEqual(mapCode(dir, '.', { ...MAP_LIMITS, fileBytes: 10 }).filter((line) => line.includes('-->')), []);
});

test('map code cuts a file inside a character without failing', (t) => {
  // "const s = '" is 11 bytes and "あ" is 3 in UTF-8, so 32 - 17 - 11 = 4 bytes of them lands inside the second one.
  const dir = write(temp(t), { 'a.ts': `import './b.js';\nconst s = '${'あ'.repeat(4)}';\n`, 'b.ts': '' });
  assert.deepEqual(mapCode(dir, '.', { ...MAP_LIMITS, fileBytes: 32 }), [
    'graph LR',
    NOTE,
    '  %% 先頭 32 バイトだけ読んだ: 1件',
    '  m_a_ts["a.ts"]',
    '  m_b_ts["b.ts"]',
    '  m_a_ts --> m_b_ts',
  ]);
});

test('map code reads what a byte limit that names no amount asks for, without failing', (t) => {
  const dir = write(temp(t), { 'a.ts': "import './b.js';\n", 'b.ts': '' });
  const whole = ['graph LR', NOTE, '  m_a_ts["a.ts"]', '  m_b_ts["b.ts"]', '  m_a_ts --> m_b_ts'];
  // Not a finite count of bytes: the default stands, and no buffer is asked for the size of the largest file on the disk.
  for (const fileBytes of [Number.POSITIVE_INFINITY, Number.NaN]) {
    assert.deepEqual(mapCode(dir, '.', { ...MAP_LIMITS, fileBytes }), whole, `fileBytes: ${fileBytes}`);
  }
  // Below one byte: every file is cut, and a cut file ends at a line break it does not reach.
  for (const fileBytes of [-1, 0, 1.5]) {
    assert.deepEqual(mapCode(dir, '.', { ...MAP_LIMITS, fileBytes }), [
      'graph LR',
      NOTE,
      `  %% 先頭 ${Math.max(Math.floor(fileBytes), 0)} バイトだけ読んだ: 1件`,
      '  m_a_ts["a.ts"]',
      '  m_b_ts["b.ts"]',
    ], `fileBytes: ${fileBytes}`);
  }
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
    // What was skipped and what was cut are counted apart, and both notes are shown.
    assert.deepEqual(mapCode(dir, '.', { ...MAP_LIMITS, fileBytes: 4 }), [
      'graph LR',
      NOTE,
      '  %% 読めずに飛ばした: 2件',
      '  %% 先頭 4 バイトだけ読んだ: 1件',
      '  m_a_ts["a.ts"]',
    ]);
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
