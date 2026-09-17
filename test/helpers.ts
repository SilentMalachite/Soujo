import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isRunning, type StateFile } from '../src/files.js';
import { REPOSITORY_ENV } from '../src/git.js';
import { EFFORTS } from '../src/state.js';

const CLI = fileURLToPath(new URL('../src/cli.js', import.meta.url));

// Git in tests, and the soujo runs they start, read no user or system configuration (core.hooksPath, signing, filters) and no
// variable pointing at another repository, so the results do not depend on the machine.
// An empty file rather than the null device: git cannot open Windows's `\\.\nul` as a configuration file, which would fail
// every git call with "unable to access". The file lives for the run of the process that made it.
const emptyConfig = join(mkdtempSync(join(tmpdir(), 'soujo-config-')), 'gitconfig');
writeFileSync(emptyConfig, '');
process.on('exit', () => rmSync(dirname(emptyConfig), { recursive: true, force: true }));
process.env.GIT_CONFIG_GLOBAL = emptyConfig;
process.env.GIT_CONFIG_NOSYSTEM = '1';
for (const name of REPOSITORY_ENV) delete process.env[name];

let exited: number | undefined;

/**
 * The pid of a process that has exited, so that a temporary file named after it counts as a leftover of a killed write.
 * Taken again when the system has handed the number out since, which would make the file one of a running write instead.
 */
export function deadPid(): number {
  if (exited === undefined || isRunning(exited)) {
    const { pid } = spawnSync(process.execPath, ['-e', ''], { stdio: 'ignore' });
    if (pid === undefined || pid <= 0) throw new Error('deadPid: 子プロセスを起動できない');
    exited = pid;
  }
  return exited;
}

/** The pid of a process that runs until the test is over, so that a temporary file named after it must be left alone. */
export function livePid(t: TestContext): number {
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 600000)'], { stdio: 'ignore' });
  child.unref();
  t.after(() => child.kill());
  const { pid } = child;
  if (pid === undefined || pid <= 0) throw new Error('livePid: 子プロセスを起動できない');
  return pid;
}

/** A temporary directory removed after the test. */
export function temp(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), 'soujo-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** The compiled test files in `dir`, in name order: what `npm test` runs (test/run.ts). */
export function testFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.test.js'))
    .sort()
    .map((name) => join(dir, name));
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

/** Stages and commits everything in the repository, dated date when given (author and committer). */
export function commitAll(dir: string, message = 'test commit', date?: Date): void {
  const stamp = date === undefined ? {} : { GIT_AUTHOR_DATE: gitDate(date), GIT_COMMITTER_DATE: gitDate(date) };
  const env = { ...process.env, ...stamp };
  execFileSync('git', ['add', '-A'], { cwd: dir, stdio: 'ignore', env });
  execFileSync('git', ['commit', '-q', '--allow-empty', '-m', message], { cwd: dir, stdio: 'ignore', env });
}

function gitDate(date: Date): string {
  return `@${Math.floor(date.getTime() / 1000)} +0000`;
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
