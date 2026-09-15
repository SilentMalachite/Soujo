// git calls. Thin layer: runs git in the given directory and returns its output; no Soujo file parsing here.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
// spawnSync fails beyond 1 MB by default; `git status` in a large working tree can exceed that.
const MAX_OUTPUT = 256 * 1024 * 1024;
const COMMIT_FORMAT = '--format=%h%x09%ct%x09%s';
function firstLine(text, from) {
    const lines = (text ?? '').split('\n').map((line) => line.trim()).filter((line) => line !== '');
    return from === 'first' ? lines[0] : lines[lines.length - 1];
}
/**
 * The variables that point git at another repository, work tree, index, or object store, or carry `git -c` settings: the
 * list of `git rev-parse --local-env-vars`.
 */
export const REPOSITORY_ENV = [
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_CONFIG',
    'GIT_CONFIG_PARAMETERS',
    'GIT_CONFIG_COUNT',
    'GIT_OBJECT_DIRECTORY',
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_IMPLICIT_WORK_TREE',
    'GIT_GRAFT_FILE',
    'GIT_INDEX_FILE',
    'GIT_NO_REPLACE_OBJECTS',
    'GIT_REPLACE_REF_BASE',
    'GIT_PREFIX',
    'GIT_SHALLOW_FILE',
    'GIT_COMMON_DIR',
];
// The environment without REPOSITORY_ENV, so that a soujo started from a git hook or a shell that set them reads and
// commits the repository of cwd, not another one.
function environment(extra) {
    const env = { ...process.env, ...extra };
    for (const name of REPOSITORY_ENV)
        delete env[name];
    return env;
}
function run(cwd, args, extra = {}) {
    return spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: MAX_OUTPUT, env: environment(extra) });
}
// A path printed by git on one line: only the line break is dropped, since a directory name may start or end with a space.
function pathLine(output) {
    return output.endsWith('\n') ? output.slice(0, -1) : output;
}
function failure(args, result) {
    const reason = firstLine(result.error?.message, 'first') ??
        firstLine(result.stderr, 'first') ??
        firstLine(result.stdout, 'last') ??
        `終了コード ${result.status}`;
    return new Error(`git ${args[0]} に失敗: ${reason}`);
}
function git(cwd, args) {
    const result = run(cwd, args);
    if (result.error !== undefined || result.status !== 0)
        throw failure(args, result);
    return result.stdout;
}
/** For commands that answer yes/no with exit code 0 or 1; anything else throws. */
function exitCode(cwd, args) {
    const result = run(cwd, args);
    if (result.error === undefined && (result.status === 0 || result.status === 1))
        return result.status;
    throw failure(args, result);
}
// What git says when cwd is in no repository, read in the C locale so that a translated git says it the same way.
const NOT_A_REPOSITORY = /not a git repository/i;
/**
 * Repository top level, or undefined outside a git repository. Any other failure (git missing, a broken config) throws, so
 * that a repository git cannot read is never taken for a directory without one.
 */
export function gitToplevel(cwd) {
    const args = ['rev-parse', '--show-toplevel'];
    const result = run(cwd, args, { LC_ALL: 'C' });
    if (result.error === undefined && result.status === 0)
        return pathLine(result.stdout);
    if (result.error === undefined && NOT_A_REPOSITORY.test(result.stderr))
        return undefined;
    throw failure(args, result);
}
/** Whether HEAD points to a commit. Throws outside a repository or when git itself fails. */
export function gitHasCommits(cwd) {
    return exitCode(cwd, ['rev-parse', '--verify', '--quiet', 'HEAD']) === 0;
}
// Staging, committing, and status are limited to cwd with this pathspec, so a project in a subdirectory of a larger
// repository never sweeps up changes outside it.
const HERE = ['--', '.'];
/**
 * `git status --porcelain` lines for cwd and below; empty when clean. Untracked files are included, an untracked directory
 * as one line, whatever status.showUntrackedFiles says.
 */
export function gitStatus(cwd) {
    return git(cwd, ['status', '--porcelain', '--untracked-files=normal', ...HERE]).split('\n').filter((line) => line !== '');
}
/**
 * `git status --porcelain` lines for cwd and below, leaving out the given paths (relative to cwd, taken literally). An untracked
 * directory counts once, as in gitStatus.
 */
