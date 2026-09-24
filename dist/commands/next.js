// soujo next show / set / check: the one file needed to resume.
import { dirname } from 'node:path';
import { STATE_DIR, findStateDir, hideHome, homePath, readState, removeLeftoverTemps, requireStateDir, writeState } from '../files.js';
import { gitBudget, gitChangeCount, gitToplevel } from '../git.js';
import { AFTER_LAYERS, PHASES, checkMismatch, contentLines, formatDate, formatNext, logMonths, missingConditions, missingMilestone, rotateLog, nextStatus, parseNext, parsePlan, printable, validateNext, validatePlan, validateSpec, } from '../state.js';
// How many problems a warning names before counting the rest, so that the line stays readable where a hook shows it.
const SHOWN_PROBLEMS = 4;
// The one line that names problems: the first SHOWN_PROBLEMS of them, then how many are left. Problems named by line are one
// per broken line, so a badly broken PLAN or NEXT would otherwise stretch this one line without end.
function warning(found) {
    const shown = found.length > SHOWN_PROBLEMS ? [...found.slice(0, SHOWN_PROBLEMS), `ほか${found.length - SHOWN_PROBLEMS}件`] : found;
    return `soujo 警告: ${shown.join(' / ')}`;
}
/**
 * NEXT.md as the lines its limit counts, with one line naming what makes it unusable after them: resume and close refuse
 * such a file, and the text alone does not say why. A file that is there but empty is one of those, so only a missing file
 * gives NEXT.md なし. With hook, silent when there is nothing to show (no project, no file, unreadable).
 */
export function nextShow(cwd, hook) {
    try {
        const dir = hook ? findStateDir(cwd) : requireStateDir(cwd);
        const text = dir === undefined ? undefined : readState(dir, 'NEXT.md');
        if (text === undefined)
            return hook ? [] : ['NEXT.md なし'];
        const problems = validateNext(text);
        return problems.length === 0 ? contentLines(text) : [...contentLines(text), warning(problems)];
    }
    catch (error) {
        if (hook)
            return [];
        throw error;
    }
}
// The effort of the spec, plan, and converge skills (SPEC §7), so that it is not chosen anew after the last layer.
const PHASE_EFFORT = 'high';
/**
 * Rewrites NEXT.md. Writes nothing when the result would be invalid, when a phase gets an effort other than
 * PHASE_EFFORT, when PLAN.md has ambiguous layer names, or when PLAN.md has layers and the layer is neither one of them
 * nor a phase: a mistyped name would otherwise pass next check and resume until layer done. Nor when plan or converge
 * comes before its milestone (see missingMilestone), checked last, so that what the command or PLAN.md gets wrong is named first.
 */
