// Parsing, formatting, and validation of the .soujo/ files. Pure functions only: no file or git access.
export const EFFORTS = ['low', 'medium', 'high', 'xhigh'];
export const NEXT_MAX_LINES = 5;
export const LOG_MAX_LINES = 3;
export const PRINCIPLES_MAX_LINES = 7;
/**
 * Steps outside PLAN's layers, matched exactly after trimming: spec and plan before the first layer, converge after the last,
 * and plan once converge finds no gap.
 */
export const PHASES = ['spec', 'plan', 'converge'];
/**
 * The phases that come after every layer, since the go and converge skills write them once the last layer is done. Each
 * waits for the milestone of the phase before it (see missingMilestone).
 */
export const AFTER_LAYERS = ['plan', 'converge'];
/** The layer name of a LOG entry that marks a milestone: what phase ended and what is open. */
export const MILESTONE = '節目';
const NEXT_KEYS = [
    ['layer', '次'],
    ['premise', '前提'],
    ['check', '確認'],
    ['caution', '注意'],
    ['effort', 'effort'],
];
const NEXT_LINE = /^(次|前提|確認|注意|effort)\s*[:：]\s*(.*)$/;
// dotAll, so that a line separator pasted into a layer name (U+2028/2029, which "." would stop at) keeps the item readable
// and validatePlan can report it instead of the line being dropped without a word. An item indented by four spaces or more is
// still an item: a code fence is the only container of examples PLAN.md has (SPEC §決定), not an indented code block.
const PLAN_ITEM = /^\s*-\s+\[([ xX])\]\s+(.*)$/s;
// A code fence as CommonMark writes one: three or more backticks or tildes indented by at most three spaces, followed by the
// info string. A backtick fence's info string cannot hold a backtick, so a line of inline code (`` `x` ``) is not a fence.
// dotAll as in PLAN_ITEM, so that a line ending in U+2028/2029 is still read as a fence instead of matching nothing. The info
// string takes the spaces after the marker rather than a `[ \t]*` of its own, which would take them in as many ways as there
// are spaces and make a long line that is not a fence quadratic to refuse.
const PLAN_FENCE = /^ {0,3}(?:(`{3,})([^`]*)|(~{3,})(.*))$/s;
// What a closing fence may have after its marker: an info string is an opening fence's alone (CommonMark).
const FENCE_BLANK = /^[ \t]*$/;
// Standalone tokens between the layer name and its completion condition. "—" is canonical; the rest are common typing variants.
const PLAN_SEPARATORS = new Set(['—', '–', '--', '-']);
// dotAll as in PLAN_ITEM: a layer name written by hand with a line separator in it is still read as a heading, instead of its
// lines being taken for the entry before it.
const LOG_HEADER = /^##\s+(\d{4}-\d{2}-\d{2})\s+(.+)$/s;
// The keyed sections of SPEC.md by their literal headings (SPEC §5), each with the letter of its keys.
const SPEC_SECTIONS = new Map([
    ['原則', 'P'],
    ['受け入れ基準', 'A'],
]);
// An ATX heading's marker: one to six "#" indented by at most three spaces, followed by a space, a tab, or the line's end.
const HEADING = /^ {0,3}(#{1,6})(?=[ \t]|$)/;
// A list item's marker at the very start of the line (SPEC §5 counts only items without indentation): a bullet or an ordered
// number, followed by a space, a tab, or the line's end.
const LIST_MARKER = /^(?:[-*+]|\d{1,9}[.)])(?=[ \t]|$)/;
const SPEC_KEY = /^([PA])[1-9][0-9]*$/;
// An HTML comment starting a block (CommonMark): indented by at most three spaces, since deeper it is code.
const COMMENT_START = /^ {0,3}<!--/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
// Characters that move the cursor or break lines on a terminal: C0 controls (tab, CR, LF included), DEL, the C1 controls
// U+0080-U+009F (a terminal decoding Latin-1 takes them for escape sequences, U+0085 for a line break), and U+2028/2029.
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;
// A calendar date: the month from 01 to 12 and a day that month has, leap years included.
function isDate(value) {
    const match = DATE.exec(value);
    if (match === null)
        return false;
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
    return days !== undefined && day >= 1 && day <= days;
}
function isEffort(value) {
    return EFFORTS.includes(value);
}
/**
 * The lines of a state file as its line limit counts them: only the final line break is dropped, so trailing blank lines
 * count, and text that is blank throughout is no lines at all. What next show prints is what validateNext counted here.
 */
