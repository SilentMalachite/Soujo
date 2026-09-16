// Parsing, formatting, and validation of the .soujo/ files. Pure functions only: no file or git access.

export const EFFORTS = ['low', 'medium', 'high', 'xhigh'] as const;
export type Effort = (typeof EFFORTS)[number];

export const NEXT_MAX_LINES = 5;
export const LOG_MAX_LINES = 3;

/** Steps outside PLAN's layers, matched exactly after trimming: spec and plan before the first layer, plan after the last. */
export const PHASES: readonly string[] = ['spec', 'plan'];

/** The layer name of a LOG entry that marks a milestone: what phase ended and what is open. */
export const MILESTONE = '節目';

export interface Next {
  layer: string;
  premise: string;
  check: string;
  caution: string;
  effort: Effort;
}

export interface NextInput {
  layer: string;
  premise: string;
  check: string;
  caution?: string;
  effort?: string;
}

export interface PlanItem {
  layer: string;
  condition: string;
  done: boolean;
}

export interface LogEntry {
  date: string;
  layer: string;
  lines: string[];
}

const NEXT_KEYS = [
  ['layer', '次'],
  ['premise', '前提'],
  ['check', '確認'],
  ['caution', '注意'],
  ['effort', 'effort'],
] as const;

const NEXT_LINE = /^(次|前提|確認|注意|effort)\s*[:：]\s*(.*)$/;
// dotAll, so that a line separator pasted into a layer name (U+2028/2029, which "." would stop at) keeps the item readable
// and validatePlan can report it instead of the line being dropped without a word.
const PLAN_ITEM = /^\s*-\s+\[([ xX])\]\s+(.*)$/s;
// A code fence as CommonMark writes one: three or more backticks or tildes indented by at most three spaces, with the info
// string after an opening fence and nothing but spaces after a closing one. dotAll as in PLAN_ITEM, so that a line ending in
// U+2028/2029 is still read as a fence instead of matching nothing.
const PLAN_FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*(.*)$/s;
// Standalone tokens between the layer name and its completion condition. "—" is canonical; the rest are common typing variants.
const PLAN_SEPARATORS = new Set(['—', '–', '--', '-']);
const LOG_HEADER = /^##\s+(\d{4}-\d{2}-\d{2})\s+(.+)$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
// Characters that move the cursor or break lines on a terminal: C0 controls (tab, CR, LF included), DEL, the C1 controls
// U+0080-U+009F (a terminal decoding Latin-1 takes them for escape sequences, U+0085 for a line break), and U+2028/2029.
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;

// A calendar date: the month from 01 to 12 and a day that month has, leap years included.
function isDate(value: string): boolean {
  const match = DATE.exec(value);
  if (match === null) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return days !== undefined && day >= 1 && day <= days;
}

function isEffort(value: string): value is Effort {
  return (EFFORTS as readonly string[]).includes(value);
}

// Only the final line break is dropped, so trailing blank lines count toward the line limit.
function contentLines(text: string): string[] {
  const body = text.endsWith('\r\n') ? text.slice(0, -2) : text.endsWith('\n') ? text.slice(0, -1) : text;
  return body.trim() === '' ? [] : body.split(/\r?\n/);
}

// What to put between existing LOG text and a new entry: a line break if missing, then one blank line.
function logSeparator(text: string, eol: string): string {
  if (text === '') return '';
  if (!text.endsWith('\n')) return `${eol}${eol}`;
  const withoutLastBreak = text.slice(0, text.endsWith('\r\n') ? -2 : -1);
  return withoutLastBreak.endsWith('\n') ? '' : eol;
}

