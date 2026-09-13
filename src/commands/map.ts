// soujo map plan / map code: PLAN.md as a vertical diagram, and a directory's imports as Mermaid (or its tree).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { requireState, requireStateDir } from '../files.js';
import { directoryTree, importGraph, languageOf, planDiagram, skipEntry } from '../map.js';
import { parsePlan } from '../state.js';

export function mapPlan(cwd: string): string[] {
  const items = parsePlan(requireState(requireStateDir(cwd), 'PLAN.md'));
  return items.length === 0 ? ['PLAN.md に層がない'] : planDiagram(items);
}

// Files under root as "/"-separated relative paths. Skipped entries are never entered; symlinks are not followed.
function listFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (dir: string, prefix: string) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      throw new Error(`${prefix || '.'} を読めない: ${(error as Error).message}`);
    }
    for (const entry of entries) {
      if (skipEntry(entry.name)) continue;
      const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(join(dir, entry.name), path);
      else if (entry.isFile()) files.push(path);
    }
  };
  walk(root, '');
  return files;
}

function read(root: string, path: string): string {
  try {
    return readFileSync(join(root, path), 'utf8');
  } catch (error) {
    throw new Error(`${path} を読めない: ${(error as Error).message}`);
  }
}

/** Mermaid of the imports under dir (default cwd); a directory tree when no file is in a supported language. */
export function mapCode(cwd: string, dir: string = '.'): string[] {
  const root = resolve(cwd, dir);
  let isDirectory = false;
  try {
    isDirectory = statSync(root).isDirectory();
  } catch {
    // Missing or unreadable: reported below.
  }
  if (!isDirectory) throw new Error(`ディレクトリがない: ${dir}`);
  const paths = listFiles(root);
  const sources = paths.filter((path) => languageOf(path) !== undefined);
  if (sources.length === 0) return directoryTree(basename(root) || root, paths);
  return importGraph(sources.map((path) => ({ path, text: read(root, path) })));
}
