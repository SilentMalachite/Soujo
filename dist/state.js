// Parsing, formatting, and validation of the .soujo/ files. Pure functions only: no file or git access.
export const EFFORTS = ['low', 'medium', 'high', 'xhigh'];
export const NEXT_MAX_LINES = 5;
export const LOG_MAX_LINES = 3;
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
function isEffort(value) {
    return EFFORTS.includes(value);
}
function contentLines(text) {
    const body = text.trimEnd();
    return body === '' ? [] : body.split(/\r?\n/);
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
/** The first unfinished layer, or undefined when every layer is done. */
export function nextLayer(items) {
    return items.find((item) => !item.done);
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
/** LOG.md text with the entry appended after a blank line. Throws when the entry breaks the format. */
export function appendLog(text, entry) {
    const layer = entry.layer.trim();
    if (layer === '' || /[\r\n]/.test(layer))
        throw new Error('層名は空でない1行で書く');
    if (!DATE.test(entry.date))
        throw new Error(`日付は YYYY-MM-DD: ${entry.date}`);
    const lines = entry.lines
        .flatMap((line) => line.split(/\r?\n/))
        .map((line) => line.trim())
        .filter((line) => line !== '');
    if (lines.length > LOG_MAX_LINES) {
        throw new Error(`LOG は1エントリ${LOG_MAX_LINES}行まで（${lines.length}行）`);
    }
    if (lines.some((line) => line.startsWith('## ')))
        throw new Error('LOG の行を「## 」で始めない');
    const block = `${[`## ${entry.date} ${layer}`, ...lines].join('\n')}\n`;
    const body = text.trimEnd();
    return body === '' ? block : `${body}\n\n${block}`;
}
/** The last `## YYYY-MM-DD <layer>` entry of LOG.md with its non-blank lines. */
export function lastLog(text) {
    let last;
    for (const raw of text.split('\n')) {
        const line = raw.trim();
        const header = LOG_HEADER.exec(line);
        if (header)
            last = { date: header[1] ?? '', layer: (header[2] ?? '').trim(), lines: [] };
        else if (last && line !== '')
            last.lines.push(line);
    }
    return last;
}
/** YYYY-MM-DD in local time. */
export function formatDate(date) {
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