export function contentLines(text) {
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
        // A tab or a C1 control passes the line split; like a layer name in PLAN, a value must print as the text it is, since 次
        // becomes a commit subject and every value a line of resume. effort names its own problem below.
        else if (key !== 'effort' && printable(value) !== value)
            problems.push(`「${key}」に制御文字がある`);
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
/** NEXT.md text with defaults applied (caution なし, effort medium). Throws on multi-line values and other control characters. */
export function formatNext(input) {
    const next = { ...input, caution: input.caution ?? 'なし', effort: input.effort ?? 'medium' };
    const lines = NEXT_KEYS.map(([field, key]) => {
        const value = next[field];
        if (/[\r\n]/.test(value))
            throw new Error(`「${key}」は1行で書く`);
        const trimmed = value.trim();
        if (printable(trimmed) !== trimmed)
            throw new Error(`「${key}」に制御文字がある`);
        return `${key}: ${trimmed}`;
    });
    return `${lines.join('\n')}\n`;
}
function matchItem(line) {
    return PLAN_ITEM.exec(line.replace(/\r$/, ''));
}
// Splits at the first separator token that has a word before it. Token-based rather than a /\s+—\s+/ search, which backtracks
// quadratically on long whitespace runs. A separator with nothing after it is the usual way a completion condition is
// forgotten, so it splits too and leaves the condition empty rather than becoming part of the layer name.
function splitItem(body) {
    const parts = body.trim().split(/(\s+)/); // word, space, word, space, ...
    for (let index = 2; index < parts.length; index += 2) {
        if (PLAN_SEPARATORS.has(parts[index] ?? '')) {
            return { layer: parts.slice(0, index - 1).join(''), condition: parts.slice(index + 2).join('') };
        }
    }
    return { layer: body.trim(), condition: '' };
}
/** A fence line's marker and info string, or undefined when the line is not one (see PLAN_FENCE). */
function fenceOf(line) {
    const match = PLAN_FENCE.exec(line);
    if (match === null)
        return undefined;
    return match[1] !== undefined ? { marker: match[1], info: match[2] ?? '' } : { marker: match[3] ?? '', info: match[4] ?? '' };
}
/**
 * Calls visit with each line outside a code fence (its CR dropped) and the line's 0-based index, and returns the 1-based line
 * of a fence never closed, or undefined when every fence closed. A fence closes on the same character, at least as long, with
 * nothing but spaces after; one left open runs to the end of the text.
 */
function eachOutsideFences(lines, visit) {
    let open;
    lines.forEach((raw, index) => {
        const line = raw.replace(/\r$/, '');
        const fence = fenceOf(line);
        if (open !== undefined) {
            const closes = fence !== undefined && fence.marker[0] === open.marker[0] && fence.marker.length >= open.marker.length;
            if (closes && FENCE_BLANK.test(fence.info))
                open = undefined;
            return;
        }
        if (fence !== undefined) {
            open = { marker: fence.marker, line: index + 1 };
            return;
        }
        visit(line, index);
    });
    return open?.line;
}
/**
 * PLAN.md read as a checklist. Lines that are not items are ignored, and so is everything inside a code fence: an item there
 * is an example of the format, not a layer, and neither markDone nor validatePlan may touch it. A fence left open runs to the
 * end of the file, which validatePlan reports, since the layers it swallows would otherwise go missing without a word.
 */
function planItems(text) {
    const items = [];
    const lines = text.split('\n');
    const unclosed = eachOutsideFences(lines, (line, index) => {
        const match = matchItem(line);
        if (match)
            items.push({ item: { ...splitItem(match[2] ?? ''), done: match[1] !== ' ' }, line: index + 1 });
    });
    return unclosed === undefined ? { items, lines } : { items, lines, unclosed };
}
/** Checklist items of PLAN.md with the 1-based line each is on; other lines and code fences are ignored (see planItems). */
export function planLayers(text) {
    return planItems(text).items;
}
/** Checklist items of PLAN.md in order; other lines and code fences are ignored (see planItems). */
export function parsePlan(text) {
    return planItems(text).items.map(({ item }) => item);
}
/**
 * Problems that make PLAN.md's layers unusable; empty when valid. A fence left open comes first, since it explains the layers
 * missing after it. An empty name and one with control characters are named by line, since neither can be quoted back to the
 * user or matched when pasted; the rest are named by the name itself. A repeated name cannot get its own "layer: <layer>"
 * commit, a layer named like a phase cannot be told from that phase in NEXT.md, and the completion entry of a layer named
 * 節目 would be taken for a milestone.
 */
export function validatePlan(text) {
    const problems = new Set();
    const seen = new Set();
    const { items, unclosed } = planItems(text);
    if (unclosed !== undefined)
        problems.add(`PLAN.md の${unclosed}行目のコードフェンスが閉じていない（以降の層が読まれない）`);
    for (const { item, line } of items) {
        const { layer } = item;
        // Two empty names are two lines to fix, not a repeated layer name, so they are the one kind left out of the count.
        if (layer === '') {
            problems.add(`PLAN.md の${line}行目の層名が空`);
            continue;
        }
        if (printable(layer) !== layer) {
            problems.add(`PLAN.md の${line}行目の層名に制御文字がある`);
        }
        else if (PHASES.includes(layer)) {
            problems.add(`PLAN.md の層名「${layer}」がフェーズ名と同じ`);
            continue;
        }
        else if (layer === MILESTONE) {
            problems.add(`PLAN.md の層名「${layer}」が LOG の節目と同じ`);
            continue;
        }
        // Counted by the name as it prints, so that a repeat through control characters is reported in the same run, not the next.
        // A name that prints as nothing is left out like an empty one: 「」 names neither line, and each line is its own fix.
        const name = printable(layer).trim();
        if (name === '')
            continue;
        if (seen.has(name))
            problems.add(`PLAN.md の層「${name}」が重複`);
        else
            seen.add(name);
    }
    return [...problems];
}
/**
 * Layers whose PLAN.md item has no completion condition, by line; empty when every layer has one. A warning rather than a
 * refusal, so that an existing PLAN still resumes, while `layer done` (which has nothing to close the layer against) refuses.
 * Names validatePlan reports by line are left to it: neither can be quoted back here either.
 */
export function missingConditions(text) {
    return planItems(text)
        .items.filter(({ item }) => item.condition === '' && item.layer !== '' && printable(item.layer) === item.layer)
        .map(({ item, line }) => `PLAN.md の${line}行目の層「${item.layer}」に完了条件がない`);
}
// Two lines as the user means them: whitespace runs are one space, so a condition re-spaced or rewrapped by hand still
// matches. printable runs first, so a control character compares as the space it prints as, as everywhere else.
function sameWords(a, b) {
    const words = (text) => printable(text).trim().split(/\s+/).join(' ');
    return words(a) === words(b);
}
/**
 * A warning when NEXT.md's 確認 is not the completion condition PLAN.md gives its layer, or undefined when they agree. The
 * two say the same thing in two files (the go skill copies one into the other), so a PLAN edited afterwards leaves the layer
 * being worked on with the old condition. Nothing to compare gives no warning: a phase, a layer PLAN has not got, one left
 * without a condition (missingConditions names it), and a name PLAN repeats, whose two conditions are neither of them the
 * layer's (validatePlan names the repeat).
 */
export function checkMismatch(next, items) {
    if (PHASES.includes(next.layer))
        return undefined;
    const matches = items.filter(({ layer }) => layer === next.layer);
    const [item] = matches;
    if (matches.length !== 1 || item === undefined || item.condition === '')
        return undefined;
    if (sameWords(next.check, item.condition))
        return undefined;
    return `NEXT.md の確認が PLAN の層「${next.layer}」の完了条件と違う（PLAN に合わせて soujo next set）`;
}
/**
 * A line read as nothing but HTML comments and whitespace, starting inside a comment when open: whether a comment is left
 * open at its end, or undefined when the line has other text outside comments. Scanned by position, so that a long line of
 * many comments stays linear.
 */
function readComments(line, open) {
    let position = 0;
    let inside = open;
    for (;;) {
        if (inside) {
            const end = line.indexOf('-->', position);
            if (end < 0)
                return true;
            position = end + '-->'.length;
            inside = false;
        }
        while (position < line.length && /\s/.test(line.charAt(position)))
            position += 1;
        if (position === line.length)
            return false;
        if (!line.startsWith('<!--', position))
            return undefined;
        position += '<!--'.length;
        inside = true;
    }
}
// A line of nothing but HTML comments that open and close on it. Text beside one, or a comment running on, makes it a line
// of its section.
function isCommentLine(line) {
    return line.trim() !== '' && readComments(line, false) === false;
}
/**
 * Problems of SPEC.md's keyed sections (SPEC §5), in line order after the count; empty when valid, and for a SPEC without
 * their headings. `## 原則` holds at most PRINCIPLES_MAX_LINES lines, each `- P<n> <name> — <sentence>` without indentation,
 * as SPEC writes it; every item of `## 受け入れ基準` without indentation starts with its `A<n>` key, whatever its list marker,
 * and other text may stand between them. A section runs to the next heading of level 1 or 2 and takes in every section of its
 * name. Blank lines, lines of one-line HTML comments, and code fences are no lines of a section. Every problem but the count
 * is named by line, since a line out of form cannot be quoted back. A principle's key counts toward repeats even on a line out
 * of form (indented, or with another marker), and such a line gets both problems, so that one fix does not reveal the other
 * only on the next run.
 */
export function validateSpec(text) {
    const problems = [];
    const keys = new Set();
    let letter;
    let principles = 0;
    eachOutsideFences(text.split('\n'), (line, index) => {
        const heading = HEADING.exec(line);
        const level = heading?.[1]?.length ?? 0;
        if (heading !== null && level <= 2) {
            letter = level === 2 ? SPEC_SECTIONS.get(line.slice(heading[0].length).trim()) : undefined;
            return;
        }
        if (letter === undefined || line.trim() === '' || isCommentLine(line))
            return;
        const at = `SPEC.md の${index + 1}行目`;
        // A criterion is an item only without indentation (an indented one belongs to the item above); a principle's key is read
        // through indentation too, since the section holds nothing but principles.
        const item = letter === 'P' ? line.trimStart() : line;
        const marker = LIST_MARKER.exec(item);
        const rest = marker === null ? '' : item.slice(marker[0].length).trim();
        const words = rest === '' ? [] : rest.split(/\s+/);
        const key = SPEC_KEY.exec(words[0] ?? '')?.[1] === letter ? words[0] : undefined;
        if (letter === 'P') {
            principles += 1;
            // The name is at least one word before the first "—", and the sentence at least one after it.
            const separator = words.indexOf('—', 1);
            const formed = item === line && marker?.[0] === '-' && key !== undefined && separator >= 2 && separator < words.length - 1;
            if (!formed)
                problems.push(`${at}が原則の形（- P<n> <名前> — <1文>）でない`);
        }
        else if (marker === null) {
            return;
        }
        else if (key === undefined) {
            problems.push(`${at}の受け入れ基準にキー（A<n>）がない`);
        }
        if (key === undefined)
            return;
        if (keys.has(key))
            problems.push(`${at}のキー「${key}」が重複`);
        else
            keys.add(key);
    });
    if (principles > PRINCIPLES_MAX_LINES) {
        problems.unshift(`SPEC.md の原則が${PRINCIPLES_MAX_LINES}行を超えている（${principles}行）`);
    }
    return problems;
}
/**
 * Whether SPEC.md holds nothing but `#` headings, blank lines, and HTML comments, as the template of every version does, so
 * that a SPEC copied from any of them counts as unwritten. Lines are read as CommonMark reads blocks: a comment starts its
 * line (indented by at most three spaces, or it is code) and may run over lines, and text beside one on its first or last
 * line is text. A heading counts whatever it holds, since no comment runs on from it. A comment left open counts as written,
 * and so does a setext heading, which no template has. A byte order mark is skipped and a lone CR breaks a line, as editors
 * do, so that neither turns an empty SPEC into a written one or hides a written line in a heading.
 */
export function specUnwritten(text) {
    let open = false;
    for (const line of text.replace(/^﻿/, '').split(/\r\n|\r|\n/)) {
        if (open || COMMENT_START.test(line)) {
            const state = readComments(line, open);
            if (state === undefined)
                return false;
            open = state;
        }
        else if (line.trim() !== '' && !HEADING.test(line)) {
            return false;
        }
    }
    return !open;
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
 * (NEXT.md was moved on but that layer was never closed), 'ok' otherwise. Phases are never matched to PLAN's layers:
 * "converge" and "plan" come after every layer (AFTER_LAYERS); "spec" and other layers not in PLAN are 'ok'.
 */
export function nextStatus(layer, items) {
    const found = PHASES.includes(layer) ? -1 : items.findIndex((item) => item.layer === layer);
    if (items[found]?.done)
        return { state: 'done' };
    const position = AFTER_LAYERS.includes(layer) ? items.length : found;
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
    const name = layer.trim();
    const { items, lines } = planItems(text);
    const found = items.find(({ item }) => item.layer === name);
    if (found === undefined)
        throw new Error(`PLAN.md に層「${layer}」がない`);
    return lines.map((line, index) => (index === found.line - 1 ? line.replace(/\[[ xX]\]/, '[x]') : line)).join('\n');
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
    if (!isDate(entry.date))
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
// LOG.md split at "\n" into the lines before the first entry and one range per entry.
function logBlocks(text) {
    const lines = text.split('\n');
    const blocks = [];
    lines.forEach((raw, index) => {
        const line = raw.trim();
        const header = LOG_HEADER.exec(line);
        const last = blocks.at(-1);
        if (header) {
            if (last !== undefined)
                last.end = index;
            blocks.push({ entry: { date: header[1] ?? '', layer: (header[2] ?? '').trim(), lines: [] }, start: index, end: lines.length });
        }
        else if (line !== '') {
            last?.entry.lines.push(line);
        }
    });
    return { lines, preamble: blocks[0]?.start ?? lines.length, blocks };
}
/** Every `## YYYY-MM-DD <layer>` entry of LOG.md in order, each with its non-blank lines. */
export function parseLog(text) {
    return logBlocks(text).blocks.map(({ entry }) => entry);
}
/** The last entry of LOG.md, or undefined when there is none. */
export function lastLog(text) {
    return parseLog(text).at(-1);
}
/** The last milestone entry (layer 節目) of LOG.md, or undefined when there is none. */
export function lastMilestone(text) {
    return parseLog(text).filter((entry) => entry.layer === MILESTONE).at(-1);
}
/**
 * What LOG.md lacks before NEXT.md may point to layer, or undefined when nothing: plan and converge (AFTER_LAYERS, matched
 * after trimming) wait for a milestone after the last entry of one of PLAN's layers, the entries layer done and close write.
 * The skills leave the milestone saying what a phase ended before next set, since a session stopped between the two would
 * resume at the next phase without the milestone brief shows; this keeps that order instead of trusting the model. A
 * milestone before that entry closed an earlier phase, and with no such entry any milestone does. Entries of other names (a
 * release written by hand, a phase's 中断) are neither. spec and PLAN's layers need none.
 */
export function missingMilestone(layer, items, log) {
    if (!AFTER_LAYERS.includes(layer.trim()))
        return undefined;
    const layers = new Set(items.map((item) => item.layer));
    for (const entry of parseLog(log).reverse()) {
        if (entry.layer === MILESTONE)
            return undefined;
        if (layers.has(entry.layer))
            return `LOG.md に層「${entry.layer}」の記録より後の節目がない`;
    }
    return 'LOG.md に節目がない';
}
/** Whether value is a month as log rotation names it: YYYY-MM, the month from 01 to 12. */
export function isMonth(value) {
    return MONTH.test(value);
}
/** value when it is a month (see isMonth); throws otherwise. */
export function requireMonth(value) {
    if (!MONTH.test(value))
        throw new Error(`月は YYYY-MM: ${value}`);
    return value;
}
/** The YYYY-MM part of a LOG entry's date; not a month (see isMonth) when the date names none. */
export function logMonth(entry) {
    return entry.date.slice(0, 7);
}
/** The months of the entries, distinct and in ascending order. */
export function logMonths(entries) {
    return [...new Set(entries.map(logMonth))].sort();
}
/**
 * LOG.md split for rotation: every entry dated in a month before `before` (YYYY-MM) moves, wherever it is, except the last
 * entry, which resume reads, the last milestone, which brief reads, and entries whose date names no month. An entry moves
 * with the blank lines after it, so the kept entries stay separated as they were.
 */
export function rotateLog(text, before) {
    requireMonth(before);
    const { lines, blocks } = logBlocks(text);
    const milestone = blocks.map(({ entry }) => entry.layer).lastIndexOf(MILESTONE);
    const dropped = new Set();
    const moved = [];
    for (const [index, { entry, start, end }] of blocks.entries()) {
        const month = logMonth(entry);
        if (index === blocks.length - 1 || index === milestone || !isMonth(month) || month >= before)
            continue;
        const raw = lines.slice(start, end).map((line) => line.replace(/\r$/, ''));
        while (raw.length > 1 && (raw.at(-1) ?? '').trim() === '')
            raw.pop();
        moved.push({ entry, lines: raw });
        for (let line = start; line < end; line++)
            dropped.add(line);
    }
    return { kept: lines.filter((_, index) => !dropped.has(index)).join('\n'), moved };
}
/**
 * The archive LOG-<month>.md with each block appended after a blank line, its lines as LOG.md had them. A missing or blank
 * archive starts with "# LOG <month>" and uses eol; an existing one keeps its own line break. No limit of appendLog applies,
 * so entries written by hand move too.
 */
export function archiveLog(archive, month, blocks, eol = '\n') {
    requireMonth(month);
    const fresh = archive === undefined || archive.trim() === '';
    const lineBreak = fresh ? eol : archive.includes('\r\n') ? '\r\n' : '\n';
    let text = fresh ? `# LOG ${month}${lineBreak}` : archive;
    for (const { lines } of blocks)
        text = `${text}${logSeparator(text, lineBreak)}${lines.join(lineBreak)}${lineBreak}`;
    return text;
}
// Whether the lines before a new archive's first entry are the heading archiveLog writes for month, and nothing else. The
// heading is compared as written, at the start of its line: archiveLog never indents it, so an indented one is someone else's.
function freshPreamble(lines, month) {
    const written = lines.map((line) => line.replace(/\r$/, '')).filter((line) => line.trim() !== '');
    return written.length === 1 && written[0] === `# LOG ${month}`;
}
/**
 * The entries appended to before to make after, or undefined when after is not before followed by whole entries (blank lines
 * allowed): what archiveLog writes for month. CRLF and LF compare equal, as git's line-ending conversion may change them. A
 * missing or blank before (a new archive) gives every entry of after, but only under the heading archiveLog gives that month:
 * any other text there is a file no rotate wrote, and nothing checks it later, since a new archive has no entries at HEAD.
 * Throws when month is not YYYY-MM, which the ArchiveFile the caller names it from already rules out.
 */
export function appendedEntries(before, after, month) {
    requireMonth(month);
    if (before === undefined || before.trim() === '') {
        const { lines, preamble, blocks } = logBlocks(after);
        return freshPreamble(lines.slice(0, preamble), month) ? blocks.map(({ entry }) => entry) : undefined;
    }
    const [old, now] = [lf(before), lf(after)];
    if (!now.startsWith(old))
        return undefined;
    const rest = now.slice(old.length);
    // Text added to before's last line is an edit, not an appended entry.
    if (!old.endsWith('\n') && rest !== '' && !rest.startsWith('\n'))
        return undefined;
    const { lines, preamble } = logBlocks(rest);
    if (lines.slice(0, preamble).some((line) => line.trim() !== ''))
        return undefined;
    return parseLog(rest);
}
function lf(text) {
    return text.replace(/\r\n/g, '\n');
}
function sameLines(a, aStart, b, bStart, length) {
    if (aStart + length > a.length)
        return false;
    for (let offset = 0; offset < length; offset++)
        if (a[aStart + offset] !== b[bStart + offset])
            return false;
    return true;
}
/**
 * The entries removed from before to make after, in before's order, or undefined unless after is before with whole entries
 * removed and nothing else changed: what rotateLog keeps. CRLF and LF compare equal, as in appendedEntries.
 */
export function removedEntries(before, after) {
    const old = logBlocks(lf(before));
    const now = lf(after).split('\n');
    if (!sameLines(now, 0, old.lines, 0, old.preamble))
        return undefined;
    let at = old.preamble;
    const removed = [];
    for (const { entry, start, end } of old.blocks) {
        if (sameLines(now, at, old.lines, start, end - start))
            at += end - start;
        else
            removed.push(entry);
    }
    return at === now.length ? removed : undefined;
}
const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * The calendar days in local time from from's date to to's date, the dates formatDate prints; 0 when to's date is not later.
 * Counted on the dates rather than the hours, so that a commit at 23:00 is 2 days before 01:00 the day after next.
 */
export function daysBetween(from, to) {
    // Each local date as a UTC midnight, so that a daylight saving change between them adds no hour to the difference.
    const day = (date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.max(0, Math.round((day(to) - day(from)) / DAY_MS));
}
/** YYYY-MM-DD in local time. */
export function formatDate(date) {
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
