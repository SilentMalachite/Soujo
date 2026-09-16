// Diagrams for soujo map: PLAN.md as a vertical ASCII diagram, imports as Mermaid, and a directory tree. Pure functions only.

import { posix } from 'node:path';
import { formatItem, nextLayer, printable, type PlanItem } from './state.js';

/** Scanned files by path: an exact match first, then one ignoring case (for case-insensitive file systems). */
export interface FileIndex {
  find(path: string): string | undefined;
}

export interface ImportRules {
  /** Import specifiers written in a file, in order. */
  imports(text: string): string[];
  /** The scanned file a specifier in from points to; undefined for packages, path aliases, and missing files. */
  resolve(from: string, specifier: string, files: FileIndex): string | undefined;
}

export interface Language {
  name: string;
  extensions: readonly string[];
  /** How imports become edges. Languages without rules are drawn as a directory tree. */
  graph?: ImportRules;
}

export interface ScannedFile {
  /** Relative to the scanned directory, "/"-separated. */
  path: string;
  imports: string[];
}

export interface MapLimits {
  /** Files and directories scanned before stopping. */
  entries: number;
  nodes: number;
  /** Below Mermaid's default maxEdges (500). */
  edges: number;
  treeLines: number;
}

export const MAP_LIMITS: MapLimits = { entries: 5000, nodes: 100, edges: 300, treeLines: 200 };

