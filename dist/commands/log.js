// soujo log add: appends one dated entry to LOG.md. soujo log rotate: moves past months of LOG.md into LOG-YYYY-MM.md and commits.
import { dirname } from 'node:path';
import { archiveFile, archiveFiles, leftoverTemps, readState, removeLeftoverTemps, requireStateDir, statePath, trackedStatePath, writeState, } from '../files.js';
import { gitChangedPaths, gitLastCommit, gitStatusExcluding } from '../git.js';
import { appendLog, appendedEntries, archiveLog, formatDate, isMonth, lastLog, logMonth, logMonths, removedEntries, parseLog, rotateLog, } from '../state.js';
import { commitRecords, headState, missingEntries, requireCommittable, requireCommittableFiles, resumable } from './shared.js';
export function logAdd(cwd, layer, lines, now = new Date()) {
    if (!lines.some((line) => line.trim() !== ''))
        throw new Error('--line を1つ以上指定する');
    const dir = requireStateDir(cwd);
    const date = formatDate(now);
    const text = appendLog(readState(dir, 'LOG.md') ?? '', { date, layer, lines });
    removeLeftoverTemps(dir);
    writeState(dir, 'LOG.md', text);
    return [`LOG.md に追記: ${date} ${layer.trim()}（${lastLog(text)?.lines.length ?? 0}行）`];
}
const DIRTY = '未コミットの変更がある（soujo layer done か soujo close で締めてから）';
const RESUME = '書いた分は再実行で二重に移さない。原因を直して同じコマンドを再実行する';
const identity = (entry) => entry;
// The path of file and of its symlink target, relative to the project root: where git reports its changes.
function trackedPaths(root, file) {
    return [...new Set([statePath(file), trackedStatePath(root, file)])];
}
/**
 * What a previous rotate wrote but did not commit. Throws DIRTY unless every uncommitted change could be such a rotate's: only
 * LOG.md and existing archives changed (leftover temporary files aside), LOG.md is HEAD's with whole entries removed and nothing
 * else changed, each changed archive is HEAD's with whole entries appended, and every entry removed from LOG.md is in the archive
 * of its month (committed or not, so an archive committed by hand before LOG.md is fine).
 */
function stoppedRotation(root, dir, log) {
    const pending = new Map();
    const archives = archiveFiles(dir);
    // Read first, so an archive whose real path leaves the project is refused before its path reaches git.
    const texts = new Map(archives.map((file) => [file, readState(dir, file) ?? '']));
    const allowed = [...trackedPaths(root, 'LOG.md'), ...archives.flatMap((file) => trackedPaths(root, file))];
    if (gitStatusExcluding(root, [...allowed, ...leftoverTemps(dir)]).length > 0)
        throw new Error(DIRTY);
    const changed = new Set(gitChangedPaths(root, allowed));
    if (changed.size === 0)
        return { removed: [], pending };
    const removed = removedEntries(headState(root, 'LOG.md') ?? '', log);
    if (removed === undefined)
        throw new Error(DIRTY);
    for (const [file, text] of texts) {
        if (!trackedPaths(root, file).some((path) => changed.has(path)))
            continue;
        const appended = appendedEntries(headState(root, file), text);
        if (appended === undefined)
            throw new Error(DIRTY);
        if (appended.length > 0)
            pending.set(file, appended);
    }
    for (const month of logMonths(removed)) {
        const archive = isMonth(month) ? texts.get(archiveFile(month)) : undefined;
        const lost = missingEntries(removed.filter((entry) => logMonth(entry) === month), parseLog(archive ?? ''), identity);
        if (lost.length > 0)
            throw new Error(DIRTY);
    }
    return { removed, pending };
}
// "2026-08" for one month, "2026-01〜2026-08" (separator given) for more.
function span(months, separator) {
    const first = months[0] ?? '';
    const last = months.at(-1) ?? '';
    return first === last ? first : `${first}${separator}${last}`;
}
/**
 * Decided before anything is written:
 * - before not YYYY-MM, or not committable (see requireCommittable)                        → refuse
 * - uncommitted changes other than a stopped rotate's (see stoppedRotation)                  → refuse
 * - a stopped rotate's archive entry that this rotation would leave in LOG.md (another month) → refuse
 * - an archive to write or to commit that git ignores                                        → refuse
 * An archive whose real path leaves the project or enters .git is refused when it is read. Then leftover temporary files are
 * removed, the entries of LOG.md dated before the month move (all but the last entry), archives first and LOG.md last, and the
 * project is committed as "log: rotate <months>". An entry a stopped rotate already appended is not appended again, so
 * re-running after any failure finishes the same rotation.
 */
export function logRotate(cwd, before, now = new Date()) {
    const dir = requireStateDir(cwd);
    const root = dirname(dir);
    const month = before ?? formatDate(now).slice(0, 7);
    if (!isMonth(month))
        throw new Error(`--before は YYYY-MM: ${month}`);
    requireCommittable(root);
    const log = readState(dir, 'LOG.md') ?? '';
    const stopped = stoppedRotation(root, dir, log);
    const { pending } = stopped;
    const { kept, moved } = rotateLog(log, month);
    const removed = [...stopped.removed, ...moved.map(({ entry }) => entry)];
    const stranded = missingEntries([...pending.values()].flat(), removed, identity);
    if (stranded.length > 0) {
        throw new Error('前回の rotate が書庫に移したエントリが LOG.md に残る（前回と同じ --before で再実行する）');
    }
    const eol = log.includes('\r\n') ? '\r\n' : '\n';
    const writes = logMonths(moved.map(({ entry }) => entry)).flatMap((entryMonth) => {
        const file = archiveFile(entryMonth);
        const blocks = moved.filter(({ entry }) => logMonth(entry) === entryMonth);
        const fresh = missingEntries(blocks, pending.get(file) ?? [], ({ entry }) => entry);
        return fresh.length === 0 ? [] : [{ file, text: archiveLog(readState(dir, file), entryMonth, fresh, eol) }];
    });
    const months = logMonths(removed);
    const archives = [...new Set([...months.map(archiveFile), ...pending.keys()])].sort();
    requireCommittableFiles(root, archives);
    if (removed.length === 0)
        return ['移動なし'];
    removeLeftoverTemps(dir);
    for (const { file, text } of writes)
        resumable(() => writeState(dir, file, text), RESUME);
    if (kept !== log)
        resumable(() => writeState(dir, 'LOG.md', kept), RESUME);
    const subject = `log: rotate ${span(months, '..')}`;
    const committed = resumable(() => commitRecords(root, subject, archives), RESUME);
    if (!committed)
        throw new Error('コミットする変更がない（LOG.md と書庫の変更を git が拾っていない。skip-worktree などを確認）');
    return [
        `LOG.md から${removed.length}件を${months.length}書庫へ移動（${span(months, '〜')}）`,
        `コミット: ${gitLastCommit(root)?.hash ?? '?'} ${subject}`,
    ];
}
