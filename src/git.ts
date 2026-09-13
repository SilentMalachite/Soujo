// git calls. Thin layer: each function runs one git command in the given directory.

import { execFileSync } from 'node:child_process';

export interface Commit {
  hash: string;
  subject: string;
}

function firstLine(text: string | undefined, from: 'first' | 'last'): string | undefined {
  const lines = (text ?? '').split('\n').map((line) => line.trim()).filter((line) => line !== '');
  return from === 'first' ? lines[0] : lines[lines.length - 1];
}

function git(cwd: string, args: string[]): string {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    const { stderr, stdout, message } = error as { stderr?: string; stdout?: string; message?: string };
    const reason = firstLine(stderr, 'first') ?? firstLine(stdout, 'last') ?? firstLine(message, 'first') ?? '';
    throw new Error(`git ${args[0]} に失敗: ${reason}`);
  }
}

/** Repository top level, or undefined outside a git repository. */
export function gitToplevel(cwd: string): string | undefined {
  try {
    return git(cwd, ['rev-parse', '--show-toplevel']).trim();
  } catch {
    return undefined;
  }
}

/** `git status --porcelain` lines; empty when the tree is clean. Untracked files are included. */
export function gitStatus(cwd: string): string[] {
  return git(cwd, ['status', '--porcelain']).split('\n').filter((line) => line !== '');
}

export function gitAddAll(cwd: string): void {
  git(cwd, ['add', '-A']);
}

export function gitCommit(cwd: string, message: string): void {
  git(cwd, ['commit', '-q', '-m', message]);
}

/** The latest commit, or undefined when there is none (or no repository). */
export function gitLastCommit(cwd: string): Commit | undefined {
  try {
    const line = git(cwd, ['log', '-1', '--format=%h%x09%s']).trim();
    const tab = line.indexOf('\t');
    return tab === -1 ? undefined : { hash: line.slice(0, tab), subject: line.slice(tab + 1) };
  } catch {
    return undefined;
  }
}
