// soujo layer done: checks the layer in PLAN.md, appends LOG.md, and commits everything as "layer: <layer>".
import { dirname } from 'node:path';
import { readState, removeLeftoverTemps, requireState, requireStateDir, writeState } from '../files.js';
import { gitAddedFiles, gitFindCommit, gitLastCommit } from '../git.js';
import { appendLog, formatDate, logLines, markDone, parsePlan, validatePlan } from '../state.js';
import { INTERRUPTED, INTERRUPTION_NOTE, LAYER_COMMIT, commitRecords, headState, requireCommittable, requireNext, resumable, uncommittedLogs, } from './shared.js';
const SHOWN_FILES = 5;
function isChecked(plan, layer) {
    return plan !== undefined && parsePlan(plan).find((item) => item.layer === layer)?.done === true;
}
function requireNextStep(dir, layer) {
    const hint = '（先に soujo next set で次の一手を書く）';
    if (requireNext(dir, hint).layer === layer)
        throw new Error(`NEXT.md の次がまだ「${layer}」${hint}`);
}
// Display only: the commit already succeeded, so a failure here must not turn the result into an error.
function describeAdded(root) {
    let files;
    try {
        files = gitAddedFiles(root);
    }
    catch {
        return '（追加ファイルの一覧は取得できなかった）';
    }
    if (files.length === 0)
        return '';
    const rest = files.length > SHOWN_FILES ? ` ほか${files.length - SHOWN_FILES}件` : '';
    return `（追加: ${files.slice(0, SHOWN_FILES).join(', ')}${rest}）`;
}
/**
 * States, decided before anything is written:
 * - not committable (no repository, unfinished merge/rebase, unmerged files, ignored .soujo/ files) → refuse
 * - PLAN with a repeated layer name or a layer named like a phase (see validatePlan) → refuse
 * - committed ("layer: <layer>" exists)                       → refuse
 * - checked in PLAN at HEAD (committed under another subject), even if unchecked again in the working tree → refuse
 * - NEXT.md missing, invalid, or still pointing to this layer → refuse (the commit must carry the next step)
 * - --note starting with "中断:"                              → refuse (only close writes those, so a re-run can tell them apart)
 * - unchecked in PLAN                                         → check PLAN, append LOG, commit
 * - checked only in the working tree (interrupted run)        → append LOG unless LOG has this layer's completion entry not in
 *                                                                HEAD yet (a 中断 entry of close does not count), then commit
 * After the first write, every failure says what is recorded, so that fixing the cause and re-running resumes. Nothing is
 * committed while PLAN, LOG, or NEXT is not staged as written (skip-worktree), since a re-run could not add them afterwards.
 */
export function layerDone(cwd, layer, note, now = new Date()) {
    const dir = requireStateDir(cwd);
    const root = dirname(dir);
    requireCommittable(root);
    const name = layer.trim();
    const plan = requireState(dir, 'PLAN.md');
    const planProblems = validatePlan(plan);
    if (planProblems.length > 0)
        throw new Error(`${planProblems.join('、')}（PLAN.md の層名を直してから）`);
    const item = parsePlan(plan).find((candidate) => candidate.layer === name);
    if (item === undefined)
        throw new Error(`PLAN.md に層「${name}」がない`);
    const subject = `${LAYER_COMMIT}${name}`;
    const committed = gitFindCommit(root, subject);
    if (committed !== undefined)
        throw new Error(`層「${name}」はコミット済み（${committed.hash}）`);
    if (isChecked(headState(root, 'PLAN.md'), name)) {
        throw new Error(`層「${name}」は PLAN のチェックごとコミット済み（件名が「${subject}」ではない）`);
    }
    requireNextStep(dir, name);
    if (note !== undefined && INTERRUPTION_NOTE.test(logLines([note])[0] ?? '')) {
        throw new Error('--note を「中断:」で始めない（close の中断の記録と区別できなくなる）');
    }
    const log = readState(dir, 'LOG.md') ?? '';
    const uncommitted = item.done ? uncommittedLogs(log, headState(root, 'LOG.md')) : [];
    const logged = uncommitted.some((entry) => entry.layer === name && !entry.lines[0]?.startsWith(INTERRUPTED));
    const newPlan = item.done ? undefined : markDone(plan, name);
    // Built even when the existing entry is reused, so an invalid note is refused on a re-run too.
    const appended = appendLog(log, { date: formatDate(now), layer: name, lines: note === undefined ? [] : [note] });
    const newLog = logged ? undefined : appended;
    removeLeftoverTemps(dir);
    if (newPlan !== undefined)
        writeState(dir, 'PLAN.md', newPlan);
    if (newLog !== undefined) {
        resumable(() => writeState(dir, 'LOG.md', newLog), 'PLAN は記録済み。原因を直して再実行すれば LOG 追記からやり直す');
    }
    const done = resumable(() => commitRecords(root, subject), 'PLAN と LOG は記録済み。原因を直して再実行すればコミットだけやり直す');
    if (!done)
        throw new Error('コミットする変更がない（PLAN と LOG の変更を git が拾っていない。skip-worktree などを確認）');
    const hash = gitLastCommit(root)?.hash ?? '?';
    const result = item.done ? `層「${name}」のコミットをやり直した` : `層「${name}」を完了`;
    return [`${result}: ${hash} ${subject}${describeAdded(root)}`];
}
