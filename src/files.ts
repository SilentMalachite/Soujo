// Finding .soujo/ and reading/writing its files. Thin I/O layer: no parsing or validation here.

import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const STATE_DIR = '.soujo';
export const STATE_FILES = ['SPEC.md', 'PLAN.md', 'LOG.md', 'NEXT.md'] as const;
export type StateFile = (typeof STATE_FILES)[number];

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The nearest .soujo/ directory from start upward, or undefined outside Soujo projects.
 * The search stops at the git top level (a directory with .git), so a nested repository never uses an outer project.
 */
export function findStateDir(start: string = process.cwd()): string | undefined {
  let dir = resolve(start);
  for (;;) {
    const candidate = join(dir, STATE_DIR);
    if (isDirectory(candidate)) return candidate;
    if (existsSync(join(dir, '.git'))) return undefined;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export function requireStateDir(start: string = process.cwd()): string {
  const dir = findStateDir(start);
  if (dir === undefined) throw new Error(`${STATE_DIR}/ が見つからない（soujo init で作る）`);
  return dir;
}

/** File contents, or undefined when the file does not exist. */
export function readState(dir: string, file: StateFile): string | undefined {
  try {
    return readFileSync(join(dir, file), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new Error(`${file} を読めない: ${(error as Error).message}`);
  }
}

export function requireState(dir: string, file: StateFile): string {
  const text = readState(dir, file);
  if (text === undefined) throw new Error(`${file} がない（soujo init で作る）`);
  return text;
}

/** Replaces the file via a temporary file and rename, so an interruption never leaves it half-written. Symlinks are kept. */
export function writeState(dir: string, file: StateFile, text: string): void {
  const path = join(dir, file);
  const target = existsSync(path) ? realpathSync(path) : path;
  const temp = join(dirname(target), `.${basename(target)}.${process.pid}.tmp`);
  try {
    writeFileSync(temp, text);
    renameSync(temp, target);
  } catch (error) {
    try {
      rmSync(temp, { force: true });
    } catch {
      // Cleanup is best effort; report the original failure.
    }
    throw new Error(`${file} を書けない: ${(error as Error).message}`);
  }
}

export function ensureStateDir(root: string): string {
  const dir = join(root, STATE_DIR);
  try {
    mkdirSync(dir, { recursive: true });
  } catch (error) {
    throw new Error(`${STATE_DIR}/ を作れない: ${(error as Error).message}`);
  }
  return dir;
}

/** Creates the file only when nothing exists at path. Returns false when it already exists. */
export function createFile(path: string, text: string): boolean {
  try {
    writeFileSync(path, text, { flag: 'wx' });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw new Error(`${basename(path)} を作れない: ${(error as Error).message}`);
  }
}

/** The soujo package root: the nearest directory with package.json above this module (dist/ or .test-dist/src/). */
export function packageDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error('soujo の package.json が見つからない');
    dir = parent;
  }
}

export function readTemplate(name: string): string {
  return readFileSync(join(packageDir(), 'templates', name), 'utf8');
}
