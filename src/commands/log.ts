// soujo log add: appends one dated entry to LOG.md.

import { readState, removeLeftoverTemps, requireStateDir, writeState } from '../files.js';
import { appendLog, formatDate, lastLog } from '../state.js';

export function logAdd(cwd: string, layer: string, lines: string[], now: Date = new Date()): string[] {
  if (!lines.some((line) => line.trim() !== '')) throw new Error('--line を1つ以上指定する');
  const dir = requireStateDir(cwd);
  const date = formatDate(now);
  const text = appendLog(readState(dir, 'LOG.md') ?? '', { date, layer, lines });
  removeLeftoverTemps(dir);
  writeState(dir, 'LOG.md', text);
  return [`LOG.md に追記: ${date} ${layer.trim()}（${lastLog(text)?.lines.length ?? 0}行）`];
}
