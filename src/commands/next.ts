// soujo next show / set / check: the one file needed to resume.

import { dirname } from 'node:path';
import { findStateDir, readState, removeLeftoverTemps, requireStateDir, writeState } from '../files.js';
import { gitStatus, gitToplevel } from '../git.js';
import {
  PHASES,
  formatNext,
  logMonths,
  nextStatus,
  parseNext,
  parsePlan,
  validateNext,
  validatePlan,
  type Effort,
  type NextInput,
} from '../state.js';

/** NEXT.md as lines. With hook, silent when there is nothing to show (no project, no file, unreadable). */
export function nextShow(cwd: string, hook: boolean): string[] {
  try {
    const dir = hook ? findStateDir(cwd) : requireStateDir(cwd);
    const text = dir === undefined ? '' : (readState(dir, 'NEXT.md') ?? '');
    const body = text.trimEnd();
    if (body === '') return hook ? [] : ['NEXT.md なし'];
    return body.split(/\r?\n/);
  } catch (error) {
    if (hook) return [];
    throw error;
  }
}

// The effort of the spec and plan skills (SPEC §7), so that it is not chosen anew after the last layer.
const PHASE_EFFORT: Effort = 'high';

/**
 * Rewrites NEXT.md. Writes nothing when the result would be invalid, when a phase gets an effort other than
 * PHASE_EFFORT, when PLAN.md has ambiguous layer names, or when PLAN.md has layers and the layer is neither one of them
 * nor a phase: a mistyped name would otherwise pass next check and resume until layer done.
 */
export function nextSet(cwd: string, input: NextInput): string[] {
  const dir = requireStateDir(cwd);
  const layer = input.layer.trim();
  const phase = PHASES.includes(layer);
  // A phase defaults to PHASE_EFFORT; a given effort is kept, so that a multi-line or unknown value is reported first.
  const text = formatNext({ ...input, effort: phase ? (input.effort ?? PHASE_EFFORT) : input.effort });
  const problems = validateNext(text);
  if (problems.length > 0) throw new Error(`NEXT.md を書かない: ${problems.join('、')}`);
  if (phase && parseNext(text)?.effort !== PHASE_EFFORT) {
    throw new Error(`NEXT.md を書かない: 層「${layer}」の effort は ${PHASE_EFFORT} 固定（--effort を外して再実行）`);
  }
  const plan = readState(dir, 'PLAN.md') ?? '';
  const planProblems = validatePlan(plan);
  if (planProblems.length > 0) throw new Error(`NEXT.md を書かない: ${planProblems.join('、')}（PLAN.md の層名を直してから）`);
  const items = parsePlan(plan);
  if (items.length > 0 && !phase && !items.some((item) => item.layer === layer)) {
    throw new Error(`NEXT.md を書かない: PLAN.md に層「${layer}」がない（PLAN の層名をそのまま、または ${PHASES.join(' / ')}）`);
  }
  // A killed write's temporary file would otherwise stay untracked until layer done or close, or block a write under the same pid.
  removeLeftoverTemps(dir);
  writeState(dir, 'NEXT.md', text);
  return [`NEXT.md を更新: 次: ${layer}`];
}

// LOG.md spanning this many months is worth rotating: a month just begun plus the one before it is not.
const ROTATE_MONTHS = 3;

// Kept apart from the other checks, so that an unreadable LOG.md does not hide their warnings.
function logProblems(dir: string): string[] {
  try {
    const months = logMonths(readState(dir, 'LOG.md') ?? '').length;
    return months >= ROTATE_MONTHS ? [`LOG.md に${months}か月分のエントリ（soujo log rotate で移す）`] : [];
  } catch (error) {
    return [(error as Error).message];
  }
}

function problems(dir: string): string[] {
  const found: string[] = [];
  const next = readState(dir, 'NEXT.md');
  const plan = readState(dir, 'PLAN.md');
  if (next === undefined) {
    found.push('NEXT.md がない');
  } else {
    found.push(...validateNext(next));
    const layer = parseNext(next)?.layer;
    const status = layer === undefined || plan === undefined ? undefined : nextStatus(layer, parsePlan(plan));
    if (status?.state === 'done') found.push(`NEXT.md の次「${layer}」は PLAN で完了済み`);
    if (status?.state === 'skipped') found.push(`NEXT.md の次「${layer}」より前の「${status.unfinished.layer}」が PLAN で未完了`);
  }
  found.push(...validatePlan(plan ?? ''));
  found.push(...logProblems(dir));
  const root = dirname(dir);
  if (gitToplevel(root) !== undefined) {
    const changes = gitStatus(root).length;
    if (changes > 0) found.push(`未コミットの変更 ${changes}件`);
  }
  return found;
}

/** One warning line when the project is not safely resumable; nothing otherwise or outside Soujo projects. Never throws. */
export function nextCheck(cwd: string, hook: boolean): string[] {
  let found: string[];
  try {
    const dir = findStateDir(cwd);
    if (dir === undefined) return [];
    found = problems(dir);
  } catch (error) {
    found = [`確認できない: ${error instanceof Error ? error.message : String(error)}`];
  }
  if (found.length === 0) return [];
  const line = `soujo 警告: ${found.join(' / ')}`;
  return [hook ? JSON.stringify({ systemMessage: line }) : line];
}
