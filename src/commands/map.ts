// soujo map plan / map code: PLAN.md as a vertical diagram, and a directory's imports as Mermaid (or its tree).

import { readFileSync, readdirSync, statSync, type Dirent } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { findStateDir } from '../files.js';
import {
  MAP_LIMITS,
  directoryTree,
  importGraph,
  mainLanguage,
  planDiagram,
  scanNotes,
  skipEntry,
  type MapLimits,
  type ScannedFile,
} from '../map.js';
import { NO_LAYERS, readPlan } from './shared.js';

interface Scan {
  files: string[];
  /** With a trailing "/". */
  dirs: string[];
  unreadable: number;
  truncated: boolean;
}

export function mapPlan(cwd: string): string[] {
  const items = readPlan(cwd);
  return items.length === 0 ? [NO_LAYERS] : planDiagram(items);
}

function reason(error: unknown): string {
  return (error as NodeJS.ErrnoException).code ?? (error as Error).message;
}

function requireDirectory(root: string, shown: string): void {
  let isDirectory;
  try {
    isDirectory = statSync(root).isDirectory();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') throw new Error(`ディレクトリがない: ${shown}`);
    throw new Error(`ディレクトリを読めない: ${shown}（${reason(error)}）`);
  }
  if (!isDirectory) throw new Error(`ディレクトリではない: ${shown}`);
}

// Files and directories under root, breadth first so that a cut keeps the upper levels. Skipped names and symlinks
// (to files or directories) are left out entirely; unreadable subdirectories are counted and skipped.
function scanDirectory(root: string, shown: string, limit: number): Scan {
  const scan: Scan = { files: [], dirs: [], unreadable: 0, truncated: false };
  const queue: { dir: string; prefix: string }[] = [{ dir: root, prefix: '' }];
  for (const { dir, prefix } of queue) {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      if (prefix === '') throw new Error(`ディレクトリを読めない: ${shown}（${reason(error)}）`);
      scan.unreadable += 1;
      continue;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      if (skipEntry(entry.name) || !(entry.isFile() || entry.isDirectory())) continue;
      if (scan.files.length + scan.dirs.length >= limit) {
        scan.truncated = true;
        return scan;
      }
      const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isFile()) scan.files.push(path);
      else {
        scan.dirs.push(`${path}/`);
        queue.push({ dir: join(dir, entry.name), prefix: path });
      }
    }
  }
  return scan;
}

/**
 * Mermaid of the imports in the main language under dir (default: the project root, or cwd outside Soujo projects);
 * a directory tree when that language has no import rules or no file is recognized. Unreadable files are counted and skipped.
 */
export function mapCode(cwd: string, dir?: string, limits: MapLimits = MAP_LIMITS): string[] {
  const stateDir = findStateDir(cwd);
  const root = dir !== undefined ? resolve(cwd, dir) : stateDir !== undefined ? dirname(stateDir) : resolve(cwd);
  const shown = dir ?? root;
  requireDirectory(root, shown);
  const scan = scanDirectory(root, shown, limits.entries);
  const main = mainLanguage(scan.files);
  const rules = main?.language.graph;
  if (main === undefined || rules === undefined) {
    return directoryTree(basename(root) || '.', [...scan.dirs, ...scan.files], scanNotes(scan, limits), limits);
  }
  const files: ScannedFile[] = [];
  let unreadable = scan.unreadable;
  for (const path of main.paths) {
    let text;
    try {
      text = readFileSync(join(root, path), 'utf8');
    } catch {
      unreadable += 1;
      continue;
    }
    files.push({ path, imports: rules.imports(text) });
  }
  return importGraph(rules, files, scanNotes({ unreadable, truncated: scan.truncated }, limits), limits);
}
