import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StateFile } from '../src/files.js';
import { EFFORTS } from '../src/state.js';

const CLI = fileURLToPath(new URL('../src/cli.js', import.meta.url));

/** A temporary directory removed after the test. */
export function temp(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), 'soujo-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A temporary git repository with a local identity, unsigned commits, and untracked directories counted once. */
export function repo(t: TestContext): string {
  const dir = temp(t);
  const run = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  run('init', '-q');
  run('config', 'user.name', 'soujo test');
  run('config', 'user.email', 'test@example.com');
  run('config', 'commit.gpgsign', 'false');
  run('config', 'status.showUntrackedFiles', 'normal');
  return dir;
}

/** Stages and commits everything in the repository. */
export function commitAll(dir: string, message = 'test commit'): void {
  execFileSync('git', ['add', '-A'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['commit', '-q', '-m', message], { cwd: dir, stdio: 'ignore' });
}

/** Writes .soujo/ with the given files into dir and returns dir. */
export function project(dir: string, files: Partial<Record<StateFile, string>> = {}): string {
  mkdirSync(join(dir, '.soujo'), { recursive: true });
  for (const [file, text] of Object.entries(files)) if (text !== undefined) writeFileSync(join(dir, '.soujo', file), text);
  return dir;
}

/** `soujo …` spans as argv: table-escaped pipes and optional brackets unwrapped, quotes removed, and <low|…> checked against EFFORTS. */
export function commands(text: string): string[][] {
  return [...text.matchAll(/`soujo ([^`]+)`/g)].map((match) =>
    [...(match[1] ?? '').replace(/\\\|/g, '|').replace(/[[\]]/g, '').matchAll(/'([^']*)'|(\S+)/g)].map(([token, quoted]) => {
      if (quoted !== undefined) return quoted;
      const choices = /^<(\w+(?:\|\w+)+)>$/.exec(token)?.[1];
      if (choices === undefined) return token;
      assert.deepEqual(choices.split('|'), [...EFFORTS]);
      return EFFORTS[0];
    }),
  );
}

/**
 * Runs the CLI with argv in cwd and fails when the command, an option, or an option value is not recognized.
 * Spans with arguments must also fit the usage; a bare name such as `soujo next set` in prose only has to exist.
 */
export function assertKnownCommand(argv: string[], cwd: string, label: string): void {
  const result = spawnSync(process.execPath, [CLI, ...argv], { cwd, encoding: 'utf8' });
  const rejected = argv.length > 2 || argv.some((token) => token.startsWith('-'))
    ? /不明なコマンド|不明なオプション|オプションの値|使い方/
    : /不明なコマンド|不明なオプション|オプションの値/;
  assert.doesNotMatch(result.stderr, rejected, `${label}: soujo ${argv.join(' ')}`);
}
