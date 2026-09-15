// Parsing, formatting, and validation of the .soujo/ files. Pure functions only: no file or git access.
export const EFFORTS = ['low', 'medium', 'high', 'xhigh'];
export const NEXT_MAX_LINES = 5;
export const LOG_MAX_LINES = 3;
/** Steps outside PLAN's layers, matched exactly after trimming: spec and plan before the first layer, plan after the last. */
export const PHASES = ['spec', 'plan'];
const NEXT_KEYS = [
    ['layer', '次'],
    ['premise', '前提'],
    ['check', '確認'],
    ['caution', '注意'],
    ['effort', 'effort'],
];
const NEXT_LINE = /^(次|前提|確認|注意|effort)\s*[:：]\s*(.*)$/;
const PLAN_ITEM = /^\s*-\s+\[([ xX])\]\s+(.*)$/;
// Standalone tokens between the layer name and its completion condition. "—" is canonical; the rest are common typing variants.
const PLAN_SEPARATORS = new Set(['—', '–', '--', '-']);
const LOG_HEADER = /^##\s+(\d{4}-\d{2}-\d{2})\s+(.+)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// Characters that move the cursor or break lines on a terminal: C0 controls (tab, CR, LF included), DEL, U+2028/2029.
const CONTROL = /[\u0000-\u001f\u007f\u2028\u2029]/g;
function isEffort(value) {
    return EFFORTS.includes(value);
}
// Only the final line break is dropped, so trailing blank lines count toward the line limit.
function contentLines(text) {
    const body = text.endsWith('\r\n') ? text.slice(0, -2) : text.endsWith('\n') ? text.slice(0, -1) : text;
    return body.trim() === '' ? [] : body.split(/\r?\n/);
}
// What to put between existing LOG text and a new entry: a line break if missing, then one blank line.
function logSeparator(text, eol) {
    if (text === '')
        return '';
    if (!text.endsWith('\n'))
        return `${eol}${eol}`;
    const withoutLastBreak = text.slice(0, text.endsWith('\r\n') ? -2 : -1);
    return withoutLastBreak.endsWith('\n') ? '' : eol;
}
function readNext(text) {
    const values = new Map();
    const lines = contentLines(text);
    if (lines.length === 0)
        return { values, problems: ['NEXT.md が空'] };
    const problems = [];
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
        if (values.has(key))
            problems.push(`「${key}」が重複`);
        else
            values.set(key, (match[2] ?? '').trim());
    });
    for (const [, key] of NEXT_KEYS) {
        const value = values.get(key);
        if (value === undefined)
            problems.push(`「${key}」がない`);
        else if (value === '')
            problems.push(`「${key}」が空`);
    }
    const effort = values.get('effort');
    if (effort && !isEffort(effort))
        problems.push(`effort は ${EFFORTS.join('|')} のどれか: ${effort}`);
    return { values, problems };
}
/** Problems that make NEXT.md unusable for resuming; empty when valid. */
export function validateNext(text) {
    return readNext(text).problems;
}
/** The parsed NEXT.md, or undefined when validateNext reports any problem. */
export function parseNext(text) {
    const { values, problems } = readNext(text);
    if (problems.length > 0)
        return undefined;
    const get = (key) => values.get(key) ?? '';
    return {
        layer: get('次'),
        premise: get('前提'),
        check: get('確認'),
        caution: get('注意'),
        effort: get('effort'),
    };
}
/** NEXT.md text with defaults applied (caution なし, effort medium). Throws on multi-line values. */
export function formatNext(input) {
    const next = { ...input, caution: input.caution ?? 'なし', effort: input.effort ?? 'medium' };
    const lines = NEXT_KEYS.map(([field, key]) => {
        const value = next[field];
        if (/[\r\n]/.test(value))
            throw new Error(`「${key}」は1行で書く`);
        return `${key}: ${value.trim()}`;
    });
    return `${lines.join('\n')}\n`;
}
function matchItem(line) {
    return PLAN_ITEM.exec(line.replace(/\r$/, ''));
}
// Splits at the first separator token that has a word on both sides. Token-based rather than a /\s+—\s+/ search,
// which backtracks quadratically on long whitespace runs.
function splitItem(body) {
    const parts = body.trim().split(/(\s+)/); // word, space, word, space, ...
    for (let index = 2; index < parts.length - 2; index += 2) {
        if (PLAN_SEPARATORS.has(parts[index] ?? '')) {
            return { layer: parts.slice(0, index - 1).join(''), condition: parts.slice(index + 2).join('') };
        }
    }
    return { layer: body.trim(), condition: '' };
}
/** Checklist items of PLAN.md in order; other lines are ignored. */
export function parsePlan(text) {
    const items = [];
    for (const line of text.split('\n')) {
        const match = matchItem(line);
        if (match)
            items.push({ ...splitItem(match[2] ?? ''), done: match[1] !== ' ' });
    }
    return items;
}
/**
 * Problems that make a layer name of PLAN.md ambiguous; empty when valid. A repeated name cannot get its own "layer: <layer>"
 * commit, and a layer named like a phase cannot be told from that phase in NEXT.md.
 */
