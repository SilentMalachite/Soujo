// Diagrams for soujo map: PLAN.md as a vertical ASCII diagram, imports as Mermaid, and a directory tree. Pure functions only.
import { posix } from 'node:path';
import { nextLayer } from './state.js';
// One row per language. Only relative specifiers ("./", "../") become edges; packages are left out.
export const LANGUAGES = [
    { name: 'TypeScript/JavaScript', extensions: ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'], imports: /\b(?:from|import|require)\s*(?:\(\s*)?['"]([^'"\n]+)['"]/g },
];
const SKIPPED = new Set(['node_modules', 'dist']);
const RAIL = ' │  ';
const NO_RAIL = '    ';
// Code point order, so output does not depend on the locale.
function compare(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}
/** Directory entries map code never enters or lists: node_modules, dist, and names starting with ".". */
export function skipEntry(name) {
    return SKIPPED.has(name) || name.startsWith('.');
}
/** The language whose extensions include the file's, or undefined for unsupported files. */
export function languageOf(path) {
    const extension = posix.extname(path);
    return extension === '' ? undefined : LANGUAGES.find((language) => language.extensions.includes(extension));
}
/**
 * PLAN.md as two lines per layer: "[x] <layer>" (with " ←次" on the first unfinished one), then its completion condition
 * on the rail to the next layer. The last layer has no rail below it.
 */
export function planDiagram(items) {
    const next = nextLayer(items);
    return items.flatMap((item, index) => [
        `[${item.done ? 'x' : ' '}] ${item.layer}${item === next ? ' ←次' : ''}`,
        `${index < items.length - 1 ? RAIL : NO_RAIL}${item.condition || '未記入'}`,
    ]);
}
// The scanned file a relative specifier points to: as written, with a language extension swapped in or added
// ("./state.js" → "state.ts"), or its index file. Specifiers leaving the scanned directory resolve to nothing.
function resolveImport(from, specifier, language, known) {
    if (!/^\.\.?(?:\/|$)/.test(specifier))
        return undefined;
    const target = posix.join(posix.dirname(from), specifier);
    if (target === '..' || target.startsWith('../'))
        return undefined;
    const extension = posix.extname(target);
    const stem = language.extensions.includes(extension) ? target.slice(0, -extension.length) : target;
    const candidates = [
        target,
        ...language.extensions.map((ext) => `${stem}${ext}`),
        ...language.extensions.map((ext) => posix.join(target, `index${ext}`)),
    ];
    return candidates.find((candidate) => candidate !== from && known.has(candidate));
}
// Mermaid entity codes for characters that end a quoted label or read as markup.
function label(path) {
    return `"${path.replace(/["#<>]/g, (char) => `#${char.charCodeAt(0)};`)}"`;
}
/** Mermaid `graph LR` of the files in supported languages: one node per file, one edge per resolved relative import. */
export function importGraph(files) {
    const sources = files
        .flatMap((file) => {
        const language = languageOf(file.path);
        return language === undefined ? [] : [{ ...file, language }];
    })
        .sort((a, b) => compare(a.path, b.path));
    const ids = new Map(sources.map((file, index) => [file.path, `n${index}`]));
    const lines = ['graph LR', ...sources.map((file) => `  ${ids.get(file.path)}[${label(file.path)}]`)];
    for (const { path, text, language } of sources) {
        const targets = new Set();
        for (const match of text.matchAll(language.imports)) {
            const target = resolveImport(path, match[1] ?? '', language, ids);
            if (target !== undefined)
                targets.add(target);
        }
        for (const target of [...targets].sort(compare))
            lines.push(`  ${ids.get(path)} --> ${ids.get(target)}`);
    }
    return lines;
}
function renderFolder(folder, prefix) {
    const entries = [
        ...[...folder.folders.keys()].sort(compare).map((name) => ({ name, folder: folder.folders.get(name) })),
        ...[...folder.files].sort(compare).map((name) => ({ name, folder: undefined })),
    ];
    return entries.flatMap((entry, index) => {
        const last = index === entries.length - 1;
        const head = `${prefix}${last ? '└── ' : '├── '}${entry.name}${entry.folder ? '/' : ''}`;
        return entry.folder ? [head, ...renderFolder(entry.folder, `${prefix}${last ? '    ' : '│   '}`)] : [head];
    });
}
/** A directory tree of the files under "<name>/", folders first, each level in code point order. */
export function directoryTree(name, paths) {
    const root = { folders: new Map(), files: [] };
    for (const path of paths) {
        const parts = path.split('/');
        let folder = root;
        for (const part of parts.slice(0, -1)) {
            let child = folder.folders.get(part);
            if (child === undefined) {
                child = { folders: new Map(), files: [] };
                folder.folders.set(part, child);
            }
            folder = child;
        }
        folder.files.push(parts.at(-1) ?? '');
    }
    return [`${name}/`, ...renderFolder(root, '')];
}
