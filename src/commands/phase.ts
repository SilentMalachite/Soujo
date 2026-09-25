// soujo phase done: commits the four records of spec / plan / converge as "phase: <phase>", and nothing else.

import { dirname } from 'node:path';
import { requireStateDir } from '../files.js';
import { PHASES } from '../state.js';
import { PHASE_COMMIT, commitOnlyRecords, committedHash, requireNextStep, requireRecordsCommittable } from './shared.js';

/**
 * States, decided before anything is staged:
 * - not one of PHASES after trimming                          → refuse, naming them
 * - not committable (see requireRecordsCommittable)           → refuse; untracked credential names are not checked, since
 *                                                                only the records are staged
 * - NEXT.md missing, invalid, or still pointing to this phase → refuse (the phase hands over with next set first, so that the
 *                                                                commit carries the next step)
 * - no uncommitted change in SPEC, PLAN, LOG, or NEXT         → say so and succeed, so that a re-run after a success is harmless
 * - otherwise                                                 → commit those four only, as "phase: <phase>"
 * Every other change in the project, staged or not, is left as it was. Nothing is committed while a record is not staged as
 * written (skip-worktree). The hooks run: one refusing the commit fails like any git call, and a re-run after fixing it commits.
 */
export function phaseDone(cwd: string, phase: string): string[] {
  const name = phase.trim();
  if (!PHASES.includes(name)) throw new Error(`フェーズ「${name}」はない（${PHASES.join(' / ')} のどれか）`);
  const dir = requireStateDir(cwd);
  const root = dirname(dir);
  requireRecordsCommittable(root);
  requireNextStep(dir, name);

  const subject = `${PHASE_COMMIT}${name}`;
  if (!commitOnlyRecords(root, subject)) return [`フェーズ「${name}」の記録に未コミットの変更なし`];
  return [`フェーズ「${name}」の記録をコミット: ${committedHash(root)} ${subject}`];
}
