// Checks and messages used by more than one command: committing records, reading NEXT.md and PLAN.md, and naming skills for both hosts.
import { join } from 'node:path';
import { STATE_DIR, STATE_FILES, isSymlink, readState, requireState, requireStateDir, stateTarget, statePath, trackedStatePath, } from '../files.js';
import { gitAddAll, gitCommit, gitHasCommits, gitHasStagedChanges, gitHeadFile, gitIgnored, gitLastCommit, gitNotStaged, gitOperationInProgress, gitToplevel, gitUnmergedCount, } from '../git.js';
import { parseLog, parseNext, parsePlan, validateNext } from '../state.js';
const CLIP = 60;
// The records a layer or wip commit must carry as written.
const RECORDS = ['PLAN.md', 'LOG.md', 'NEXT.md'];
export const NO_LAYERS = 'PLAN.md に層がない';
/** The start of the subject of a layer done commit. */
export const LAYER_COMMIT = 'layer: ';
/** The start of the first line of a LOG entry written by close. */
export const INTERRUPTED = '中断: ';
/** A note starting like a 中断 entry, in any spelling close accepts. */
export const INTERRUPTION_NOTE = /^\s*中断\s*[:：]/;
/** A failure becomes a value, so one unreadable file or git failure degrades one line of a status instead of the whole status. */
export function attempt(step) {
    try {
        return step();
    }
    catch (error) {
        return error instanceof Error ? error : new Error(String(error));
    }
}
/** Reads git history with read in a repository that has commits; otherwise, or when git fails, why there is nothing to show. */
export function readGit(root, read) {
    const toplevel = attempt(() => gitToplevel(root));
    if (toplevel instanceof Error)
        return 'git の状態を読めない';
    if (toplevel === undefined)
        return 'git リポジトリではない';
    const hasCommits = attempt(() => gitHasCommits(root));
    if (hasCommits instanceof Error)
        return 'git の状態を読めない';
    if (!hasCommits)
        return 'まだない';
    const result = attempt(read);
    return result instanceof Error ? 'git の状態を読めない' : result;
}
/** The last commit, or why there is none to show. */
export function readHead(root) {
    return readGit(root, () => {
        const commit = gitLastCommit(root);
        if (commit === undefined)
            throw new Error('git log');
        return commit;
    });
}
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
    requireInProject(root, STATE_FILES);
    const operation = gitOperationInProgress(root);
    if (operation !== undefined)
        throw new Error(`git の ${operation} が途中なのでコミットしない（終えるか中止してから）`);
    const unmerged = gitUnmergedCount(toplevel);
    if (unmerged > 0)
        throw new Error(`競合が未解決のファイルが ${unmerged}件あるのでコミットしない`);
    requireNotIgnored(root, STATE_FILES);
}
/** Throws when a file's real path (a symlink's target) is outside the project or inside .git. */
function requireInProject(root, files) {
    for (const file of files) {
        const { problem } = stateTarget(join(root, STATE_DIR), file);
        if (problem !== undefined)
            throw new Error(`${statePath(file)} の実体（symlink の先）が${problem}なので記録をコミットできない`);
    }
}
/** Throws when git ignores a file or its symlink target, so that it would be missing from the commit. */
function requireNotIgnored(root, files) {
    const paths = files.flatMap((file) => [statePath(file), trackedStatePath(root, file)]);
    const ignored = gitIgnored(root, [...new Set(paths)]);
    if (ignored.length > 0) {
        throw new Error(`${ignored.join(', ')} が git に無視されていて記録がコミットに残らない（.gitignore などから外してから）`);
    }
}
/** The checks of requireCommittable for files other than the four state files, e.g. the archives of LOG.md. */
export function requireCommittableFiles(root, files) {
    if (files.length === 0)
        return;
    requireInProject(root, files);
    requireNotIgnored(root, files);
}
/**
 * The LOG entries, in order, that HEAD's LOG.md does not have (a previous run wrote them but did not commit), wherever they
 * are. Entries are compared whole and counted, so a repeated entry is uncommitted once HEAD has fewer copies of it.
 */
export function uncommittedLogs(log, head) {
    return missingEntries(parseLog(log), parseLog(head ?? ''), (entry) => entry);
}
/** The items, in order, whose entry present does not have. Entries are compared whole and counted, as uncommittedLogs does. */
export function missingEntries(items, present, entryOf) {
    const key = (entry) => JSON.stringify([entry.date, entry.layer, entry.lines]);
    const copies = new Map();
    for (const entry of present)
        copies.set(key(entry), (copies.get(key(entry)) ?? 0) + 1);
    return items.filter((item) => {
        const left = copies.get(key(entryOf(item))) ?? 0;
        if (left > 0)
            copies.set(key(entryOf(item)), left - 1);
        return left === 0;
    });
}
/** The state file as committed at HEAD (following a symlinked file to its target), or undefined when HEAD has none. */
export function headState(root, file) {
    return gitHeadFile(root, trackedStatePath(root, file));
}
/**
 * Stages everything in the project and commits it as subject. Returns false, without committing, when nothing ends up staged.
 * Nothing is committed while PLAN, LOG, NEXT, or an extra file is not staged as written (skip-worktree): the commit would lack
 * its records, and a re-run of layer done could not add them afterwards.
 */
export function commitRecords(root, subject, extra = []) {
    gitAddAll(root);
    const unstaged = gitNotStaged(root, [...RECORDS, ...extra].map((file) => trackedStatePath(root, file)));
    if (unstaged.length > 0)
        throw new Error(`${unstaged.join(', ')} の変更を git が拾っていない（skip-worktree などを確認）`);
    if (!gitHasStagedChanges(root))
        return false;
    gitCommit(root, subject);
    return true;
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
