// Checks and messages used by more than one command: committing records, reading NEXT.md and PLAN.md, and naming skills for both hosts.

import { join, posix } from 'node:path';
import {
  STATE_DIR,
  STATE_FILES,
  MAX_SYMLINKS,
  foldsCase,
  isSymlink,
  readState,
  requireState,
  requireStateDir,
  stateIdentities,
  stateTarget,
  statePath,
  symlinkTargetParts,
  trackedStatePath,
  type StateFile,
} from '../files.js';
import {
  gitAddAll,
  gitCommit,
  gitHasCommits,
  gitHasStagedChanges,
  gitHeadEntry,
  gitIgnored,
  gitLastCommit,
  gitNotStaged,
  gitOperationInProgress,
  gitToplevel,
  gitUnmergedCount,
  gitUntracked,
  type Commit,
  type HeadEntry,
} from '../git.js';
import { parseLog, parseNext, parsePlan, validateNext, type LogEntry, type Next, type PlanItem } from '../state.js';

const CLIP = 60;
// The records a layer or wip commit must carry as written. SPEC.md is one too: the skills write it, and a layer's commit
// would otherwise leave its change behind without a word.
const RECORDS = ['SPEC.md', 'PLAN.md', 'LOG.md', 'NEXT.md'] as const;
// How many paths an error names before counting the rest.
const SHOWN_PATHS = 3;

/**
 * The name of a file that holds credentials (by its base name, in lower case). .env.example is a template without values. A
 * commit that stages everything must not take one in only because the project's .gitignore forgot it.
 */
export const CREDENTIAL_FILE =
  /^(?:\.env(?:\.(?!example$).+)?|\.npmrc|\.netrc|_netrc|\.git-credentials|\.credentials\.json|auth\.json|id_(?:rsa|ed25519(?:_sk)?|ecdsa(?:_sk)?)(?:\.pub)?|.+\.(?:pem|key))$/;

export const NO_LAYERS = 'PLAN.md に層がない';

/** The start of the subject of a layer done commit. */
export const LAYER_COMMIT = 'layer: ';

/** The start of the first line of a LOG entry written by close. */
export const INTERRUPTED = '中断: ';

/** A note starting like a 中断 entry, in any spelling close accepts. */
export const INTERRUPTION_NOTE = /^\s*中断\s*[:：]/;

/** A failure becomes a value, so one unreadable file or git failure degrades one line of a status instead of the whole status. */
export function attempt<T>(step: () => T): T | Error {
  try {
    return step();
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

/** Why git has no commit to show, as a status line says it. */
export type NoCommit = 'git リポジトリではない' | 'まだない' | 'git の状態を読めない';

/** Reads git history with read in a repository that has commits; otherwise, or when git fails, why there is nothing to show. */
export function readGit<T>(root: string, read: () => T): T | NoCommit {
  const toplevel = attempt(() => gitToplevel(root));
  if (toplevel instanceof Error) return 'git の状態を読めない';
  if (toplevel === undefined) return 'git リポジトリではない';
  const hasCommits = attempt(() => gitHasCommits(root));
  if (hasCommits instanceof Error) return 'git の状態を読めない';
  if (!hasCommits) return 'まだない';
  const result = attempt(read);
  return result instanceof Error ? 'git の状態を読めない' : result;
}

/** The last commit changing the project, or why there is none to show. */
export function readHead(root: string): Commit | NoCommit {
  return readGit(root, (): Commit | NoCommit => gitLastCommit(root) ?? 'まだない');
}

/** The hash of the last commit changing the project, for a message after committing: "?" when git cannot say, never a throw. */
export function committedHash(root: string): string {
  const commit = attempt(() => gitLastCommit(root));
  return commit instanceof Error ? '?' : (commit?.hash ?? '?');
}

/** The layers of PLAN.md in the project above cwd; throws outside Soujo projects or without PLAN.md. */
export function readPlan(cwd: string): PlanItem[] {
  return parsePlan(requireState(requireStateDir(cwd), 'PLAN.md'));
}

/** A skill as typed in Claude Code, with the Codex spelling. */
export function skill(name: 'converge' | 'go' | 'plan' | 'resume' | 'spec'): string {
  return `/soujo:${name}（Codex は $${name}）`;
}

/** text cut to max characters with "…", so a long value cannot stretch a status line. */
export function clip(text: string, max: number = CLIP): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join('')}…`;
}

// A layer name as one shell word: single-quoted, as the skills spell it, so that spaces and `$(…)` in it stay literal.
// No name suggested here carries a control character, which printable() would flatten so that the pasted line no longer
// matches: `close` refuses a PLAN that validatePlan refuses and `resume` names no layer of one, and validateNext refuses
// NEXT.md values carrying one.
function quoted(text: string): string {
  return `'${text.split("'").join(String.raw`'\''`)}'`;
}

