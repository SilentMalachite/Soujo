// Finding .soujo/ and reading/writing its files. Thin I/O layer: file contents are neither parsed nor validated here. What is
// checked is where a name and a symlink lead (months through state.ts), so that no read or write leaves the project, enters
// .git, or lands on another state file.
import { closeSync, existsSync, fchmodSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, statSync, writeFileSync, } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMonth, requireMonth } from './state.js';
export const STATE_DIR = '.soujo';
export const STATE_FILES = ['SPEC.md', 'PLAN.md', 'LOG.md', 'NEXT.md'];
const ARCHIVE = /^LOG-(.+)\.md$/;
// A temporary file of writeState, named after the file it replaces.
const TEMP = /^\.(.+)\.\d+\.tmp$/;
function isArchive(name) {
    return isMonth(ARCHIVE.exec(name)?.[1] ?? '');
}
function isStateFile(name) {
    return STATE_FILES.includes(name) || isArchive(name);
}
function requireStateFile(file) {
    if (!isStateFile(file))
        throw new Error(`状態ファイルの名前ではない: ${file}`);
}
/** The archive of month (YYYY-MM); anything else throws, so a name can never leave .soujo/. */
export function archiveFile(month) {
    return `LOG-${requireMonth(month)}.md`;
}
/** The month (YYYY-MM) of an archive. */
export function archiveMonth(file) {
    requireStateFile(file);
    return ARCHIVE.exec(file)?.[1] ?? '';
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
        .filter(isArchive)
        .sort();
}
/** The state file relative to the project root, e.g. ".soujo/PLAN.md". */
export function statePath(file) {
    requireStateFile(file);
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
 * The parts of the path, relative to root, where a symlink at path (relative to root, "/"-separated) with the link text link
 * points; they may include "." and "..". A relative link is joined to the symlink's directory unresolved, since a part before
 * ".." may itself be a symlink, and split at separator as well as "/" (Windows splits at "\" too). An absolute one is taken
 * through the real paths of root and of the link's directory, so /tmp and /private/tmp compare equal.
 */
export function symlinkTargetParts(root, path, link, separator = sep) {
    if (!isAbsolute(link))
        return [...posix.dirname(path).split('/'), ...link.split(separator).flatMap((part) => part.split('/'))];
    const target = join(realPathOfAncestor(dirname(link)), basename(link));
    return relative(realPathOfAncestor(root), target).split(sep);
}
// The directories under which hosts keep install caches and marketplace clones of plugins, this repository included (SPEC §8).
const PLUGIN_DIRS = ['.claude', '.codex'];
// The real path of dir. When a part cannot be resolved (missing, unreadable, or a symlink loop), the real path of the nearest
// ancestor that can be, with the rest of the absolute path appended, so that a symlink before that part is still followed.
function realPathOfAncestor(dir) {
    const rest = [];
    let path = resolve(dir);
    for (;;) {
        try {
            return join(realpathSync(path), ...rest);
        }
        catch {
            const parent = dirname(path);
            if (parent === path)
                return resolve(dir);
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
export function pluginDir(dir) {
    const segments = realPathOfAncestor(dir).split(sep).map((segment) => segment.toLowerCase());
    const index = segments.findIndex((segment, i) => PLUGIN_DIRS.includes(segment) && segments[i + 1] === 'plugins');
    return index === -1 ? undefined : `${segments[index]}/plugins`;
}
/**
 * The nearest .soujo/ directory from start upward, or undefined outside Soujo projects and inside a host plugin directory,
 * whose copy of Soujo carries this repository's .soujo/.
 * The search stops at the git top level (a directory with .git), so a nested repository never uses an outer project.
 */
export function findStateDir(start) {
    if (pluginDir(start) !== undefined)
        return undefined;
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
/** The state directory of the project above start; throws outside Soujo projects. start is always given: cli.ts reports a
 * current directory it cannot read itself, instead of letting process.cwd() throw here. */
export function requireStateDir(start) {
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
    // A problem only writing has (a dangling symlink leading to a file not created yet) leaves nothing to read through.
    if (target.problem !== undefined && target.problem.whenWritten !== true)
        throw new Error(`${file} を読まない: ${target.problem.text}`);
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
// The names a file system may hand to .git, which git itself refuses through core.protectNTFS and core.protectHFS: the code
// points HFS+ leaves out of a name, the stream and the trailing dots and spaces NTFS drops, and the 8.3 short name.
const HFS_IGNORED = /[‌-‏‪-‮⁪-⁯﻿]/g;
/** Whether a path part names .git, in any letter case and under any of the names a file system may accept for it. */
export function isDotGit(part) {
    const name = (part.replace(HFS_IGNORED, '').split(':')[0] ?? '').replace(/[. ]+$/, '').toLowerCase();
    return name === '.git' || /^git~\d+$/.test(name);
}
// The characters a path in a message ends at; a name may hold anything else, so "/p/aya" is not the start of "/p/ayaka".
// Control characters end a path too, since hideHome runs before printable flattens them into a space that \s would match.
const PATH_END = String.raw `[/\\\s'"\`)\]}）」、。,:;<>：； --]|$`;
// A directory no path can be shown under: a file system root, a drive, or a UNC share, which would turn every path into "~".
const ROOT = /^$|^[A-Za-z]:$|^[\\/]{2}[^\\/]*([\\/]+[^\\/]*)?$/;
// The separators of an escaped path, so that the same directory matches however the spelling of a message separates it.
const SEPARATOR = /\\\\|\//g;
function escaped(text) {
    return text.replace(/[\\^$.*+?()[\]{}|]/g, String.raw `\$&`);
}
/**
 * text with home shown as "~" (SPEC §6), so that a line copied out of a terminal carries no user name. Only a whole path
 * matches, in either normalization, since a file system may store either, with either separator, since Node and git print
 * both on Windows, and in either letter case only where the file system ignores case. A root, or no home directory, leaves
 * text as it is.
 */
export function hideHome(text, home, foldCase) {
    const root = (home ?? '').replace(/[\\/]+$/, '');
    if (ROOT.test(root))
        return text;
    const spellings = [...new Set([root.normalize('NFC'), root.normalize('NFD')])];
    const paths = spellings.map((spelling) => escaped(spelling).replace(SEPARATOR, String.raw `[\\/]`));
    return text.replace(new RegExp(`(?:${paths.join('|')})(?=${PATH_END})`, foldCase ? 'gi' : 'g'), '~');
}
/**
 * The home directory as a path in a message spells it, and how this file system compares it; undefined when the environment
 * has none, which leaves a message as it is. Measured rather than guessed, as .soujo/ paths are (see foldsCase).
 */
export function homePath() {
    try {
        const home = homedir();
        return [home, foldsCase(home)];
    }
    catch {
        return [undefined, false];
    }
}
// What the current platform usually does, for a directory whose file system cannot be asked.
const LIKELY_FOLDS_CASE = process.platform === 'darwin' || process.platform === 'win32';
/**
 * Whether the file system compares paths at dir ignoring letter case. Measured where it can be: the platform decides when
 * dir is gone or unreadable, or its name reads the same in another letter case.
 */
export function foldsCase(dir) {
    return ignoresCase(dir) ?? LIKELY_FOLDS_CASE;
}
/** How paths are compared: in NFC, since a file system may store either form, and in one letter case only where it ignores case. */
export function pathKey(path, foldCase) {
    const normalized = path.normalize('NFC');
    return foldCase ? normalized.toLowerCase() : normalized;
}
/**
 * Whether two identities are one file: the same inode, confirmed by the path or by size and creation time, since inodes are
 * neither unique nor stable everywhere. Files that do not exist are one when they would be created at the same path.
 */
export function sameFile(a, b) {
    if (a.inode !== undefined && a.inode === b.inode)
        return a.key === b.key || (a.size === b.size && a.birthtime === b.birthtime);
    return a.key === b.key;
}
// The most symlinks followed for one path before taking it as a loop, as Linux does.
export const MAX_SYMLINKS = 40;
function attempt(step) {
    try {
        return step();
    }
    catch {
        return undefined;
    }
}
/**
 * The paths the entry at path (relative to root, "/"-separated) leads through, in order, each part resolved in turn and every
 * symlink on the way followed, as the operating system does, so that ".." after a symlink is taken from where that points.
 * The last one is where it lands, which need not exist. Empty beyond MAX_SYMLINKS, as for a loop.
 */
function pathLeadsTo(root, path) {
    const visited = [];
    const pending = path.split('/');
    let dir = '';
    for (let links = 0; pending.length > 0;) {
        const part = pending.shift() ?? '';
        if (part === '' || part === '.')
            continue;
        const next = posix.join(dir, part);
        if (part === '..') {
            dir = next === '.' ? '' : next;
            continue;
        }
        const full = join(root, ...next.split('/'));
        visited.push(full);
        if (isSymlink(full)) {
            if (++links > MAX_SYMLINKS)
                return [];
            const link = attempt(() => readlinkSync(full));
            if (link === undefined)
                return visited;
            pending.unshift(...symlinkTargetParts(root, next, link));
            dir = '';
        }
        else if (pending.length === 0) {
            return visited;
        }
        else {
            dir = next;
        }
    }
    return visited;
}
// Whether the file system of dir ignores letter case, told by looking for dir itself under an upper-cased name.
// undefined when that cannot be told: the name is the same upper-cased, or dir itself cannot be read.
function ignoresCase(dir) {
    const upper = join(dirname(dir), basename(dir).toUpperCase());
    if (upper === dir)
        return undefined;
    const own = attempt(() => statSync(dir, { bigint: true }));
    if (own === undefined)
        return undefined;
    const other = attempt(() => statSync(upper, { bigint: true }));
    return other !== undefined && own.dev === other.dev && own.ino === other.ino;
}
function identityOf(dir, file, foldCase) {
    const path = join(dir, file);
    const link = isSymlink(path) ? true : undefined;
    if (existsSync(path)) {
        const { dev, ino, size, birthtimeMs } = statSync(path, { bigint: true });
        const inode = ino === 0n ? undefined : `${dev}:${ino}`;
        return { key: pathKey(realpathSync(path), foldCase), inode, size, birthtime: birthtimeMs, link };
    }
    const own = { key: pathKey(join(realpathSync(dir), file), foldCase), link };
    if (link === undefined)
        return own;
    return { ...own, leadsTo: pathLeadsTo(realpathSync(dirname(dir)), `${basename(dir)}/${file}`) };
}
/** The identities of the state files, the archives in .soujo/, and extra, so that stateTarget can check them all at once. */
export function stateIdentities(dir, extra = []) {
    // Where it cannot be told, paths are compared as they are spelled, as a file system that keeps case does.
    const foldCase = ignoresCase(dir) ?? false;
    const of = new Map();
    for (const file of new Set([...STATE_FILES, ...archiveFiles(dir), ...extra])) {
        // A file that cannot be resolved is left out; reading or writing it fails by itself.
        const identity = attempt(() => identityOf(dir, file, foldCase));
        if (identity !== undefined)
            of.set(file, identity);
    }
    return { foldCase, of };
}
/**
 * Where writeState writes the file, and why it must not be written (or, unless whenWritten is set, read): its real path is
 * outside the project or inside .git, or it is another state file or archive (see sameStateFile). Throws when .soujo/ or the
 * project cannot be resolved. Pass known from stateIdentities to check several files without resolving the others each time.
 */
export function stateTarget(dir, file, known) {
    requireStateFile(file);
    const path = join(dir, file);
    const real = existsSync(path) ? realpathSync(path) : join(realpathSync(dir), file);
    const inProject = relative(realpathSync(dirname(dir)), real);
    const elsewhere = (where) => ({ path: real, problem: { text: `実体（symlink の先）が${where}`, elsewhere: true } });
    if (inProject === '..' || inProject.startsWith(`..${sep}`) || isAbsolute(inProject))
        return elsewhere('プロジェクトの外');
    if (inProject.split(sep).some(isDotGit))
        return elsewhere('.git の中');
    const problem = sameStateFile(dir, file, known ?? stateIdentities(dir, [file]));
    return problem === undefined ? { path: real } : { path: real, problem };
}
/**
 * Why the file is another state file or archive in .soujo/: they are one file (a symlink, a differently cased path, or a hard
 * link), so reading one returns the other's contents and writing one overwrites them; or one of them is a dangling symlink
 * leading to where the other is created, which the next write would then go through. Refusing both keeps a command writing
 * several of them, as layer done and log rotate do, from overwriting what it has just written.
 */
function sameStateFile(dir, file, known) {
    const { foldCase, of } = known;
    const own = of.get(file) ?? attempt(() => identityOf(dir, file, foldCase));
    if (own === undefined)
        return undefined;
    const leads = (identity, key) => identity.leadsTo?.some((step) => pathKey(step, foldCase) === key) === true;
    for (const [other, them] of of) {
        if (other === file)
            continue;
        if (sameFile(own, them))
            return { text: sameText(own, them, other) };
        if (leads(own, them.key))
            return ledTo(other);
        if (leads(them, own.key))
            return { text: `場所が ${other}（壊れた symlink）の先と同じ`, whenWritten: true };
    }
    // A state file with no entry in .soujo/ yet has no identity to compare, so its name in .soujo/ is what tells it.
    const led = (own.leadsTo ?? []).map((step) => namedStateFile(dir, step, foldCase)).find((name) => name !== undefined && name !== file);
    return led === undefined ? undefined : ledTo(led);
}
function ledTo(other) {
    return { text: `壊れた symlink の先が ${other}（まだ無い）と同じ`, whenWritten: true };
}
// The state file path is, when it is in .soujo/ (dir): its name there, spelled as Soujo writes it where the file system
// ignores letter case, or undefined when it names no state file.
function namedStateFile(dir, path, foldCase) {
    const real = attempt(() => realpathSync(dir));
    if (real === undefined || pathKey(dirname(path), foldCase) !== pathKey(real, foldCase))
        return undefined;
    const name = basename(path);
    if (isStateFile(name))
        return name;
    if (!foldCase)
        return undefined;
    const known = STATE_FILES.find((file) => file.toLowerCase() === name.toLowerCase());
    if (known !== undefined)
        return known;
    const month = /^log-(.+)\.md$/i.exec(name)?.[1] ?? '';
    return isMonth(month) ? archiveFile(month) : undefined;
}
// Names the symlink, so that what has to be changed is the file named; without one, a hard link is what is left.
function sameText(own, them, other) {
    if (own.link === true)
        return `実体（symlink の先）が ${other} と同じ`;
    if (them.link === true)
        return `実体が ${other}（symlink）の先と同じ`;
    return `実体が ${other} と同じ（hard link）`;
}
// The temporary file writeState and createFile use for target: ".<name>.<pid>.tmp" next to it.
function tempOf(target) {
    return join(dirname(target), `.${basename(target)}.${process.pid}.tmp`);
}
// The pid in the name of a temporary file of target, or undefined when the name is not one of its temporary files at all.
// A number no process of ours can have (a leading zero, or past the safe integer range) is NaN, which isRunning takes as
// not running, so that the file is still deleted as a leftover rather than left for `git add -A` to commit.
function tempPid(target, name) {
    const prefix = `.${basename(target)}.`;
    if (!name.startsWith(prefix))
        return undefined;
    const digits = /^(\d+)\.tmp$/.exec(name.slice(prefix.length))?.[1];
    if (digits === undefined)
        return undefined;
    const pid = Number(digits);
    return Number.isSafeInteger(pid) && String(pid) === digits ? pid : Number.NaN;
}
/**
 * Whether a process with pid is running, so that a temporary file it may still be writing is left where it is. The own pid
 * is not one: by the time leftovers are removed, a write of this process has either finished or cleaned up after itself.
 * The pid says this only on the machine and in the pid namespace that wrote it: across a shared mount (NFS, SMB, a bind
 * mount into a container) the number belongs to another process table, and a pid the system has since handed out again
 * keeps a leftover of a killed write for as long as the new process lives.
 */
export function isRunning(pid) {
    if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid)
        return false;
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        // EPERM: the process is there, it just belongs to someone else.
        return error.code === 'EPERM';
    }
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
 * but only followed where stateTarget allows (inside the project, outside .git, not another state file), so a symlink planted
 * in a repository cannot overwrite other files. The temporary file is created exclusively, never through an existing entry,
 * and gets the file's permissions.
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
        throw new Error(`${file} を書かない: ${target.problem.text}`);
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
// The temporary files (or symlinks in their place) of target that a killed write left next to it, as absolute paths. One
// named after a process that is still running is left out: that process may be writing it right now. Pass running for every
// temporary file whatever wrote it, which is what the commit checks exclude from the working tree.
function tempsOf(target, running = false) {
    let entries;
    try {
        entries = readdirSync(dirname(target), { withFileTypes: true });
    }
    catch {
        return [];
    }
    return entries
        .filter((entry) => {
        if (!entry.isFile() && !entry.isSymbolicLink())
            return false;
        const pid = tempPid(target, entry.name);
        return pid !== undefined && (running || !isRunning(pid));
    })
        .map((entry) => join(dirname(target), entry.name));
}
/** Deletes the temporary files (or symlinks in their place) of target that a killed write left next to it. */
export function removeTempsOf(target) {
    for (const path of tempsOf(target))
        rmSync(path, { force: true });
}
// The leftovers of the four state files, and of archives that exist or whose temporary file is in .soujo/; none next to a
// target outside the project or inside .git. A target that is another state file is still inside the project, so its leftovers
// are deleted as before; leaving them would let `git add -A` commit them.
function leftoverTempPaths(dir, running = false) {
    const named = entryNames(dir).flatMap((name) => TEMP.exec(name)?.[1] ?? []).filter(isArchive);
    const files = [...new Set([...STATE_FILES, ...archiveFiles(dir), ...named])];
    const known = attempt(() => stateIdentities(dir, files));
    return files.flatMap((file) => {
        try {
            const target = stateTarget(dir, file, known);
            return target.problem?.elsewhere === true ? [] : tempsOf(target.path, running);
        }
        catch {
            return [];
        }
    });
}
function relativeTemps(dir, running) {
    const paths = leftoverTempPaths(dir, running);
    if (paths.length === 0)
        return [];
    const root = realpathSync(dirname(dir));
    return paths.map((path) => relative(root, path).split(sep).join('/'));
}
/** The temporary files removeLeftoverTemps would delete, relative to the project root (the directory above .soujo/), with "/". */
export function leftoverTemps(dir) {
    return relativeTemps(dir, false);
}
/**
 * Every temporary file of a state file or archive, the ones a running write owns included, so that a command checking for
 * uncommitted changes counts none of them: the ones it will delete, nor the ones it leaves for another soujo to finish.
 */
export function stateTemps(dir) {
    return relativeTemps(dir, true);
}
/**
 * Deletes temporary files (or symlinks in their place) that a killed writeState left behind, so that `git add -A` does not
 * commit them: those of the four state files, and those of archives that exist or whose temporary file is in .soujo/. One
 * named after a process that is still running is kept, since another soujo may be writing it — a commit made while it is
 * there takes it along, which is the price of not deleting a write in progress.
 */
export function removeLeftoverTemps(dir) {
    for (const path of leftoverTempPaths(dir))
        rmSync(path, { force: true });
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
/**
 * Puts temp at path unless anything, a dangling symlink included, is there; false says something was. A hard link fails by
 * itself in that case, and where hard links cannot be made (FAT, exFAT, and some FUSE and SMB mounts) temp is copied into a
 * file opened exclusively there, which fails the same way, rather than renamed, which would replace an entry appearing in
 * between. Either refusal is the operating system's, at the moment of writing, not a check made beforehand that an entry
 * could slip past. link is the hard link; a test standing in for a file system without them passes one that fails.
 */
export function place(temp, path, link = linkSync) {
    try {
        link(temp, path);
        return true;
    }
    catch (error) {
        if (error.code === 'EEXIST')
            return false;
        return copyExclusively(temp, path);
    }
}
// Copies temp into a file this call creates at path and nowhere else: "wx" opens it exclusively, so anything already there
// (a directory or a dangling symlink included) fails with EEXIST and is left untouched. Only once that open has succeeded
// is the file ours to delete, which is what a write failing halfway leaves behind; a failure to open deletes nothing, since
// what is at path then belongs to whoever put it there. Only a killed process can leave a half-written file, and only here.
function copyExclusively(temp, path) {
    let fd;
    try {
        fd = openSync(path, 'wx');
    }
    catch (error) {
        if (error.code === 'EEXIST')
            return false;
        throw error;
    }
    try {
        writeFileSync(fd, readFileSync(temp));
    }
    catch (error) {
        closeSync(fd);
        try {
            rmSync(path, { force: true });
        }
        catch {
            // Cleanup is best effort; report the copy's failure.
        }
        throw error;
    }
    closeSync(fd);
    return true;
}
/**
 * Creates the file only when nothing exists at path; returns false when something does. Nothing is written at all when the
 * entry is already there, so a directory that has every file it would be given may be read-only. Otherwise the text is
 * written to an exclusive temporary file first, as writeState does, and linked into place, so an interruption never leaves
 * the file half-written — except where hard links cannot be made and place has to copy (see there).
 * Temporary files a killed write left next to path are not cleared here: the caller (init) removes them beforehand.
 */
export function createFile(path, text) {
    if (hasEntry(path))
        return false;
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
