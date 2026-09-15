// Finding .soujo/ and reading/writing its files. Thin I/O layer: file contents are neither parsed nor validated here, and only
// file names are checked (months through state.ts), so that no read or write leaves .soujo/.

import {
  closeSync,
  existsSync,
  fchmodSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMonth, requireMonth } from './state.js';

export const STATE_DIR = '.soujo';
export const STATE_FILES = ['SPEC.md', 'PLAN.md', 'LOG.md', 'NEXT.md'] as const;
/** A month of LOG.md moved out by soujo log rotate. Only archiveFile and archiveFiles make one; other names are refused at use. */
export type ArchiveFile = `LOG-${string}.md`;
export type StateFile = (typeof STATE_FILES)[number] | ArchiveFile;

const ARCHIVE = /^LOG-(.+)\.md$/;
// A temporary file of writeState, named after the file it replaces.
const TEMP = /^\.(.+)\.\d+\.tmp$/;

function isArchive(name: string): name is ArchiveFile {
  return isMonth(ARCHIVE.exec(name)?.[1] ?? '');
}

function isStateFile(name: string): name is StateFile {
  return (STATE_FILES as readonly string[]).includes(name) || isArchive(name);
}

function requireStateFile(file: string): void {
  if (!isStateFile(file)) throw new Error(`状態ファイルの名前ではない: ${file}`);
}

/** The archive of month (YYYY-MM); anything else throws, so a name can never leave .soujo/. */
export function archiveFile(month: string): ArchiveFile {
  return `LOG-${requireMonth(month)}.md`;
}

/** The month (YYYY-MM) of an archive. */
export function archiveMonth(file: ArchiveFile): string {
  requireStateFile(file);
  return ARCHIVE.exec(file)?.[1] ?? '';
}

