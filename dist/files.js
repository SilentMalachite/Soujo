// Finding .soujo/ and reading/writing its files. Thin I/O layer: no parsing or validation here.
import { closeSync, existsSync, fchmodSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync, } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
export const STATE_DIR = '.soujo';
export const STATE_FILES = ['SPEC.md', 'PLAN.md', 'LOG.md', 'NEXT.md'];
const ARCHIVE = /^LOG-(\d{4}-\d{2})\.md$/;
// A temporary file of writeState for an archive, named after it.
const ARCHIVE_TEMP = /^\.(LOG-\d{4}-\d{2}\.md)\.\d+\.tmp$/;
/** The pathspec (git glob) of every archive, relative to the project root. */
export const ARCHIVE_PATHSPEC = `${STATE_DIR}/LOG-[0-9][0-9][0-9][0-9]-[0-9][0-9].md`;
/** The archive of month (YYYY-MM); anything else throws, so a name can never leave .soujo/. */
export function archiveFile(month) {
    const file = `LOG-${month}.md`;
    if (!ARCHIVE.test(file))
        throw new Error(`月は YYYY-MM: ${month}`);
    return file;
}
/** The month (YYYY-MM) of an archive. */
export function archiveMonth(file) {
    return ARCHIVE.exec(file)?.[1] ?? '';
}
function isStateFile(name) {
    return STATE_FILES.includes(name) || ARCHIVE.test(name);
}
function entryNames(dir) {
    try {
        return readdirSync(dir);
    }
    catch {
        return [];
    }
}
/** The archives in .soujo/ (a symlink or any other entry with an archive's name included), sorted by name. */
export function archiveFiles(dir) {
    return entryNames(dir)
        .filter((name) => ARCHIVE.test(name))
        .sort();
}
/** The state file relative to the project root, e.g. ".soujo/PLAN.md". */
export function statePath(file) {
    return `${STATE_DIR}/${file}`;
}
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
function isMissing(error) {
    return error.code === 'ENOENT';
}
/**
 * File contents, or undefined when the file (or .soujo/) does not exist. Symlinks are followed only as writeState follows
 * them, so a symlink planted in a repository cannot put other files into hook output or warnings, and only regular files
 * are read, so a FIFO or device cannot block a hook.
 */
export function readState(dir, file) {
    let target;
    try {
        target = stateTarget(dir, file);
    }
    catch (error) {
        if (isMissing(error))
            return undefined;
        throw new Error(`${file} を読めない: ${error.message}`);
    }
    if (target.problem !== undefined)
        throw new Error(`${file} を読まない: 実体（symlink の先）が${target.problem}`);
    try {
        if (!statSync(target.path).isFile())
            throw new Error('通常のファイルではない');
        return readFileSync(target.path, 'utf8');
    }
    catch (error) {
        if (isMissing(error))
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
    if (!isStateFile(file))
        throw new Error(`状態ファイルの名前ではない: ${file}`);
    const path = join(dir, file);
    const real = existsSync(path) ? realpathSync(path) : join(realpathSync(dir), file);
    const inProject = relative(realpathSync(dirname(dir)), real);
    if (inProject === '..' || inProject.startsWith(`..${sep}`) || isAbsolute(inProject))
        return { path: real, problem: 'プロジェクトの外' };
    if (inProject.split(sep).includes('.git'))
        return { path: real, problem: '.git の中' };
    return { path: real };
}
// The temporary file writeState and createFile use for target: ".<name>.<pid>.tmp" next to it.
function tempOf(target) {
    return join(dirname(target), `.${basename(target)}.${process.pid}.tmp`);
}
function isTempOf(target, name) {
    const prefix = `.${basename(target)}.`;
    return name.startsWith(prefix) && /^\d+\.tmp$/.test(name.slice(prefix.length));
}
// Anything at path, a dangling symlink included (existsSync follows symlinks).
function hasEntry(path) {
    try {
        lstatSync(path);
        return true;
    }
    catch {
        return false;
    }
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
    const temp = tempOf(target.path);
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
/** Deletes the temporary files (or symlinks in their place) of target that a killed write left next to it. */
export function removeTempsOf(target) {
    let entries;
    try {
        entries = readdirSync(dirname(target), { withFileTypes: true });
    }
    catch {
        return;
    }
    for (const entry of entries) {
        if ((entry.isFile() || entry.isSymbolicLink()) && isTempOf(target, entry.name)) {
            rmSync(join(dirname(target), entry.name), { force: true });
        }
    }
}
/**
 * Deletes temporary files (or symlinks in their place) that a killed writeState left behind, so that `git add -A` never commits
 * them: those of the four state files, and those of archives that exist or whose temporary file is in .soujo/.
 */
export function removeLeftoverTemps(dir) {
    const temps = entryNames(dir).flatMap((name) => ARCHIVE_TEMP.exec(name)?.[1] ?? []);
    const archives = new Set([...archiveFiles(dir), ...temps]);
    for (const file of [...STATE_FILES, ...archives]) {
        let target;
        try {
            target = stateTarget(dir, file);
        }
        catch {
            continue;
        }
        if (target.problem === undefined)
            removeTempsOf(target.path);
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
// Puts temp at path unless anything, a dangling symlink included, is there. A hard link fails in that case by itself;
// file systems without hard links (FAT, exFAT) rename instead, which replaces, so only after checking that nothing is there.
function place(temp, path) {
    try {
        linkSync(temp, path);
        return true;
    }
    catch (error) {
        if (error.code === 'EEXIST' || hasEntry(path))
            return false;
        renameSync(temp, path);
        return true;
    }
}
/**
 * Creates the file only when nothing exists at path; returns false when something does. The text is written to an exclusive
 * temporary file first, as writeState does, so an interruption never leaves the file empty or half-written.
 */
export function createFile(path, text) {
    const temp = tempOf(path);
    let created = false;
    try {
        writeFileSync(temp, text, { flag: 'wx' });
        created = true;
        return place(temp, path);
    }
    catch (error) {
        throw new Error(`${basename(path)} を作れない: ${error.message}`);
    }
    finally {
        try {
            if (created)
                rmSync(temp, { force: true });
        }
        catch {
            // Cleanup is best effort; a leftover is removed by the next init.
        }
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