// One row per language; extensions are lower case and belong to one row. Earlier rows win ties for the main language.
export const LANGUAGES: readonly Language[] = [
  { name: 'TypeScript/JavaScript', extensions: ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'], graph: { imports: scriptImports, resolve: scriptResolve } },
  { name: 'Python', extensions: ['.py'] },
  { name: 'Ruby', extensions: ['.rb'] },
  { name: 'Go', extensions: ['.go'] },
  { name: 'Rust', extensions: ['.rs'] },
  { name: 'Java', extensions: ['.java'] },
  { name: 'Kotlin', extensions: ['.kt', '.kts'] },
  { name: 'Swift', extensions: ['.swift'] },
  { name: 'C/C++', extensions: ['.c', '.h', '.cc', '.cpp', '.cxx', '.hpp'] },
  { name: 'C#', extensions: ['.cs'] },
  { name: 'F#', extensions: ['.fs', '.fsx'] },
  { name: 'PHP', extensions: ['.php'] },
  { name: 'Dart', extensions: ['.dart'] },
  { name: 'Scala', extensions: ['.scala'] },
  { name: 'Elixir', extensions: ['.ex', '.exs', '.heex'] },
  { name: 'Erlang', extensions: ['.erl', '.hrl'] },
  { name: 'Gleam', extensions: ['.gleam'] },
  { name: 'Haskell', extensions: ['.hs'] },
  { name: 'OCaml', extensions: ['.ml', '.mli'] },
  { name: 'Clojure', extensions: ['.clj', '.cljs', '.cljc'] },
  { name: 'Lua', extensions: ['.lua'] },
  { name: 'Zig', extensions: ['.zig'] },
];

const BY_EXTENSION = new Map(LANGUAGES.flatMap((language) => language.extensions.map((extension) => [extension, language] as const)));
// Dependency and build output directories of common toolchains.
const SKIPPED = new Set(['node_modules', 'dist', 'build', 'target', 'vendor', 'deps', '_build', '__pycache__', 'venv', 'coverage']);
const RAIL = ' |  ';
const NO_RAIL = '    ';
const NARROW = 'ディレクトリを指定して絞る';

// Code point order, so output does not depend on the locale.
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Directory entries map code never enters or lists: dependency and build output directories, and names starting with ".". */
export function skipEntry(name: string): boolean {
  return SKIPPED.has(name) || name.startsWith('.');
}

/** The language whose extensions include the file's (ignoring case), or undefined for unrecognized files. */
export function languageOf(path: string): Language | undefined {
  return BY_EXTENSION.get(posix.extname(path).toLowerCase());
}

/** The language with the most files among paths, with those files (earlier rows win ties); undefined when none is recognized. */
export function mainLanguage(paths: string[]): { language: Language; paths: string[] } | undefined {
  const groups = new Map<Language, string[]>();
  for (const path of paths) {
    const language = languageOf(path);
    if (language === undefined) continue;
    const group = groups.get(language);
    if (group === undefined) groups.set(language, [path]);
    else group.push(path);
  }
  let main: { language: Language; paths: string[] } | undefined;
  for (const language of LANGUAGES) {
    const group = groups.get(language);
    if (group !== undefined && group.length > (main?.paths.length ?? 0)) main = { language, paths: group };
  }
  return main;
}

/**
 * PLAN.md as two lines per layer: "[x] <layer>" (with " ←次" on the first unfinished one), then its completion condition
 * on the rail to the next layer. The last layer has no rail below it; "全層完了" follows when every layer is done.
 */
export function planDiagram(items: PlanItem[]): string[] {
  const next = nextLayer(items);
  const lines = items.flatMap((item, index) => [
    `${formatItem(item)}${item === next ? ' ←次' : ''}`,
    `${index < items.length - 1 ? RAIL : NO_RAIL}${item.condition || '未記入'}`,
  ]);
  return items.length > 0 && next === undefined ? [...lines, '全層完了'] : lines;
}

/** Notes about an incomplete scan, shared by the graph and the tree. */
export function scanNotes(scan: { unreadable: number; truncated: boolean }, limits: MapLimits = MAP_LIMITS): string[] {
  return [
    ...(scan.truncated ? [`走査を ${limits.entries}件で打ち切った（${NARROW}）`] : []),
    ...(scan.unreadable > 0 ? [`読めずに飛ばした: ${scan.unreadable}件`] : []),
  ];
}

// --- TypeScript/JavaScript ---

interface Token {
  kind: 'word' | 'punct' | 'string' | 'other';
  value: string;
  /** On ")": it closes the condition of if, while, for (for await included), or with, so a "/" after it starts a regular expression. */
  condition?: boolean;
  /** On "}": it closes a block rather than an object literal, so a "/" after it starts a regular expression. */
  block?: boolean;
}

// Words after which "/" starts a regular expression instead of a division.
const REGEX_AFTER = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
// Words after which "{" opens a block: every word outside REGEX_AFTER, and these two inside it.
const BLOCK_AFTER = new Set(['do', 'else']);
// Words whose "(" opens a statement's condition.
const CONDITION_BEFORE = new Set(['if', 'while', 'for', 'with']);
const SINGLE_ESCAPES = new Map([['b', '\b'], ['f', '\f'], ['n', '\n'], ['r', '\r'], ['t', '\t'], ['v', '\v']]);
// LINE SEPARATOR and PARAGRAPH SEPARATOR, which a backslash turns into a line continuation like a line break.
const SEPARATORS = new Set([0x2028, 0x2029]);
// What ends a '...' or "..." literal left unterminated. The two separators are allowed inside one (ES2019), so they are out.
const QUOTE_ENDS = new Set([0x0a, 0x0d]);
// Line terminators: a line comment ends at one, and a regular expression literal cannot hold one.
const LINE_ENDS = new Set([...QUOTE_ENDS, ...SEPARATORS]);

// Characters of a name, judged one UTF-16 code unit at a time. Above ASCII everything but white space counts, so that names
// in any script hold together (white space is all in the BMP, so a surrogate pair is never split) while a no-break or
// ideographic space still ends the word before it.
function isWordChar(char: string): boolean {
  return /[\w$]/.test(char) || (char.charCodeAt(0) > 0x7f && !/\s/.test(char));
}

// The first line terminator at or after from, or -1.
function lineEnd(text: string, from: number): number {
  for (let index = from; index < text.length; index += 1) if (LINE_ENDS.has(text.charCodeAt(index))) return index;
  return -1;
}

/**
 * Whether a "{" opens a block (a statement) rather than an object literal, judged from the token before it. Known
 * misjudgements, each harmless unless a "/" follows the matching "}": a block after a label or a "case" is read as an object
 * literal, and an object type or literal after "as", "satisfies", "=>", or "export default" is read as a block.
 */
function opensBlock(tokens: Token[]): boolean {
  const previous = tokens.at(-1);
  if (previous === undefined) return true;
  if (previous.kind === 'word') return BLOCK_AFTER.has(previous.value) || !REGEX_AFTER.has(previous.value);
  if (previous.kind !== 'punct') return false;
  // "=>" opens a function body; after ")", ";", and "{" a statement can start, and after "}" when that one closed a block.
  if (previous.value === '>') return isPunct(tokens.at(-2), '=');
  if (previous.value === '}') return previous.block === true;
  return ';{)'.includes(previous.value);
}

// A token that ends an operand, so that "++" or "--" after it is postfix.
function endsOperand(token: Token | undefined): boolean {
  if (token?.kind === 'word') return !REGEX_AFTER.has(token.value);
  return token?.kind === 'string' || token?.kind === 'other' || isPunct(token, ')') || isPunct(token, ']');
}

// before is the character just before the "/".
function regexAllowed(tokens: Token[], before: string | undefined): boolean {
  const previous = tokens.at(-1);
  if (previous === undefined) return true;
  if (previous.kind === 'word') return REGEX_AFTER.has(previous.value);
  if (previous.kind !== 'punct') return false;
  if (previous.value === ')') return previous.condition === true;
  // "</" with nothing between closes a JSX element; "a < /re/" compares with a regular expression.
  if (previous.value === '<') return before !== '<';
  // A block's "}" ends a statement, so what follows starts a new one; an object literal's ends an operand, so "/" divides.
  if (previous.value === '}') return previous.block === true;
  if (previous.value === ']') return false;
  // "a++ / b" divides.
  if ('+-'.includes(previous.value) && isPunct(tokens.at(-2), previous.value)) return !endsOperand(tokens.at(-3));
  return true;
}

// The escape sequence at text[start] (a backslash): its value, or undefined when module code does not allow it, so the literal has no fixed value.
function scanEscape(text: string, start: number): { next: number; value: string | undefined } {
  const char = text[start + 1] ?? '';
  if (char === '\r') return { next: text[start + 2] === '\n' ? start + 3 : start + 2, value: '' };
  if (char === '\n' || SEPARATORS.has(char.charCodeAt(0))) return { next: start + 2, value: '' };
  if (char === 'x' || char === 'u') {
    const rest = text.slice(start + 2, start + 10);
    const match = (char === 'x' ? /^[0-9a-fA-F]{2}/ : /^(?:[0-9a-fA-F]{4}|\{[0-9a-fA-F]{1,6}\})/).exec(rest);
    const code = match === null ? Number.NaN : parseInt(match[0].replace(/[{}]/g, ''), 16);
    if (match === null || !(code <= 0x10ffff)) return { next: start + 2, value: undefined };
    return { next: start + 2 + match[0].length, value: String.fromCodePoint(code) };
  }
  // Only a "0" not followed by a digit; legacy octal escapes and "8" / "9" are not allowed.
  if (/[0-9]/.test(char)) return { next: start + 2, value: char === '0' && !/[0-9]/.test(text[start + 2] ?? '') ? '\0' : undefined };
  return { next: start + 2, value: SINGLE_ESCAPES.get(char) ?? char };
}

// Literal text from start up to where stop holds, with escapes decoded; content is undefined after an escape without a value.
function scanLiteral(text: string, start: number, stop: (index: number) => boolean): { next: number; content: string | undefined } {
  let content: string | undefined = '';
  let index = start;
  while (index < text.length && !stop(index)) {
    if (text[index] === '\\') {
      const escape = scanEscape(text, index);
      content = content === undefined || escape.value === undefined ? undefined : `${content}${escape.value}`;
      index = escape.next;
    } else {
      if (content !== undefined) content += text[index];
      index += 1;
    }
  }
  return { next: Math.min(index, text.length), content };
}

// A '...' or "..." literal from its opening quote; an unterminated one ends at a line feed or a carriage return.
function scanQuoted(text: string, start: number): { next: number; content: string | undefined } {
  const quote = text[start];
  const literal = scanLiteral(text, start + 1, (index) => text[index] === quote || QUOTE_ENDS.has(text.charCodeAt(index)));
  return { next: text[literal.next] === quote ? literal.next + 1 : literal.next, content: literal.content };
}

// Template text from start (after "`" or a substitution's "}") up to its closing "`" or the next "${".
function scanTemplate(text: string, start: number): { next: number; content: string | undefined; substitution: boolean } {
  const literal = scanLiteral(text, start, (index) => text[index] === '`' || (text[index] === '$' && text[index + 1] === '{'));
  const substitution = text[literal.next] === '$';
  const end = literal.next >= text.length ? text.length : literal.next + (substitution ? 2 : 1);
  return { next: end, content: literal.content, substitution };
}

// A regular expression literal from its opening "/"; its flags are read as a word afterwards.
function scanRegex(text: string, start: number): number {
  let inClass = false;
  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];
    if (LINE_ENDS.has(text.charCodeAt(index))) return index;
    // A backslash escapes the next character, except a line terminator: there the literal ends, unterminated.
    else if (char === '\\') index += LINE_ENDS.has(text.charCodeAt(index + 1)) ? 0 : 1;
    else if (inClass) inClass = char !== ']';
    else if (char === '[') inClass = true;
    else if (char === '/') return index + 1;
  }
  return text.length;
}

