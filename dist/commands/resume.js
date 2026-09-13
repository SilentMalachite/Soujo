// soujo resume: four lines to continue from — 次 (NEXT.md or PLAN), 前回 (LOG.md), コミット (git), 再開 (what to run).
import { dirname } from 'node:path';
import { readState, readTemplate, requireStateDir } from '../files.js';
import { gitHasCommits, gitLastCommit, gitStatus, gitToplevel } from '../git.js';
import { lastLog, newlyDone, nextLayer, nextStatus, parseNext, parsePlan, validateNext } from '../state.js';
import { clip, describeInvalidNext, headState, skill } from './shared.js';
// A failure becomes a value, so one unreadable file degrades one line instead of the whole status.
function attempt(step) {
    try {
        return step();
    }
    catch (error) {
        return error instanceof Error ? error : new Error(String(error));
    }
}
function normalized(text) {
    return text.replace(/\r\n/g, '\n').trim();
}
// SPEC.md is missing or still the template. Unreadable files count as written, so nothing is guessed from a failure.
function specUnwritten(dir) {
    const spec = attempt(() => readState(dir, 'SPEC.md'));
    if (spec === undefined)
        return true;
    const template = attempt(() => readTemplate('SPEC.md'));
    return typeof spec === 'string' && typeof template === 'string' && normalized(spec) === normalized(template);
}
function checkOf(item) {
    return clip(item.condition || '未記入');
}
// 次 and 再開 from NEXT.md; PLAN's next layer when NEXT.md is missing, unreadable, invalid, or points to a finished layer.
function nextAndCommand(dir, plan) {
    const items = typeof plan === 'string' ? parsePlan(plan) : [];
    const text = attempt(() => readState(dir, 'NEXT.md'));
    const next = typeof text === 'string' ? parseNext(text) : undefined;
    const status = next === undefined ? undefined : nextStatus(next.layer, items);
    if (next !== undefined && status?.state === 'ok') {
        return [`次: ${next.layer}（effort: ${next.effort}）確認: ${clip(next.check)}`, `再開: ${skill('go')}`];
    }
    if (next !== undefined && status?.state === 'skipped') {
        const layer = status.unfinished.layer;
        return [
            `次: ${layer}（PLAN で未完了。NEXT.md は「${next.layer}」）確認: ${checkOf(status.unfinished)}`,
            `再開: 「${layer}」を締めていない → 完了なら soujo layer done "${layer}"、途中なら soujo next set で次を戻す`,
        ];
    }
    let reason;
    if (text instanceof Error)
        reason = 'NEXT.md を読めない';
    else if (text === undefined)
        reason = 'NEXT.md がない';
    else if (next === undefined)
        reason = clip(describeInvalidNext(validateNext(text)));
    else
        reason = `NEXT.md の次「${next.layer}」は PLAN で完了済み`;
    if (plan instanceof Error)
        return ['次: 不明（PLAN.md を読めない）', `再開: ${reason} → PLAN.md を読めるようにしてから soujo resume`];
    const item = nextLayer(items);
    if (item !== undefined) {
        return [`次: ${item.layer}（PLAN から）確認: ${checkOf(item)}`, `再開: ${reason} → soujo next set で書いてから ${skill('go')}`];
    }
    if (items.length > 0)
        return ['次: なし（PLAN は全層完了）', `再開: ${reason} → 層を足すなら ${skill('plan')}`];
    if (specUnwritten(dir))
        return ['次: なし（SPEC.md が未作成）', `再開: ${reason} → ${skill('spec')}`];
    return [`次: なし（${plan === undefined ? 'PLAN.md がない' : 'PLAN.md に層がない'}）`, `再開: ${reason} → ${skill('plan')}`];
}
// 再開 for a layer done that checked PLAN but stopped before its commit; this outranks every other hint.
function unfinishedLayerDone(root, items) {
    const head = attempt(() => headState(root, 'PLAN.md'));
    if (head instanceof Error)
        return undefined;
    const [pending] = newlyDone(parsePlan(head ?? ''), items);
    if (pending === undefined)
        return undefined;
    return `再開: 「${pending.layer}」の layer done が途中（PLAN のチェックが未コミット）→ soujo layer done "${pending.layer}" を再実行`;
}
function logLine(dir) {
    const text = attempt(() => readState(dir, 'LOG.md'));
    if (text instanceof Error)
        return '前回: LOG.md を読めない';
    const entry = lastLog(text ?? '');
    if (entry === undefined)
        return '前回: LOG.md に記録なし';
    const first = entry.lines[0];
    return `前回: ${entry.date} ${entry.layer}${first === undefined ? '' : ` — ${clip(first)}`}`;
}
function commitLine(root) {
    if (gitToplevel(root) === undefined)
        return 'コミット: git リポジトリではない';
    const head = attempt(() => {
        if (!gitHasCommits(root))
            return 'まだない';
        const commit = gitLastCommit(root);
        if (commit === undefined)
            throw new Error('git log');
        return `${commit.hash} ${clip(commit.subject)}`;
    });
    if (head instanceof Error)
        return 'コミット: git の状態を読めない';
    const changes = attempt(() => gitStatus(root).length);
    if (changes instanceof Error)
        return `コミット: ${head}（未コミットの変更を数えられない）`;
    return `コミット: ${head}${changes > 0 ? `（未コミット ${changes}件）` : ''}`;
}
/** Four lines: 次 / 前回 / コミット / 再開. Unreadable files and git failures degrade their line; only a missing .soujo/ throws. */
export function resume(cwd) {
    const dir = requireStateDir(cwd);
    const root = dirname(dir);
    const plan = attempt(() => readState(dir, 'PLAN.md'));
    const [next, command] = nextAndCommand(dir, plan);
    const items = typeof plan === 'string' ? parsePlan(plan) : [];
    return [next, logLine(dir), commitLine(root), unfinishedLayerDone(root, items) ?? command];
}