/**
 * A layer name as the positional argument of a command a message suggests, with "--" before a name starting with "-",
 * which the CLI would read as an option. Options a caller adds go before the "--" (`soujo layer done --note x -- '-L1'`).
 */
export function commandArg(text: string): string {
  return text.startsWith('-') ? `-- ${quoted(text)}` : quoted(text);
}

/** A layer name as the value of an option, attached with "=", so that a name starting with "-" is still read as the value. */
export function optionArg(option: string, text: string): string {
  return `${option}=${quoted(text)}`;
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
 * Whether path (relative to root) names a credential file: as written, or in another letter case where the file system
 * ignores case, since a tool opening .npmrc there opens .NPMRC. The file system is asked only for a name that needs it.
 */
function isCredential(root: string, path: string): boolean {
  const name = posix.basename(path);
  if (CREDENTIAL_FILE.test(name)) return true;
  return CREDENTIAL_FILE.test(name.toLowerCase()) && foldsCase(join(root, path));
}

/** paths joined for a message: the first SHOWN_PATHS of them, then how many are left. */
function listPaths(paths: readonly string[]): string {
  const rest = paths.length > SHOWN_PATHS ? ` ほか${paths.length - SHOWN_PATHS}件` : '';
  return `${paths.slice(0, SHOWN_PATHS).join(', ')}${rest}`;
}

/**
 * Throws unless committing the project at root is safe: a repository, .soujo/ not a symlink, every state file (a symlink's
 * target included) inside the project, outside .git, and not another state file or archive, no unfinished
 * merge/rebase/cherry-pick/revert anywhere in the repository, no unmerged files in the project, no state file or symlink
 * target ignored by git, and no untracked credential file (see isCredential) that staging everything would take in. One
 * added with `git add` first is tracked, and is committed as the user chose.
 */
export function requireCommittable(root: string): void {
  const toplevel = gitToplevel(root);
  if (toplevel === undefined) throw new Error('git リポジトリではないのでコミットできない');
  if (isSymlink(join(root, STATE_DIR))) {
    throw new Error(`${STATE_DIR}/ が symlink なので記録をコミットできない（実体のディレクトリにしてから）`);
  }
  requireSafeTargets(root, STATE_FILES);
  const operation = gitOperationInProgress(root);
  if (operation !== undefined) throw new Error(`git の ${operation} が途中なのでコミットしない（終えるか中止してから）`);
  const unmerged = gitUnmergedCount(root);
  if (unmerged > 0) throw new Error(`競合が未解決のファイルが ${unmerged}件あるのでコミットしない`);
  requireNotIgnored(root, STATE_FILES);
  const credentials = gitUntracked(root).filter((path) => isCredential(root, path));
  if (credentials.length > 0) {
    throw new Error(`${listPaths(credentials)} は認証情報のファイル名なのでコミットしない（.gitignore に足すか、コミットするなら先に git add する）`);
  }
}

/**
 * Throws when a file must not be written: its real path (a symlink's target) is outside the project or inside .git, or it is
 * another state file or archive, which writing both of them would overwrite (see stateTarget).
 */
function requireSafeTargets(root: string, files: readonly StateFile[]): void {
  const dir = join(root, STATE_DIR);
  const known = stateIdentities(dir, files);
  for (const file of files) {
    const { problem } = stateTarget(dir, file, known);
    if (problem !== undefined) throw new Error(`${statePath(file)} の${problem.text}なので記録をコミットできない`);
  }
}

/** Throws when git ignores a file or its symlink target, so that it would be missing from the commit. */
function requireNotIgnored(root: string, files: readonly StateFile[]): void {
  const paths = files.flatMap((file) => [statePath(file), trackedStatePath(root, file)]);
  const ignored = gitIgnored(root, [...new Set(paths)]);
  if (ignored.length > 0) {
    throw new Error(`${ignored.join(', ')} が git に無視されていて記録がコミットに残らない（.gitignore などから外してから）`);
  }
}

/** The checks of requireCommittable for files other than the four state files, e.g. the archives of LOG.md. */
export function requireCommittableFiles(root: string, files: readonly StateFile[]): void {
  if (files.length === 0) return;
  requireSafeTargets(root, files);
  requireNotIgnored(root, files);
}

/**
 * The LOG entries, in order, that HEAD's LOG.md does not have (a previous run wrote them but did not commit), wherever they
 * are. Entries are compared whole and counted, so a repeated entry is uncommitted once HEAD has fewer copies of it.
 */
export function uncommittedLogs(log: string, head: string | undefined): LogEntry[] {
  return missingEntries(parseLog(log), parseLog(head ?? ''), (entry) => entry);
}

/** The items, in order, whose entry present does not have. Entries are compared whole and counted, as uncommittedLogs does. */
export function missingEntries<T>(items: readonly T[], present: readonly LogEntry[], entryOf: (item: T) => LogEntry): T[] {
  const key = (entry: LogEntry) => JSON.stringify([entry.date, entry.layer, entry.lines]);
  const copies = new Map<string, number>();
  for (const entry of present) copies.set(key(entry), (copies.get(key(entry)) ?? 0) + 1);
  return items.filter((item) => {
    const left = copies.get(key(entryOf(item))) ?? 0;
    if (left > 0) copies.set(key(entryOf(item)), left - 1);
    return left === 0;
  });
}

/**
 * The state file as committed at HEAD, or undefined when HEAD has none. HEAD's entries decide: the path is resolved part by
 * part as realpath does, following each symlink at HEAD, a directory's included, to its target at HEAD (undefined beyond
 * MAX_SYMLINKS, as for a loop), whatever the working tree has now, so moving PLAN.md behind a symlink, or replacing a symlink
 * with the file, does not change what HEAD is taken to hold.
 */
export function headState(root: string, file: StateFile): string | undefined {
  const entries = new Map<string, HeadEntry | undefined>();
  const entryAt = (path: string): HeadEntry | undefined => {
    if (!entries.has(path)) entries.set(path, gitHeadEntry(root, path));
    return entries.get(path);
  };
  const pending = statePath(file).split('/');
  // The resolved directory, relative to root, "" for root itself.
  let dir = '';
  for (let links = 0; pending.length > 0; ) {
    const part = pending.shift() ?? '';
    if (part === '' || part === '.') continue;
    const path = posix.join(dir, part);
    if (part === '..') {
      dir = path === '.' ? '' : path;
      continue;
    }
    const entry = entryAt(path);
    if (entry?.symlink === true) {
      if (++links > MAX_SYMLINKS) return undefined;
      pending.unshift(...symlinkTargetParts(root, path, entry.content));
      dir = '';
    } else if (pending.length === 0) {
      return entry?.content;
    } else {
      dir = path;
    }
  }
  return undefined;
}

/**
 * Stages everything in the project and commits it as subject. Returns false, without committing, when nothing ends up staged.
 * Nothing is committed while SPEC, PLAN, LOG, NEXT, or an extra file, or the symlink standing for one, is not staged as
 * written (skip-worktree): the commit would lack its records, and a re-run of layer done could not add them afterwards.
 */
export function commitRecords(root: string, subject: string, extra: readonly StateFile[] = []): boolean {
  gitAddAll(root);
  const paths = [...RECORDS, ...extra].flatMap((file) => [statePath(file), trackedStatePath(root, file)]);
  const unstaged = gitNotStaged(root, [...new Set(paths)]);
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