// Tokens of a script with comments dropped, so that imports are only found in code. Linear in the text length.
function scriptTokens(text: string): Token[] {
  const tokens: Token[] = [];
  // blocks.length is the brace depth: for each open "{", whether it opens a block rather than an object literal.
  const blocks: boolean[] = [];
  const substitutions: number[] = []; // brace depth at which each open "${" closes
  const conditions: boolean[] = []; // for each open "(", whether it opens a statement's condition
  let index = 0;
  const after = (found: number, length: number) => (found === -1 ? text.length : found + length);
  const fixed = (content: string | undefined): Token => (content === undefined ? { kind: 'other', value: '' } : { kind: 'string', value: content });
  while (index < text.length) {
    const char = text[index] ?? '';
    const following = text[index + 1];
    if (/\s/.test(char)) index += 1;
    else if (char === '/' && following === '/') index = after(lineEnd(text, index), 0);
    else if (char === '/' && following === '*') index = after(text.indexOf('*/', index + 2), 2);
    else if (char === "'" || char === '"') {
      const literal = scanQuoted(text, index);
      tokens.push(fixed(literal.content));
      index = literal.next;
    } else if (char === '`' || (char === '}' && substitutions.at(-1) === blocks.length)) {
      if (char === '}') substitutions.pop();
      const template = scanTemplate(text, index + 1);
      // Only a template without substitutions has a fixed value; its later parts add no token.
      if (char === '`') tokens.push(fixed(template.substitution ? undefined : template.content));
      if (template.substitution) substitutions.push(blocks.length);
      index = template.next;
    } else if (char === '/' && regexAllowed(tokens, text[index - 1])) {
      index = scanRegex(text, index);
      tokens.push({ kind: 'other', value: '' });
    } else if (isWordChar(char)) {
      let end = index + 1;
      while (end < text.length && isWordChar(text[end] ?? '')) end += 1;
      tokens.push({ kind: 'word', value: text.slice(index, end) });
      index = end;
    } else {
      const token: Token = { kind: 'punct', value: char };
      if (char === '{') blocks.push(opensBlock(tokens));
      else if (char === '}') {
        // A "}" with no "{" of its own closes a block the scanned text does not hold, so that "/" after it is not division.
        token.block = blocks.pop() ?? true;
      } else if (char === '(') {
        // "for await (" opens a condition like "for (".
        const at = isWord(tokens.at(-1), 'await') && isWord(tokens.at(-2), 'for') ? -2 : -1;
        const keyword = tokens.at(at);
        conditions.push(keyword?.kind === 'word' && CONDITION_BEFORE.has(keyword.value) && !isPunct(tokens.at(at - 1), '.'));
      } else if (char === ')') token.condition = conditions.pop() === true;
      tokens.push(token);
      index += 1;
    }
  }
  return tokens;
}

