// Checks and messages used by more than one command: committing records, reading NEXT.md and PLAN.md, and naming skills for both hosts.
import { join } from 'node:path';
import { STATE_DIR, STATE_FILES, STATE_PATHS, isSymlink, readState, requireState, requireStateDir, stateTarget, statePath, trackedStatePath, } from '../files.js';
import { gitHeadFile, gitIgnored, gitOperationInProgress, gitToplevel, gitUnmergedCount } from '../git.js';
import { parseLog, parseNext, parsePlan, validateNext } from '../state.js';
const CLIP = 60;
export const NO_LAYERS = 'PLAN.md に層がない';
/** The start of the first line of a LOG entry written by close. */
export const INTERRUPTED = '中断: ';
/** The layers of PLAN.md in the project above cwd; throws outside Soujo projects or without PLAN.md. */
export function readPlan(cwd) {
    return parsePlan(requireState(requireStateDir(cwd), 'PLAN.md'));
}
/** A skill as typed in Claude Code, with the Codex spelling. */
export function skill(name) {
    return `/soujo:${name}（Codex は $${name}）`;
}
/** text cut to max characters with "…", so a long value cannot stretch a status line. */
export function clip(text, max = CLIP) {
    const chars = Array.from(text);
    return chars.length <= max ? text : `${chars.slice(0, max - 1).join('')}…`;
}
/** "NEXT.md が無効: A、B" without repeating "NEXT.md" inside each problem. */
export function describeInvalidNext(problems) {
    return `NEXT.md が無効: ${problems.map((problem) => problem.replace(/^NEXT\.md が/, '')).join('、')}`;
}
/** The valid NEXT.md; missing or invalid throws with hint appended. */
export function requireNext(dir, hint) {
    const text = readState(dir, 'NEXT.md');
    if (text === undefined)
        throw new Error(`NEXT.md がない${hint}`);
    const next = parseNext(text);
    if (next === undefined)
        throw new Error(`${describeInvalidNext(validateNext(text))}${hint}`);
    return next;
}
/**
 * Throws unless committing the project at root is safe: a repository, .soujo/ not a symlink, every state file (a symlink's
 * target included) inside the project and outside .git, no unfinished merge/rebase/cherry-pick/revert, no unmerged files,
 * and no state file or symlink target ignored by git.
 */
export function requireCommittable(root) {
    const toplevel = gitToplevel(root);
    if (toplevel === undefined)
        throw new Error('git リポジトリではないのでコミットできない');
    if (isSymlink(join(root, STATE_DIR))) {
        throw new Error(`${STATE_DIR}/ が symlink なので記録をコミットできない（実体のディレクトリにしてから）`);
    }
    for (const file of STATE_FILES) {
        const { problem } = stateTarget(join(root, STATE_DIR), file);
        if (problem !== undefined)
            throw new Error(`${statePath(file)} の実体（symlink の先）が${problem}なので記録をコミットできない`);
    }
    const operation = gitOperationInProgress(root);
    if (operation !== undefined)
        throw new Error(`git の ${operation} が途中なのでコミットしない（終えるか中止してから）`);
    const unmerged = gitUnmergedCount(toplevel);
    if (unmerged > 0)
        throw new Error(`競合が未解決のファイルが ${unmerged}件あるのでコミットしない`);
    const tracked = STATE_FILES.map((file) => trackedStatePath(root, file));
    const ignored = gitIgnored(root, [...new Set([...STATE_PATHS, ...tracked])]);
    if (ignored.length > 0) {
        throw new Error(`${ignored.join(', ')} が git に無視されていて記録がコミットに残らない（.gitignore などから外してから）`);
    }
}
/** The last LOG entry when HEAD's LOG.md does not have it yet (a previous run wrote it but did not commit), or undefined. */
export function uncommittedLastLog(log, head) {
    const entries = parseLog(log);
    return entries.length > parseLog(head ?? '').length ? entries.at(-1) : undefined;
}
/** The state file as committed at HEAD (following a symlinked file to its target), or undefined when HEAD has none. */
export function headState(root, file) {
    return gitHeadFile(root, trackedStatePath(root, file));
}
/** Runs step and appends what is already recorded and how to resume to its error message. */
export function resumable(step, recorded) {
    try {
        return step();
    }
    catch (error) {
        throw new Error(`${error.message}（${recorded}）`);
    }
}
