// soujo log add: appends one dated entry to LOG.md. soujo log rotate: moves past months of LOG.md into LOG-YYYY-MM.md and commits.

import { dirname } from 'node:path';
import {
  archiveFile,
  archiveFiles,
  archiveMonth,
  leftoverTemps,
  readState,
  removeLeftoverTemps,
  requireStateDir,
  statePath,
  trackedStatePath,
  writeState,
  type ArchiveFile,
  type StateFile,
} from '../files.js';
import { gitChangedPaths, gitLastCommit, gitStatusExcluding, gitToplevel } from '../git.js';
import {
  appendLog,
  appendedEntries,
  archiveLog,
  formatDate,
  isMonth,
  lastLog,
  logMonth,
  logMonths,
  removedEntries,
  parseLog,
  rotateLog,
  type LogEntry,
} from '../state.js';
import {
  attempt,
  commitRecords,
  headState,
  missingEntries,
  requireCommittable,
  requireCommittableFiles,
  resumable,
  uncommittedLogs,
} from './shared.js';

/**
 * Appends the entry, unless LOG.md already ends with the same entry (date, layer, and lines) and HEAD does not have that copy:
 * a re-run of a line like "log add 節目 → next set" after its later command failed must not write the entry twice.
 */
export function logAdd(cwd: string, layer: string, lines: string[], now: Date = new Date()): string[] {
  if (!lines.some((line) => line.trim() !== '')) throw new Error('--line を1つ以上指定する');
  const dir = requireStateDir(cwd);
  const date = formatDate(now);
  const log = readState(dir, 'LOG.md') ?? '';
  const text = appendLog(log, { date, layer, lines });
  const added = lastLog(text) as LogEntry;
  removeLeftoverTemps(dir);
  if (repeated(dirname(dir), log, added)) return [`LOG.md に同じエントリが未コミットであるので追記しない: ${date} ${added.layer}`];
  writeState(dir, 'LOG.md', text);
  return [`LOG.md に追記: ${date} ${added.layer}（${added.lines.length}行）`];
}

// Whether log ends with entry and HEAD lacks that copy. Git is asked only when the last entry is the same; when git fails,
// HEAD is unknown and counts as lacking it, as outside a repository.
function repeated(root: string, log: string, entry: LogEntry): boolean {
  const last = lastLog(log);
  if (last === undefined || missingEntries([entry], [last], identity).length > 0) return false;
  const head = attempt(() => (gitToplevel(root) === undefined ? undefined : headState(root, 'LOG.md')));
  if (head instanceof Error) return true;
  return missingEntries([entry], uncommittedLogs(log, head), identity).length === 0;
}

const DIRTY = '未コミットの変更がある（soujo layer done か soujo close で締めてから）';
const OTHER_BEFORE = '前回の rotate が動かしたエントリがこの --before では移らない（前回と同じ --before で再実行する）';
const RESUME = '書いた分は再実行で二重に移さない。原因を直して同じコマンドを再実行する';
// Later than any month, so that rotateLog moves every entry a rotate ever may.
const EVERY_MONTH = '9999-12';
const identity = (entry: LogEntry) => entry;

// The path of file and of its symlink target, relative to the project root: where git reports its changes.
function trackedPaths(root: string, file: StateFile): string[] {
  return [...new Set([statePath(file), trackedStatePath(root, file)])];
}

// Whether every entry is among the allowed ones, counting repeated entries.
function within(entries: readonly LogEntry[], allowed: readonly LogEntry[]): boolean {
  return missingEntries(entries, allowed, identity).length === 0;
}

interface StoppedRotation {
  /** The entries LOG.md lost since HEAD. */
  removed: LogEntry[];
  /** The entries each archive gained since HEAD. */
  pending: Map<ArchiveFile, LogEntry[]>;
}

/**
 * What a previous rotate wrote but did not commit. Throws DIRTY unless every uncommitted change could be a rotate's: only
 * LOG.md and existing archives changed (leftover temporary files aside); LOG.md is HEAD's with whole entries removed and
 * nothing else changed; each changed archive is HEAD's with at least one whole entry of its month appended; every removed or
 * appended entry is one a rotate of HEAD's LOG.md may move (not the last entry or the last milestone, not one whose date names
 * no month, not one LOG.md never had); and every removed entry is in the archive of its month (committed or not, so an archive committed by
 * hand before LOG.md is fine). Throws OTHER_BEFORE when those entries are not all moved by a rotate with this before.
 */