function isPunct(token: Token | undefined, value: string): boolean {
  return token?.kind === 'punct' && token.value === value;
}

function isWord(token: Token | undefined, value: string): boolean {
  return token?.kind === 'word' && token.value === value;
}

// Specifiers of `from "x"`, `import "x"`, `import("x")`, and `require("x")`, skipping member calls such as `obj.import("x")`
// and arguments that are not a whole fixed string, such as `import("./x" + name)`.
function scriptImports(text: string): string[] {
  const tokens = scriptTokens(text);
  const specifiers: string[] = [];
  tokens.forEach((token, index) => {
    if (token.kind !== 'word' || isPunct(tokens[index - 1], '.')) return;
    const next = tokens[index + 1];
    const whole = isPunct(tokens[index + 3], ')') || isPunct(tokens[index + 3], ',');
    const argument = isPunct(next, '(') && whole ? tokens[index + 2] : undefined;
    if ((token.value === 'from' || token.value === 'import') && next?.kind === 'string') specifiers.push(next.value);
    else if ((token.value === 'import' || token.value === 'require') && argument?.kind === 'string') specifiers.push(argument.value);
  });
  return specifiers;
}

// Extensions tried for a specifier written with an extension, the way TypeScript maps output extensions to sources.
const SCRIPT_SWAPS = new Map<string, readonly string[]>([
  ['.js', ['.ts', '.tsx', '.d.ts', '.js']],
  ['.jsx', ['.tsx', '.jsx']],
  ['.mjs', ['.mts', '.d.mts', '.mjs']],
  ['.cjs', ['.cts', '.d.cts', '.cjs']],
  ['.ts', ['.ts']],
  ['.tsx', ['.tsx']],
  ['.mts', ['.mts']],
  ['.cts', ['.cts']],
]);
// Extensions tried for a specifier written without one, and for its index file.
const SCRIPT_BARE = ['.ts', '.tsx', '.d.ts', '.js', '.jsx', '.mts', '.mjs', '.cts', '.cjs'];

