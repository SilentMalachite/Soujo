// soujo layer done: checks the layer in PLAN.md, appends LOG.md, and commits everything as "layer: <layer>".

import { dirname } from 'node:path';
import { readState, removeLeftoverTemps, requireState, requireStateDir, writeState } from '../files.js';
import { gitAddedFiles, gitFindCommit } from '../git.js';
import { appendLog, formatDate, logLines, markDone, parsePlan, planLayers, validatePlan } from '../state.js';
import {
  INTERRUPTED,
  INTERRUPTION_NOTE,
  LAYER_COMMIT,
  commitRecords,
  committedHash,
  headState,
  requireCommittable,
  requireNext,
  resumable,
  uncommittedLogs,
} from './shared.js';

const SHOWN_FILES = 5;

function isChecked(plan: string | undefined, layer: string): boolean {
  return plan !== undefined && parsePlan(plan).find((item) => item.layer === layer)?.done === true;
}

function requireNextStep(dir: string, layer: string): void {
  const hint = '（先に soujo next set で次の一手を書く）';
  if (requireNext(dir, hint).layer === layer) throw new Error(`NEXT.md の次がまだ「${layer}」${hint}`);
}

// Display only: the commit already succeeded, so a failure here must not turn the result into an error.
function describeAdded(root: string): string {
  let files: string[];
  try {
    files = gitAddedFiles(root);
  } catch {
    return '（追加ファイルの一覧は取得できなかった）';
  }
  if (files.length === 0) return '';
  const rest = files.length > SHOWN_FILES ? ` ほか${files.length - SHOWN_FILES}件` : '';
  return `（追加: ${files.slice(0, SHOWN_FILES).join(', ')}${rest}）`;
}

/**
 * States, decided before anything is written:
 * - not committable (no repository, unfinished merge/rebase, unmerged files, ignored .soujo/ files) → refuse
 * - PLAN with an unclosed code fence, or a repeated, phase-like, empty, or control-character layer name (see validatePlan) → refuse
 * - committed ("layer: <layer>" exists)                       → refuse
 * - checked in PLAN at HEAD (committed under another subject), even if unchecked again in the working tree → refuse
 * - the layer's PLAN item has no completion condition         → refuse
 * - NEXT.md missing, invalid, or still pointing to this layer → refuse (the commit must carry the next step)
 * - --note starting with "中断:"                              → refuse (only close writes those, so a re-run can tell them apart)
 * - unchecked in PLAN                                         → check PLAN, append LOG, commit
 * - checked only in the working tree (interrupted run)        → append LOG unless LOG has this layer's completion entry not in
 *                                                                HEAD yet (a 中断 entry of close does not count), then commit
 * After the first write, every failure says what is recorded, so that fixing the cause and re-running resumes. Nothing is
 * committed while SPEC, PLAN, LOG, or NEXT is not staged as written (skip-worktree), since a re-run could not add them afterwards.
 */
export function layerDone(cwd: string, layer: string, note?: string, now: Date = new Date()): string[] {
  const dir = requireStateDir(cwd);
  const root = dirname(dir);
  requireCommittable(root);

  const name = layer.trim();
  const plan = requireState(dir, 'PLAN.md');
  const planProblems = validatePlan(plan);
  // "PLAN.md を" rather than "PLAN.md の層名を": a problem can be an unclosed code fence, which is not a name.
  if (planProblems.length > 0) throw new Error(`${planProblems.join('、')}（PLAN.md を直してから）`);
  const found = planLayers(plan).find((candidate) => candidate.item.layer === name);
  if (found === undefined) throw new Error(`PLAN.md に層「${name}」がない`);
  const { item, line } = found;

  const subject = `${LAYER_COMMIT}${name}`;
  const committed = gitFindCommit(root, subject);
  if (committed !== undefined) throw new Error(`層「${name}」はコミット済み（${committed.hash}）`);
  if (isChecked(headState(root, 'PLAN.md'), name)) {
    throw new Error(`層「${name}」は PLAN のチェックごとコミット済み（件名が「${subject}」ではない）`);
  }
  // After the committed checks, so that a layer already closed is still reported as closed when its condition was since removed.
  // Without a condition there is nothing to close the layer against, and the 確認: line of the next NEXT.md would be blank.
  // By line like the other PLAN problems, since the line is what there is to fix.
  if (item.condition === '') throw new Error(`PLAN.md の${line}行目の層「${name}」に完了条件がない（「— <完了条件>」を書いてから）`);
  requireNextStep(dir, name);
  if (note !== undefined && INTERRUPTION_NOTE.test(logLines([note])[0] ?? '')) {
    throw new Error('--note を「中断:」で始めない（close の中断の記録と区別できなくなる）');
  }

  const log = readState(dir, 'LOG.md') ?? '';
  const uncommitted = item.done ? uncommittedLogs(log, headState(root, 'LOG.md')) : [];
  const logged = uncommitted.some((entry) => entry.layer === name && !entry.lines[0]?.startsWith(INTERRUPTED));
  const newPlan = item.done ? undefined : markDone(plan, name);
  // Built even when the existing entry is reused, so an invalid note is refused on a re-run too.
  const appended = appendLog(log, { date: formatDate(now), layer: name, lines: note === undefined ? [] : [note] });
  const newLog = logged ? undefined : appended;

  removeLeftoverTemps(dir);
  if (newPlan !== undefined) writeState(dir, 'PLAN.md', newPlan);
  if (newLog !== undefined) {
    resumable(() => writeState(dir, 'LOG.md', newLog), 'PLAN は記録済み。原因を直して再実行すれば LOG 追記からやり直す');
  }
  const done = resumable(() => commitRecords(root, subject), 'PLAN と LOG は記録済み。原因を直して再実行すればコミットだけやり直す');
  if (!done) throw new Error('コミットする変更がない（PLAN と LOG の変更を git が拾っていない。skip-worktree などを確認）');

  const hash = committedHash(root);
  const result = item.done ? `層「${name}」のコミットをやり直した` : `層「${name}」を完了`;
  return [`${result}: ${hash} ${subject}${describeAdded(root)}`];
}
