// Finding .soujo/ and reading/writing its files. Thin I/O layer: no parsing or validation here.
import { closeSync, existsSync, fchmodSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync, } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
export const STATE_DIR = '.soujo';
export const STATE_FILES = ['SPEC.md', 'PLAN.md', 'LOG.md', 'NEXT.md'];
/** The state file relative to the project root, e.g. ".soujo/PLAN.md". */
export function statePath(file) {
    return `${STATE_DIR}/${file}`;
}
export const STATE_PATHS = STATE_FILES.map(statePath);
function isDirectory(path) {
    try {
        return statSync(path).isDirectory();
    }
    catch {
        return false;
    }
}
export function isSymlink(path) {
    try {
        return lstatSync(path).isSymbolicLink();
    }
    catch {
        return false;
    }
}
/**
 * Where git tracks the state file, relative to root: the symlink target when the file is a symlink (root resolved too,
 * so /tmp and /private/tmp compare equal), otherwise ".soujo/<file>".
 */
export function trackedStatePath(root, file) {
    const path = join(root, statePath(file));
    if (!isSymlink(path))
        return statePath(file);
    try {
        return relative(realpathSync(root), realpathSync(path)).split(sep).join('/');
    }
    catch {
        return statePath(file);
    }
}
/**
 * The nearest .soujo/ directory from start upward, or undefined outside Soujo projects.
 * The search stops at the git top level (a directory with .git), so a nested repository never uses an outer project.
 */
export function findStateDir(start = process.cwd()) {
    let dir = resolve(start);
    for (;;) {
        const candidate = join(dir, STATE_DIR);
        if (isDirectory(candidate))
            return candidate;
        if (existsSync(join(dir, '.git')))
            return undefined;
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
export function requireState(dir, file) {
    const text = readState(dir, file);
    if (text === undefined)
        throw new Error(`${file} がない（soujo init で作る）`);
    return text;
}
/** Where writeState writes the file. Throws when .soujo/ or the project cannot be resolved. */
export function stateTarget(dir, file) {
    const path = join(dir, file);
    const real = existsSync(path) ? realpathSync(path) : join(realpathSync(dir), file);
    const inProject = relative(realpathSync(dirname(dir)), real);
    if (inProject === '..' || inProject.startsWith(`..${sep}`) || isAbsolute(inProject))
        return { path: real, problem: 'プロジェクトの外' };
    if (inProject.split(sep).includes('.git'))
        return { path: real, problem: '.git の中' };
    return { path: real };
}
// writeState's temporary file for target: ".<name>.<pid>.tmp" next to it.
function isTempOf(target, name) {
    const prefix = `.${basename(target)}.`;
    return name.startsWith(prefix) && /^\d+\.tmp$/.test(name.slice(prefix.length));
}
function modeOf(path) {
    try {
        return statSync(path).mode & 0o7777;
    }
    catch {
        return undefined;
    }
}
/**
 * Replaces the file via a temporary file and rename, so an interruption never leaves it half-written. Symlinks are kept,
 * but only followed to files inside the project and outside .git, so a symlink planted in a repository cannot overwrite
 * other files. The temporary file is created exclusively, never through an existing entry, and gets the file's permissions.
 */
export function writeState(dir, file, text) {
    let target;
    try {
        target = stateTarget(dir, file);
    }
    catch (error) {
        throw new Error(`${file} を書けない: ${error.message}`);
    }
    if (target.problem !== undefined)
        throw new Error(`${file} を書かない: 実体（symlink の先）が${target.problem}`);
    const temp = join(dirname(target.path), `.${basename(target.path)}.${process.pid}.tmp`);
    let created = false;
    try {
        const mode = modeOf(target.path);
        const fd = openSync(temp, 'wx', mode ?? 0o666);
        created = true;
        try {
            writeFileSync(fd, text);
            if (mode !== undefined)
                fchmodSync(fd, mode);
        }
        finally {
            closeSync(fd);
        }
        renameSync(temp, target.path);
    }
    catch (error) {
        try {
            if (created)
                rmSync(temp, { force: true });
        }
        catch {
            // Cleanup is best effort; report the original failure.
        }
        throw new Error(`${file} を書けない: ${error.message}`);
    }
}
/** Deletes temporary files (or symlinks in their place) that a killed writeState left behind, so that `git add -A` never commits them. */
export function removeLeftoverTemps(dir) {
    for (const file of STATE_FILES) {
        let target;
        let entries;
        try {
            target = stateTarget(dir, file);
            if (target.problem !== undefined)
                continue;
            entries = readdirSync(dirname(target.path), { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            if ((entry.isFile() || entry.isSymbolicLink()) && isTempOf(target.path, entry.name)) {
                rmSync(join(dirname(target.path), entry.name), { force: true });
            }
        }
    }
}
export function ensureStateDir(root) {
    const dir = join(root, STATE_DIR);
    try {
        mkdirSync(dir, { recursive: true });
    }
    catch (error) {
        throw new Error(`${STATE_DIR}/ を作れない: ${error.message}`);
    }
    return dir;
}
/** Creates the file only when nothing exists at path. Returns false when it already exists. */
export function createFile(path, text) {
    try {
        writeFileSync(path, text, { flag: 'wx' });
        return true;
    }
    catch (error) {
        if (error.code === 'EEXIST')
            return false;
        throw new Error(`${basename(path)} を作れない: ${error.message}`);
    }
}
/** The soujo package root: the nearest directory with package.json above this module (dist/ or .test-dist/src/). */
export function packageDir() {
    let dir = dirname(fileURLToPath(import.meta.url));
    for (;;) {
        if (existsSync(join(dir, 'package.json')))
            return dir;
        const parent = dirname(dir);
        if (parent === dir)
            throw new Error('soujo の package.json が見つからない');
        dir = parent;
    }
}
export function readTemplate(name) {
    return readFileSync(join(packageDir(), 'templates', name), 'utf8');
}
