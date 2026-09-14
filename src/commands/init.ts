// soujo init: copies templates into the project root without overwriting anything.

import { join, resolve } from 'node:path';
import { STATE_DIR, STATE_FILES, createFile, ensureStateDir, readTemplate, removeLeftoverTemps } from '../files.js';
import { gitToplevel } from '../git.js';

const ROOT_FILES = ['CLAUDE.md', 'AGENTS.md'];

export function init(cwd: string): string[] {
  const toplevel = gitToplevel(cwd);
  const root = toplevel ?? resolve(cwd);
  removeLeftoverTemps(ensureStateDir(root));
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
