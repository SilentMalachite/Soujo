// Finding .soujo/ and reading/writing its files. Thin I/O layer: no parsing or validation here.
import { existsSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
export const STATE_DIR = '.soujo';
function isDirectory(path) {
    try {
        return statSync(path).isDirectory();
    }
    catch {
        return false;
    }
}
/** The nearest .soujo/ directory from start upward, or undefined outside Soujo projects. */
export function findStateDir(start = process.cwd()) {
    let dir = resolve(start);
    for (;;) {
        const candidate = join(dir, STATE_DIR);
        if (isDirectory(candidate))
            return candidate;
        const parent = dirname(dir);
        if (parent === dir)
            return undefined;
        dir = parent;
    }
}
export function requireStateDir(start = process.cwd()) {
    const dir = findStateDir(start);
    if (dir === undefined)
        throw new Error(`${STATE_DIR}/ が見つからない（soujo init で作る）`);
    return dir;
}
/** File contents, or undefined when the file does not exist. */
export function readState(dir, file) {
    try {
        return readFileSync(join(dir, file), 'utf8');
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return undefined;
        throw new Error(`${file} を読めない: ${error.message}`);
    }
}
/** Replaces the file via a temporary file and rename, so an interruption never leaves it half-written. Symlinks are kept. */
export function writeState(dir, file, text) {
    const path = join(dir, file);
    const target = existsSync(path) ? realpathSync(path) : path;
    const temp = join(dirname(target), `.${basename(target)}.${process.pid}.tmp`);
    try {
        writeFileSync(temp, text);
        renameSync(temp, target);
    }
    catch (error) {
        rmSync(temp, { force: true });
        throw new Error(`${file} を書けない: ${error.message}`);
    }
}
