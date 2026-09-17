// soujo init: copies templates into the project root without overwriting anything.

import { join, resolve } from 'node:path';
import {
  ROOT_FILES,
  STATE_DIR,
  STATE_FILES,
  createFile,
  ensureStateDir,
  readTemplate,
  removeLeftoverTemps,
  removeRootTemps,
  stateIdentities,
  stateTarget,
  statePath,
} from '../files.js';
import { gitToplevel } from '../git.js';

export function init(cwd: string): string[] {
  const toplevel = gitToplevel(cwd);
  const root = toplevel ?? resolve(cwd);
  const dir = ensureStateDir(root);
  // The rules writeState follows, checked before anything is created: a symlinked .soujo/ or state file planted in a
  // repository must not place files outside the project, inside .git, or where a dangling symlink of another state file leads,
  // which the next write would then go through. Two state files that are already one file are left to the commands that write
  // them, since createFile never writes through an existing entry, and init has CLAUDE.md and AGENTS.md to restore.
  const known = stateIdentities(dir);
  for (const file of STATE_FILES) {
    const { problem } = stateTarget(dir, file, known);
    if (problem?.elsewhere === true || problem?.whenWritten === true) throw new Error(`${statePath(file)} の${problem.text}なので init しない`);
  }
  removeLeftoverTemps(dir);
  removeRootTemps(root);

  const targets = [
    ...STATE_FILES.map((file) => ({ template: file, path: `${STATE_DIR}/${file}` })),
    ...ROOT_FILES.map((file) => ({ template: file, path: file })),
  ];
  const created: string[] = [];
  const skipped: string[] = [];
  for (const { template, path } of targets) {
    (createFile(join(root, path), readTemplate(template)) ? created : skipped).push(path);
  }
  const lines = created.map((path) => `作成: ${path}`);
  if (skipped.length > 0) lines.push(`既存のため作らず: ${skipped.join(', ')}`);
  // layer done and close commit, so say it now rather than after the first layer is implemented.
  if (toplevel === undefined) lines.push('git リポジトリではない: layer done / close の前に git init が要る');
  return lines;
}
