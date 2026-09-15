// git calls. Thin layer: runs git in the given directory and returns its output; no Soujo file parsing here.

import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// spawnSync fails beyond 1 MB by default; `git status` in a large working tree can exceed that.
const MAX_OUTPUT = 256 * 1024 * 1024;
const COMMIT_FORMAT = '--format=%h%x09%s';

export interface Commit {
  hash: string;
  subject: string;
}

function firstLine(text: string | undefined, from: 'first' | 'last'): string | undefined {
  const lines = (text ?? '').split('\n').map((line) => line.trim()).filter((line) => line !== '');
  return from === 'first' ? lines[0] : lines[lines.length - 1];
}

function run(cwd: string, args: string[]): SpawnSyncReturns<string> {
  return spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: MAX_OUTPUT });
}

function failure(args: string[], result: SpawnSyncReturns<string>): Error {
  const reason =
    firstLine(result.error?.message, 'first') ??
    firstLine(result.stderr, 'first') ??
    firstLine(result.stdout, 'last') ??
    `終了コード ${result.status}`;
  return new Error(`git ${args[0]} に失敗: ${reason}`);
}

function git(cwd: string, args: string[]): string {
  const result = run(cwd, args);
  if (result.error !== undefined || result.status !== 0) throw failure(args, result);
  return result.stdout;
}

/** For commands that answer yes/no with exit code 0 or 1; anything else throws. */
function exitCode(cwd: string, args: string[]): 0 | 1 {
  const result = run(cwd, args);
  if (result.error === undefined && (result.status === 0 || result.status === 1)) return result.status;
  throw failure(args, result);
}

/** Repository top level, or undefined outside a git repository. */
export function gitToplevel(cwd: string): string | undefined {
  try {
    return git(cwd, ['rev-parse', '--show-toplevel']).trim();
  } catch {
    return undefined;
  }
}

/** Whether HEAD points to a commit. Throws outside a repository or when git itself fails. */
export function gitHasCommits(cwd: string): boolean {
  return exitCode(cwd, ['rev-parse', '--verify', '--quiet', 'HEAD']) === 0;
}

// Staging, committing, and status are limited to cwd with this pathspec, so a project in a subdirectory of a larger
// repository never sweeps up changes outside it.
const HERE = ['--', '.'];

/**
 * `git status --porcelain` lines for cwd and below; empty when clean. Untracked files are included, an untracked directory
 * as one line, whatever status.showUntrackedFiles says.
 */
export function gitStatus(cwd: string): string[] {
  return git(cwd, ['status', '--porcelain', '--untracked-files=normal', ...HERE]).split('\n').filter((line) => line !== '');
}

/**
 * `git status --porcelain` lines for cwd and below, leaving out the paths matching the excluded git globs (relative to cwd).
 * Every untracked file has its own line, so an untracked directory holding only excluded files is not reported.
 */
export function gitStatusExcluding(cwd: string, excluded: readonly string[]): string[] {
  const pathspecs = excluded.map((glob) => `:(exclude,glob)${glob}`);
  return git(cwd, ['status', '--porcelain', '--untracked-files=all', ...HERE, ...pathspecs]).split('\n').filter((line) => line !== '');
}

const OPERATIONS = [
  ['MERGE_HEAD', 'merge'],
  ['rebase-merge', 'rebase'],
  ['rebase-apply', 'rebase'],
  ['CHERRY_PICK_HEAD', 'cherry-pick'],
  ['REVERT_HEAD', 'revert'],
  // Left by a multi-commit cherry-pick or revert even after CHERRY_PICK_HEAD / REVERT_HEAD are gone.
  ['sequencer', 'cherry-pick / revert'],
] as const;

/** The unfinished git operation (merge, rebase, cherry-pick, revert), or undefined. */
export function gitOperationInProgress(cwd: string): string | undefined {
  const gitDir = git(cwd, ['rev-parse', '--absolute-git-dir']).trim();
  return OPERATIONS.find(([marker]) => existsSync(join(gitDir, marker)))?.[1];
}

/** Stages every change in cwd and below, deletions and untracked files included. */
export function gitAddAll(cwd: string): void {
  git(cwd, ['add', '-A', ...HERE]);
}

