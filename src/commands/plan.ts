// soujo plan list / plan next: read-only views of PLAN.md.

import { formatItem, nextLayer } from '../state.js';
import { NO_LAYERS, readPlan } from './shared.js';

export function planList(cwd: string): string[] {
  const items = readPlan(cwd);
  if (items.length === 0) return [NO_LAYERS];
  return items.map((item) => formatItem(item));
}

export function planNext(cwd: string): string[] {
  const items = readPlan(cwd);
  if (items.length === 0) return [NO_LAYERS];
  const item = nextLayer(items);
  if (item === undefined) return ['全層完了'];
  return [`次: ${item.layer}`, `確認: ${item.condition || '未記入'}`];
}
