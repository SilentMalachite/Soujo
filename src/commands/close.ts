// soujo close: records an interruption in LOG.md and commits everything as "wip: <layer>", so the next session can resume.

import { dirname } from 'node:path';
import { STATE_PATHS, readState, removeLeftoverTemps, requireStateDir, writeState } from '../files.js';
import { gitCommitAll, gitLastCommit, gitRequireCommittable } from '../git.js';
import { appendLog, formatDate, lastLog, parseNext, validateNext, type Next } from '../state.js';

const RESUME = '再開: /soujo:resume（Codex は $resume）';

function requireNext(dir: string): Next {
  const hint = '（soujo next set で直してから再実行）';
  const text = readState(dir, 'NEXT.md');
  if (text === undefined) throw new Error(`NEXT.md がない${hint}`);
  const next = parseNext(text);
  if (next === undefined) throw new Error(`NEXT.md が無効: ${validateNext(text).join('、')}${hint}`);
  return next;
}

// The note as LOG lines: blank lines dropped and "中断: " put before the first.
function noteLines(note: string): string[] {
  const lines = note
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  if (lines.length === 0) throw new Error('--note が空');
  return lines.map((line, index) => (index === 0 ? `中断: ${line}` : line));
}

function sameLines(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((line, index) => line === b[index]);
}

/**
 * Decided before anything is written: NEXT.md missing or invalid, an invalid note, or a repository that cannot be committed → refuse.
 * The note is not appended again when the last LOG entry already has the same layer and lines, so re-running the same command
 * after a failed commit retries only the commit.
 */
export function close(cwd: string, note?: string, now: Date = new Date()): string[] {
  const dir = requireStateDir(cwd);
  const root = dirname(dir);
  const next = requireNext(dir);

  let newLog: string | undefined;
  if (note !== undefined) {
    const lines = noteLines(note);
    const log = readState(dir, 'LOG.md') ?? '';
    // Built even when the entry is already there, so an invalid note is refused on a re-run too.
    const appended = appendLog(log, { date: formatDate(now), layer: next.layer, lines });
    const last = lastLog(log);
    if (!(last?.layer === next.layer && sameLines(last.lines, lines))) newLog = appended;
  }
  gitRequireCommittable(root, STATE_PATHS);

  removeLeftoverTemps(dir);
  if (newLog !== undefined) writeState(dir, 'LOG.md', newLog);
  const subject = `wip: ${next.layer}`;
  let committed: boolean;
  try {
    committed = gitCommitAll(root, subject);
  } catch (error) {
    if (note === undefined) throw error;
    throw new Error(`${(error as Error).message}（中断は LOG に記録済み。原因を直して同じコマンドを再実行すればコミットだけやり直す）`);
  }
  if (!committed && newLog !== undefined) throw new Error('中断ログを git が拾っていない（skip-worktree などを確認）');

  const logged = note === undefined ? [] : [newLog === undefined ? '中断は LOG に記録済み' : '中断を LOG に記録'];
  const result = committed ? `コミット: ${gitLastCommit(root)?.hash ?? '?'} ${subject}` : '未コミットの変更なし';
  return [[...logged, result].join('・'), RESUME];
}
