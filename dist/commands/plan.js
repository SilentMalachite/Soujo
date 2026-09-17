// soujo plan list / plan next: read-only views of PLAN.md.
import { formatItem, nextLayer } from '../state.js';
import { NO_LAYERS, readPlan } from './shared.js';
export function planList(cwd) {
    const { items, problem } = readPlan(cwd);
    const lines = items.length === 0 ? [NO_LAYERS] : items.map((item) => formatItem(item));
    return problem === undefined ? lines : [problem, ...lines];
}
export function planNext(cwd) {
    const { items, problem } = readPlan(cwd);
    const lines = layerLines(items);
    return problem === undefined ? lines : [problem, ...lines];
}
function layerLines(items) {
    if (items.length === 0)
        return [NO_LAYERS];
    const item = nextLayer(items);
    if (item === undefined)
        return ['全層完了'];
    return [`次: ${item.layer}`, `確認: ${item.condition || '未記入'}`];
}