// Only relative specifiers ("./", "../") resolve; packages and path aliases such as "@/x" do not.
function scriptResolve(from: string, specifier: string, files: FileIndex): string | undefined {
  if (!/^\.\.?(?:\/|$)/.test(specifier)) return undefined;
  const target = posix.join(posix.dirname(from), specifier);
  if (target === '..' || target.startsWith('../')) return undefined;
  const index = SCRIPT_BARE.map((extension) => posix.join(target, `index${extension}`));
  // ".", "..", and a trailing "/" name a directory, never a sibling file of the same name.
  const directory = specifier.endsWith('/') || /(?:^|\/)\.\.?$/.test(specifier);
  const extension = posix.extname(target).toLowerCase();
  const swaps = SCRIPT_SWAPS.get(extension);
  let candidates: string[];
  if (directory) candidates = index;
  else if (swaps !== undefined) candidates = swaps.map((swap) => `${target.slice(0, -extension.length)}${swap}`);
  else candidates = [target, ...SCRIPT_BARE.map((bare) => `${target}${bare}`), ...index];
  for (const candidate of candidates) {
    const found = files.find(candidate);
    if (found !== undefined) return found;
  }
  return undefined;
}

// --- Mermaid ---

function fileIndex(paths: string[]): FileIndex {
  const exact = new Set(paths);
  const folded = new Map<string, string>();
  for (const path of paths) if (!folded.has(path.toLowerCase())) folded.set(path.toLowerCase(), path);
  return { find: (path) => (exact.has(path) ? path : folded.get(path.toLowerCase())) };
}

// Ids made from paths, so adding a file does not rename the others; a collision gets "_2", "_3", ...
function nodeIds(paths: string[]): Map<string, string> {
  const ids = new Map<string, string>();
  const used = new Set<string>();
  for (const path of paths) {
    const base = `m_${path.replace(/[^A-Za-z0-9]/g, '_')}`;
    let id = base;
    for (let suffix = 2; used.has(id); suffix += 1) id = `${base}_${suffix}`;
    used.add(id);
    ids.set(path, id);
  }
  return ids;
}

// A quoted label: control characters become spaces, and characters that end the label or read as markup become entity codes.
function label(path: string): string {
  return `"${printable(path).replace(/["#&<>]/g, (char) => `#${char.charCodeAt(0)};`)}"`;
}

