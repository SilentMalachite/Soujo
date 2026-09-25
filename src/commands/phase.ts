// soujo phase done: commits the four records of spec / plan / converge as "phase: <phase>", and nothing else.

import { dirname } from 'node:path';
import { ROOT_FILES, archiveFiles, isPlacedRootFile, readState, requireStateDir } from '../files.js';
import { gitHeadEntry, gitIgnored } from '../git.js';
import { PHASES, parsePlan } from '../state.js';
import {
  PHASE_COMMIT,
  commitOnlyRecords,
  committedHash,
  listPaths,
  requireNextStep,
  requireNoStoppedLayerDone,
  requireRecordsCommittable,
  statePaths,
  uncommittedPaths,
} from './shared.js';

// Throws while an archive of LOG.md has an uncommitted change, one skip-worktree hides from git status included: a log rotate
// that stopped before its commit. Committing LOG.md alone would leave HEAD with the entries gone from LOG.md and not yet in
// their archive, and a re-run of log rotate refused.
function requireNoStoppedRotate(root: string, dir: string): void {
  const changed = uncommittedPaths(root, statePaths(root, archiveFiles(dir)));
  if (changed.length > 0) throw new Error(`書庫 ${listPaths(changed)} の変更が未コミット（log rotate の途中）。先に soujo log rotate を再実行する`);
}

// The root's CLAUDE.md and AGENTS.md as soujo init placed them, which spec commits with its records: HEAD lacks them (staged
// by a run that failed counts too), they are what init writes, and git does not ignore them. A file of the user's own, which
// init keeps, or one changed since, is the user's to commit.
function placedRootFiles(root: string): string[] {
  const placed: string[] = ROOT_FILES.filter((file) => gitHeadEntry(root, file) === undefined && isPlacedRootFile(root, file));
  const ignored = new Set(gitIgnored(root, placed));
  return placed.filter((file) => !ignored.has(file));
}

/**
 * Decided before anything is staged:
 * - not one of PHASES after trimming                          → refuse, naming them
 * - not committable (see requireRecordsCommittable)           → refuse
 * - NEXT.md missing, invalid, or still pointing to this phase → refuse (the phase hands over with next set first, so that the
 *                                                                commit carries the next step)
 * - a layer checked in PLAN but not at HEAD                   → refuse as close does: only re-running that layer done finishes it
 * - an archive of LOG.md with an uncommitted change, one      → refuse: only re-running log rotate finishes it
 *   hidden by skip-worktree included
 * - a record symlink that cannot be resolved, or a symlink    → refuse (see commitOnlyRecords)
 *   on the way to a record where HEAD or the index has a
 *   directory
 * - a path to commit untracked and named like a credential    → refuse (a record's symlink to .env); other untracked files are
 *   file (see commitOnlyRecords)                                 not checked, since only these paths are staged
 * Then the temporary files a killed init or state write left are deleted, as before a commit of everything, and SPEC, PLAN,
 * LOG, and NEXT (with every symlink on the way to each) are staged, for spec with the root's CLAUDE.md and AGENTS.md that
 * soujo init placed and HEAD does not have yet (see placedRootFiles), and:
 * - one not staged as written (skip-worktree), a deletion     → refuse
 *   included
 * - none of them has an uncommitted change                    → say so and succeed, so that a re-run after a success is harmless
 * - otherwise                                                 → commit those only, as "phase: <phase>"
 * Every other change in the project, staged or not, is left as it was. The hooks run: one refusing the commit fails like any
 * git call. After a refusal once staged, or a failed commit, the paths stay staged and nothing is committed; a re-run after
 * fixing the cause commits.
 */
export function phaseDone(cwd: string, phase: string): string[] {
  const name = phase.trim();
  if (!PHASES.includes(name)) throw new Error(`フェーズ「${name}」はない（${PHASES.join(' / ')} のどれか）`);
  const dir = requireStateDir(cwd);
  const root = dirname(dir);
  requireRecordsCommittable(root);
  requireNextStep(dir, name);
  requireNoStoppedLayerDone(root, parsePlan(readState(dir, 'PLAN.md') ?? ''));
  requireNoStoppedRotate(root, dir);

  // Without them, a new project's Stop hook counts CLAUDE.md and AGENTS.md as uncommitted through the whole plan phase.
  const placed = name === 'spec' ? placedRootFiles(root) : [];
  const subject = `${PHASE_COMMIT}${name}`;
  if (!commitOnlyRecords(root, subject, placed)) return [`フェーズ「${name}」の記録に未コミットの変更なし`];
  return [`フェーズ「${name}」の記録をコミット: ${committedHash(root)} ${subject}`];
}