export function validatePlan(text) {
    const problems = new Set();
    const seen = new Set();
    for (const { layer } of parsePlan(text)) {
        if (PHASES.includes(layer))
            problems.add(`PLAN.md の層名「${layer}」がフェーズ名と同じ`);
        else if (seen.has(layer))
            problems.add(`PLAN.md の層「${layer}」が重複`);
        seen.add(layer);
    }
    return [...problems];
}
/** "[x] <layer>" or "[ ] <layer>", as plan list and map plan show a layer. */
export function formatItem(item) {
    return `[${item.done ? 'x' : ' '}] ${item.layer}`;
}
/** The first unfinished layer, or undefined when every layer is done. */
export function nextLayer(items) {
    return items.find((item) => !item.done);
}
/**
 * How NEXT.md's layer stands in PLAN: 'done' when it is checked, 'skipped' when an unchecked layer comes before it
 * (NEXT.md was moved on but that layer was never closed), 'ok' otherwise. Phases are never matched to PLAN's layers: "plan"
 * comes after every layer, since the go skill writes it after the last one; "spec" and other layers not in PLAN are 'ok'.
 */
export function nextStatus(layer, items) {
    const found = PHASES.includes(layer) ? -1 : items.findIndex((item) => item.layer === layer);
    if (items[found]?.done)
        return { state: 'done' };
    const position = layer === 'plan' ? items.length : found;
    const unfinished = items.findIndex((item) => !item.done);
    const item = items[unfinished];
    return item !== undefined && unfinished < position ? { state: 'skipped', unfinished: item } : { state: 'ok' };
}
/** Layers checked in after but not in before (e.g. the working tree against HEAD), in after's order. */
export function newlyDone(before, after) {
    const done = new Set(before.filter((item) => item.done).map((item) => item.layer));
    return after.filter((item) => item.done && !done.has(item.layer));
}
/** PLAN.md text with the layer checked. Already checked layers are left as is; unknown layers throw. */
export function markDone(text, layer) {
    const lines = text.split('\n');
    const index = lines.findIndex((line) => {
        const match = matchItem(line);
        return match !== null && splitItem(match[2] ?? '').layer === layer.trim();
    });
    const line = lines[index];
    if (line === undefined)
        throw new Error(`PLAN.md に層「${layer}」がない`);
    lines[index] = line.replace(/\[[ xX]\]/, '[x]');
    return lines.join('\n');
}
/** text with every control character (line breaks included) turned into a space, so it prints as one terminal line. */
export function printable(text) {
    return text.replace(CONTROL, ' ');
}
/** Lines as LOG.md stores them: split at line breaks, other control characters turned into spaces, trimmed, blanks dropped. */
export function logLines(lines) {
    return lines
        .flatMap((line) => line.split(/\r?\n/))
        .map((line) => printable(line).trim())
        .filter((line) => line !== '');
}
/** LOG.md text with the entry appended after a blank line, using the file's line break (CRLF or LF). Throws when the entry breaks the format. */
export function appendLog(text, entry) {
    const layer = entry.layer.trim();
    if (layer === '' || printable(layer) !== layer)
        throw new Error('層名は空でない1行で書く（制御文字なし）');
    if (!DATE.test(entry.date))
        throw new Error(`日付は YYYY-MM-DD: ${entry.date}`);
    const lines = logLines(entry.lines);
    if (lines.length > LOG_MAX_LINES) {
        throw new Error(`LOG は1エントリ${LOG_MAX_LINES}行まで（${lines.length}行）`);
    }
    // The same rule parseLog uses to find entries, so no line can turn into a heading.
    if (lines.some((line) => LOG_HEADER.test(line)))
        throw new Error('LOG の行を見出しの形（## YYYY-MM-DD 層名）にしない');
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const block = `${[`## ${entry.date} ${layer}`, ...lines].join(eol)}${eol}`;
    return `${text}${logSeparator(text, eol)}${block}`;
}
/** Every `## YYYY-MM-DD <layer>` entry of LOG.md in order, each with its non-blank lines. */
export function parseLog(text) {
    const entries = [];
    for (const raw of text.split('\n')) {
        const line = raw.trim();
        const header = LOG_HEADER.exec(line);
        if (header)
            entries.push({ date: header[1] ?? '', layer: (header[2] ?? '').trim(), lines: [] });
        else if (line !== '')
            entries[entries.length - 1]?.lines.push(line);
    }
    return entries;
}
/** The last entry of LOG.md, or undefined when there is none. */
export function lastLog(text) {
    return parseLog(text).at(-1);
}
/** YYYY-MM-DD in local time. */
export function formatDate(date) {
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