function readNext(text: string): { values: Map<string, string>; problems: string[] } {
  const values = new Map<string, string>();
  const lines = contentLines(text);
  if (lines.length === 0) return { values, problems: ['NEXT.md が空'] };

  const problems: string[] = [];
  if (lines.length > NEXT_MAX_LINES) {
    problems.push(`NEXT.md が${NEXT_MAX_LINES}行を超えている（${lines.length}行）`);
  }
  lines.forEach((raw, index) => {
    const line = raw.trim();
    const match = NEXT_LINE.exec(line);
    if (!match) {
      problems.push(line === '' ? `${index + 1}行目が空行` : `${index + 1}行目を読めない: ${line}`);
      return;
    }
    const key = match[1] ?? '';
    if (values.has(key)) problems.push(`「${key}」が重複`);
    else values.set(key, (match[2] ?? '').trim());
  });
  for (const [, key] of NEXT_KEYS) {
    const value = values.get(key);
    if (value === undefined) problems.push(`「${key}」がない`);
    else if (value === '') problems.push(`「${key}」が空`);
  }
  const effort = values.get('effort');
  if (effort && !isEffort(effort)) problems.push(`effort は ${EFFORTS.join('|')} のどれか: ${effort}`);
  return { values, problems };
}

/** Problems that make NEXT.md unusable for resuming; empty when valid. */
export function validateNext(text: string): string[] {
  return readNext(text).problems;
}

/** The parsed NEXT.md, or undefined when validateNext reports any problem. */
export function parseNext(text: string): Next | undefined {
  const { values, problems } = readNext(text);
  if (problems.length > 0) return undefined;
  const get = (key: string) => values.get(key) ?? '';
  return {
    layer: get('次'),
    premise: get('前提'),
    check: get('確認'),
    caution: get('注意'),
    effort: get('effort') as Effort,
  };
}

/** NEXT.md text with defaults applied (caution なし, effort medium). Throws on multi-line values. */
export function formatNext(input: NextInput): string {
  const next = { ...input, caution: input.caution ?? 'なし', effort: input.effort ?? 'medium' };
  const lines = NEXT_KEYS.map(([field, key]) => {
    const value = next[field];
    if (/[\r\n]/.test(value)) throw new Error(`「${key}」は1行で書く`);
    return `${key}: ${value.trim()}`;
  });
  return `${lines.join('\n')}\n`;
}

function matchItem(line: string): RegExpExecArray | null {
  return PLAN_ITEM.exec(line.replace(/\r$/, ''));
}

// Splits at the first separator token that has a word before it. Token-based rather than a /\s+—\s+/ search, which backtracks
// quadratically on long whitespace runs. A separator with nothing after it is the usual way a completion condition is
// forgotten, so it splits too and leaves the condition empty rather than becoming part of the layer name.
function splitItem(body: string): { layer: string; condition: string } {
  const parts = body.trim().split(/(\s+)/); // word, space, word, space, ...
  for (let index = 2; index < parts.length; index += 2) {
    if (PLAN_SEPARATORS.has(parts[index] ?? '')) {
      return { layer: parts.slice(0, index - 1).join(''), condition: parts.slice(index + 2).join('') };
    }
  }
  return { layer: body.trim(), condition: '' };
}

interface PlanScan {
  /** Every checklist item outside a code fence, with the 1-based line it is on, in order. */
  items: { item: PlanItem; line: number }[];
  /** The line of a fence never closed, which hides every item after it; undefined when every fence closed. */
  unclosed?: number;
}

/**
 * PLAN.md read as a checklist. Lines that are not items are ignored, and so is everything inside a code fence: an item there
 * is an example of the format, not a layer, and neither markDone nor validatePlan may touch it. A fence closes on the same
 * character, at least as long, with nothing but spaces after; one left open runs to the end of the file, which validatePlan
 * reports, since the layers it swallows would otherwise go missing without a word.
 */
function planItems(text: string): PlanScan {
  const items: PlanScan['items'] = [];
  let fence: string | undefined;
  let opened = 0;
  text.split('\n').forEach((raw, index) => {
    const line = raw.replace(/\r$/, '');
    const fenced = PLAN_FENCE.exec(line);
    if (fence !== undefined) {
      const marker = fenced?.[1] ?? '';
      if (marker[0] === fence[0] && marker.length >= fence.length && (fenced?.[2] ?? '') === '') fence = undefined;
      return;
    }
    if (fenced) {
      [fence, opened] = [fenced[1], index + 1];
      return;
    }
    const match = matchItem(line);
    if (match) items.push({ item: { ...splitItem(match[2] ?? ''), done: match[1] !== ' ' }, line: index + 1 });
  });
  return fence === undefined ? { items } : { items, unclosed: opened };
}