/** Commits the changes in cwd and below; changes staged elsewhere stay staged. */
export function gitCommit(cwd: string, message: string): void {
  git(cwd, ['commit', '-q', '-m', message, ...HERE]);
}

/** Whether the index has anything to commit in cwd and below (compared with HEAD, or with nothing before the first commit). */
export function gitHasStagedChanges(cwd: string): boolean {
  return exitCode(cwd, ['diff', '--cached', '--quiet', ...HERE]) === 1;
}

/**
 * The paths (relative to cwd) whose file is not staged as it is, for example because skip-worktree or assume-unchanged
 * keeps `git add` from picking it up. Compared by object id, so clean filters and line-ending conversion count as staged.
 * Missing files are skipped.
 */
export function gitNotStaged(cwd: string, paths: readonly string[]): string[] {
  return paths.filter((path) => {
    if (!existsSync(join(cwd, path))) return false;
    const staged = run(cwd, ['rev-parse', '--verify', '--quiet', `:./${path}`]);
    if (staged.error !== undefined || (staged.status !== 0 && staged.status !== 1)) throw failure(['rev-parse'], staged);
    return staged.status === 1 || staged.stdout.trim() !== git(cwd, ['hash-object', '--', path]).trim();
  });
}

/** Stages everything in cwd and below and commits it. Returns false, without committing, when nothing ends up staged. */
export function gitCommitAll(cwd: string, message: string): boolean {
  gitAddAll(cwd);
  if (!gitHasStagedChanges(cwd)) return false;
  gitCommit(cwd, message);
  return true;
}

/** The paths (relative to cwd) that git ignores. Tracked files are never reported. */
export function gitIgnored(cwd: string, paths: readonly string[]): string[] {
  const args = ['check-ignore', '--', ...paths];
  const result = run(cwd, args);
  if (result.error === undefined && result.status === 1) return [];
  if (result.error !== undefined || result.status !== 0) throw failure(args, result);
  return result.stdout.split('\n').filter((line) => line !== '');
}

const UNMERGED = /^(DD|AU|UD|UA|DU|AA|UU) /;

/** The number of files with unresolved conflicts anywhere in the repository. */
export function gitUnmergedCount(cwd: string): number {
  return git(cwd, ['status', '--porcelain']).split('\n').filter((line) => UNMERGED.test(line)).length;
}

function parseCommit(line: string): Commit | undefined {
  const tab = line.indexOf('\t');
  return tab === -1 ? undefined : { hash: line.slice(0, tab), subject: line.slice(tab + 1) };
}

/** The latest commit for display, or undefined when there is none (or git fails). */
export function gitLastCommit(cwd: string): Commit | undefined {
  try {
    return parseCommit(git(cwd, ['log', '-1', COMMIT_FORMAT]).trim());
  } catch {
    return undefined;
  }
}

/** The latest commit whose subject is exactly subject, or undefined (also when there are no commits). Git failures throw. */
export function gitFindCommit(cwd: string, subject: string): Commit | undefined {
  if (!gitHasCommits(cwd)) return undefined;
  const output = git(cwd, ['log', COMMIT_FORMAT, '--fixed-strings', `--grep=${subject}`]);
  for (const line of output.split('\n')) {
    const commit = parseCommit(line);
    if (commit?.subject === subject) return commit;
  }
  return undefined;
}

/** The file at HEAD, or undefined when there are no commits or HEAD does not contain it. path is relative to cwd. */
export function gitHeadFile(cwd: string, path: string): string | undefined {
  if (!gitHasCommits(cwd)) return undefined;
  if (git(cwd, ['ls-tree', '--name-only', 'HEAD', '--', path]).trim() === '') return undefined;
  return git(cwd, ['show', `HEAD:./${path}`]);
}

/** Paths added by the HEAD commit, the root commit included. */
export function gitAddedFiles(cwd: string): string[] {
  const output = git(cwd, ['diff-tree', '-r', '--root', '--no-commit-id', '--name-only', '--diff-filter=A', '-z', 'HEAD']);
  return output.split('\0').filter((path) => path !== '');
}
