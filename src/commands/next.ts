// soujo next show / set / check: the one file needed to resume.

import { dirname } from 'node:path';
import { findStateDir, readState, requireStateDir, writeState } from '../files.js';
import { gitStatus, gitToplevel } from '../git.js';
import { formatNext, nextStatus, parseNext, parsePlan, validateNext, type NextInput } from '../state.js';

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

/** Rewrites NEXT.md. Writes nothing when the result would be invalid. */
export function nextSet(cwd: string, input: NextInput): string[] {
  const dir = requireStateDir(cwd);
  const text = formatNext(input);
  const problems = validateNext(text);
  if (problems.length > 0) throw new Error(`NEXT.md を書かない: ${problems.join('、')}`);
  writeState(dir, 'NEXT.md', text);
  return [`NEXT.md を更新: 次: ${input.layer.trim()}`];
}

function problems(dir: string): string[] {
  const found: string[] = [];
  const next = readState(dir, 'NEXT.md');
  if (next === undefined) {
    found.push('NEXT.md がない');
  } else {
    found.push(...validateNext(next));
    const layer = parseNext(next)?.layer;
    const plan = readState(dir, 'PLAN.md');
    const status = layer === undefined || plan === undefined ? undefined : nextStatus(layer, parsePlan(plan));
    if (status?.state === 'done') found.push(`NEXT.md の次「${layer}」は PLAN で完了済み`);
    if (status?.state === 'skipped') found.push(`NEXT.md の次「${layer}」より前の「${status.unfinished.layer}」が PLAN で未完了`);
  }
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
