// git calls. Thin layer: runs git in the given directory and returns its output; no Soujo file parsing here.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
// spawnSync fails beyond 1 MB by default; `git status` in a large working tree can exceed that.
const MAX_OUTPUT = 256 * 1024 * 1024;
const COMMIT_FORMAT = '--format=%h%x09%s';
function firstLine(text, from) {
    const lines = (text ?? '').split('\n').map((line) => line.trim()).filter((line) => line !== '');
    return from === 'first' ? lines[0] : lines[lines.length - 1];
}
function run(cwd, args) {
    return spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: MAX_OUTPUT });
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
/** Repository top level, or undefined outside a git repository. */
export function gitToplevel(cwd) {
    try {
        return git(cwd, ['rev-parse', '--show-toplevel']).trim();
    }
    catch {
        return undefined;
    }
}
/** Whether HEAD points to a commit. Throws outside a repository or when git itself fails. */
export function gitHasCommits(cwd) {
    return exitCode(cwd, ['rev-parse', '--verify', '--quiet', 'HEAD']) === 0;
}
/** `git status --porcelain` lines; empty when the tree is clean. Untracked files are included. */
export function gitStatus(cwd) {
    return git(cwd, ['status', '--porcelain']).split('\n').filter((line) => line !== '');
}
const OPERATIONS = [
    ['MERGE_HEAD', 'merge'],
    ['rebase-merge', 'rebase'],
    ['rebase-apply', 'rebase'],
    ['CHERRY_PICK_HEAD', 'cherry-pick'],
    ['REVERT_HEAD', 'revert'],
];
/** The unfinished git operation (merge, rebase, cherry-pick, revert), or undefined. */
export function gitOperationInProgress(cwd) {
    const gitDir = git(cwd, ['rev-parse', '--absolute-git-dir']).trim();
    return OPERATIONS.find(([marker]) => existsSync(join(gitDir, marker)))?.[1];
}
export function gitAddAll(cwd) {
    git(cwd, ['add', '-A']);
}
export function gitCommit(cwd, message) {
    git(cwd, ['commit', '-q', '-m', message]);
}
/** Whether the index has anything to commit (compared with HEAD, or with nothing before the first commit). */
export function gitHasStagedChanges(cwd) {
    return exitCode(cwd, ['diff', '--cached', '--quiet']) === 1;
}
/** Stages everything and commits it. Returns false, without committing, when nothing ends up staged. */
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
/**
 * Throws unless committing everything in cwd is safe: a repository, no unfinished merge/rebase/cherry-pick/revert,
 * no unmerged files, and none of recorded (paths relative to cwd) ignored by git.
 */
export function gitRequireCommittable(cwd, recorded) {
    if (gitToplevel(cwd) === undefined)
        throw new Error('git リポジトリではないのでコミットできない');
    const operation = gitOperationInProgress(cwd);
    if (operation !== undefined)
        throw new Error(`git の ${operation} が途中なのでコミットしない（終えるか中止してから）`);
    const unmerged = gitStatus(cwd).filter((line) => UNMERGED.test(line)).length;
    if (unmerged > 0)
        throw new Error(`競合が未解決のファイルが ${unmerged}件あるのでコミットしない`);
    const ignored = gitIgnored(cwd, recorded);
    if (ignored.length > 0) {
        throw new Error(`${ignored.join(', ')} が git に無視されていて記録がコミットに残らない（.gitignore などから外してから）`);
    }
}
function parseCommit(line) {
    const tab = line.indexOf('\t');
    return tab === -1 ? undefined : { hash: line.slice(0, tab), subject: line.slice(tab + 1) };
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
    for (const line of output.split('\n')) {
        const commit = parseCommit(line);
        if (commit?.subject === subject)
            return commit;
    }
    return undefined;
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