/** Checklist items of PLAN.md in order; other lines and code fences are ignored (see planItems). */
export function parsePlan(text: string): PlanItem[] {
  return planItems(text).items.map(({ item }) => item);
}

/**
 * Problems that make PLAN.md's layers unusable; empty when valid. A fence left open comes first, since it explains the layers
 * missing after it. An empty name and one with control characters are named by line, since neither can be quoted back to the
 * user or matched when pasted; the rest are named by the name itself. A repeated name cannot get its own "layer: <layer>"
 * commit, a layer named like a phase cannot be told from that phase in NEXT.md, and the completion entry of a layer named
 * 節目 would be taken for a milestone.
 */
export function validatePlan(text: string): string[] {
  const problems = new Set<string>();
  const seen = new Set<string>();
  const { items, unclosed } = planItems(text);
  if (unclosed !== undefined) problems.add(`PLAN.md の${unclosed}行目のコードフェンスが閉じていない（以降の層が読まれない）`);
  for (const { item, line } of items) {
    const { layer } = item;
    if (layer === '') problems.add(`PLAN.md の${line}行目の層名が空`);
    else if (printable(layer) !== layer) problems.add(`PLAN.md の${line}行目の層名に制御文字がある`);
    else if (PHASES.includes(layer)) problems.add(`PLAN.md の層名「${layer}」がフェーズ名と同じ`);
    else if (layer === MILESTONE) problems.add(`PLAN.md の層名「${layer}」が LOG の節目と同じ`);
    else if (seen.has(layer)) problems.add(`PLAN.md の層「${layer}」が重複`);
    else seen.add(layer);
  }
  return [...problems];
}

/** "[x] <layer>" or "[ ] <layer>", as plan list and map plan show a layer. */
export function formatItem(item: PlanItem): string {
  return `[${item.done ? 'x' : ' '}] ${item.layer}`;
}

/** The first unfinished layer, or undefined when every layer is done. */
export function nextLayer(items: PlanItem[]): PlanItem | undefined {
  return items.find((item) => !item.done);
}

export type NextStatus = { state: 'ok' } | { state: 'done' } | { state: 'skipped'; unfinished: PlanItem };

/**
 * How NEXT.md's layer stands in PLAN: 'done' when it is checked, 'skipped' when an unchecked layer comes before it
 * (NEXT.md was moved on but that layer was never closed), 'ok' otherwise. Phases are never matched to PLAN's layers: "plan"
 * comes after every layer, since the go skill writes it after the last one; "spec" and other layers not in PLAN are 'ok'.
 */
export function nextStatus(layer: string, items: PlanItem[]): NextStatus {
  const found = PHASES.includes(layer) ? -1 : items.findIndex((item) => item.layer === layer);
  if (items[found]?.done) return { state: 'done' };
  const position = layer === 'plan' ? items.length : found;
  const unfinished = items.findIndex((item) => !item.done);
  const item = items[unfinished];
  return item !== undefined && unfinished < position ? { state: 'skipped', unfinished: item } : { state: 'ok' };
}

/** Layers checked in after but not in before (e.g. the working tree against HEAD), in after's order. */
export function newlyDone(before: PlanItem[], after: PlanItem[]): PlanItem[] {
  const done = new Set(before.filter((item) => item.done).map((item) => item.layer));
  return after.filter((item) => item.done && !done.has(item.layer));
}

/** PLAN.md text with the layer checked. Already checked layers are left as is; unknown layers throw. */
export function markDone(text: string, layer: string): string {
  const name = layer.trim();
  const found = planItems(text).items.find(({ item }) => item.layer === name);
  if (found === undefined) throw new Error(`PLAN.md に層「${layer}」がない`);
  const lines = text.split('\n');
  const index = found.line - 1;
  lines[index] = (lines[index] ?? '').replace(/\[[ xX]\]/, '[x]');
  return lines.join('\n');
}

/** text with every control character (line breaks included) turned into a space, so it prints as one terminal line. */
export function printable(text: string): string {
  return text.replace(CONTROL, ' ');
}