function entryNames(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/** The archives in .soujo/ (a symlink or any other entry with an archive's name included), sorted by name. */
export function archiveFiles(dir: string): ArchiveFile[] {
  return entryNames(dir)
    .filter(isArchive)
    .sort();
}

/** The state file relative to the project root, e.g. ".soujo/PLAN.md". */
export function statePath(file: StateFile): string {
  requireStateFile(file);
  return `${STATE_DIR}/${file}`;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Where git tracks the state file, relative to root: the symlink target when the file is a symlink (root resolved too,
 * so /tmp and /private/tmp compare equal), otherwise ".soujo/<file>".
 */
export function trackedStatePath(root: string, file: StateFile): string {
  const path = join(root, statePath(file));
  if (!isSymlink(path)) return statePath(file);
  try {
    return relative(realpathSync(root), realpathSync(path)).split(sep).join('/');
  } catch {
    return statePath(file);
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

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

/**
 * File contents, or undefined when the file (or .soujo/) does not exist. Symlinks are followed only as writeState follows
 * them, so a symlink planted in a repository cannot put other files into hook output or warnings, and only regular files
 * are read, so a FIFO or device cannot block a hook.
 */
export function readState(dir: string, file: StateFile): string | undefined {
  let target: StateTarget;
  try {
    target = stateTarget(dir, file);
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw new Error(`${file} を読めない: ${(error as Error).message}`);
  }
  if (target.problem !== undefined) throw new Error(`${file} を読まない: 実体（symlink の先）が${target.problem}`);
  try {
    if (!statSync(target.path).isFile()) throw new Error('通常のファイルではない');
    return readFileSync(target.path, 'utf8');
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw new Error(`${file} を読めない: ${(error as Error).message}`);
  }
}

export function requireState(dir: string, file: StateFile): string {
  const text = readState(dir, file);
  if (text === undefined) throw new Error(`${file} がない（soujo init で作る）`);
  return text;
}

export interface StateTarget {
  /** The real path: symlinks of the file and of .soujo/ resolved. A missing file (or a dangling symlink) is replaced in .soujo/. */
  path: string;
  /** Why the file must not be written: its real path is outside the project (the directory above .soujo/) or inside .git. */
  problem?: 'プロジェクトの外' | '.git の中';
}

/** Where writeState writes the file. Throws when .soujo/ or the project cannot be resolved. */
export function stateTarget(dir: string, file: StateFile): StateTarget {
  requireStateFile(file);
  const path = join(dir, file);
  const real = existsSync(path) ? realpathSync(path) : join(realpathSync(dir), file);
  const inProject = relative(realpathSync(dirname(dir)), real);
  if (inProject === '..' || inProject.startsWith(`..${sep}`) || isAbsolute(inProject)) return { path: real, problem: 'プロジェクトの外' };
  if (inProject.split(sep).includes('.git')) return { path: real, problem: '.git の中' };
  return { path: real };
}

// The temporary file writeState and createFile use for target: ".<name>.<pid>.tmp" next to it.
function tempOf(target: string): string {
  return join(dirname(target), `.${basename(target)}.${process.pid}.tmp`);
}

function isTempOf(target: string, name: string): boolean {
  const prefix = `.${basename(target)}.`;
  return name.startsWith(prefix) && /^\d+\.tmp$/.test(name.slice(prefix.length));
}

// Anything at path, a dangling symlink included (existsSync follows symlinks).
function hasEntry(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function modeOf(path: string): number | undefined {
  try {
    return statSync(path).mode & 0o7777;
  } catch {
    return undefined;
  }
}

/**
 * Replaces the file via a temporary file and rename, so an interruption never leaves it half-written. Symlinks are kept,
 * but only followed to files inside the project and outside .git, so a symlink planted in a repository cannot overwrite
 * other files. The temporary file is created exclusively, never through an existing entry, and gets the file's permissions.
 */
export function writeState(dir: string, file: StateFile, text: string): void {
  let target: StateTarget;
  try {
    target = stateTarget(dir, file);
  } catch (error) {
    throw new Error(`${file} を書けない: ${(error as Error).message}`);
  }
  if (target.problem !== undefined) throw new Error(`${file} を書かない: 実体（symlink の先）が${target.problem}`);
  const temp = tempOf(target.path);
  let created = false;
  try {
    const mode = modeOf(target.path);
    const fd = openSync(temp, 'wx', mode ?? 0o666);
    created = true;
    try {
      writeFileSync(fd, text);
      if (mode !== undefined) fchmodSync(fd, mode);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, target.path);
  } catch (error) {
    try {
      if (created) rmSync(temp, { force: true });
    } catch {
      // Cleanup is best effort; report the original failure.
    }
    throw new Error(`${file} を書けない: ${(error as Error).message}`);
  }
}

// The temporary files (or symlinks in their place) of target that a killed write left next to it, as absolute paths.
function tempsOf(target: string): string[] {
  let entries;
  try {
    entries = readdirSync(dirname(target), { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => (entry.isFile() || entry.isSymbolicLink()) && isTempOf(target, entry.name))
    .map((entry) => join(dirname(target), entry.name));
}

/** Deletes the temporary files (or symlinks in their place) of target that a killed write left next to it. */
export function removeTempsOf(target: string): void {
  for (const path of tempsOf(target)) rmSync(path, { force: true });
}

// The leftovers of the four state files, and of archives that exist or whose temporary file is in .soujo/; none next to a
// target outside the project or inside .git.
function leftoverTempPaths(dir: string): string[] {
  const named = entryNames(dir).flatMap((name) => TEMP.exec(name)?.[1] ?? []).filter(isArchive);
  const archives = new Set([...archiveFiles(dir), ...named]);
  return [...STATE_FILES, ...archives].flatMap((file) => {
    try {
      const target = stateTarget(dir, file);
      return target.problem === undefined ? tempsOf(target.path) : [];
    } catch {
      return [];
    }
  });
}

/** The temporary files removeLeftoverTemps would delete, relative to the project root (the directory above .soujo/), with "/". */
export function leftoverTemps(dir: string): string[] {
  const paths = leftoverTempPaths(dir);
  if (paths.length === 0) return [];
  const root = realpathSync(dirname(dir));
  return paths.map((path) => relative(root, path).split(sep).join('/'));
}

/**
 * Deletes temporary files (or symlinks in their place) that a killed writeState left behind, so that `git add -A` never commits
 * them: those of the four state files, and those of archives that exist or whose temporary file is in .soujo/.
 */
export function removeLeftoverTemps(dir: string): void {
  for (const path of leftoverTempPaths(dir)) rmSync(path, { force: true });
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

// Puts temp at path unless anything, a dangling symlink included, is there. A hard link fails in that case by itself;
// file systems without hard links (FAT, exFAT) rename instead, which replaces, so only after checking that nothing is there.
function place(temp: string, path: string): boolean {
  try {
    linkSync(temp, path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST' || hasEntry(path)) return false;
    renameSync(temp, path);
    return true;
  }
}

/**
 * Creates the file only when nothing exists at path; returns false when something does. The text is written to an exclusive
 * temporary file first, as writeState does, so an interruption never leaves the file empty or half-written.
 */
export function createFile(path: string, text: string): boolean {
  const temp = tempOf(path);
  let created = false;
  try {
    writeFileSync(temp, text, { flag: 'wx' });
    created = true;
    return place(temp, path);
  } catch (error) {
    throw new Error(`${basename(path)} を作れない: ${(error as Error).message}`);
  } finally {
    try {
      if (created) rmSync(temp, { force: true });
    } catch {
      // Cleanup is best effort; a leftover is removed by the next init.
    }
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
