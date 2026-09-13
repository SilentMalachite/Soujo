import type { TestContext } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StateFile } from '../src/files.js';

/** A temporary directory removed after the test. */
export function temp(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), 'soujo-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A temporary git repository with a local identity and unsigned commits. */
export function repo(t: TestContext): string {
  const dir = temp(t);
  const run = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  run('init', '-q');
  run('config', 'user.name', 'soujo test');
  run('config', 'user.email', 'test@example.com');
  run('config', 'commit.gpgsign', 'false');
  return dir;
}

/** Writes .soujo/ with the given files into dir and returns dir. */
export function project(dir: string, files: Partial<Record<StateFile, string>> = {}): string {
  mkdirSync(join(dir, '.soujo'), { recursive: true });
  for (const [file, text] of Object.entries(files)) writeFileSync(join(dir, '.soujo', file), text);
  return dir;
}
