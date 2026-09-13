// soujo layer done: checks the layer in PLAN.md, appends LOG.md, and commits everything as "layer: <layer>".
import { dirname } from 'node:path';
import { STATE_DIR, readState, requireState, requireStateDir, writeState } from '../files.js';
import { gitAddAll, gitAddedFiles, gitCommit, gitFindCommit, gitHeadFile, gitLastCommit, gitOperationInProgress, gitStatus, gitToplevel, } from '../git.js';
import { appendLog, formatDate, lastLog, markDone, parsePlan } from '../state.js';
const PLAN_PATH = `${STATE_DIR}/PLAN.md`;
const UNMERGED = /^(DD|AU|UD|UA|DU|AA|UU) /;
const SHOWN_FILES = 5;
function isChecked(plan, layer) {
    return plan !== undefined && parsePlan(plan).find((item) => item.layer === layer)?.done === true;
}
function describeAdded(files) {
    if (files.length === 0)
        return '';
    const rest = files.length > SHOWN_FILES ? ` ほか${files.length - SHOWN_FILES}件` : '';
    return `（追加: ${files.slice(0, SHOWN_FILES).join(', ')}${rest}）`;
}
/**
 * States, decided before anything is written:
 * - a merge/rebase is unfinished or files are unmerged       → refuse
 * - committed ("layer: <layer>" exists)                      → refuse
 * - checked in PLAN at HEAD (committed under another subject) → refuse
 * - unchecked in PLAN                                        → check PLAN, append LOG, commit
 * - checked only in the working tree (interrupted run)       → append LOG only if the last entry is not this layer, then commit
 */
export function layerDone(cwd, layer, note, now = new Date()) {
    const dir = requireStateDir(cwd);
    const root = dirname(dir);
    if (gitToplevel(root) === undefined)
        throw new Error('git リポジトリではないのでコミットできない');
    const operation = gitOperationInProgress(root);
    if (operation !== undefined)
        throw new Error(`git の ${operation} が途中なのでコミットしない（終えるか中止してから）`);
    const unmerged = gitStatus(root).filter((line) => UNMERGED.test(line)).length;
    if (unmerged > 0)
        throw new Error(`競合が未解決のファイルが ${unmerged}件あるのでコミットしない`);
    const name = layer.trim();
    const plan = requireState(dir, 'PLAN.md');
    const item = parsePlan(plan).find((candidate) => candidate.layer === name);
    if (item === undefined)
        throw new Error(`PLAN.md に層「${name}」がない`);
    const subject = `layer: ${name}`;
    const committed = gitFindCommit(root, subject);
    if (committed !== undefined)
        throw new Error(`層「${name}」はコミット済み（${committed.hash}）`);
    if (item.done && isChecked(gitHeadFile(root, PLAN_PATH), name)) {
        throw new Error(`層「${name}」は PLAN のチェックごとコミット済み（件名が「${subject}」ではない）`);
    }
    const log = readState(dir, 'LOG.md') ?? '';
    const logged = item.done && lastLog(log)?.layer === name;
    const newPlan = item.done ? undefined : markDone(plan, name);
    const newLog = logged
        ? undefined
        : appendLog(log, { date: formatDate(now), layer: name, lines: note === undefined ? [] : [note] });
    if (newPlan !== undefined)
        writeState(dir, 'PLAN.md', newPlan);
    if (newLog !== undefined)
        writeState(dir, 'LOG.md', newLog);
    try {
        gitAddAll(root);
        gitCommit(root, subject);
    }
    catch (error) {
        throw new Error(`${error.message}（PLAN と LOG は記録済み。再実行でコミットだけやり直す）`);
    }
    const hash = gitLastCommit(root)?.hash ?? '?';
    const result = item.done ? `層「${name}」のコミットをやり直した` : `層「${name}」を完了`;
    return [`${result}: ${hash} ${subject}${describeAdded(gitAddedFiles(root))}`];
}
