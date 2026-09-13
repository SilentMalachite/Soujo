// soujo resume: four lines to continue from — the next step, the last LOG entry, the last commit, and what to run.

import { dirname } from 'node:path';
import { readState, requireStateDir } from '../files.js';
import { gitLastCommit, gitToplevel } from '../git.js';
import { lastLog, nextLayer, parseNext, parsePlan, validateNext } from '../state.js';

function skill(name: 'go' | 'plan'): string {
  return `/soujo:${name}（Codex は $${name}）`;
}

function invalidReason(text: string | undefined): string {
  if (text === undefined) return 'NEXT.md がない';
  const [first, ...rest] = validateNext(text);
  return `NEXT.md が無効（${first}${rest.length > 0 ? ` ほか${rest.length}件` : ''}）`;
}

// NEXT.md when valid; otherwise PLAN's first unfinished layer, with why NEXT.md was not used and how to fix it.
function nextAndCommand(dir: string): [string, string] {
  const text = readState(dir, 'NEXT.md');
  const next = text === undefined ? undefined : parseNext(text);
  if (next !== undefined) {
    return [`次: ${next.layer}（effort: ${next.effort}）確認: ${next.check}`, `再開: ${skill('go')}`];
  }

  const reason = invalidReason(text);
  const items = parsePlan(readState(dir, 'PLAN.md') ?? '');
  const item = nextLayer(items);
  if (item !== undefined) {
    return [
      `次: ${item.layer}（PLAN から）確認: ${item.condition || '未記入'}`,
      `再開: ${reason} → soujo next set で書いてから ${skill('go')}`,
    ];
  }
  if (items.length === 0) return ['次: なし（PLAN.md に層がない）', `再開: ${reason} → ${skill('plan')}`];
  return ['次: なし（PLAN は全層完了）', `再開: ${reason} → 続けるなら ${skill('plan')} で層を足す`];
}

function logLine(dir: string): string {
  const entry = lastLog(readState(dir, 'LOG.md') ?? '');
  if (entry === undefined) return '前回: LOG.md に記録なし';
  const first = entry.lines[0];
  return `前回: ${entry.date} ${entry.layer}${first === undefined ? '' : ` — ${first}`}`;
}

function commitLine(root: string): string {
  if (gitToplevel(root) === undefined) return 'コミット: git リポジトリではない';
  const commit = gitLastCommit(root);
  return commit === undefined ? 'コミット: まだない' : `コミット: ${commit.hash} ${commit.subject}`;
}

/** Always four lines: 次 / 前回 / コミット / 再開. Falls back to PLAN when NEXT.md is missing or invalid. */
export function resume(cwd: string): string[] {
  const dir = requireStateDir(cwd);
  const [next, command] = nextAndCommand(dir);
  return [next, logLine(dir), commitLine(dirname(dir)), command];
}