export function gitStatusExcluding(cwd, excluded) {
    const pathspecs = excluded.map((path) => `:(exclude,literal)${path}`);
    return git(cwd, ['status', '--porcelain', '--untracked-files=normal', ...HERE, ...pathspecs]).split('\n').filter((line) => line !== '');
}
/** The given paths (relative to cwd, taken literally) with uncommitted changes, untracked and deleted files included, in the given order. */
export function gitChangedPaths(cwd, paths) {
    if (paths.length === 0)
        return [];
    const prefix = pathLine(git(cwd, ['rev-parse', '--show-prefix']));
    const pathspecs = paths.map((path) => `:(literal)${path}`);
    // -z keeps paths unquoted; --no-renames keeps one path per record. Porcelain paths are relative to the top level.
    const output = git(cwd, ['status', '--porcelain', '-z', '--no-renames', '--untracked-files=all', '--', ...pathspecs]);
    const changed = new Set(output.split('\0').filter((record) => record.length > 3).map((record) => record.slice(3)));
    return paths.filter((path) => changed.has(`${prefix}${path}`));
}
const OPERATIONS = [
    ['MERGE_HEAD', 'merge'],
    ['rebase-merge', 'rebase'],
    ['rebase-apply', 'rebase'],
    ['CHERRY_PICK_HEAD', 'cherry-pick'],
    ['REVERT_HEAD', 'revert'],
    // Left by a multi-commit cherry-pick or revert even after CHERRY_PICK_HEAD / REVERT_HEAD are gone.
    ['sequencer', 'cherry-pick / revert'],
];
/** The unfinished git operation (merge, rebase, cherry-pick, revert), or undefined. */
export function gitOperationInProgress(cwd) {
    const gitDir = pathLine(git(cwd, ['rev-parse', '--absolute-git-dir']));
    return OPERATIONS.find(([marker]) => existsSync(join(gitDir, marker)))?.[1];
}
/** Stages every change in cwd and below, deletions and untracked files included. */
export function gitAddAll(cwd) {
    git(cwd, ['add', '-A', ...HERE]);
}
/** Commits the changes in cwd and below; changes staged elsewhere stay staged. */
export function gitCommit(cwd, message) {
    git(cwd, ['commit', '-q', '-m', message, ...HERE]);
}
/** Whether the index has anything to commit in cwd and below (compared with HEAD, or with nothing before the first commit). */
export function gitHasStagedChanges(cwd) {
    return exitCode(cwd, ['diff', '--cached', '--quiet', ...HERE]) === 1;
}
/**
 * The paths (relative to cwd) whose file is not staged as it is, for example because skip-worktree or assume-unchanged
 * keeps `git add` from picking it up. Compared by object id, so clean filters and line-ending conversion count as staged.
 * Missing files are skipped.
 */
export function gitNotStaged(cwd, paths) {
    return paths.filter((path) => {
        if (!existsSync(join(cwd, path)))
            return false;
        const staged = run(cwd, ['rev-parse', '--verify', '--quiet', `:./${path}`]);
        if (staged.error !== undefined || (staged.status !== 0 && staged.status !== 1))
            throw failure(['rev-parse'], staged);
        return staged.status === 1 || staged.stdout.trim() !== git(cwd, ['hash-object', '--', path]).trim();
    });
}
/** Stages everything in cwd and below and commits it. Returns false, without committing, when nothing ends up staged. */
export function gitCommitAll(cwd, message) {
    gitAddAll(cwd);
    if (!gitHasStagedChanges(cwd))
        return false;
    gitCommit(cwd, message);
    return true;
}
/** The paths (relative to cwd) that git ignores. Tracked files are never reported. */
export function gitIgnored(cwd, paths) {
    const args = ['check-ignore', '--', ...paths];
    const result = run(cwd, args);
    if (result.error === undefined && result.status === 1)
        return [];
    if (result.error !== undefined || result.status !== 0)
        throw failure(args, result);
    return result.stdout.split('\n').filter((line) => line !== '');
}
const UNMERGED = /^(DD|AU|UD|UA|DU|AA|UU) /;
/** The number of files with unresolved conflicts anywhere in the repository. */
export function gitUnmergedCount(cwd) {
    return git(cwd, ['status', '--porcelain']).split('\n').filter((line) => UNMERGED.test(line)).length;
}
function parseCommit(line) {
    const match = /^([^\t]+)\t(\d+)\t(.*)$/.exec(line);
    if (match === null)
        return undefined;
    return { hash: match[1] ?? '', subject: match[3] ?? '', date: new Date(Number(match[2]) * 1000) };
}
function parseCommits(output) {
    return output.split('\n').flatMap((line) => parseCommit(line) ?? []);
}
/** The latest commit for display, or undefined when there is none (or git fails). */
export function gitLastCommit(cwd) {
    try {
        return parseCommit(git(cwd, ['log', '-1', COMMIT_FORMAT]).trim());
    }
    catch {
        return undefined;
    }
}
/** The latest commit whose subject is exactly subject, or undefined (also when there are no commits). Git failures throw. */
export function gitFindCommit(cwd, subject) {
    if (!gitHasCommits(cwd))
        return undefined;
    const output = git(cwd, ['log', COMMIT_FORMAT, '--fixed-strings', `--grep=${subject}`]);
    return parseCommits(output).find((commit) => commit.subject === subject);
}
/** The latest commit whose subject starts with prefix, or undefined (also when there are no commits). Git failures throw. */
export function gitFindCommitStarting(cwd, prefix) {
    if (!gitHasCommits(cwd))
        return undefined;
    const output = git(cwd, ['log', COMMIT_FORMAT, '--fixed-strings', `--grep=${prefix}`]);
    return parseCommits(output).find((commit) => commit.subject.startsWith(prefix));
}
/** The commits reachable from HEAD but not from since (every commit without since), oldest first. Git failures throw. */
export function gitCommitsAfter(cwd, since) {
    if (!gitHasCommits(cwd))
        return [];
    return parseCommits(git(cwd, ['log', '--reverse', COMMIT_FORMAT, since === undefined ? 'HEAD' : `${since}..HEAD`, '--']));
}
/** The file at HEAD, or undefined when there are no commits or HEAD does not contain it. path is relative to cwd. */
export function gitHeadFile(cwd, path) {
    if (!gitHasCommits(cwd))
        return undefined;
    if (git(cwd, ['ls-tree', '--name-only', 'HEAD', '--', path]).trim() === '')
        return undefined;
    return git(cwd, ['show', `HEAD:./${path}`]);
}
/** Paths added by the HEAD commit, the root commit included. */
export function gitAddedFiles(cwd) {
    const output = git(cwd, ['diff-tree', '-r', '--root', '--no-commit-id', '--name-only', '--diff-filter=A', '-z', 'HEAD']);
    return output.split('\0').filter((path) => path !== '');
}
