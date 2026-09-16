import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { testFiles } from './helpers.js';

// `npm test` runs the compiled tests through this file instead of `node --test .test-dist/test/*.test.js`: npm runs scripts in
// cmd.exe on Windows, which expands no glob, and node takes a glob itself only from 21 on. Arguments after `npm test --` go to
// `node --test` before the files.
const run = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), ...testFiles(fileURLToPath(new URL('.', import.meta.url)))], {
  stdio: 'inherit',
});
if (run.error !== undefined) throw run.error;
process.exitCode = run.status ?? 1;
