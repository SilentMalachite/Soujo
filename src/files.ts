// Finding .soujo/ and reading/writing its files. Thin I/O layer: file contents are neither parsed nor validated here. What is
// checked is where a name and a symlink lead (months through state.ts), so that no read or write leaves the project, enters
// .git, or lands on another state file.

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
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';
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
 * The parts of the path, relative to root, where a symlink at path (relative to root, "/"-separated) with the link text link
 * points; they may include "." and "..". A relative link is joined to the symlink's directory unresolved, since a part before
 * ".." may itself be a symlink, and split at separator as well as "/" (Windows splits at "\" too). An absolute one is taken
 * through the real paths of root and of the link's directory, so /tmp and /private/tmp compare equal.
 */
export function symlinkTargetParts(root: string, path: string, link: string, separator: string = sep): string[] {
  if (!isAbsolute(link)) return [...posix.dirname(path).split('/'), ...link.split(separator).flatMap((part) => part.split('/'))];
  const target = join(realPathOfAncestor(dirname(link)), basename(link));
  return relative(realPathOfAncestor(root), target).split(sep);
}

// The directories under which hosts keep install caches and marketplace clones of plugins, this repository included (SPEC §8).
const PLUGIN_DIRS = ['.claude', '.codex'];

// The real path of dir. When a part cannot be resolved (missing, unreadable, or a symlink loop), the real path of the nearest
// ancestor that can be, with the rest of the absolute path appended, so that a symlink before that part is still followed.
function realPathOfAncestor(dir: string): string {
  const rest: string[] = [];
  let path = resolve(dir);
  for (;;) {
    try {
      return join(realpathSync(path), ...rest);
    } catch {
      const parent = dirname(path);
      if (parent === path) return resolve(dir);
      rest.unshift(basename(path));
      path = parent;
    }
  }
}

/**
 * The host plugin directory (".claude/plugins" or ".codex/plugins") that the real path of dir is in, in any letter case, since
 * the file system may ignore case, or undefined. A symlink into a copy of Soujo there is caught; when the real path cannot be
 * found, the real path of the nearest ancestor that can be is checked with the rest of the absolute path.
 */
export function pluginDir(dir: string): string | undefined {
  const segments = realPathOfAncestor(dir).split(sep).map((segment) => segment.toLowerCase());
  const index = segments.findIndex((segment, i) => PLUGIN_DIRS.includes(segment) && segments[i + 1] === 'plugins');
  return index === -1 ? undefined : `${segments[index]}/plugins`;
}

/**
 * The nearest .soujo/ directory from start upward, or undefined outside Soujo projects and inside a host plugin directory,
 * whose copy of Soujo carries this repository's .soujo/.
 * The search stops at the git top level (a directory with .git), so a nested repository never uses an outer project.
 */
export function findStateDir(start: string = process.cwd()): string | undefined {
  if (pluginDir(start) !== undefined) return undefined;
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
  // A problem only writing has (a dangling symlink leading to a file not created yet) leaves nothing to read through.
  if (target.problem !== undefined && target.problem.whenWritten !== true) throw new Error(`${file} を読まない: ${target.problem.text}`);
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

export interface StateProblem {
  /** Why, as it reads after "<file> の": "実体（symlink の先）がプロジェクトの外", "実体が LOG.md（symlink）の先と同じ", … */
  text: string;
  /** Only writing is refused: nothing is shared until the file another one leads to is created (see leadsTo). */
  whenWritten?: true;
  /** The real path is outside the project or inside .git, so that nothing next to it may be deleted either. */
  elsewhere?: true;
}

export interface StateTarget {
  /** The real path: symlinks of the file and of .soujo/ resolved. A missing file (or a dangling symlink) is replaced in .soujo/. */
  path: string;
  /** Why the file must not be written, and unless whenWritten is set, not read either. */
  problem?: StateProblem;
}

/** What tells one state file from another; see sameFile. */
export interface FileIdentity {
  /** The path it resolves to, or where it would be created in .soujo/ when it does not exist (see pathKey). */
  key: string;
  /** "<device>:<inode>" of an existing file, or undefined when it does not exist or the file system gives no inode. */
  inode?: string;
  /** Told apart from another file with the same inode, which ReFS and some FUSE and SMB mounts hand out. */
  size?: bigint;
  birthtime?: bigint;
  /** Whether .soujo/ has the file as a symlink. */
  link?: true;
  /** The paths a dangling symlink leads through, in order (not pathKey): a file created at any of them is written through it. */
  leadsTo?: string[];
}

/** The identities of the state files and archives in .soujo/, computed once so that several targets can be checked together. */
export interface StateIdentities {
  /** Whether paths are compared ignoring letter case, as this file system does. */
  foldCase: boolean;
  of: Map<StateFile, FileIdentity>;
}

// The names a file system may hand to .git, which git itself refuses through core.protectNTFS and core.protectHFS: the code
// points HFS+ leaves out of a name, the stream and the trailing dots and spaces NTFS drops, and the 8.3 short name.
const HFS_IGNORED = /[‌-‏‪-‮⁪-⁯﻿]/g;

/** Whether a path part names .git, in any letter case and under any of the names a file system may accept for it. */
export function isDotGit(part: string): boolean {
  const name = (part.replace(HFS_IGNORED, '').split(':')[0] ?? '').replace(/[. ]+$/, '').toLowerCase();
  return name === '.git' || /^git~\d+$/.test(name);
}

/** How paths are compared: in NFC, since a file system may store either form, and in one letter case only where it ignores case. */
export function pathKey(path: string, foldCase: boolean): string {
  const normalized = path.normalize('NFC');
  return foldCase ? normalized.toLowerCase() : normalized;
}

/**
 * Whether two identities are one file: the same inode, confirmed by the path or by size and creation time, since inodes are
 * neither unique nor stable everywhere. Files that do not exist are one when they would be created at the same path.
 */
export function sameFile(a: FileIdentity, b: FileIdentity): boolean {
  if (a.inode !== undefined && a.inode === b.inode) return a.key === b.key || (a.size === b.size && a.birthtime === b.birthtime);
  return a.key === b.key;
}

// The most symlinks followed for one path before taking it as a loop, as Linux does.
export const MAX_SYMLINKS = 40;

function attempt<T>(step: () => T): T | undefined {
  try {
    return step();
  } catch {
    return undefined;
  }
}

/**
 * The paths the entry at path (relative to root, "/"-separated) leads through, in order, each part resolved in turn and every
 * symlink on the way followed, as the operating system does, so that ".." after a symlink is taken from where that points.
 * The last one is where it lands, which need not exist. Empty beyond MAX_SYMLINKS, as for a loop.
 */
function pathLeadsTo(root: string, path: string): string[] {
  const visited: string[] = [];
  const pending = path.split('/');
  let dir = '';
  for (let links = 0; pending.length > 0; ) {
    const part = pending.shift() ?? '';
    if (part === '' || part === '.') continue;
    const next = posix.join(dir, part);
    if (part === '..') {
      dir = next === '.' ? '' : next;
      continue;
    }
    const full = join(root, ...next.split('/'));
    visited.push(full);
    if (isSymlink(full)) {
      if (++links > MAX_SYMLINKS) return [];
      const link = attempt(() => readlinkSync(full));
      if (link === undefined) return visited;
      pending.unshift(...symlinkTargetParts(root, next, link));
      dir = '';
    } else if (pending.length === 0) {
      return visited;
    } else {
      dir = next;
    }
  }
  return visited;
}

// Whether the file system of dir ignores letter case, told by looking for .soujo/ itself under an upper-cased name.
function ignoresCase(dir: string): boolean {
  const upper = join(dirname(dir), basename(dir).toUpperCase());
  if (upper === dir) return false;
  const own = attempt(() => statSync(dir, { bigint: true }));
  const other = attempt(() => statSync(upper, { bigint: true }));
  return own !== undefined && other !== undefined && own.dev === other.dev && own.ino === other.ino;
}

function identityOf(dir: string, file: StateFile, foldCase: boolean): FileIdentity {
  const path = join(dir, file);
  const link = isSymlink(path) ? (true as const) : undefined;
  if (existsSync(path)) {
    const { dev, ino, size, birthtimeMs } = statSync(path, { bigint: true });
    const inode = ino === 0n ? undefined : `${dev}:${ino}`;
    return { key: pathKey(realpathSync(path), foldCase), inode, size, birthtime: birthtimeMs, link };
  }
  const own = { key: pathKey(join(realpathSync(dir), file), foldCase), link };
  if (link === undefined) return own;
  return { ...own, leadsTo: pathLeadsTo(realpathSync(dirname(dir)), `${basename(dir)}/${file}`) };
}

/** The identities of the state files, the archives in .soujo/, and extra, so that stateTarget can check them all at once. */
export function stateIdentities(dir: string, extra: readonly StateFile[] = []): StateIdentities {
  const foldCase = ignoresCase(dir);
  const of = new Map<StateFile, FileIdentity>();
  for (const file of new Set([...STATE_FILES, ...archiveFiles(dir), ...extra])) {
    // A file that cannot be resolved is left out; reading or writing it fails by itself.
    const identity = attempt(() => identityOf(dir, file, foldCase));
    if (identity !== undefined) of.set(file, identity);
  }
  return { foldCase, of };
}

/**
 * Where writeState writes the file, and why it must not be written (or, unless whenWritten is set, read): its real path is
 * outside the project or inside .git, or it is another state file or archive (see sameStateFile). Throws when .soujo/ or the
 * project cannot be resolved. Pass known from stateIdentities to check several files without resolving the others each time.
 */
export function stateTarget(dir: string, file: StateFile, known?: StateIdentities): StateTarget {
  requireStateFile(file);
  const path = join(dir, file);
  const real = existsSync(path) ? realpathSync(path) : join(realpathSync(dir), file);
  const inProject = relative(realpathSync(dirname(dir)), real);
  const elsewhere = (where: string): StateTarget => ({ path: real, problem: { text: `実体（symlink の先）が${where}`, elsewhere: true } });
  if (inProject === '..' || inProject.startsWith(`..${sep}`) || isAbsolute(inProject)) return elsewhere('プロジェクトの外');
  if (inProject.split(sep).some(isDotGit)) return elsewhere('.git の中');
  const problem = sameStateFile(dir, file, known ?? stateIdentities(dir, [file]));
  return problem === undefined ? { path: real } : { path: real, problem };
}

/**
 * Why the file is another state file or archive in .soujo/: they are one file (a symlink, a differently cased path, or a hard
 * link), so reading one returns the other's contents and writing one overwrites them; or one of them is a dangling symlink
 * leading to where the other is created, which the next write would then go through. Refusing both keeps a command writing
 * several of them, as layer done and log rotate do, from overwriting what it has just written.
 */
function sameStateFile(dir: string, file: StateFile, known: StateIdentities): StateProblem | undefined {
  const { foldCase, of } = known;
  const own = of.get(file) ?? attempt(() => identityOf(dir, file, foldCase));
  if (own === undefined) return undefined;
  const leads = (identity: FileIdentity, key: string) => identity.leadsTo?.some((step) => pathKey(step, foldCase) === key) === true;
  for (const [other, them] of of) {
    if (other === file) continue;
    if (sameFile(own, them)) return { text: sameText(own, them, other) };
    if (leads(own, them.key)) return ledTo(other);
    if (leads(them, own.key)) return { text: `場所が ${other}（壊れた symlink）の先と同じ`, whenWritten: true };
  }
  // A state file with no entry in .soujo/ yet has no identity to compare, so its name in .soujo/ is what tells it.
  const led = (own.leadsTo ?? []).map((step) => namedStateFile(dir, step, foldCase)).find((name) => name !== undefined && name !== file);
  return led === undefined ? undefined : ledTo(led);
}

function ledTo(other: StateFile): StateProblem {
  return { text: `壊れた symlink の先が ${other}（まだ無い）と同じ`, whenWritten: true };
}

// The state file path is, when it is in .soujo/ (dir): its name there, spelled as Soujo writes it where the file system
// ignores letter case, or undefined when it names no state file.
function namedStateFile(dir: string, path: string, foldCase: boolean): StateFile | undefined {
  const real = attempt(() => realpathSync(dir));
  if (real === undefined || pathKey(dirname(path), foldCase) !== pathKey(real, foldCase)) return undefined;
  const name = basename(path);
  if (isStateFile(name)) return name;
  if (!foldCase) return undefined;
  const known = STATE_FILES.find((file) => file.toLowerCase() === name.toLowerCase());
  if (known !== undefined) return known;
  const month = /^log-(.+)\.md$/i.exec(name)?.[1] ?? '';
  return isMonth(month) ? archiveFile(month) : undefined;
}

// Names the symlink, so that what has to be changed is the file named; without one, a hard link is what is left.
function sameText(own: FileIdentity, them: FileIdentity, other: StateFile): string {
  if (own.link === true) return `実体（symlink の先）が ${other} と同じ`;
  if (them.link === true) return `実体が ${other}（symlink）の先と同じ`;
  return `実体が ${other} と同じ（hard link）`;
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
 * but only followed where stateTarget allows (inside the project, outside .git, not another state file), so a symlink planted
 * in a repository cannot overwrite other files. The temporary file is created exclusively, never through an existing entry,
 * and gets the file's permissions.
 */
export function writeState(dir: string, file: StateFile, text: string): void {
  let target: StateTarget;
  try {
    target = stateTarget(dir, file);
  } catch (error) {
    throw new Error(`${file} を書けない: ${(error as Error).message}`);
  }
  if (target.problem !== undefined) throw new Error(`${file} を書かない: ${target.problem.text}`);
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
// target outside the project or inside .git. A target that is another state file is still inside the project, so its leftovers
// are deleted as before; leaving them would let `git add -A` commit them.
function leftoverTempPaths(dir: string): string[] {
  const named = entryNames(dir).flatMap((name) => TEMP.exec(name)?.[1] ?? []).filter(isArchive);
  const files = [...new Set<StateFile>([...STATE_FILES, ...archiveFiles(dir), ...named])];
  const known = attempt(() => stateIdentities(dir, files));
  return files.flatMap((file) => {
    try {
      const target = stateTarget(dir, file, known);
      return target.problem?.elsewhere === true ? [] : tempsOf(target.path);
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
