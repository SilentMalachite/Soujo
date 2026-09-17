// soujo resume: four lines to continue from — 次 (NEXT.md or PLAN), 前回 (LOG.md), コミット (git), 再開 (what to run).

import { dirname } from 'node:path';
import { readState, readTemplate, requireStateDir } from '../files.js';
import { gitChangeCount, type Commit } from '../git.js';
import {
  daysBetween,
  lastLog,
  newlyDone,
  nextLayer,
  nextStatus,
  parseNext,
  parsePlan,
  validateNext,
  validatePlan,
  type PlanItem,
} from '../state.js';
import { attempt, clip, commandArg, describeInvalidNext, headState, optionArg, readHead, skill, type NoCommit } from './shared.js';

// From this many days since the last commit, 再開 points to soujo brief first.
const AWAY_DAYS = 3;

function normalized(text: string): string {
  return text.replace(/\r\n/g, '\n').trim();
}

// SPEC.md is missing or still the template. Unreadable files count as written, so nothing is guessed from a failure.
function specUnwritten(dir: string): boolean {
  const spec = attempt(() => readState(dir, 'SPEC.md'));
  if (spec === undefined) return true;
  const template = attempt(() => readTemplate('SPEC.md'));
  return typeof spec === 'string' && typeof template === 'string' && normalized(spec) === normalized(template);
}

function checkOf(item: PlanItem): string {
  return clip(item.condition || '未記入');
}

// The problems validatePlan finds in PLAN, none when it is missing or unreadable.
function planProblems(plan: string | undefined | Error): string[] {
  return typeof plan === 'string' ? validatePlan(plan) : [];
}

/**
 * 次 and 再開 from NEXT.md; PLAN's next layer when NEXT.md is missing, unreadable, invalid, or points to a finished layer.
 * Layer names are clipped like other values, except inside a command, which must stay runnable. A PLAN that validatePlan
 * refuses gives no layer at all: with a name repeated or layers swallowed by an open fence, any layer named would be a guess.
 */
export function nextAndCommand(dir: string, plan: string | undefined | Error): [string, string] {
  const problems = planProblems(plan);
  if (problems.length > 0) {
    const invalid = `PLAN.md が無効: ${problems.map((problem) => problem.replace(/^PLAN\.md の/, '')).join('、')}`;
    return [`次: 不明（${clip(invalid)}）`, '再開: PLAN.md を直してから soujo resume（問題は soujo next check が示す）'];
  }
  const items = typeof plan === 'string' ? parsePlan(plan) : [];
  const text = attempt(() => readState(dir, 'NEXT.md'));
  const next = typeof text === 'string' ? parseNext(text) : undefined;
  const status = next === undefined ? undefined : nextStatus(next.layer, items);
  if (next !== undefined && status?.state === 'ok') {
    return [`次: ${clip(next.layer)}（effort: ${next.effort}）確認: ${clip(next.check)}`, `再開: ${skill('go')}`];
  }
  if (next !== undefined && status?.state === 'skipped') {
    const layer = status.unfinished.layer;
    return [
      `次: ${clip(layer)}（PLAN で未完了。NEXT.md は「${clip(next.layer)}」）確認: ${checkOf(status.unfinished)}`,
      `再開: 「${clip(layer)}」を締めていない → 完了なら soujo layer done ${commandArg(layer)}、途中なら soujo next set ${optionArg('--layer', layer)} で次を戻す`,
    ];
  }

  let reason: string;
  if (text instanceof Error) reason = 'NEXT.md を読めない';
  else if (text === undefined) reason = 'NEXT.md がない';
  else if (next === undefined) reason = clip(describeInvalidNext(validateNext(text)));
  else reason = `NEXT.md の次「${clip(next.layer)}」は PLAN で完了済み`;

  if (plan instanceof Error) return ['次: 不明（PLAN.md を読めない）', `再開: ${reason} → PLAN.md を読めるようにしてから soujo resume`];
  const item = nextLayer(items);
  if (item !== undefined) {
    return [`次: ${clip(item.layer)}（PLAN から）確認: ${checkOf(item)}`, `再開: ${reason} → soujo next set で書いてから ${skill('go')}`];
  }
  // converge checks the code against SPEC and adds what is missing, what SPEC has and PLAN never got included.
  if (items.length > 0) return ['次: なし（PLAN は全層完了）', `再開: ${reason} → ${skill('converge')}`];
  if (specUnwritten(dir)) return ['次: なし（SPEC.md が未作成）', `再開: ${reason} → ${skill('spec')}`];
  return [`次: なし（${plan === undefined ? 'PLAN.md がない' : 'PLAN.md に層がない'}）`, `再開: ${reason} → ${skill('plan')}`];
}

// 再開 for a layer done that checked PLAN but stopped before its commit; this outranks every other hint.
function unfinishedLayerDone(root: string, items: PlanItem[]): string | undefined {
  const head = attempt(() => headState(root, 'PLAN.md'));
  if (head instanceof Error) return undefined;
  const [pending] = newlyDone(parsePlan(head ?? ''), items);
  if (pending === undefined) return undefined;
  return `再開: 「${clip(pending.layer)}」の layer done が途中（PLAN のチェックが未コミット）→ soujo layer done ${commandArg(pending.layer)} を再実行`;
}

function logLine(dir: string): string {
  const text = attempt(() => readState(dir, 'LOG.md'));
  if (text instanceof Error) return '前回: LOG.md を読めない';
  const entry = lastLog(text ?? '');
  if (entry === undefined) return '前回: LOG.md に記録なし';
  const first = entry.lines[0];
  return `前回: ${entry.date} ${clip(entry.layer)}${first === undefined ? '' : ` — ${clip(first)}`}`;
}

function commitLine(root: string, head: Commit | NoCommit): string {
  if (head === 'git リポジトリではない' || head === 'git の状態を読めない') return `コミット: ${head}`;
  const shown = typeof head === 'string' ? head : `${head.hash} ${clip(head.subject)}`;
  const changes = attempt(() => gitChangeCount(root));
  if (changes instanceof Error) return `コミット: ${shown}（未コミットの変更を数えられない）`;
  const { count, truncated } = changes;
  return `コミット: ${shown}${count > 0 || truncated ? `（未コミット ${count}件${truncated ? '以上' : ''}）` : ''}`;
}

// The hint appended to 再開 when the last commit is AWAY_DAYS or more days old.
function awayHint(head: Commit | NoCommit, now: Date): string {
  if (typeof head === 'string') return '';
  const days = daysBetween(head.date, now);
  return days >= AWAY_DAYS ? `・${days}日ぶり: 先に soujo brief` : '';
}

/** Four lines: 次 / 前回 / コミット / 再開. Unreadable files and git failures degrade their line; only a missing .soujo/ throws. */
export function resume(cwd: string, now: Date = new Date()): string[] {
  const dir = requireStateDir(cwd);
  const root = dirname(dir);
  const plan = attempt(() => readState(dir, 'PLAN.md'));
  const [next, command] = nextAndCommand(dir, plan);
  const items = typeof plan === 'string' ? parsePlan(plan) : [];
  const head = readHead(root);
  // layer done refuses the PLAN nextAndCommand refuses, so re-running it is no way on.
  const unfinished = planProblems(plan).length > 0 ? undefined : unfinishedLayerDone(root, items);
  return [next, logLine(dir), commitLine(root, head), `${unfinished ?? command}${awayHint(head, now)}`];
}
