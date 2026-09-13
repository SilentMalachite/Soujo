// soujo layer done: checks the layer in PLAN.md, appends LOG.md, and commits everything as "layer: <layer>".

import { dirname } from 'node:path';
import { readState, removeLeftoverTemps, requireState, requireStateDir, writeState } from '../files.js';
import { gitAddedFiles, gitCommitAll, gitFindCommit, gitLastCommit } from '../git.js';
import { appendLog, formatDate, lastLog, markDone, parsePlan } from '../state.js';
import { headState, requireCommittable, requireNext, resumable } from './shared.js';

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
 * - committed ("layer: <layer>" exists)                       → refuse
 * - checked in PLAN at HEAD (committed under another subject), even if unchecked again in the working tree → refuse
 * - NEXT.md missing, invalid, or still pointing to this layer → refuse (the commit must carry the next step)
 * - unchecked in PLAN                                         → check PLAN, append LOG, commit
 * - checked only in the working tree (interrupted run)        → append LOG only if the last entry is not this layer, then commit
 * After the first write, every failure says what is recorded, so that fixing the cause and re-running resumes.
 */
export function layerDone(cwd: string, layer: string, note?: string, now: Date = new Date()): string[] {
  const dir = requireStateDir(cwd);
  const root = dirname(dir);
  requireCommittable(root);

  const name = layer.trim();
  const plan = requireState(dir, 'PLAN.md');
  const item = parsePlan(plan).find((candidate) => candidate.layer === name);
  if (item === undefined) throw new Error(`PLAN.md に層「${name}」がない`);

  const subject = `layer: ${name}`;
  const committed = gitFindCommit(root, subject);
  if (committed !== undefined) throw new Error(`層「${name}」はコミット済み（${committed.hash}）`);
  if (isChecked(headState(root, 'PLAN.md'), name)) {
    throw new Error(`層「${name}」は PLAN のチェックごとコミット済み（件名が「${subject}」ではない）`);
  }
  requireNextStep(dir, name);

  const log = readState(dir, 'LOG.md') ?? '';
  const logged = item.done && lastLog(log)?.layer === name;
  const newPlan = item.done ? undefined : markDone(plan, name);
  // Built even when the existing entry is reused, so an invalid note is refused on a re-run too.
  const appended = appendLog(log, { date: formatDate(now), layer: name, lines: note === undefined ? [] : [note] });
  const newLog = logged ? undefined : appended;

  removeLeftoverTemps(dir);
  if (newPlan !== undefined) writeState(dir, 'PLAN.md', newPlan);
  if (newLog !== undefined) {
    resumable(() => writeState(dir, 'LOG.md', newLog), 'PLAN は記録済み。原因を直して再実行すれば LOG 追記からやり直す');
  }
  const done = resumable(
    () => gitCommitAll(root, subject),
    'PLAN と LOG は記録済み。原因を直して再実行すればコミットだけやり直す',
  );
  if (!done) throw new Error('コミットする変更がない（PLAN と LOG の変更を git が拾っていない。skip-worktree などを確認）');

  const hash = gitLastCommit(root)?.hash ?? '?';
  const result = item.done ? `層「${name}」のコミットをやり直した` : `層「${name}」を完了`;
  return [`${result}: ${hash} ${subject}${describeAdded(root)}`];
}
