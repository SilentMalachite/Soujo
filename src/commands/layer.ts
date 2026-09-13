// soujo layer done: checks the layer in PLAN.md, appends LOG.md, and commits everything as "layer: <layer>".

import { dirname } from 'node:path';
import { readState, requireState, requireStateDir, writeState } from '../files.js';
import { gitAddAll, gitCommit, gitFindCommit, gitLastCommit, gitToplevel } from '../git.js';
import { appendLog, formatDate, lastLog, markDone, parsePlan } from '../state.js';

/**
 * States, decided before anything is written:
 * - committed ("layer: <layer>" exists)      → refuse
 * - PLAN unchecked                           → check PLAN, append LOG, commit
 * - PLAN checked, not committed (interrupted) → append LOG only if the last entry is not this layer, then commit
 */
export function layerDone(cwd: string, layer: string, note?: string, now: Date = new Date()): string[] {
  const dir = requireStateDir(cwd);
  const root = dirname(dir);
  if (gitToplevel(root) === undefined) throw new Error('git リポジトリではないのでコミットできない');

  const name = layer.trim();
  const plan = requireState(dir, 'PLAN.md');
  const item = parsePlan(plan).find((candidate) => candidate.layer === name);
  if (item === undefined) throw new Error(`PLAN.md に層「${name}」がない`);

  const subject = `layer: ${name}`;
  const committed = gitLastCommit(root) === undefined ? undefined : gitFindCommit(root, subject);
  if (committed !== undefined) throw new Error(`層「${name}」はコミット済み（${committed.hash}）`);

  const log = readState(dir, 'LOG.md') ?? '';
  const logged = item.done && lastLog(log)?.layer === name;
  const newPlan = item.done ? undefined : markDone(plan, name);
  const newLog = logged
    ? undefined
    : appendLog(log, { date: formatDate(now), layer: name, lines: note === undefined ? [] : [note] });

  if (newPlan !== undefined) writeState(dir, 'PLAN.md', newPlan);
  if (newLog !== undefined) writeState(dir, 'LOG.md', newLog);
  try {
    gitAddAll(root);
    gitCommit(root, subject);
  } catch (error) {
    throw new Error(`${(error as Error).message}（PLAN と LOG は記録済み。再実行でコミットだけやり直す）`);
  }

  const hash = gitLastCommit(root)?.hash ?? '?';
  return [item.done ? `層「${name}」のコミットをやり直した: ${hash} ${subject}` : `層「${name}」を完了: ${hash} ${subject}`];
}
