// soujo map plan / map code: PLAN.md as a vertical diagram, and a directory's imports as Mermaid (or its tree).
import { closeSync, fstatSync, openSync, readSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { findStateDir, foldsCase, pathKey } from '../files.js';
import { MAP_LIMITS, directoryTree, importGraph, mainLanguage, planDiagram, scanNotes, skipEntry, } from '../map.js';
import { NO_LAYERS, attempt, readPlan } from './shared.js';
export function mapPlan(cwd) {
    const items = readPlan(cwd);
    return items.length === 0 ? [NO_LAYERS] : planDiagram(items);
}
function reason(error) {
    return error.code ?? error.message;
}
function requireDirectory(root, shown) {
    let isDirectory;
    try {
        isDirectory = statSync(root).isDirectory();
    }
    catch (error) {
        const code = error.code;
        if (code === 'ENOENT' || code === 'ENOTDIR')
            throw new Error(`ディレクトリがない: ${shown}`);
        throw new Error(`ディレクトリを読めない: ${shown}（${reason(error)}）`);
    }
    if (!isDirectory)
        throw new Error(`ディレクトリではない: ${shown}`);
}
// Files and directories under root, breadth first so that a cut keeps the upper levels. Skipped names and symlinks
// (to files or directories) are left out entirely; unreadable subdirectories are counted and skipped.
function scanDirectory(root, shown, limit) {
    const scan = { files: [], dirs: [], unreadable: 0, truncated: false };
    const queue = [{ dir: root, prefix: '' }];
    for (const { dir, prefix } of queue) {
        let entries;
        try {
            entries = readdirSync(dir, { withFileTypes: true });
        }
        catch (error) {
            if (prefix === '')
                throw new Error(`ディレクトリを読めない: ${shown}（${reason(error)}）`);
            scan.unreadable += 1;
            continue;
        }
        entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
        for (const entry of entries) {
            if (skipEntry(entry.name) || !(entry.isFile() || entry.isDirectory()))
                continue;
            if (scan.files.length + scan.dirs.length >= limit) {
                scan.truncated = true;
                return scan;
            }
            const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
            if (entry.isFile())
                scan.files.push(path);
            else {
                scan.dirs.push(`${path}/`);
                queue.push({ dir: join(dir, entry.name), prefix: path });
            }
        }
    }
    return scan;
}
// Where a text's last line ends, so that what follows a cut — an unfinished line — is left out. A byte count cuts where it
// falls, and half of an `import './dependency.js';` reads as a whole `'./dep` that would be drawn as an edge of its own.
const LINE_ENDS = [0x0a, 0x0d, 0x2028, 0x2029].map((code) => String.fromCharCode(code));
function completeLines(text) {
    const last = Math.max(...LINE_ENDS.map((end) => text.lastIndexOf(end)));
    return last === -1 ? '' : text.slice(0, last + 1);
}
/**
 * Reads the whole of a file that fits within limit bytes, or its first limit bytes when it does not, saying which of the
 * two it was. What a cut file gives back ends at its last complete line: the cut lands where the byte count falls, inside
 * a character (which then reads as U+FFFD) or inside a token, and a file whose first limit bytes hold no line break at all
 * gives back nothing.
 *
 * One buffer serves every file, grown to what the largest so far needs and never beyond limit + 1, so a limit far above
 * any file costs only what the files themselves do. limit is a non-negative integer. A file that grows between its size
 * being read and its bytes being read is taken as the size said, and is not counted as cut by the limit.
 */
function headReader(limit) {
    let buffer = Buffer.alloc(0);
    return (path) => {
        const file = openSync(path, 'r');
        try {
            // One byte past what is kept, so that reading it is what tells a file at the limit from one beyond it.
            const want = Math.min(fstatSync(file).size, limit) + 1;
            if (buffer.length < want)
                buffer = Buffer.allocUnsafe(want);
            let read = 0;
            while (read < want) {
                const got = readSync(file, buffer, read, want - read, null);
                if (got === 0)
                    break;
                read += got;
            }
            const partial = read === want && want === limit + 1;
            const text = buffer.toString('utf8', 0, partial ? read - 1 : read);
            return { text: partial ? completeLines(text) : text, partial };
        }
        finally {
            closeSync(file);
        }
    };
}
/**
 * Whether dir is outside project, both taken by their real paths, since the scan follows a symlink given as dir, and compared
 * as the file system holding project compares names. A path whose real path cannot be found is taken as given.
 */
function isOutside(project, dir) {
    const real = (path) => {
        const found = attempt(() => realpathSync(path));
        return found instanceof Error ? resolve(path) : found;
    };
    const folds = foldsCase(project);
    const away = relative(pathKey(real(project), folds), pathKey(real(dir), folds));
    return away === '..' || away.startsWith(`..${sep}`) || isAbsolute(away);
}
/**
 * Mermaid of the imports in the main language under dir (default: the project root, or cwd outside Soujo projects);
 * a directory tree when that language has no import rules or no file is recognized. Unreadable files are counted and skipped,
 * and a file longer than the byte limit is read only to it and counted.
 */
export function mapCode(cwd, dir, limits = MAP_LIMITS) {
    const stateDir = findStateDir(cwd);
    const project = stateDir !== undefined ? dirname(stateDir) : resolve(cwd);
    const root = dir !== undefined ? resolve(cwd, dir) : project;
    const shown = dir ?? root;
    requireDirectory(root, shown);
    // A dir outside the project is read as asked, and said so first: what it holds is not the project's, and it may be as
    // large as the limits allow.
    const outside = isOutside(project, root) ? [`プロジェクトの外を読んだ: ${shown}`] : [];
    const scan = scanDirectory(root, shown, limits.entries);
    const main = mainLanguage(scan.files);
    const rules = main?.language.graph;
    if (main === undefined || rules === undefined) {
        const notes = [...outside, ...scanNotes({ ...scan, partial: 0 }, limits)];
        return directoryTree(basename(root) || '.', [...scan.dirs, ...scan.files], notes, limits);
    }
    const files = [];
    let unreadable = scan.unreadable;
    let partial = 0;
    // Rounded to a whole count of bytes, so a limit given as a fraction or a negative number reads what it can rather than
    // failing the command; one that is not a finite number names no amount to read, so the default stands. The note names
    // the limit that was applied.
    const bytes = Number.isFinite(limits.fileBytes) ? Math.max(Math.floor(limits.fileBytes), 0) : MAP_LIMITS.fileBytes;
    const readHead = headReader(bytes);
    for (const path of main.paths) {
        let head;
        try {
            head = readHead(join(root, path));
        }
        catch {
            unreadable += 1;
            continue;
        }
        if (head.partial)
            partial += 1;
        files.push({ path, imports: rules.imports(path, head.text) });
    }
    const notes = [...outside, ...scanNotes({ unreadable, truncated: scan.truncated, partial }, { ...limits, fileBytes: bytes })];
    // Paths are compared the way the file system holding the scanned files compares them, asked once per run of a file that
    // was scanned rather than of root, whose own name a mount boundary can have another file system answer for. Always in
    // NFC, since a file system may hand back either normal form for one name, and in one letter case only where it folds it.
    const folds = foldsCase(join(root, main.paths[0] ?? ''));
    return importGraph(rules, files, notes, limits, (path) => pathKey(path, folds));
}
