// soujo close: commits everything as "wip: <layer>", logging --note as "中断: …" first, so the next session can resume.

import { dirname } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { readState, removeLeftoverTemps, requireStateDir, writeState } from '../files.js';
import { appendLog, formatDate, logLines, nextStatus, parsePlan, validatePlan, type LogEntry } from '../state.js';
import {
  INTERRUPTED,
  INTERRUPTION_NOTE,
  commitRecords,
  committedHash,
  headState,
  requireCommittable,
  requireNext,
  requireNoStoppedLayerDone,
  resumable,
  skill,
  uncommittedLogs,
} from './shared.js';

const HINT = '（soujo next set で書き直してから再実行）';

// The note as LOG lines with "中断: " before the first; a "中断:" already written by the caller is not doubled.
function interruptionLines(note: string): string[] {
  const [first, ...rest] = logLines([note.replace(INTERRUPTION_NOTE, '')]);
  if (first === undefined) throw new Error('--note が空');
  return [`${INTERRUPTED}${first}`, ...rest];
}

// The last 中断 entry of layer that HEAD does not have yet, even with entries added after it: a previous close whose commit failed.
function uncommittedInterruption(log: string, head: string | undefined, layer: string): LogEntry | undefined {
  return uncommittedLogs(log, head)
    .filter((entry) => entry.layer === layer && entry.lines[0]?.startsWith(INTERRUPTED))
    .at(-1);
}

/**
 * Decided before anything is written, in the order layer done uses:
 * - not committable (see requireCommittable)                                  → refuse
 * - PLAN refused by validatePlan (a layer to commit could be the wrong one)    → refuse
 * - NEXT.md missing, invalid, or pointing to a layer already checked in PLAN   → refuse
 * - a layer checked in PLAN but not at HEAD (layer done stopped before commit) → refuse; re-running layer done finishes it
 * - --note blank or breaking LOG limits                                        → refuse
 * After the 中断 entry is written, nothing is committed while SPEC, PLAN, LOG, or NEXT is not staged as written (see commitRecords).
 * The layer is NEXT.md's, or PLAN's first unfinished layer when NEXT.md already points past it (stopped between next set and layer done).
 * With --note, a 中断 entry of the same layer not in HEAD's LOG is kept instead of adding another,
 * so re-running after a failed commit retries only the commit, even with different wording.
 */
export function close(cwd: string, note?: string, now: Date = new Date()): string[] {
  const dir = requireStateDir(cwd);
  const root = dirname(dir);
  requireCommittable(root);

  const plan = readState(dir, 'PLAN.md') ?? '';
  const planProblems = validatePlan(plan);
  // Refused as layer done refuses it: a repeated name or a fence swallowing layers makes the layer found below a guess.
  if (planProblems.length > 0) throw new Error(`${planProblems.join('、')}（PLAN.md を直してから）`);
  const next = requireNext(dir, HINT);
  const items = parsePlan(plan);
  const status = nextStatus(next.layer, items);
  if (status.state === 'done') throw new Error(`NEXT.md の次「${next.layer}」は PLAN で完了済み${HINT}`);
  requireNoStoppedLayerDone(root, items);
  const layer = status.state === 'skipped' ? status.unfinished.layer : next.layer;

  const log = readState(dir, 'LOG.md') ?? '';
  let newLog: string | undefined;
  let logged: string | undefined;
  if (note !== undefined) {
    const lines = interruptionLines(note);
    // Built even when the entry is kept, so an invalid note is refused on a re-run too.
    const appended = appendLog(log, { date: formatDate(now), layer, lines });
    const kept = uncommittedInterruption(log, headState(root, 'LOG.md'), layer);
    if (kept === undefined) {
      newLog = appended;
      logged = '中断を LOG に記録';
    } else {
      logged = isDeepStrictEqual(kept.lines, lines) ? '中断は LOG に記録済み' : '中断は LOG に記録済み（今回の note は追記しない）';
    }
  }

  removeLeftoverTemps(dir);
  if (newLog !== undefined) writeState(dir, 'LOG.md', newLog);
  const subject = `wip: ${layer}`;
  const committed = resumable(
    () => commitRecords(root, subject),
    note === undefined
      ? '記録したものはない。原因を直して同じコマンドを再実行する'
      : '中断は LOG に記録済み。原因を直して同じコマンドを再実行すればコミットだけやり直す',
  );

  const result = committed ? `コミット: ${committedHash(root)} ${subject}` : '未コミットの変更なし';
  return [[...(logged === undefined ? [] : [logged]), result].join('・'), `再開: ${skill('resume')}`];
}
