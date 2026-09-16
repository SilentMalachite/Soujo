// Diagrams for soujo map: PLAN.md as a vertical ASCII diagram, imports as Mermaid, and a directory tree. Pure functions only.

import { posix } from 'node:path';
import { formatItem, nextLayer, printable, type PlanItem } from './state.js';

/** Scanned files by path: an exact match first, then one spelled differently that the file system would take for it. */
export interface FileIndex {
  find(path: string): string | undefined;
}

export interface ImportRules {
  /** Import specifiers written in a file, in order; from is its path, whose extension can change how the text reads. */
  imports(from: string, text: string): string[];
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
  /** Bytes read from one file; what follows the cut is not read, so its imports are not drawn. */
  fileBytes: number;
  nodes: number;
  /** Below Mermaid's default maxEdges (500). */
  edges: number;
  treeLines: number;
}

export const MAP_LIMITS: MapLimits = { entries: 5000, fileBytes: 512 * 1024, nodes: 100, edges: 300, treeLines: 200 };

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

// UTF-16 code unit order, so output does not depend on the locale; a surrogate pair sorts by its first unit, which puts
// it before the last characters of the basic plane rather than after them.
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
export function scanNotes(scan: { unreadable: number; truncated: boolean; partial: number }, limits: MapLimits = MAP_LIMITS): string[] {
  return [
    ...(scan.truncated ? [`走査を ${limits.entries}件で打ち切った（${NARROW}）`] : []),
    ...(scan.unreadable > 0 ? [`読めずに飛ばした: ${scan.unreadable}件`] : []),
    ...(scan.partial > 0 ? [`先頭 ${limits.fileBytes} バイトだけ読んだ: ${scan.partial}件`] : []),
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
// Words after which "{" opens a block: every word outside REGEX_AFTER and VALUE_AFTER, and these two inside REGEX_AFTER.
const BLOCK_AFTER = new Set(['do', 'else']);
// Words after which "{" opens an object literal or a type, though a word usually has a block after it.
const VALUE_AFTER = new Set(['as', 'satisfies', 'default']);
// Words whose body is a block only where the keyword itself stands where a statement can start.
const BODY_BEFORE = new Set(['function', 'class']);
// Words whose "(" opens a statement's condition.
const CONDITION_BEFORE = new Set(['if', 'while', 'for', 'with']);
const SINGLE_ESCAPES = new Map([['b', '\b'], ['f', '\f'], ['n', '\n'], ['r', '\r'], ['t', '\t'], ['v', '\v']]);
// LINE SEPARATOR and PARAGRAPH SEPARATOR, which a backslash turns into a line continuation like a line break.
const SEPARATORS = new Set([0x2028, 0x2029]);
// What ends a '...' or "..." literal left unterminated. The two separators are allowed inside one (ES2019), so they are out.
const QUOTE_ENDS = new Set([0x0a, 0x0d]);
// Line terminators: a line comment ends at one, and a regular expression literal cannot hold one.
const LINE_ENDS = new Set([...QUOTE_ENDS, ...SEPARATORS]);
// Extensions whose "<x>" opens a JSX element. In .ts, .mts, and .cts it is a type assertion or a type argument list instead,
// and an extension outside both sets is read as one of those, the reading that swallows the least when it is wrong.
const JSX_EXTENSIONS = new Set(['.tsx', '.jsx', '.js', '.mjs', '.cjs']);
// The value of a punctuation token that marks where an expression starts without being punctuation any code could write:
// "$" is a word character, so a scan never makes a punctuation token of it. Every rule below reads it as "anything may follow".
const EXPRESSION = '$';

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
 * Whether a "{" opens a block (a statement) rather than an object literal or a type, judged from the token before it. Known
 * misjudgement, harmless unless a "/" follows the matching "}": a block after a label or a "case" is read as an object literal.
 */
function opensBlock(tokens: Token[]): boolean {
  const previous = tokens.at(-1);
  if (previous === undefined) return true;
  if (previous.kind === 'word') return !VALUE_AFTER.has(previous.value) && (BLOCK_AFTER.has(previous.value) || !REGEX_AFTER.has(previous.value));
  if (previous.kind !== 'punct') return false;
  // After ")", ";", and "{" a statement can start; "]" and ">" end a return type or a type parameter list, "=>" a signature.
  if (previous.value === '}') return previous.block === true;
  return ';{)]>'.includes(previous.value);
}

// A token that ends an operand, so that "++" or "--" after it is postfix.
function endsOperand(token: Token | undefined): boolean {
  if (token?.kind === 'word') return !REGEX_AFTER.has(token.value);
  return token?.kind === 'string' || token?.kind === 'other' || isPunct(token, ')') || isPunct(token, ']');
}

// Whether an expression, rather than an operand's continuation, starts here; before is the character just before the "/" or
// the "<" being judged, which keeps the "<" of a shift ("a << b") from reading as the start of one.
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

/** A JSX element being read: its text and its attribute values hold no code, only the "{ }" inside it do. */
interface JsxElement {
  /** Whether the opening tag is closed, so what follows is children rather than attributes. */
  children: boolean;
  /** The open "{" count when the element started; the element is being read only while the count is back to it. */
  braces: number;
  /** Where its "<" is, to read again from after it when what follows is no tag, or from it when nothing closes the element. */
  open: number;
  /** How many tokens there were then, to drop what its "{ }" left when that text is read again. */
  tokens: number;
  /** Whether the last thing read in the opening tag was an attribute's "=", so what follows is its value. */
  value?: boolean;
}

// Characters a type argument list may hold, so that "<Box<T>>" reads as one tag: names, white space, and the punctuation of
// unions, tuples, and nested lists. One holding anything else (an object or a string type) is not recognised as one.
const TYPE_ARGUMENT = /[\w$\s,.[\]|&:?<>]/;

// The end of the type argument list at text[start] (a "<"), or start when no balanced one written this plainly stands there.
function skipTypeArguments(text: string, start: number): number {
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index] ?? '';
    if (!TYPE_ARGUMENT.test(char) && !isWordChar(char)) return start;
    if (char === '<') depth += 1;
    else if (char === '>') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return start;
}

/**
 * What the reading of elements carries between steps, so that the text of one is read again only as often as it must be.
 * A "<" found not to open a tag is read again as code; nest those and each level would read the ones inside it again, which
 * squares the work. rejected keeps the answer for a "<" already judged (it rests on the text after it, so it does not
 * change), the "<" of each element nothing closed by the end of the text among them, and spent counts what has been read
 * twice; once it passes budget, off turns the reading of elements off for the rest of the text, which is then read as code
 * alone.
 */
interface JsxScan {
  rejected: Set<number>;
  spent: number;
  budget: number;
  off: boolean;
}

// Whether a name can start here: a JSX name is an identifier, which no digit leads.
function startsJsxName(char: string): boolean {
  return isWordChar(char) && !/[0-9]/.test(char);
}

// A JSX element or attribute name from start, with its member ("."), namespace (":"), and dashed ("data-x") parts; start
// itself when there is none.
function scanJsxName(text: string, start: number): number {
  if (!startsJsxName(text[start] ?? '')) return start;
  let end = start + 1;
  while (end < text.length && (isWordChar(text[end] ?? '') || '-.:'.includes(text[end] ?? ''))) end += 1;
  return end;
}

// Whether a "<" opens a JSX element rather than a comparison or a type argument list: where a value can start, which is where
// a regular expression can, and after "default" (export default <div />), the one word that starts a value yet ends none.
function jsxAllowed(tokens: Token[], before: string | undefined): boolean {
  return regexAllowed(tokens, before) || isWord(tokens.at(-1), 'default');
}

/**
 * One step of reading the JSX element on top of elements: its attributes until the opening tag closes, its children after
 * that. Nothing read here is code, so the only tokens it adds are the operand a finished element leaves behind and, where
 * what follows a "<" turns out not to be a tag, that "<" itself; brace tells the caller a "{" opened, whose contents it
 * reads as code. Known misjudgements: a generic function type where a value can start (`type X = <T>(a: T) => T`) reads as
 * an element, and since nothing closes it the rest of the text is its children until the end, where it is read again as code
 * (see scriptTokens); a closing tag's name is not matched against the opening one, so an unmatched one ends the wrong
 * element; a type argument list holding an object or a string type (`<Box<{a: 1}>>`) is not read as one, so its tag is taken
 * for no tag at all.
 */
function scanJsx(text: string, start: number, tokens: Token[], elements: JsxElement[], braces: number, scan: JsxScan): { next: number; brace: boolean } {
  const element = elements.at(-1);
  // The caller reads an element only while one is open.
  if (element === undefined) return { next: start + 1, brace: false };
  const char = text[start] ?? '';
  const following = text[start + 1];
  // An element that ends where code, rather than another element's children, surrounds it is an operand there.
  const ended = (next: number): { next: number; brace: boolean } => {
    elements.pop();
    if (elements.at(-1)?.braces !== braces) tokens.push({ kind: 'other', value: '' });
    return { next, brace: false };
  };
  if (element.children) {
    if (char === '{') return { next: start + 1, brace: true };
    if (char !== '<') {
      let end = start + 1;
      while (end < text.length && text[end] !== '<' && text[end] !== '{') end += 1;
      return { next: end, brace: false };
    }
    if (following === '/') return ended(after(text, text.indexOf('>', start + 2), 1));
    // A "<" already found not to open a tag is text here like any other character.
    if (scan.rejected.has(start)) return { next: start + 1, brace: false };
    elements.push({ children: false, braces, open: start, tokens: tokens.length });
    return { next: start + 1, brace: false };
  }
  // Whether an "=" came just before, which only the value after it may read; white space between the two does not end it.
  const value = element.value === true;
  if (!/\s/.test(char)) element.value = false;
  if (/\s/.test(char)) return { next: start + 1, brace: false };
  if (char === '{') return { next: start + 1, brace: true };
  if (char === '=') {
    element.value = true;
    return { next: start + 1, brace: false };
  }
  if (char === '>') {
    element.children = true;
    return { next: start + 1, brace: false };
  }
  if (char === '/') {
    if (following === '*') return { next: after(text, text.indexOf('*/', start + 2), 2), brace: false };
    if (following === '/') return { next: after(text, lineEnd(text, start), 0), brace: false };
    // White space may stand between the "/" and the ">" of a self-closing tag.
    let at = start + 1;
    while (at < text.length && /\s/.test(text[at] ?? '')) at += 1;
    if (text[at] === '>') return ended(at + 1);
  }
  // An attribute value in quotes: it holds no escape, and a line terminator does not end it.
  if (char === '"' || char === "'") return { next: after(text, text.indexOf(char, start + 1), 1), brace: false };
  if (char === '<' && !scan.rejected.has(start)) {
    // After an "=" an element stands as the attribute's value; anywhere else the "<" opens the tag name's type arguments.
    if (value) {
      elements.push({ children: false, braces, open: start, tokens: tokens.length });
      return { next: start + 1, brace: false };
    }
    const arguments_ = skipTypeArguments(text, start);
    if (arguments_ > start) return { next: arguments_, brace: false };
  }
  const name = scanJsxName(text, start);
  if (name > start) return { next: name, brace: false };
  // Not a tag after all: what its "{ }" left is dropped, since the text they hold is about to be read again.
  elements.pop();
  scan.rejected.add(element.open);
  scan.spent += start - element.open;
  tokens.length = element.tokens;
  // Too much read twice already: the caller drops the elements still open and reads the rest, from here, as code.
  if (scan.spent > scan.budget) {
    scan.off = true;
    return { next: start, brace: false };
  }
  // In code the "<" is punctuation and what follows is read again; in another element's children it is text like the rest.
  if (elements.at(-1)?.braces !== braces) tokens.push({ kind: 'punct', value: '<' });
  return { next: element.open + 1, brace: false };
}

// found plus length, or the end of the text when found is -1 (indexOf found nothing).
function after(text: string, found: number, length: number): number {
  return found === -1 ? text.length : found + length;
}

// Tokens of a script with comments dropped, so that imports are only found in code. Linear in the text length. With jsx off,
// "<x>" is read as a type rather than as the start of an element.
function scriptTokens(text: string, jsx: boolean): Token[] {
  const tokens: Token[] = [];
  // blocks.length is the brace depth: for each open "{", whether it opens a block rather than an object literal.
  const blocks: boolean[] = [];
  // For each open "${" or JSX "{", innermost last so the two nest in the right order: the brace depth at which its "}" sits,
  // and how many conditions and bodies were open outside it. Its code neither closes those nor leaves its own open past its
  // "}", so what one leaves on the stacks is gone once it closes, and none of them ever shrinks below where it opened.
  const braces: { depth: number; kind: 'substitution' | 'container'; conditions: number; bodies: number }[] = [];
  const conditions: boolean[] = []; // for each open "(", whether it opens a statement's condition
  const bodies: boolean[] = []; // for each "function" or "class" awaiting its body, whether it stands where a statement can
  const elements: JsxElement[] = []; // for each JSX element being read, innermost last
  // Text read again after a "<" turned out not to open a tag, bounded so that the whole scan stays linear in the text length.
  const scan: JsxScan = { rejected: new Set(), spent: 0, budget: text.length, off: false };
  let index = 0;
  const fixed = (content: string | undefined): Token => (content === undefined ? { kind: 'other', value: '' } : { kind: 'string', value: content });
  // The "${" or JSX "{" that a "}" here closes, if any: only one at the depth it was opened at. Code with unmatched braces
  // never reaches that depth again, so a later "}" closes it instead and the element around it resumes in the wrong place.
  const closing = () => (braces.at(-1)?.depth === blocks.length ? braces.at(-1) : undefined);
  const openBrace = (kind: 'substitution' | 'container') => {
    braces.push({ depth: blocks.length, kind, conditions: conditions.length, bodies: bodies.length });
  };
  const closeBrace = () => {
    const brace = braces.pop();
    if (brace === undefined) return;
    conditions.length = brace.conditions;
    bodies.length = brace.bodies;
  };
  // At the end of the text, an element still open was none, since nothing closed it. The innermost group of them, one read
  // where code stands with those read inside it as children or as an attribute's value, is dropped with all it read, and the
  // text is read again from its "<", now known to open no tag. The rest of the group goes with it, since each is open to the
  // end as well and dropping them one at a time would read the text again once per level; an element around the group is
  // kept, since what the group took from it may yet close it. What is read twice counts toward the budget, and past it every
  // element still open is dropped and the rest is read as code. The stacks go back to where they stood at the "<": the first
  // "{ }" opened after it saved them, and before that nothing but the group was read.
  const reopen = (): boolean => {
    // One read where code stands has more braces open than the element around it; a child or an attribute's value has as many.
    let first = elements.length - 1;
    while (first > 0 && elements[first]?.braces === elements[first - 1]?.braces) first -= 1;
    const group = elements[first];
    if (group === undefined) return false;
    scan.spent += text.length - group.open;
    if (scan.spent > scan.budget) {
      scan.off = true;
      first = 0;
    }
    const element = elements[first] ?? group;
    for (const dropped of elements.slice(first)) scan.rejected.add(dropped.open);
    const brace = braces[element.braces];
    if (brace !== undefined) {
      blocks.length = brace.depth;
      conditions.length = brace.conditions;
      bodies.length = brace.bodies;
    }
    braces.length = element.braces;
    elements.length = first;
    tokens.length = element.tokens;
    index = element.open;
    return true;
  };
  while (index < text.length || reopen()) {
    const char = text[index] ?? '';
    const following = text[index + 1];
    // Inside a JSX element, unless the code of one of its "{ }" is what is being read.
    if (elements.at(-1)?.braces === braces.length) {
      const step = scanJsx(text, index, tokens, elements, braces.length, scan);
      if (step.brace) {
        openBrace('container');
        // What a "{ }" holds is an expression of its own, whatever the element or an earlier "{ }" left before it. A "("
        // would say so too, but it would also let "{require}{'./x'}" read as a call, so the mark is one no code can write.
        tokens.push({ kind: 'punct', value: EXPRESSION });
      }
      index = step.next;
      if (scan.off) {
        elements.length = 0;
        for (let at = braces.length - 1; at >= 0; at -= 1) if (braces[at]?.kind === 'container') braces.splice(at, 1);
      }
    } else if (/\s/.test(char)) index += 1;
    else if (char === '/' && following === '/') index = after(text, lineEnd(text, index), 0);
    else if (char === '/' && following === '*') index = after(text, text.indexOf('*/', index + 2), 2);
    else if (char === "'" || char === '"') {
      const literal = scanQuoted(text, index);
      tokens.push(fixed(literal.content));
      index = literal.next;
    } else if (char === '`' || (char === '}' && closing()?.kind === 'substitution')) {
      if (char === '}') closeBrace();
      const template = scanTemplate(text, index + 1);
      // A part ending in "${" leaves what follows at the start of an expression; the last part ends an operand however the
      // substitutions read, and only a template without any has a fixed value.
      if (template.substitution) {
        tokens.push({ kind: 'punct', value: EXPRESSION });
        openBrace('substitution');
      } else tokens.push(char === '`' ? fixed(template.content) : { kind: 'other', value: '' });
      index = template.next;
    } else if (char === '}' && closing()?.kind === 'container') {
      // The value of a JSX "{ }" belongs to the element around it, which leaves the operand token of its own.
      closeBrace();
      index += 1;
    } else if (
      jsx &&
      char === '<' &&
      !scan.off &&
      !scan.rejected.has(index) &&
      (following === '>' || startsJsxName(following ?? '')) &&
      jsxAllowed(tokens, text[index - 1])
    ) {
      elements.push({ children: false, braces: braces.length, open: index, tokens: tokens.length });
      index += 1;
    } else if (char === '/' && regexAllowed(tokens, text[index - 1])) {
      index = scanRegex(text, index);
      tokens.push({ kind: 'other', value: '' });
    } else if (isWordChar(char)) {
      let end = index + 1;
      while (end < text.length && isWordChar(text[end] ?? '')) end += 1;
      const value = text.slice(index, end);
      if (BODY_BEFORE.has(value)) bodies.push(opensBlock(tokens));
      tokens.push({ kind: 'word', value });
      index = end;
    } else {
      const token: Token = { kind: 'punct', value: char };
      // Only a condition or a body opened since the innermost "${" or JSX "{" can be closed or taken from inside it.
      const brace = braces.at(-1);
      // A function or class body is a block only where its keyword could start a statement: the "}" of one written as an
      // expression (const f = function () {}) ends an operand, so a "/" after it divides.
      if (char === '{') blocks.push(opensBlock(tokens) && (bodies.length > (brace?.bodies ?? 0) ? (bodies.pop() ?? true) : true));
      else if (char === '}') {
        // A "}" with no "{" of its own closes a block the scanned text does not hold, so that "/" after it is not division.
        token.block = blocks.pop() ?? true;
      } else if (char === '(') {
        // "for await (" opens a condition like "for (".
        const at = isWord(tokens.at(-1), 'await') && isWord(tokens.at(-2), 'for') ? -2 : -1;
        const keyword = tokens.at(at);
        conditions.push(keyword?.kind === 'word' && CONDITION_BEFORE.has(keyword.value) && !isPunct(tokens.at(at - 1), '.'));
      } else if (char === ')') token.condition = conditions.length > (brace?.conditions ?? 0) && conditions.pop() === true;
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
function scriptImports(from: string, text: string): string[] {
  const tokens = scriptTokens(text, JSX_EXTENSIONS.has(posix.extname(from).toLowerCase()));
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

// Extensions tried for a specifier written with an extension, the way TypeScript maps output extensions to sources. Looked
// up as written, so ".TS" is not one of these: swapping it for ".ts" would name a file whose spelling the specifier does
// not have, which a case sensitive file system does not answer. It falls to the branch below, where the index decides.
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

// The file a path relative to from names, with the extensions TypeScript would try; undefined for a path leading out of
// the scanned directory or naming nothing scanned.
function resolveRelative(from: string, path: string, files: FileIndex): string | undefined {
  const target = posix.join(posix.dirname(from), path);
  if (target === '..' || target.startsWith('../')) return undefined;
  const index = SCRIPT_BARE.map((extension) => posix.join(target, `index${extension}`));
  // ".", "..", and a trailing "/" name a directory, never a sibling file of the same name.
  const directory = path.endsWith('/') || /(?:^|\/)\.\.?$/.test(path);
  const extension = posix.extname(target);
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

/**
 * Only relative specifiers ("./", "../") resolve; packages and path aliases such as "@/x" do not. A specifier is cut at its
 * first "?" or "#", whichever comes first, since the query and the fragment of a URL-like specifier name no file, and the
 * percent escapes of what is left are decoded, a decoded "/" separating like any other. The text as written is tried after
 * the decoded one, so a file really named "d%2Ee.js" is found as well as one named "d.e.js"; an invalid escape ("%zz")
 * decodes to itself, leaving one candidate.
 */
function scriptResolve(from: string, specifier: string, files: FileIndex): string | undefined {
  if (!/^\.\.?(?:[/?#]|$)/.test(specifier)) return undefined;
  const cut = specifier.split(/[?#]/, 1)[0] ?? '';
  let decoded;
  try {
    decoded = decodeURIComponent(cut);
  } catch {
    decoded = cut;
  }
  for (const path of decoded === cut ? [cut] : [decoded, cut]) {
    const found = resolveRelative(from, path, files);
    if (found !== undefined) return found;
  }
  return undefined;
}

// --- Mermaid ---

/**
 * Scanned files found by the key their file system compares paths by, the first of the paths sharing a key in the order
 * they are given (importGraph sorts them first, so there it is path order). The default key is the path itself, so only
 * what is spelled the same is found: an index completes a spelling only where the file system would complete it too.
 */
export function fileIndex(paths: string[], key: (path: string) => string = (path) => path): FileIndex {
  const exact = new Set(paths);
  const byKey = new Map<string, string>();
  for (const path of paths) {
    const folded = key(path);
    if (!byKey.has(folded)) byKey.set(folded, path);
  }
  return { find: (path) => (exact.has(path) ? path : byKey.get(key(path))) };
}

// Ids made from the path, with every character outside A-Z a-z 0-9 as "_". Paths that then share an id take "_2", "_3",
// ... in path order, so a file added before them shifts the numbers. A numbered id can collide in its turn with a path
// whose own id ends that way ("a_b_2"), which then takes the next number, so no id is fixed by its path alone.
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

// A quoted label: control characters become spaces, and characters that end the label or the node ("]"), or read as markup
// (a backtick opens a Markdown string), become entity codes.
function label(path: string): string {
  return `"${printable(path).replace(/["#&<>\]`]/g, (char) => `#${char.charCodeAt(0)};`)}"`;
}

/**
 * Mermaid `graph LR` of files (the first of duplicate paths counts): one node per file, one edge per import resolved by rules
 * to another file. Over the limits, the most connected files and the first edges in path order are kept, with a note.
 * key is how the file system the paths came from compares them, as fileIndex takes it; by default only an exact match counts.
 */
export function importGraph(
  rules: ImportRules,
  files: ScannedFile[],
  notes: string[] = [],
  limits: MapLimits = MAP_LIMITS,
  key?: (path: string) => string,
): string[] {
  const byPath = new Map<string, ScannedFile>();
  for (const file of files) if (!byPath.has(file.path)) byPath.set(file.path, file);
  const paths = [...byPath.keys()].sort(compare);
  const index = fileIndex(paths, key);
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
 * level in the UTF-16 code unit order compare gives. Lines past the limit are cut with a note; notes follow as "注: ..." lines.
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
