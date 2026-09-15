// soujo log add: appends one dated entry to LOG.md. soujo log rotate: moves past months of LOG.md into LOG-YYYY-MM.md and commits.

import { dirname } from 'node:path';
import {
  ARCHIVE_PATHSPEC,
  archiveFile,
  archiveFiles,
  archiveMonth,
  readState,
  removeLeftoverTemps,
  requireStateDir,
  statePath,
  writeState,
  type ArchiveFile,
} from '../files.js';
import { gitLastCommit, gitStatusExcluding } from '../git.js';
import { appendLog, archiveLog, formatDate, isMonth, lastLog, logMonth, rotateLog } from '../state.js';
import {
  commitRecords,
  headState,
  missingEntries,
  requireCommittable,
  requireCommittableFiles,
  resumable,
  uncommittedLogs,
} from './shared.js';

export function logAdd(cwd: string, layer: string, lines: string[], now: Date = new Date()): string[] {
  if (!lines.some((line) => line.trim() !== '')) throw new Error('--line を1つ以上指定する');
  const dir = requireStateDir(cwd);
  const date = formatDate(now);
  const text = appendLog(readState(dir, 'LOG.md') ?? '', { date, layer, lines });
  removeLeftoverTemps(dir);
  writeState(dir, 'LOG.md', text);
  return [`LOG.md に追記: ${date} ${layer.trim()}（${lastLog(text)?.lines.length ?? 0}行）`];
}

const DIRTY = '未コミットの変更がある（soujo layer done か soujo close で締めてから）';
const RESUME = '書いた分は再実行で二重に移さない。原因を直して同じコマンドを再実行する';

/**
 * The archives holding entries that HEAD does not have: what a previous rotate wrote but did not commit. Throws DIRTY unless
 * every uncommitted change is such a rotate's: only LOG.md and archives changed, LOG.md has no entry HEAD lacks, and every
 * entry LOG.md lost since HEAD is in one of those archives.
 */
function stoppedRotation(root: string, dir: string, log: string): ArchiveFile[] {
  if (gitStatusExcluding(root, []).length === 0) return [];
  if (gitStatusExcluding(root, [statePath('LOG.md'), ARCHIVE_PATHSPEC]).length > 0) throw new Error(DIRTY);
  const head = headState(root, 'LOG.md');
  const pending = archiveFiles(dir).map((file) => ({ file, entries: uncommittedLogs(readState(dir, file) ?? '', headState(root, file)) }));
  const lost = missingEntries(uncommittedLogs(head ?? '', log), pending.flatMap(({ entries }) => entries));
  if (uncommittedLogs(log, head).length > 0 || lost.length > 0) throw new Error(DIRTY);
  return pending.filter(({ entries }) => entries.length > 0).map(({ file }) => file);
}

/**
 * Decided before anything is written:
 * - not committable (see requireCommittable), or before not YYYY-MM                         → refuse
 * - uncommitted changes other than a stopped rotate's (see stoppedRotation)                  → refuse
 * - an archive to write whose real path leaves the project or enters .git, or is git-ignored → refuse
 * Then the entries of LOG.md dated before the month move (all but the last entry), archives first and LOG.md last, and the
 * project is committed as "log: rotate <months>". An entry already in an archive but not in HEAD (a previous run that stopped)
 * is not appended again, so re-running after any failure finishes the same rotation.
 */
export function logRotate(cwd: string, before?: string, now: Date = new Date()): string[] {
  const dir = requireStateDir(cwd);
  const root = dirname(dir);
  const month = before ?? formatDate(now).slice(0, 7);
  if (!isMonth(month)) throw new Error(`--before は YYYY-MM: ${month}`);
  requireCommittable(root);
  removeLeftoverTemps(dir);

  const log = readState(dir, 'LOG.md') ?? '';
  const pending = stoppedRotation(root, dir, log);
  const { kept, moved } = rotateLog(log, month);
  const eol = log.includes('\r\n') ? '\r\n' : '\n';
  const months = [...new Set(moved.map(logMonth))].sort();
  const writes = months.flatMap((entryMonth) => {
    const file = archiveFile(entryMonth);
    const archive = readState(dir, file);
    const already = uncommittedLogs(archive ?? '', headState(root, file));
    const fresh = missingEntries(moved.filter((entry) => logMonth(entry) === entryMonth), already);
    return fresh.length === 0 ? [] : [{ file, count: fresh.length, text: archiveLog(archive, entryMonth, fresh, eol) }];
  });
  requireCommittableFiles(root, writes.map(({ file }) => file));

  for (const { file, text } of writes) resumable(() => writeState(dir, file, text), RESUME);
  if (kept !== log) resumable(() => writeState(dir, 'LOG.md', kept), RESUME);
  const archives = [...new Set([...pending, ...writes.map(({ file }) => file)])].sort();
  if (archives.length === 0) return ['移動なし'];

  const subject = ['log: rotate', ...archives.map(archiveMonth)].join(' ');
  const committed = resumable(() => commitRecords(root, subject, archives), RESUME);
  if (!committed) throw new Error('コミットする変更がない（LOG.md と書庫の変更を git が拾っていない。skip-worktree などを確認）');
  return [
    ...writes.map(({ file, count }) => `${file} に移動: ${count}件`),
    `コミット: ${gitLastCommit(root)?.hash ?? '?'} ${subject}`,
  ];
}
