#!/usr/bin/env node
// Entry point: resolves the command, prints its lines to stdout, and turns any error into one stderr line with exit 1.
// Keys are "<word>" or "<word> <word>" (e.g. "init", "next show"). Filled in by later layers.
const COMMANDS = {};
function resolve(argv) {
    const [first, second] = argv;
    if (first === undefined)
        return undefined;
    if (second !== undefined) {
        const command = COMMANDS[`${first} ${second}`];
        if (command)
            return { command, args: argv.slice(2) };
    }
    const command = COMMANDS[first];
    return command ? { command, args: argv.slice(1) } : undefined;
}
function oneLine(text) {
    return text.replace(/\s*\n\s*/g, ' ').trim();
}
function main(argv) {
    try {
        const found = resolve(argv);
        if (!found) {
            throw new Error(argv[0] === undefined ? 'コマンドがありません' : `不明なコマンド: ${argv[0]}`);
        }
        const lines = found.command(found.args);
        if (lines.length > 0)
            process.stdout.write(`${lines.join('\n')}\n`);
        return 0;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`soujo: ${oneLine(message)}\n`);
        return 1;
    }
}
process.exitCode = main(process.argv.slice(2));
export {};