/** Lines as LOG.md stores them: split at line breaks, other control characters turned into spaces, trimmed, blanks dropped. */
export function logLines(lines: string[]): string[] {
  return lines
    .flatMap((line) => line.split(/\r?\n/))
    .map((line) => printable(line).trim())
    .filter((line) => line !== '');
}

/** LOG.md text with the entry appended after a blank line, using the file's line break (CRLF or LF). Throws when the entry breaks the format. */
export function appendLog(text: string, entry: LogEntry): string {
  const layer = entry.layer.trim();
  if (layer === '' || printable(layer) !== layer) throw new Error('層名は空でない1行で書く（制御文字なし）');
  if (!isDate(entry.date)) throw new Error(`日付は YYYY-MM-DD: ${entry.date}`);
  const lines = logLines(entry.lines);
  if (lines.length > LOG_MAX_LINES) {
    throw new Error(`LOG は1エントリ${LOG_MAX_LINES}行まで（${lines.length}行）`);
  }
  // The same rule parseLog uses to find entries, so no line can turn into a heading.
  if (lines.some((line) => LOG_HEADER.test(line))) throw new Error('LOG の行を見出しの形（## YYYY-MM-DD 層名）にしない');

  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const block = `${[`## ${entry.date} ${layer}`, ...lines].join(eol)}${eol}`;
  return `${text}${logSeparator(text, eol)}${block}`;
}

interface LogBlocks {
  lines: string[];
  /** The number of lines before the first entry. */
  preamble: number;
  /** Each entry with its line range, from its heading up to the next heading. */
  blocks: { entry: LogEntry; start: number; end: number }[];
}

// LOG.md split at "\n" into the lines before the first entry and one range per entry.
function logBlocks(text: string): LogBlocks {
  const lines = text.split('\n');
  const blocks: LogBlocks['blocks'] = [];
  lines.forEach((raw, index) => {
    const line = raw.trim();
    const header = LOG_HEADER.exec(line);
    const last = blocks.at(-1);
    if (header) {
      if (last !== undefined) last.end = index;
      blocks.push({ entry: { date: header[1] ?? '', layer: (header[2] ?? '').trim(), lines: [] }, start: index, end: lines.length });
    } else if (line !== '') {
      last?.entry.lines.push(line);
    }
  });
  return { lines, preamble: blocks[0]?.start ?? lines.length, blocks };
}

/** Every `## YYYY-MM-DD <layer>` entry of LOG.md in order, each with its non-blank lines. */
export function parseLog(text: string): LogEntry[] {
  return logBlocks(text).blocks.map(({ entry }) => entry);
}

/** The last entry of LOG.md, or undefined when there is none. */
export function lastLog(text: string): LogEntry | undefined {
  return parseLog(text).at(-1);
}

/** The last milestone entry (layer 節目) of LOG.md, or undefined when there is none. */
export function lastMilestone(text: string): LogEntry | undefined {
  return parseLog(text).filter((entry) => entry.layer === MILESTONE).at(-1);
}

/** Whether value is a month as log rotation names it: YYYY-MM, the month from 01 to 12. */
export function isMonth(value: string): boolean {
  return MONTH.test(value);
}

/** value when it is a month (see isMonth); throws otherwise. */
export function requireMonth(value: string): string {
  if (!MONTH.test(value)) throw new Error(`月は YYYY-MM: ${value}`);
  return value;
}

/** The YYYY-MM part of a LOG entry's date; not a month (see isMonth) when the date names none. */
export function logMonth(entry: LogEntry): string {
  return entry.date.slice(0, 7);
}

/** The months of the entries, distinct and in ascending order. */
export function logMonths(entries: readonly LogEntry[]): string[] {
  return [...new Set(entries.map(logMonth))].sort();
}

/** An entry with its lines as LOG.md has them: the heading first, line breaks and the blank lines after the entry dropped. */
export interface LogBlock {
  entry: LogEntry;
  lines: string[];
}

export interface LogRotation {
  /** LOG.md without the moved entries; everything else, the text before the first entry included, stays as it was. */
  kept: string;
  /** The moved entries in LOG.md's order. */
  moved: LogBlock[];
}

