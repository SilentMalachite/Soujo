// Checks and messages used by more than one command: committing records, reading NEXT.md and PLAN.md, and naming skills for both hosts.

import { join } from 'node:path';
import {
  STATE_DIR,
  STATE_FILES,
  STATE_PATHS,
  isSymlink,
  readState,
  requireState,
  requireStateDir,
  stateTarget,
  statePath,
  trackedStatePath,
  type StateFile,
} from '../files.js';
import {
  gitAddAll,
  gitCommit,
  gitHasStagedChanges,
  gitHeadFile,
  gitIgnored,
  gitNotStaged,
  gitOperationInProgress,
  gitToplevel,
  gitUnmergedCount,
} from '../git.js';
import { parseLog, parseNext, parsePlan, validateNext, type LogEntry, type Next, type PlanItem } from '../state.js';

const CLIP = 60;
// The records a layer or wip commit must carry as written.
const RECORDS = ['PLAN.md', 'LOG.md', 'NEXT.md'] as const;

export const NO_LAYERS = 'PLAN.md に層がない';

/** The start of the first line of a LOG entry written by close. */
export const INTERRUPTED = '中断: ';

/** A note starting like a 中断 entry, in any spelling close accepts. */
export const INTERRUPTION_NOTE = /^\s*中断\s*[:：]/;

/** The layers of PLAN.md in the project above cwd; throws outside Soujo projects or without PLAN.md. */
export function readPlan(cwd: string): PlanItem[] {
  return parsePlan(requireState(requireStateDir(cwd), 'PLAN.md'));
}

/** A skill as typed in Claude Code, with the Codex spelling. */
export function skill(name: 'go' | 'plan' | 'resume' | 'spec'): string {
  return `/soujo:${name}（Codex は $${name}）`;
}

/** text cut to max characters with "…", so a long value cannot stretch a status line. */
export function clip(text: string, max: number = CLIP): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join('')}…`;
}

/** "NEXT.md が無効: A、B" without repeating "NEXT.md" inside each problem. */
export function describeInvalidNext(problems: string[]): string {
  return `NEXT.md が無効: ${problems.map((problem) => problem.replace(/^NEXT\.md が/, '')).join('、')}`;
}

/** The valid NEXT.md; missing or invalid throws with hint appended. */
export function requireNext(dir: string, hint: string): Next {
  const text = readState(dir, 'NEXT.md');
  if (text === undefined) throw new Error(`NEXT.md がない${hint}`);
  const next = parseNext(text);
  if (next === undefined) throw new Error(`${describeInvalidNext(validateNext(text))}${hint}`);
  return next;
}

/**
 * Throws unless committing the project at root is safe: a repository, .soujo/ not a symlink, every state file (a symlink's
 * target included) inside the project and outside .git, no unfinished merge/rebase/cherry-pick/revert, no unmerged files,
 * and no state file or symlink target ignored by git.
 */
export function requireCommittable(root: string): void {
  const toplevel = gitToplevel(root);
  if (toplevel === undefined) throw new Error('git リポジトリではないのでコミットできない');
  if (isSymlink(join(root, STATE_DIR))) {
    throw new Error(`${STATE_DIR}/ が symlink なので記録をコミットできない（実体のディレクトリにしてから）`);
  }
  for (const file of STATE_FILES) {
    const { problem } = stateTarget(join(root, STATE_DIR), file);
    if (problem !== undefined) throw new Error(`${statePath(file)} の実体（symlink の先）が${problem}なので記録をコミットできない`);
  }
  const operation = gitOperationInProgress(root);
  if (operation !== undefined) throw new Error(`git の ${operation} が途中なのでコミットしない（終えるか中止してから）`);
  const unmerged = gitUnmergedCount(toplevel);
  if (unmerged > 0) throw new Error(`競合が未解決のファイルが ${unmerged}件あるのでコミットしない`);
  const tracked = STATE_FILES.map((file) => trackedStatePath(root, file));
  const ignored = gitIgnored(root, [...new Set([...STATE_PATHS, ...tracked])]);
  if (ignored.length > 0) {
    throw new Error(`${ignored.join(', ')} が git に無視されていて記録がコミットに残らない（.gitignore などから外してから）`);
  }
}

/**
 * The LOG entries, in order, that HEAD's LOG.md does not have (a previous run wrote them but did not commit), wherever they
 * are. Entries are compared whole and counted, so a repeated entry is uncommitted once HEAD has fewer copies of it.
 */
export function uncommittedLogs(log: string, head: string | undefined): LogEntry[] {
  const key = (entry: LogEntry) => JSON.stringify([entry.date, entry.layer, entry.lines]);
  const committed = new Map<string, number>();
  for (const entry of parseLog(head ?? '')) committed.set(key(entry), (committed.get(key(entry)) ?? 0) + 1);
  return parseLog(log).filter((entry) => {
    const copies = committed.get(key(entry)) ?? 0;
    if (copies > 0) committed.set(key(entry), copies - 1);
    return copies === 0;
  });
}

/** The state file as committed at HEAD (following a symlinked file to its target), or undefined when HEAD has none. */
export function headState(root: string, file: StateFile): string | undefined {
  return gitHeadFile(root, trackedStatePath(root, file));
}

/**
 * Stages everything in the project and commits it as subject. Returns false, without committing, when nothing ends up staged.
 * Nothing is committed while PLAN, LOG, or NEXT is not staged as written (skip-worktree): the commit would lack its records,
 * and a re-run of layer done could not add them afterwards.
 */
export function commitRecords(root: string, subject: string): boolean {
  gitAddAll(root);
  const unstaged = gitNotStaged(root, RECORDS.map((file) => trackedStatePath(root, file)));
  if (unstaged.length > 0) throw new Error(`${unstaged.join(', ')} の変更を git が拾っていない（skip-worktree などを確認）`);
  if (!gitHasStagedChanges(root)) return false;
  gitCommit(root, subject);
  return true;
}

/** Runs step and appends what is already recorded and how to resume to its error message. */
export function resumable<T>(step: () => T, recorded: string): T {
  try {
    return step();
  } catch (error) {
    throw new Error(`${(error as Error).message}（${recorded}）`);
  }
}
