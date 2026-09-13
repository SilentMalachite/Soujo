#!/usr/bin/env node
// Entry point: parses arguments, runs the command, prints its lines to stdout, and turns any error into one stderr line with exit 1.
import { parseArgs } from 'node:util';
import { init } from './commands/init.js';
import { layerDone } from './commands/layer.js';
import { logAdd } from './commands/log.js';
import { nextCheck, nextSet, nextShow } from './commands/next.js';
import { planList, planNext } from './commands/plan.js';
function expectPositionals(positionals, count, usage) {
    if (positionals.length !== count)
        throw new Error(`使い方: soujo ${usage}`);
}
function noArguments(usage, run) {
    return (args, cwd) => {
        const { positionals } = parseArgs({ args, allowPositionals: true });
        expectPositionals(positionals, 0, usage);
        return run(cwd);
    };
}
// Keys are "<word>" or "<word> <word>"; two-word keys are matched first.
const COMMANDS = {
    init: noArguments('init', init),
    'next show': (args, cwd) => {
        const { positionals, values } = parseArgs({ args, options: { hook: { type: 'boolean' } }, allowPositionals: true });
        expectPositionals(positionals, 0, 'next show [--hook]');
        return nextShow(cwd, values.hook ?? false);
    },
    'next set': (args, cwd) => {
        const usage = 'next set --layer <層> --premise <前提> --check <確認> [--caution <注意>] [--effort low|medium|high|xhigh]';
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
            throw new Error(`使い方: soujo ${usage}`);
        return nextSet(cwd, { layer, premise, check, caution, effort });
    },
    // Hooks call this: unknown arguments are ignored so that it always exits 0.
    'next check': (args, cwd) => {
        const { values } = parseArgs({ args, options: { hook: { type: 'boolean' } }, allowPositionals: true, strict: false });
        return nextCheck(cwd, values.hook === true);
    },
    'plan list': noArguments('plan list', planList),
    'plan next': noArguments('plan next', planNext),
    'layer done': (args, cwd) => {
        const { positionals, values } = parseArgs({ args, options: { note: { type: 'string' } }, allowPositionals: true });
        expectPositionals(positionals, 1, 'layer done "<層名>" [--note <1〜3行>]');
        return layerDone(cwd, positionals[0] ?? '', values.note);
    },
    'log add': (args, cwd) => {
        const { positionals, values } = parseArgs({
            args,
            options: { line: { type: 'string', multiple: true } },
            allowPositionals: true,
        });
        expectPositionals(positionals, 1, 'log add "<層名>" --line <行> [--line <行>]');
        return logAdd(cwd, positionals[0] ?? '', values.line ?? []);
    },
};
// Own keys only, so that names like "constructor" or "__proto__" are unknown commands.
function lookup(key) {
    return Object.hasOwn(COMMANDS, key) ? COMMANDS[key] : undefined;
}
function resolve(argv) {
    const [first, second] = argv;
    if (first === undefined)
        return undefined;
    if (second !== undefined) {
        const command = lookup(`${first} ${second}`);
        if (command)
            return { command, args: argv.slice(2) };
    }
    const command = lookup(first);
    return command ? { command, args: argv.slice(1) } : undefined;
}
function describe(error) {
    if (!(error instanceof Error))
        return String(error);
    const code = error.code;
    const quoted = /'([^']+)'/.exec(error.message)?.[1] ?? '';
    if (code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION')
        return `不明なオプション: ${quoted}`;
    if (code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE')
        return `オプションの値が不正: ${quoted}`;
    return error.message;
}
function oneLine(text) {
    return text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '')
        .join(' ');
}
function main(argv) {
    try {
        const found = resolve(argv);
        if (!found) {
            throw new Error(argv[0] === undefined ? 'コマンドがありません' : `不明なコマンド: ${argv[0]}`);
        }
        const lines = found.command(found.args, process.cwd());
        if (lines.length > 0)
            process.stdout.write(`${lines.join('\n')}\n`);
        return 0;
    }
    catch (error) {
        process.stderr.write(`soujo: ${oneLine(describe(error))}\n`);
        return 1;
    }
}
process.exitCode = main(process.argv.slice(2));