/**
 * LOG.md split for rotation: every entry dated in a month before `before` (YYYY-MM) moves, wherever it is, except the last
 * entry, which resume reads, the last milestone, which brief reads, and entries whose date names no month. An entry moves
 * with the blank lines after it, so the kept entries stay separated as they were.
 */
export function rotateLog(text: string, before: string): LogRotation {
  requireMonth(before);
  const { lines, blocks } = logBlocks(text);
  const milestone = blocks.map(({ entry }) => entry.layer).lastIndexOf(MILESTONE);
  const dropped = new Set<number>();
  const moved: LogBlock[] = [];
  for (const [index, { entry, start, end }] of blocks.entries()) {
    const month = logMonth(entry);
    if (index === blocks.length - 1 || index === milestone || !isMonth(month) || month >= before) continue;
    const raw = lines.slice(start, end).map((line) => line.replace(/\r$/, ''));
    while (raw.length > 1 && (raw.at(-1) ?? '').trim() === '') raw.pop();
    moved.push({ entry, lines: raw });
    for (let line = start; line < end; line++) dropped.add(line);
  }
  return { kept: lines.filter((_, index) => !dropped.has(index)).join('\n'), moved };
}

/**
 * The archive LOG-<month>.md with each block appended after a blank line, its lines as LOG.md had them. A missing or blank
 * archive starts with "# LOG <month>" and uses eol; an existing one keeps its own line break. No limit of appendLog applies,
 * so entries written by hand move too.
 */
export function archiveLog(archive: string | undefined, month: string, blocks: readonly LogBlock[], eol: string = '\n'): string {
  requireMonth(month);
  const fresh = archive === undefined || archive.trim() === '';
  const lineBreak = fresh ? eol : archive.includes('\r\n') ? '\r\n' : '\n';
  let text = fresh ? `# LOG ${month}${lineBreak}` : archive;
  for (const { lines } of blocks) text = `${text}${logSeparator(text, lineBreak)}${lines.join(lineBreak)}${lineBreak}`;
  return text;
}

/**
 * The entries appended to before to make after, or undefined when after is not before followed by whole entries (blank lines
 * allowed): what archiveLog writes. CRLF and LF compare equal, as git's line-ending conversion may change them. A missing or
 * blank before (a new archive) gives every entry of after.
 */
export function appendedEntries(before: string | undefined, after: string): LogEntry[] | undefined {
  if (before === undefined || before.trim() === '') return parseLog(after);
  const [old, now] = [lf(before), lf(after)];
  if (!now.startsWith(old)) return undefined;
  const rest = now.slice(old.length);
  // Text added to before's last line is an edit, not an appended entry.
  if (!old.endsWith('\n') && rest !== '' && !rest.startsWith('\n')) return undefined;
  const { lines, preamble } = logBlocks(rest);
  if (lines.slice(0, preamble).some((line) => line.trim() !== '')) return undefined;
  return parseLog(rest);
}

function lf(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

function sameLines(a: readonly string[], aStart: number, b: readonly string[], bStart: number, length: number): boolean {
  if (aStart + length > a.length) return false;
  for (let offset = 0; offset < length; offset++) if (a[aStart + offset] !== b[bStart + offset]) return false;
  return true;
}

/**
 * The entries removed from before to make after, in before's order, or undefined unless after is before with whole entries
 * removed and nothing else changed: what rotateLog keeps. CRLF and LF compare equal, as in appendedEntries.
 */
export function removedEntries(before: string, after: string): LogEntry[] | undefined {
  const old = logBlocks(lf(before));
  const now = lf(after).split('\n');
  if (!sameLines(now, 0, old.lines, 0, old.preamble)) return undefined;
  let at = old.preamble;
  const removed: LogEntry[] = [];
  for (const { entry, start, end } of old.blocks) {
    if (sameLines(now, at, old.lines, start, end - start)) at += end - start;
    else removed.push(entry);
  }
  return at === now.length ? removed : undefined;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The whole days from from to to, rounded down; 0 when to is not after from. */
export function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));
}

/** YYYY-MM-DD in local time. */
export function formatDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