export function nextSet(cwd, input) {
    const dir = requireStateDir(cwd);
    const layer = input.layer.trim();
    const phase = PHASES.includes(layer);
    // A phase defaults to PHASE_EFFORT; a given effort is kept, so that a multi-line or unknown value is reported first.
    const text = formatNext({ ...input, effort: phase ? (input.effort ?? PHASE_EFFORT) : input.effort });
    const invalid = validateNext(text);
    if (invalid.length > 0)
        throw new Error(`NEXT.md を書かない: ${invalid.join('、')}`);
    if (phase && parseNext(text)?.effort !== PHASE_EFFORT) {
        throw new Error(`NEXT.md を書かない: 層「${layer}」の effort は ${PHASE_EFFORT} 固定（--effort を外して再実行）`);
    }
    const plan = readState(dir, 'PLAN.md') ?? '';
    const broken = validatePlan(plan);
    // "PLAN.md を" rather than "PLAN.md の層名を": a problem can be an unclosed code fence, which is not a name.
    if (broken.length > 0)
        throw new Error(`NEXT.md を書かない: ${broken.join('、')}（PLAN.md を直してから）`);
    const items = parsePlan(plan);
    if (items.length > 0 && !phase && !items.some((item) => item.layer === layer)) {
        throw new Error(`NEXT.md を書かない: PLAN.md に層「${layer}」がない（PLAN の層名をそのまま、または ${PHASES.join(' / ')}）`);
    }
    // Read only for the layers that wait for a milestone, so that a LOG.md that cannot be read refuses no other layer.
    const log = AFTER_LAYERS.includes(layer) ? (readState(dir, 'LOG.md') ?? '') : '';
    const missing = missingMilestone(layer, items, log);
    if (missing !== undefined) {
        throw new Error(`NEXT.md を書かない: ${missing}（先に soujo log add '節目' --line '<何が終わったか>' --line '<何が未決か>'）`);
    }
    // A killed write's temporary file would otherwise stay untracked until layer done or close, or block a write under the same pid.
    removeLeftoverTemps(dir);
    writeState(dir, 'NEXT.md', text);
    return [`NEXT.md を更新: 次: ${layer}`];
}
// Rotating is suggested once it would move this many months: right after a month ends, only the month before is left behind.
const ROTATE_MONTHS = 2;
function reason(error) {
    return error instanceof Error ? error.message : String(error);
}
// Each state file is read on its own, so that one that cannot be read leaves the other warnings standing instead of taking
// their place. Only the checks needing that file are the ones left out.
function nextState(dir) {
    try {
        const text = readState(dir, 'NEXT.md');
        if (text === undefined)
            return { problems: ['NEXT.md がない'] };
        return { problems: validateNext(text), next: parseNext(text) };
    }
    catch (error) {
        return { problems: [reason(error)] };
    }
}
// PLAN's layers come back too, since what NEXT.md's layer stands as depends on them (see nextState).
function planState(dir) {
    try {
        const plan = readState(dir, 'PLAN.md') ?? '';
        // missingConditions is a warning, not a refusal like layer done's: an existing PLAN written before the rule still
        // resumes, and the layer is named now rather than after the half hour of work it takes to reach layer done.
        return { problems: [...validatePlan(plan), ...missingConditions(plan)], items: parsePlan(plan) };
    }
    catch (error) {
        return { problems: [reason(error)] };
    }
}
// A warning, not a refusal, like missingConditions: an existing SPEC out of form still resumes. A missing SPEC is no problem
// here; resume points to the spec skill for it.
function specProblems(dir) {
    try {
        return validateSpec(readState(dir, 'SPEC.md') ?? '');
    }
    catch (error) {
        return [reason(error)];
    }
}
function logProblems(dir, now) {
    try {
        const { moved } = rotateLog(readState(dir, 'LOG.md') ?? '', formatDate(now).slice(0, 7));
        const months = logMonths(moved.map(({ entry }) => entry)).length;
        return months >= ROTATE_MONTHS ? [`LOG.md に移せる過去${months}か月分のエントリ（soujo log rotate）`] : [];
    }
    catch (error) {
        return [reason(error)];
    }
}
function problems(dir, now) {
    const next = nextState(dir);
    const plan = planState(dir);
    const found = [...next.problems];
    if (next.next !== undefined && plan.items !== undefined) {
        const { layer } = next.next;
        const status = nextStatus(layer, plan.items);
        // The 確認 is compared only while the layer itself stands: pointing at a finished or skipped layer is the problem to
        // fix, and its condition differing is what follows from it, not a second thing to do.
        if (status.state === 'done')
            found.push(`NEXT.md の次「${layer}」は PLAN で完了済み`);
        else if (status.state === 'skipped')
            found.push(`NEXT.md の次「${layer}」より前の「${status.unfinished.layer}」が PLAN で未完了`);
        else {
            const mismatch = checkMismatch(next.next, plan.items);
            if (mismatch !== undefined)
                found.push(mismatch);
        }
    }
    found.push(...plan.problems);
    found.push(...specProblems(dir));
    found.push(...logProblems(dir, now));
    found.push(...changeProblems(dirname(dir), next.next !== undefined && PHASES.includes(next.next.layer)));
    return found;
}
/**
 * Kept apart like the state files, so that a git failure does not hide the other warnings. While `次:` is a phase, the
 * records `.soujo/` holds are left out of the count: spec, plan, and converge write them and commit nothing, so a warning
 * about them would stand from the phase until the next layer done, with nothing to do about it. A change anywhere else
 * still warns.
 */
function changeProblems(root, phase) {
    try {
        if (gitToplevel(root) === undefined)
            return [];
        const { count, truncated } = gitChangeCount(root, undefined, phase ? [STATE_DIR] : []);
        return count > 0 || truncated ? [`未コミットの変更 ${count}件${truncated ? '以上' : ''}`] : [];
    }
    catch (error) {
        return [`未コミットの変更を確認できない: ${reason(error)}`];
    }
}
/**
 * How long the git calls of `--hook` may take together. The host kills the Stop hook after the timeout of hooks/hooks.json
 * (checked against this in test/hosts.test.ts) and the warning with it, so a `git status` a huge working tree cannot
 * finish in time is reported as one problem among the others instead of leaving the session without a word.
 */
export const HOOK_GIT_BUDGET = 20 * 1000;
/** One warning line when the project is not safely resumable; nothing otherwise or outside Soujo projects. Never throws. */
export function nextCheck(cwd, hook, now = new Date(), budget = HOOK_GIT_BUDGET) {
    let found;
    if (hook)
        gitBudget(budget);
    try {
        const dir = findStateDir(cwd);
        if (dir === undefined)
            return [];
        found = problems(dir, now);
    }
    catch (error) {
        found = [`確認できない: ${reason(error)}`];
    }
    finally {
        if (hook)
            gitBudget(undefined);
    }
    if (found.length === 0)
        return [];
    const line = warning(found);
    if (!hook)
        return [line];
    // Hidden and flattened before the line is encoded: cli.ts does both to what a command returns, and JSON escaping would have
    // turned a control character in the home path into "\t" or "" by then, which the path it compares against has not.
    const [home, foldCase] = homePath();
    return [JSON.stringify({ systemMessage: printable(hideHome(line, home, foldCase)) })];
}
