#!/usr/bin/env node
// Entry point: parses arguments, runs the command, prints its lines to stdout, and turns any error into one stderr line with exit 1.
import { homedir } from 'node:os';
import { parseArgs } from 'node:util';
import { brief } from './commands/brief.js';
import { close } from './commands/close.js';
import { init } from './commands/init.js';
import { layerDone } from './commands/layer.js';
import { logAdd, logRotate } from './commands/log.js';
import { mapCode, mapPlan } from './commands/map.js';
import { nextCheck, nextSet, nextShow } from './commands/next.js';
import { planList, planNext } from './commands/plan.js';
import { resume } from './commands/resume.js';
import { foldsCase, hideHome, pluginDir } from './files.js';
import { printable } from './state.js';
const HELP_HINT = '（soujo --help で一覧）';
function usageError(usage) {
    return new Error(`使い方: soujo ${usage}`);
}
// Exactly count positionals, or from count to max when max is given.
function expectPositionals(positionals, count, usage, max = count) {
    if (positionals.length < count || positionals.length > max)
        throw usageError(usage);
}
function noArguments(usage, run) {
    return {
        usage,
        run: (args, cwd) => {
            const { positionals } = parseArgs({ args, allowPositionals: true });
            expectPositionals(positionals, 0, usage);
            return run(cwd);
        },
    };
}
// Keys are "<word>" or "<word> <word>"; two-word keys are matched first. The order is the order of --help.
const COMMANDS = {
    init: noArguments('init', init),
    'next show': {
        usage: 'next show [--hook]',
        // Without --hook it refuses there, instead of pointing to soujo init, which is refused there too.
        hook: (args) => options(args).includes('--hook'),
        run: (args, cwd, usage) => {
            const { positionals, values } = parseArgs({ args, options: { hook: { type: 'boolean' } }, allowPositionals: true });
            expectPositionals(positionals, 0, usage);
            return nextShow(cwd, values.hook ?? false);
        },
    },
    'next set': {
        usage: 'next set --layer <層> --premise <前提> --check <確認> [--caution <注意>] [--effort low|medium|high|xhigh]',
        run: (args, cwd, usage) => {
            const { positionals, values } = parseArgs({
                args,
                options: {
                    layer: { type: 'string' },
                    premise: { type: 'string' },
                    check: { type: 'string' },
                    caution: { type: 'string' },
                    effort: { type: 'string' },
                },
                allowPositionals: true,
            });
            expectPositionals(positionals, 0, usage);
            const { layer, premise, check, caution, effort } = values;
            if (layer === undefined || premise === undefined || check === undefined)
                throw usageError(usage);
            return nextSet(cwd, { layer, premise, check, caution, effort });
        },
    },
    // Hooks call this: unknown arguments are ignored so that it always exits 0, in a host plugin directory too.
    'next check': {
        usage: 'next check [--hook]',
        hook: () => true,
        run: (args, cwd) => {
            const { values } = parseArgs({ args, options: { hook: { type: 'boolean' } }, allowPositionals: true, strict: false });
            return nextCheck(cwd, values.hook === true);
        },
    },
    'plan list': noArguments('plan list', planList),
    'plan next': noArguments('plan next', planNext),
    'log add': {
        usage: `log add '<層名>' --line <行> [--line <行>]`,
        run: (args, cwd, usage) => {
            const { positionals, values } = parseArgs({
                args,
                options: { line: { type: 'string', multiple: true } },
                allowPositionals: true,
            });
            expectPositionals(positionals, 1, usage);
            return logAdd(cwd, positionals[0] ?? '', values.line ?? []);
        },
    },
    'log rotate': {
        usage: 'log rotate [--before YYYY-MM]',
        run: (args, cwd, usage) => {
            const { positionals, values } = parseArgs({ args, options: { before: { type: 'string' } }, allowPositionals: true });
            expectPositionals(positionals, 0, usage);
            return logRotate(cwd, values.before);
        },
    },
    'layer done': {
        usage: `layer done '<層名>' [--note <1〜3行>]`,
        run: (args, cwd, usage) => {
            const { positionals, values } = parseArgs({ args, options: { note: { type: 'string' } }, allowPositionals: true });
            expectPositionals(positionals, 1, usage);
            return layerDone(cwd, positionals[0] ?? '', values.note);
        },
    },
    resume: noArguments('resume', resume),
    brief: noArguments('brief', brief),
    close: {
        usage: 'close [--note <1〜3行>]',
        run: (args, cwd, usage) => {
            const { positionals, values } = parseArgs({ args, options: { note: { type: 'string' } }, allowPositionals: true });
            expectPositionals(positionals, 0, usage);
            return close(cwd, values.note);
        },
    },
    'map plan': noArguments('map plan', mapPlan),
    'map code': {
        usage: 'map code [ディレクトリ]',
        run: (args, cwd, usage) => {
            const { positionals } = parseArgs({ args, allowPositionals: true });
            expectPositionals(positionals, 0, usage, 1);
            return mapCode(cwd, positionals[0]);
        },
    },
};
// Own keys only, so that names like "constructor" or "__proto__" are unknown commands.
function lookup(key) {
    return Object.hasOwn(COMMANDS, key) ? COMMANDS[key] : undefined;
}
function resolve(argv) {
    const [first, second] = argv;
    // "soujo 'plan list'" as one argument is not a command.
    if (first === undefined || first.includes(' '))
        return undefined;
    if (second !== undefined) {
        const command = lookup(`${first} ${second}`);
        if (command)
            return { command, args: argv.slice(2) };
    }
    const command = lookup(first);
    return command ? { command, args: argv.slice(1) } : undefined;
}
function isHelp(arg) {
    return arg === '--help' || arg === '-h';
}
// The arguments before "--", the only ones that can be options.
function options(args) {
    const end = args.indexOf('--');
    return end === -1 ? args : args.slice(0, end);
}
// Only an argument of its own before "--" asks for help; "--note=--help" and anything after "--" are ordinary.
function asksHelp(args) {
    return options(args).some(isHelp);
}
function usageLines(include) {
    return Object.entries(COMMANDS)
        .filter(([key]) => include(key))
        .map(([, command]) => `soujo ${command.usage}`);
}
// Usage lines for "soujo --help", "soujo <command> --help", or "soujo <first word> --help", or undefined.
// Decided before any other argument, so that asking for help never validates or runs a command.
function help(argv, found) {
    const [first] = argv;
    if (isHelp(first))
        return usageLines(() => true);
    if (found)
        return asksHelp(found.args) ? [`soujo ${found.command.usage}`] : undefined;
    if (first === undefined)
        return undefined;
    // An unknown word after the first word is ignored: "soujo next foo --help" still lists the next commands.
    const group = usageLines((key) => key.startsWith(`${first} `));
    return group.length > 0 && asksHelp(argv.slice(1)) ? group : undefined;
}
// The unknown command as typed: both words when the first word starts two-word commands.
function unknownCommand(argv) {
    const [first = '', second] = argv;
    const grouped = Object.keys(COMMANDS).some((key) => key.startsWith(`${first} `));
    const name = grouped && second !== undefined && !second.startsWith('-') ? `${first} ${second}` : first;
    return `不明なコマンド「${name}」${HELP_HINT}`;
}
function describe(error) {
    if (!(error instanceof Error))
        return String(error);
    const code = error.code;
    const quoted = /'([^']+)'/.exec(error.message)?.[1] ?? '';
    if (code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION')
        return `不明なオプション: ${quoted}`;
    // "--note - x" leaves the value looking like an option; the value has to be attached with "=".
    const dashed = /use '(--[\w-]+)=/.exec(error.message)?.[1];
    if (code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE' && dashed !== undefined) {
        return `オプションの値が「-」で始まる: ${dashed}=<値> の形で書く`;
    }
    if (code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE')
        return `オプションの値が不正: ${quoted}`;
    return error.message;
}
function oneLine(text) {
    return text
        .split('\n')
        .map((line) => printable(line).trim())
        .filter((line) => line !== '')
        .join(' ');
}
// A host plugin directory holds a copy of Soujo with this repository's .soujo/ (SPEC §6): calls other than the hooks' refuse
// there before reading or writing anything, so that resume never shows those records and init or a commit never lands in the copy.
function run(found, cwd) {
    const plugin = found.command.hook?.(found.args) ? undefined : pluginDir(cwd);
    if (plugin !== undefined)
        throw new Error(`プラグインの置き場所（${plugin}）では実行しない: 作業中のプロジェクトで実行する`);
    return found.command.run(found.args, cwd, found.command.usage);
}
// process.cwd() fails when the current directory has been removed or cannot be read; every command needs it (SPEC §6).
function currentDir() {
    try {
        return process.cwd();
    }
    catch (error) {
        return error;
    }
}
// ENOENT is the usual reason — the directory was removed while the shell stayed in it; another one is named as it came.
function noCurrentDir(error) {
    const reason = error.code === undefined || error.code === 'ENOENT' ? '消えていないか確かめ、' : `${error.code}。`;
    return `現在のディレクトリを読めない（${reason}別のディレクトリで実行する）`;
}
// Runs the command, or says why there is none to run. Without a current directory the hooks' calls print nothing, as they
// do outside a project, so that a removed directory does not make them fail; every other command says so and exits 1.
function execute(argv, found) {
    if (found === undefined)
        throw new Error(argv.length === 0 ? `コマンドがありません${HELP_HINT}` : unknownCommand(argv));
    const cwd = currentDir();
    if (typeof cwd !== 'string') {
        if (found.command.hook?.(found.args) === true)
            return [];
        throw new Error(noCurrentDir(cwd));
    }
    return run(found, cwd);
}
// A stream that is already closed, which is not a failure of this run: SPEC §6 ends it quietly.
const CLOSED = new Set(['EPIPE', 'ERR_STREAM_DESTROYED', 'EBADF']);
/**
 * Writes one finished output. An error event of a stream with no listener would be an uncaught exception with a stack
 * trace: a closed stream (`soujo resume` piped into `head -1`) ends the run quietly, while any other failure (a full disk)
 * fails it and is reported on stderr, which is another stream and usually still open. A failure of stderr itself is lost.
 */
function write(stream, text) {
    const failed = (error) => {
        if (CLOSED.has(error.code ?? ''))
            return;
        process.exitCode = 1;
        if (stream !== process.stderr)
            write(process.stderr, `soujo: 出力を書けない（${error.code ?? oneLine(error.message)}）\n`);
    };
    stream.on('error', failed);
    try {
        stream.write(text);
    }
    catch (error) {
        failed(error);
    }
}
// The home directory as a path in a message spells it, and how this file system compares it; unknown when the environment
// has none, which leaves the message as it is. Measured here rather than guessed, as .soujo/ paths are (see foldsCase).
function homePath() {
    try {
        const home = homedir();
        return [home, foldsCase(home)];
    }
    catch {
        return [undefined, false];
    }
}
// Warnings and errors reach the same screens and get copied from them, so both hide the home directory (SPEC §6).
function shown(lines) {
    const [home, foldCase] = homePath();
    // Values from files can carry CR or other controls; each returned line stays one terminal line. hideHome runs first, so a
    // control character inside the home path cannot keep the path from being recognized and hidden.
    return `${lines.map((line) => printable(hideHome(line, home, foldCase))).join('\n')}\n`;
}
function main(argv) {
    try {
        const found = resolve(argv);
        const lines = help(argv, found) ?? execute(argv, found);
        if (lines.length > 0)
            write(process.stdout, shown(lines));
        return 0;
    }
    catch (error) {
        write(process.stderr, `soujo: ${shown([describe(error)].map(oneLine))}`);
        return 1;
    }
}
process.exitCode = main(process.argv.slice(2));
