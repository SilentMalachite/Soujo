// git calls. Thin layer: runs git in the given directory and returns its output; no Soujo file parsing here.
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readlinkSync } from 'node:fs';
import { join, posix } from 'node:path';
// spawnSync fails beyond 1 MB by default; `git log` in a long history can exceed that.
const MAX_OUTPUT = 256 * 1024 * 1024;
// Counting changes and listing untracked files stop reading here, so that a huge working tree's listing is not held in
// memory: past it the count is a lower bound and the list is only part of them.
const COUNT_OUTPUT = 16 * 1024 * 1024;
// How long one git call may take before it is killed, so that a `commit.gpgSign` pinentry with nothing to read from, or a
// hook that never returns, fails in one line instead of holding the session that called soujo (SPEC §14).
const TIMEOUT = 120 * 1000;
// The budget the later git calls share and when it ends, read from a clock that only moves forward (performance.now(), not
// the wall clock a correction may move back), or undefined for the plain TIMEOUT one call at a time.
let budget;
/**
 * Makes every later git call end within ms from now, together: each is given what is left, killed and reported like one
 * past TIMEOUT, and one started with nothing left is reported without being run. undefined restores the plain limit. A hook
 * the host kills after its own timeout can so say what git could not finish, instead of nothing.
 */
export function gitBudget(ms) {
    budget = ms === undefined ? undefined : { total: ms, until: performance.now() + ms };
}
// How long the next call may take, and the limit its failure names: what is left of the budget, never more than TIMEOUT.
// 0 or less means the budget is spent, and the message names the whole of it rather than the sliver that was left.
function timeLimit() {
    if (budget === undefined)
        return { left: TIMEOUT, named: TIMEOUT };
    const left = Math.min(TIMEOUT, budget.until - performance.now());
    return { left, named: left > 0 ? left : budget.total };
}
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
/**
 * The variables that change how a pathspec is read. With GIT_LITERAL_PATHSPECS set, git takes `:(exclude,literal).soujo`
 * and `:(literal)PLAN.md` for file names of their own, which leaves the excluded paths in and finds nothing at HEAD; the
 * others glob, un-glob, or fold the case of paths meant to be literal.
 */
export const PATHSPEC_ENV = [
    'GIT_LITERAL_PATHSPECS',
    'GIT_GLOB_PATHSPECS',
    'GIT_NOGLOB_PATHSPECS',
    'GIT_ICASE_PATHSPECS',
];
/**
 * env without REPOSITORY_ENV and PATHSPEC_ENV, so that a soujo started from a git hook or a shell that set them reads and
 * commits the repository of cwd, not another one, and reads its own pathspecs as written. Where the system's variable names
 * ignore letter case (Windows), a name is removed in whatever case it was set, since the child would read it all the same.
 * Exported for its tests.
 */