/**
 * Mermaid `graph LR` of files (the first of duplicate paths counts): one node per file, one edge per import resolved by rules
 * to another file. Over the limits, the most connected files and the first edges in path order are kept, with a note.
 */
export function importGraph(rules: ImportRules, files: ScannedFile[], notes: string[] = [], limits: MapLimits = MAP_LIMITS): string[] {
  const byPath = new Map<string, ScannedFile>();
  for (const file of files) if (!byPath.has(file.path)) byPath.set(file.path, file);
  const paths = [...byPath.keys()].sort(compare);
  const index = fileIndex(paths);
  const edges = paths.flatMap((from) => {
    const targets = new Set<string>();
    for (const specifier of byPath.get(from)?.imports ?? []) {
      const to = rules.resolve(from, specifier, index);
      if (to !== undefined && to !== from) targets.add(to);
    }
    return [...targets].sort(compare).map((to) => [from, to] as const);
  });

  const degree = new Map<string, number>();
  for (const path of edges.flat()) degree.set(path, (degree.get(path) ?? 0) + 1);
  const byDegree = [...paths].sort((a, b) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0) || compare(a, b));
  const kept = new Set(byDegree.slice(0, limits.nodes));
  const drawn = edges.filter(([from, to]) => kept.has(from) && kept.has(to)).slice(0, limits.edges);
  const omitted = [
    ...(paths.length > kept.size ? [`ファイル ${paths.length - kept.size}件`] : []),
    ...(edges.length > drawn.length ? [`import ${edges.length - drawn.length}件`] : []),
  ];
  const ids = nodeIds(paths);
  return [
    'graph LR',
    ...['相対 import のみ（パッケージ・パス別名は線にしない）', ...notes, ...(omitted.length > 0 ? [`省略: ${omitted.join('・')}（${NARROW}）`] : [])].map(
      (note) => `  %% ${note}`,
    ),
    ...paths.filter((path) => kept.has(path)).map((path) => `  ${ids.get(path)}[${label(path)}]`),
    ...drawn.map(([from, to]) => `  ${ids.get(from)} --> ${ids.get(to)}`),
  ];
}

// --- Directory tree ---

interface Folder {
  folders: Map<string, Folder>;
  files: string[];
}

function renderFolder(folder: Folder, prefix: string): string[] {
  const entries = [
    ...[...folder.folders.keys()].sort(compare).map((name) => ({ name, folder: folder.folders.get(name) })),
    ...[...folder.files].sort(compare).map((name) => ({ name, folder: undefined })),
  ];
  return entries.flatMap((entry, index) => {
    const last = index === entries.length - 1;
    const head = `${prefix}${last ? '`-- ' : '|-- '}${entry.name}${entry.folder ? '/' : ''}`;
    return entry.folder ? [head, ...renderFolder(entry.folder, `${prefix}${last ? '    ' : '|   '}`)] : [head];
  });
}

/**
 * An ASCII directory tree under "<name>/" of paths (directories end with "/", so empty ones show too), folders first, each
 * level in code point order. Lines past the limit are cut with a note; notes follow as "注: ..." lines.
 */
export function directoryTree(name: string, paths: string[], notes: string[] = [], limits: MapLimits = MAP_LIMITS): string[] {
  const root: Folder = { folders: new Map(), files: [] };
  for (const path of paths) {
    const parts = path.split('/');
    let folder = root;
    for (const part of parts.slice(0, -1)) {
      let child = folder.folders.get(part);
      if (child === undefined) {
        child = { folders: new Map(), files: [] };
        folder.folders.set(part, child);
      }
      folder = child;
    }
    const file = parts.at(-1);
    if (file) folder.files.push(file);
  }
  const lines = renderFolder(root, '');
  const shown = lines.slice(0, limits.treeLines);
  const omitted = lines.length > shown.length ? [`省略: ${lines.length - shown.length}件（${NARROW}）`] : [];
  return [`${name}/`, ...shown, ...[...notes, ...omitted].map((note) => `注: ${note}`)];
}
