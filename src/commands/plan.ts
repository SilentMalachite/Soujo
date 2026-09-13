// soujo plan list / plan next: read-only views of PLAN.md.

import { requireState, requireStateDir } from '../files.js';
import { nextLayer, parsePlan, type PlanItem } from '../state.js';

const EMPTY = 'PLAN.md に層がない';

function readPlan(cwd: string): PlanItem[] {
  return parsePlan(requireState(requireStateDir(cwd), 'PLAN.md'));
}

export function planList(cwd: string): string[] {
  const items = readPlan(cwd);
  if (items.length === 0) return [EMPTY];
  return items.map((item) => `[${item.done ? 'x' : ' '}] ${item.layer}`);
}

export function planNext(cwd: string): string[] {
  const items = readPlan(cwd);
  if (items.length === 0) return [EMPTY];
  const item = nextLayer(items);
  if (item === undefined) return ['全層完了'];
  return [`次: ${item.layer}`, `確認: ${item.condition || '未記入'}`];
}
