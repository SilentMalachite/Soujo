// soujo brief: five lines for returning after days away — 進捗, 以後, 節目, 空白, 次 — derived from the records; writes nothing.

import { dirname } from 'node:path';
import { readState, requireStateDir } from '../files.js';
import { gitCommitsAfter, gitFindCommitStarting, type Commit } from '../git.js';
import { daysBetween, formatDate, lastMilestone, parsePlan } from '../state.js';
import { nextAndCommand } from './resume.js';
import { LAYER_COMMIT, NO_LAYERS, attempt, clip, readGit, type NoCommit } from './shared.js';

// Subjects shown after the last layer commit, oldest first.
const SHOWN_SUBJECTS = 3;

interface History {
  /** The latest layer done commit, if any. */
  layer: Commit | undefined;
  /** The commits after it (every commit without it), oldest first. */
  after: Commit[];
}

// Only the commits that change the project count, so a repository with commits can still have none for the project.
function readHistory(root: string): History | NoCommit {
  return readGit(root, (): History | NoCommit => {
    const layer = gitFindCommitStarting(root, LAYER_COMMIT);
    const after = gitCommitsAfter(root, layer?.hash);
    return layer === undefined && after.length === 0 ? 'まだない' : { layer, after };
  });
}

function noCommit(reason: NoCommit): string {
  return reason === 'まだない' ? 'コミットがまだない' : reason;
}

function progressLine(plan: string | undefined | Error, history: History | NoCommit): string {
  const items = typeof plan === 'string' ? parsePlan(plan) : [];
  let progress: string;
  if (plan instanceof Error) progress = 'PLAN.md を読めない';
  else if (plan === undefined) progress = 'PLAN.md がない';
  else if (items.length === 0) progress = NO_LAYERS;
  else progress = `PLAN ${items.filter((item) => item.done).length}/${items.length} 層完了`;

  let layer: string;
  if (typeof history === 'string') layer = noCommit(history);
  else if (history.layer === undefined) layer = 'なし';
  else layer = `${formatDate(history.layer.date)} ${clip(history.layer.subject.slice(LAYER_COMMIT.length))}`;
  return `進捗: ${progress}・最終 layer: ${layer}`;
}

function sinceLine(history: History | NoCommit): string {
  if (typeof history === 'string') return `以後: ${noCommit(history)}`;
  const { layer, after } = history;
  if (after.length === 0) return '以後: なし';
  const subjects = after.slice(0, SHOWN_SUBJECTS).map((commit) => clip(commit.subject));
  if (after.length > SHOWN_SUBJECTS) subjects.push('…');
  return `以後: ${layer === undefined ? '最初からの' : 'layer 後の'}コミット ${after.length}件: ${subjects.join(' / ')}`;
}

function milestoneLine(dir: string): string {
  const text = attempt(() => readState(dir, 'LOG.md'));
  if (text instanceof Error) return '節目: LOG.md を読めない';
  const entry = lastMilestone(text ?? '');
  if (entry === undefined) return '節目: なし';
  const first = entry.lines[0];
  return `節目: ${entry.date}${first === undefined ? '' : ` — ${clip(first)}`}`;
}

function gapLine(history: History | NoCommit, now: Date): string {
  if (typeof history === 'string') return `空白: ${noCommit(history)}`;
  const head = history.after.at(-1) ?? history.layer;
  if (head === undefined) return '空白: git の状態を読めない';
  return `空白: 最終コミットから ${daysBetween(head.date, now)}日（${formatDate(head.date)}）`;
}

/** Five lines: 進捗 / 以後 / 節目 / 空白 / 次. Unreadable files and git failures degrade their line; only a missing .soujo/ throws. */
export function brief(cwd: string, now: Date = new Date()): string[] {
  const dir = requireStateDir(cwd);
  const root = dirname(dir);
  const plan = attempt(() => readState(dir, 'PLAN.md'));
  const history = readHistory(root);
  const [next] = nextAndCommand(dir, plan);
  return [progressLine(plan, history), sinceLine(history), milestoneLine(dir), gapLine(history, now), next];
}