export function withoutGitEnv(env, foldsCase = process.platform === 'win32') {
    const removed = new Set([...REPOSITORY_ENV, ...PATHSPEC_ENV]);
    const stripped = { ...env };
    for (const name of Object.keys(stripped)) {
        if (removed.has(name) || (foldsCase && removed.has(name.toUpperCase())))
            delete stripped[name];
    }
    return stripped;
}
function environment(extra) {
    return withoutGitEnv({ ...process.env, ...extra });
}
// What a call past the budget returns: the ETIMEDOUT of a killed one, so that every caller reports it the same way.
function timedOut(limit) {
    const error = new Error('git は制限時間内に始められなかった');
    error.code = 'ETIMEDOUT';
    return { pid: 0, output: [], stdout: '', stderr: '', status: null, signal: null, error, limit };
}
function run(cwd, args, extra = {}, input, maxBuffer = MAX_OUTPUT) {
    const stdin = input === undefined ? 'ignore' : 'pipe';
    const { left, named } = timeLimit();
    // Starting a call with nothing left would wait for a whole git run past the budget, since spawnSync reads 0 as "no limit".
    if (left <= 0)
        return timedOut(named);
    const result = spawnSync('git', args, {
        cwd,
        encoding: 'utf8',
        input,
        stdio: [stdin, 'pipe', 'pipe'],
        maxBuffer,
        // Whole milliseconds: performance.now() leaves a fraction, which spawnSync refuses.
        timeout: Math.ceil(left),
        env: environment(extra),
    });
    return Object.assign(result, { limit: named });
}
// A path printed by git on one line: only the line break is dropped, since a directory name may start or end with a space.
function pathLine(output) {
    return output.endsWith('\n') ? output.slice(0, -1) : output;
}
function failure(args, result) {
    const reason = 
    // A killed call left its own message ("spawnSync git ETIMEDOUT"), which says nothing about the wait it stands for.
    (result.error?.code === 'ETIMEDOUT'
        ? `${Math.ceil(result.limit / 1000)}秒で時間切れ`
        : undefined) ??
        firstLine(result.error?.message, 'first') ??
        firstLine(result.stderr, 'first') ??
        firstLine(result.stdout, 'last') ??
        `終了コード ${result.status}`;
    return new Error(`git ${args[0]} に失敗: ${reason}`);
}
function git(cwd, args, input) {
    const result = run(cwd, args, {}, input);
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
// `git status --porcelain -z`: every record is NUL-terminated and its path is unquoted, so that a file name holding a line
// break, a quotation mark, or a backslash is one record like any other. A rename or a copy prints the path it came from as a
// record of its own right after, which is part of that change rather than another one.
const STATUS = ['status', '--porcelain', '-z', '--untracked-files=normal', ...HERE];
/** The records among complete (NUL-terminated) fields, the second field of a rename or copy left out. Exported for its tests. */
export function statusRecords(fields) {
    const records = [];
    for (let index = 0; index < fields.length; index += 1) {
        const record = fields[index] ?? '';
        if (record === '')
            continue;
        records.push(record);
        // "R" or "C" in either column of the status: the next field is the path the file was renamed or copied from.
        const status = record.slice(0, 2);
        if (status.includes('R') || status.includes('C'))
            index += 1;
    }
    return records;
}
/**
 * The complete fields of a NUL-terminated output: the text after the last NUL is no field, and after a cut it may be half of
 * one. Exported for its tests.
 */
export function completeFields(output) {
    const fields = output.split('\0');
    return { fields, fragment: fields.pop() ?? '' };
}
/** The number of changes in an output of gitChangeCount's arguments, read as it reads them. Exported for its tests. */
export function countRecords(output, truncated) {
    const { fields, fragment } = completeFields(output);
    const count = statusRecords(fields).length;
    // A cut that left not one whole record still read part of a change: "0件以上" would be read as a clean tree.
    return truncated && count === 0 && fragment !== '' ? 1 : count;
}
/**
 * `git status --porcelain` records for cwd and below; empty when clean. Untracked files are included, an untracked directory
 * as one record, whatever status.showUntrackedFiles says.
 */
export function gitStatus(cwd) {
    return statusRecords(completeFields(git(cwd, STATUS)).fields);
}
/**
 * The number of gitStatus records, reading at most maxBytes of git's output (see COUNT_OUTPUT), leaving out the given paths
 * (relative to cwd, taken literally) and, where one names a directory, everything under it.
 */
export function gitChangeCount(cwd, maxBytes = COUNT_OUTPUT, excluded = []) {
    const args = [...STATUS, ...excluded.map((path) => `:(exclude,literal)${path}`)];
    const result = run(cwd, args, {}, undefined, maxBytes);
    const truncated = result.error?.code === 'ENOBUFS';
    if (!truncated && (result.error !== undefined || result.status !== 0))
        throw failure(args, result);
    return { count: countRecords(result.stdout, truncated), truncated };
}
/**
 * `git status --porcelain` records for cwd and below, leaving out the given paths (relative to cwd, taken literally). An untracked
 * directory counts once, as in gitStatus.
 */
export function gitStatusExcluding(cwd, excluded) {
    const pathspecs = excluded.map((path) => `:(exclude,literal)${path}`);
    return statusRecords(completeFields(git(cwd, [...STATUS, ...pathspecs])).fields);
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
    // A bisect detaches HEAD, so a commit made in the middle of one is left behind by `git bisect reset`.
    ['BISECT_LOG', 'bisect'],
];
/** The unfinished git operation (merge, rebase, cherry-pick, revert, bisect), or undefined. */
export function gitOperationInProgress(cwd) {
    const gitDir = pathLine(git(cwd, ['rev-parse', '--absolute-git-dir']));
    return OPERATIONS.find(([marker]) => existsSync(join(gitDir, marker)))?.[1];
}
/** Stages every change in cwd and below, deletions and untracked files included. */
export function gitAddAll(cwd) {
    git(cwd, ['add', '-A', ...HERE]);
}
/**
 * The untracked files in cwd and below that git does not ignore, each one listed, relative to cwd, reading at most maxBytes
 * of git's output (see COUNT_OUTPUT) so that a huge untracked tree is not held in memory.
 */
export function gitUntracked(cwd, maxBytes = COUNT_OUTPUT) {
    const args = ['ls-files', '-z', '--others', '--exclude-standard', ...HERE];
    const result = run(cwd, args, {}, undefined, maxBytes);
    const truncated = result.error?.code === 'ENOBUFS';
    if (!truncated && (result.error !== undefined || result.status !== 0))
        throw failure(args, result);
    const { fields } = completeFields(result.stdout);
    return { paths: fields.filter((path) => path !== ''), truncated };
}
/**
 * Commits the changes in cwd and below; changes staged elsewhere stay staged. The repository's hooks run: a hook guarding
 * what is committed (a secret scanner) guards these commits too, and one that refuses fails the commit like any git failure.
 */
export function gitCommit(cwd, message) {
    git(cwd, ['commit', '-q', '-m', message, ...HERE]);
}
function literalPathspecs(paths) {
    return paths.map((path) => `:(literal)${path}`);
}
function inWorkingTree(path) {
    try {
        lstatSync(path);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Stages the given paths (relative to cwd, taken literally) as they are in the working tree, a deletion included, and nothing
 * else. Left out: a path neither in the working tree nor in the index, since git refuses a pathspec that matches nothing (one
 * removed from both but still in HEAD is committed by gitCommitPaths all the same), and a skip-worktree entry, which git
 * refuses to stage when it is named (gitNotStaged then reports it, as it does after gitAddAll).
 */
export function gitAddPaths(cwd, paths) {
    if (paths.length === 0)
        return;
    // "<tag> <path>" per index entry, the path relative to cwd as it is given here; the tag is "S" for skip-worktree.
    const records = completeFields(git(cwd, ['ls-files', '-z', '-t', '--', ...literalPathspecs(paths)])).fields;
    const indexed = new Map(records.filter((record) => record.length > 2).map((record) => [record.slice(2), record[0]]));
    const staged = paths.filter((path) => (indexed.has(path) ? indexed.get(path) !== 'S' : inWorkingTree(join(cwd, path))));
    if (staged.length > 0)
        git(cwd, ['add', '-A', '--', ...literalPathspecs(staged)]);
}
/**
 * Commits the given paths (relative to cwd, taken literally) as they are in the working tree, and nothing else: changes staged
 * for other paths stay staged (`git commit --only`). Each path has to be known to git, in the index or in HEAD (see
 * gitAddPaths). The repository's hooks run, as in gitCommit.
 */
export function gitCommitPaths(cwd, message, paths) {
    // Without a path, `git commit --only` would commit the whole index.
    if (paths.length === 0)
        throw new Error('コミットするパスがない');
    git(cwd, ['commit', '-q', '--only', '-m', message, '--', ...literalPathspecs(paths)]);
}
/** Whether the index has anything to commit in cwd and below (compared with HEAD, or with nothing before the first commit). */
export function gitHasStagedChanges(cwd) {
    return exitCode(cwd, ['diff', '--cached', '--quiet', ...HERE]) === 1;
}
/**
 * The paths (relative to cwd) whose file is not staged as it is, for example because skip-worktree or assume-unchanged
 * keeps `git add` from picking it up. Compared by object id, so clean filters and line-ending conversion count as staged;
 * a symlink is compared by its link text, as git stores it, not by the file it points to. Missing paths are skipped.
 */
export function gitNotStaged(cwd, paths) {
    return paths.filter((path) => {
        let stats;
        try {
            stats = lstatSync(join(cwd, path));
        }
        catch {
            return false;
        }
        const staged = run(cwd, ['rev-parse', '--verify', '--quiet', `:./${path}`]);
        if (staged.error !== undefined || (staged.status !== 0 && staged.status !== 1))
            throw failure(['rev-parse'], staged);
        if (staged.status === 1)
            return true;
        const object = stats.isSymbolicLink()
            ? git(cwd, ['hash-object', '--stdin'], readlinkSync(join(cwd, path)))
            : git(cwd, ['hash-object', '--', path]);
        return staged.stdout.trim() !== object.trim();
    });
}
/** The paths (relative to cwd) that git ignores. Tracked files are never reported. */
export function gitIgnored(cwd, paths) {
    if (paths.length === 0)
        return [];
    // -z, so that a path holding a line break is one record rather than two; git takes it only with --stdin, which reads the
    // paths the same way.
    const args = ['check-ignore', '-z', '--stdin'];
    const result = run(cwd, args, {}, paths.map((path) => `${path}\0`).join(''));
    if (result.error === undefined && result.status === 1)
        return [];
    if (result.error !== undefined || result.status !== 0)
        throw failure(args, result);
    return completeFields(result.stdout).fields.filter((path) => path !== '');
}
const UNMERGED = /^(DD|AU|UD|UA|DU|AA|UU) /;
/**
 * The number of files with unresolved conflicts in cwd and below. Git commits cwd with `-- .` while a file elsewhere is
 * unmerged (after a conflicting `git stash pop`, say), so only the project's own conflicts stand in its way.
 */
export function gitUnmergedCount(cwd) {
    const records = statusRecords(completeFields(git(cwd, ['status', '--porcelain', '-z', ...HERE])).fields);
    return records.filter((record) => UNMERGED.test(record)).length;
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
// The history functions below read, like staging and committing, only the commits that change cwd and below (history
// simplified as `git log -- .` does), so another project in the same repository and empty commits are not seen.
/** The latest commit changing cwd, or undefined (also when there are no commits). Git failures throw. */
export function gitLastCommit(cwd) {
    if (!gitHasCommits(cwd))
        return undefined;
    return parseCommit(git(cwd, ['log', '-1', COMMIT_FORMAT, ...HERE]).trim());
}
/** The latest commit changing cwd whose subject is exactly subject, or undefined (also when there are no commits). Git failures throw. */
export function gitFindCommit(cwd, subject) {
    if (!gitHasCommits(cwd))
        return undefined;
    const output = git(cwd, ['log', COMMIT_FORMAT, '--fixed-strings', `--grep=${subject}`, ...HERE]);
    return parseCommits(output).find((commit) => commit.subject === subject);
}
/** The latest commit changing cwd whose subject starts with prefix, or undefined (also when there are no commits). Git failures throw. */
export function gitFindCommitStarting(cwd, prefix) {
    if (!gitHasCommits(cwd))
        return undefined;
    const output = git(cwd, ['log', COMMIT_FORMAT, '--fixed-strings', `--grep=${prefix}`, ...HERE]);
    return parseCommits(output).find((commit) => commit.subject.startsWith(prefix));
}
/** The commits changing cwd reachable from HEAD but not from since (all of them without since), oldest first. Git failures throw. */
export function gitCommitsAfter(cwd, since) {
    if (!gitHasCommits(cwd))
        return [];
    return parseCommits(git(cwd, ['log', '--reverse', COMMIT_FORMAT, since === undefined ? 'HEAD' : `${since}..HEAD`, ...HERE]));
}
// An ls-tree -z record of a file or symlink: mode, object id, and path.
const BLOB_RECORD = /^(\d{6}) blob ([0-9a-f]+)\t(.*)$/s;
/**
 * The file or symlink at path (relative to cwd, "/"-separated, taken literally) in HEAD, not followed. Undefined when there
 * are no commits, or HEAD has no file or symlink there (nothing, a directory, a submodule, or a path outside the repository).
 * Git failures throw.
 */
export function gitHeadEntry(cwd, path) {
    if (!gitHasCommits(cwd))
        return undefined;
    const full = posix.normalize(posix.join(pathLine(git(cwd, ['rev-parse', '--show-prefix'])), path));
    if (full === '..' || full.startsWith('../'))
        return undefined;
    const output = git(cwd, ['ls-tree', '-z', '--full-tree', 'HEAD', '--', `:(literal)${full}`]);
    const match = output.split('\0').map((record) => BLOB_RECORD.exec(record)).find((record) => record?.[3] === full);
    if (!match)
        return undefined;
    return { symlink: match[1] === '120000', content: git(cwd, ['cat-file', 'blob', match[2] ?? '']) };
}
/** Paths (relative to the top level) in cwd and below added by the HEAD commit, the root commit included. */
export function gitAddedFiles(cwd) {
    const output = git(cwd, ['diff-tree', '-r', '--root', '--no-commit-id', '--name-only', '--diff-filter=A', '-z', 'HEAD', ...HERE]);
    return output.split('\0').filter((path) => path !== '');
}