function stoppedRotation(root: string, dir: string, log: string, before: string): StoppedRotation {
  const pending = new Map<ArchiveFile, LogEntry[]>();
  const archives = archiveFiles(dir);
  // Read first, so an archive whose real path leaves the project is refused before its path reaches git.
  const texts = new Map(archives.map((file) => [file, readState(dir, file) ?? ''] as const));
  const allowed = [...trackedPaths(root, 'LOG.md'), ...archives.flatMap((file) => trackedPaths(root, file))];
  if (gitStatusExcluding(root, [...allowed, ...leftoverTemps(dir)]).length > 0) throw new Error(DIRTY);
  const changed = new Set(gitChangedPaths(root, allowed));
  if (changed.size === 0) return { removed: [], pending };

  const head = headState(root, 'LOG.md') ?? '';
  const removed = removedEntries(head, log);
  if (removed === undefined) throw new Error(DIRTY);
  for (const [file, text] of texts) {
    if (!trackedPaths(root, file).some((path) => changed.has(path))) continue;
    const appended = appendedEntries(headState(root, file), text);
    if (appended === undefined || appended.length === 0 || appended.some((entry) => logMonth(entry) !== archiveMonth(file))) {
      throw new Error(DIRTY);
    }
    pending.set(file, appended);
  }
  const appended = [...pending.values()].flat();
  const movable = rotateLog(head, EVERY_MONTH).moved.map(({ entry }) => entry);
  if (!within(removed, movable) || !within(appended, movable)) throw new Error(DIRTY);
  for (const month of logMonths(removed)) {
    const archive = texts.get(archiveFile(month)) ?? '';
    if (!within(removed.filter((entry) => logMonth(entry) === month), parseLog(archive))) throw new Error(DIRTY);
  }
  const moves = rotateLog(head, before).moved.map(({ entry }) => entry);
  if (!within(removed, moves) || !within(appended, moves)) throw new Error(OTHER_BEFORE);
  return { removed, pending };
}

// "2026-08" for one month, "2026-01〜2026-08" (separator given) for more.
function span(months: readonly string[], separator: string): string {
  const first = months[0] ?? '';
  const last = months.at(-1) ?? '';
  return first === last ? first : `${first}${separator}${last}`;
}

/**
 * Decided before anything is written:
 * - before not YYYY-MM, or not committable (see requireCommittable)                  → refuse
 * - uncommitted changes other than a stopped rotate's, or one of another before     → refuse (see stoppedRotation)
 * - an archive to write or to commit that git ignores                               → refuse
 * An archive whose real path leaves the project, enters .git, or is another state file's or archive's is refused, when it is
 * read or by the check of the archives, before anything is written. Then leftover temporary files are
 * removed; with nothing to move or commit that is all. Otherwise the entries of LOG.md dated before the month move (all but
 * the last entry and the last milestone), archives first and LOG.md last, and the project is committed as "log: rotate <months>". An entry the
 * archive of its month already has is not appended again, so re-running after any failure finishes the same rotation, also
 * when the archives were committed by hand in between.
 */
export function logRotate(cwd: string, before?: string, now: Date = new Date()): string[] {
  const dir = requireStateDir(cwd);
  const root = dirname(dir);
  const month = before ?? formatDate(now).slice(0, 7);
  if (!isMonth(month)) throw new Error(`--before は YYYY-MM: ${month}`);
  requireCommittable(root);

  const log = readState(dir, 'LOG.md') ?? '';
  const stopped = stoppedRotation(root, dir, log, month);
  const { kept, moved } = rotateLog(log, month);
  const removed = [...stopped.removed, ...moved.map(({ entry }) => entry)];

  const eol = log.includes('\r\n') ? '\r\n' : '\n';
  const writes = logMonths(moved.map(({ entry }) => entry)).flatMap((entryMonth) => {
    const file = archiveFile(entryMonth);
    const archive = readState(dir, file);
    // The archive's entries past those LOG.md lost before this run: what a stopped rotate appended or a hand commit added.
    const lostBefore = stopped.removed.filter((entry) => logMonth(entry) === entryMonth);
    const present = missingEntries(parseLog(archive ?? ''), lostBefore, identity);
    const blocks = moved.filter(({ entry }) => logMonth(entry) === entryMonth);
    const fresh = missingEntries(blocks, present, ({ entry }) => entry);
    return fresh.length === 0 ? [] : [{ file, text: archiveLog(archive, entryMonth, fresh, eol) }];
  });
  const months = logMonths(removed);
  const archives = [...new Set([...months.map(archiveFile), ...stopped.pending.keys()])].sort();
  requireCommittableFiles(root, archives);
  removeLeftoverTemps(dir);
  if (removed.length === 0) return ['移動なし'];

  for (const { file, text } of writes) resumable(() => writeState(dir, file, text), RESUME);
  if (kept !== log) resumable(() => writeState(dir, 'LOG.md', kept), RESUME);
  const subject = `log: rotate ${span(months, '..')}`;
  const committed = resumable(() => commitRecords(root, subject, archives), RESUME);
  if (!committed) throw new Error('コミットする変更がない（LOG.md と書庫の変更を git が拾っていない。skip-worktree などを確認）');
  return [
    `LOG.md から${removed.length}件を${months.length}書庫へ移動（${span(months, '〜')}）`,
    `コミット: ${gitLastCommit(root)?.hash ?? '?'} ${subject}`,
  ];
}
